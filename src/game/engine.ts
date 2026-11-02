import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeFormationSlots, EnemyCommanderAI, TacticalUnitView } from './ai';
import { soundEngine } from './audio';
import { BuildingManager } from './buildings';
import {
  CharacterAssetRegistry,
  ClonedCharacterInstance,
  createInitialCharacterInfo,
} from './characterLoader';
import { BATTLE_ARENAS, BUILDING_SPECS, UNIT_SPECS } from './constants';
import { buildPlaceholderRig, buildProceduralUnitRig, RigJoints } from './models';
import { createProceduralTextures, ProceduralTextureSet } from './textures';
import {
  BattleArenaId,
  BuildingType,
  CharacterModelInfo,
  FormationType,
  GameMode,
  GameSnapshot,
  OrderType,
  QualityTier,
  SelectionBoxRect,
  Team,
  UnitType,
} from './types';
import { buildMedievalWorld, groundHeightAt, WorldHandles } from './world';

interface UnitEntity {
  id: string;
  type: UnitType;
  team: Team;
  isHero: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  attackTimer: number;
  attackAnimTimer: number;
  blocking: boolean;
  sprinting: boolean;
  selected: boolean;
  dead: boolean;
  deathTimer: number;
  order: OrderType;
  slotTargetX: number;
  slotTargetZ: number;
  walkPhase: number;
  proceduralRig: RigJoints | null;
  glbInstance: ClonedCharacterInstance | null;
}

interface ArrowProjectile {
  mesh: THREE.Group;
  team: Team;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  age: number;
}

interface SparkBurst {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

// Reusable module-scope math objects (zero per-frame GC allocations)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _rayMouse = new THREE.Vector2();

function detectSoftwareGl(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class KingdomsGameEngine {
  private container: HTMLElement;
  private onSnapshot: (snap: GameSnapshot) => void;
  private onSelectionBox: (rect: SelectionBoxRect) => void;
  private onWebglError: (msg: string) => void;

  public readonly isSoftwareGl: boolean;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private sunLight!: THREE.DirectionalLight;
  private orbitControls!: OrbitControls;
  private raycaster = new THREE.Raycaster();

  private textures!: ProceduralTextureSet;
  private world!: WorldHandles;
  private buildingManager!: BuildingManager;
  private charRegistry = new CharacterAssetRegistry();
  private enemyAI = new EnemyCommanderAI();

  private unitsGroup = new THREE.Group();
  private fxGroup = new THREE.Group();
  private rallyMarkerGroup = new THREE.Group();

  private units: UnitEntity[] = [];
  private heroUnit!: UnitEntity;
  private arrows: ArrowProjectile[] = [];
  private sparks: SparkBurst[] = [];

  // Shared lightweight geometries/materials for arrows & sparks
  private arrowGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.85, 5);
  private arrowMat = new THREE.MeshStandardMaterial({ color: '#d6d3d1', roughness: 0.5 });
  private sparkGeo = new THREE.OctahedronGeometry(0.08, 0);
  private sparkMat = new THREE.MeshBasicMaterial({ color: '#fde047' });

  // Game & Economy State
  private mode: GameMode = GameMode.King;
  private quality: QualityTier;
  private gold = 420;
  private wood = 260;
  private stone = 240;
  private food = 180;
  private economyTimer = 0;

  private activeArena: BattleArenaId = BattleArenaId.GreenvaleFord;
  private waveNumber = 1;
  private activeOrder: OrderType = OrderType.Defend;
  private activeFormation: FormationType = FormationType.Line;
  private selectedUnitFilter: UnitType | 'all' = 'all';
  private rallyX = BATTLE_ARENAS[BattleArenaId.GreenvaleFord].centerX;
  private rallyZ =
    BATTLE_ARENAS[BattleArenaId.GreenvaleFord].centerZ +
    BATTLE_ARENAS[BattleArenaId.GreenvaleFord].friendlySpawnOffsetZ;
  private rallyYaw = Math.PI; // facing North (-Z) toward enemy spawn

  private selectedBuilding: BuildingType | null = null;
  private demolishMode = false;
  private buildingRotationSteps = 0;

  private heroStamina = 100;
  private heroKills = 0;
  private heroRespawnTimer = 0;
  private heroCamYaw = Math.PI; // looking North (-Z)
  private heroCamPitch = 0.34;
  private smoothedCamPos = new THREE.Vector3(-12, 32, 36);
  private smoothedCamLook = new THREE.Vector3(0, 2, 0);

  private heroModelInfo: CharacterModelInfo = createInitialCharacterInfo('hero');
  private enemyModelInfo: CharacterModelInfo = createInitialCharacterInfo('enemy');
  private applyHeroModelToFriendlySquad = false;
  private statusMessage =
    'Kingdom established. Build your castle, command formations, or press 2 to fight in Soldier Mode.';

  // Input Tracking
  private keys: Record<string, boolean> = {};
  private pointerDownPos = { x: 0, y: 0 };
  private isDraggingBox = false;
  private isRightMouseDown = false;
  private isLeftMouseDown = false;
  private lastHoverRaycast = 0;

  private clock = new THREE.Clock();
  private elapsed = 0;
  private frameId = 0;
  private lastUiEmit = 0;
  private disposed = false;

  constructor(
    container: HTMLElement,
    onSnapshot: (snap: GameSnapshot) => void,
    onSelectionBox: (rect: SelectionBoxRect) => void,
    onWebglError: (msg: string) => void
  ) {
    this.container = container;
    this.onSnapshot = onSnapshot;
    this.onSelectionBox = onSelectionBox;
    this.onWebglError = onWebglError;
    this.isSoftwareGl = detectSoftwareGl();
    this.quality = this.isSoftwareGl ? QualityTier.Low : QualityTier.Balanced;

    this.arrowGeo.rotateX(Math.PI / 2);
    this.initThree();
  }

  private initThree(): void {
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: !this.isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      this.onWebglError('WebGL is unavailable on this browser or hardware configuration.');
      return;
    }

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // WebGL context loss safety
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.cancelLoop();
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.scheduleNextTick();
    });

    this.scene = new THREE.Scene();
    const horizonHex = 0xc6d3e1;
    this.scene.background = new THREE.Color(horizonHex);
    this.scene.fog = new THREE.FogExp2(horizonHex, 0.0058);

    // Mandatory studio environment map for realistic PBR metallic armor & steel blades
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    this.camera = new THREE.PerspectiveCamera(56, width / height, 0.25, 340);
    this.camera.position.set(-14, 34, 42);

    // 3-Point Outdoor Daylight Rig (Warm Golden Key Sun + Cool Sky/Earth Hemisphere + Rim Light)
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x4d5d3b, 0.72);
    hemiLight.position.set(0, 60, 0);
    this.scene.add(hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 1.85);
    this.sunLight.position.set(-45, 68, 38);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1536, 1536);
    const d = 58;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 175;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    rimLight.position.set(45, 32, -50);
    this.scene.add(rimLight);

    // OrbitControls for King & Commander strategic cameras
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = !this.isSoftwareGl;
    this.orbitControls.dampingFactor = 0.07;
    this.orbitControls.maxPolarAngle = Math.PI * 0.46;
    this.orbitControls.minDistance = 8;
    this.orbitControls.maxDistance = 105;
    this.orbitControls.mouseButtons = {
      LEFT: null as unknown as THREE.MOUSE, // Left mouse is reserved for placing blocks, box-selecting troops, or attacking!
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.orbitControls.target.set(-12, 2, 4);

    // Build Textures, World, Initial Castle & Village
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.world = buildMedievalWorld(this.textures, this.quality);
    this.scene.add(this.world.group);

    this.buildingManager = new BuildingManager(this.textures);
    this.buildingManager.populateInitialKingdom();
    this.scene.add(this.buildingManager.group);
    this.scene.add(this.buildingManager.ghostGroup);

    this.scene.add(this.unitsGroup);
    this.scene.add(this.fxGroup);
    this.buildRallyFlagMarker();
    this.scene.add(this.rallyMarkerGroup);

    // Spawn Playable Hero + Initial Friendly Army + Initial Enemy AI Wave
    this.spawnInitialForces();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitSnapshot(true);
    this.clock.start();
    this.scheduleNextTick();
  }

  private buildRallyFlagMarker(): void {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 3.2, 6),
      new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.7, roughness: 0.3 })
    );
    pole.position.y = 1.6;
    const pennant = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.55),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide })
    );
    pennant.position.set(0.44, 2.85, 0);
    const groundRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.15, 24),
      new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.06;
    this.rallyMarkerGroup.add(pole, pennant, groundRing);
    this.updateRallyMarkerTransform();
  }

  private updateRallyMarkerTransform(): void {
    const ry = groundHeightAt(this.rallyX, this.rallyZ);
    this.rallyMarkerGroup.position.set(this.rallyX, ry, this.rallyZ);
  }

  private spawnInitialForces(): void {
    const arena = BATTLE_ARENAS[this.activeArena];
    const heroX = arena.centerX - 3;
    const heroZ = arena.centerZ + arena.friendlySpawnOffsetZ + 2;

    // 1. Playable Hero (uses explicit 3D Calibration Placeholder Rig until user imports their .GLB/.GLTF)
    this.heroUnit = this.createUnit(UnitType.Hero, Team.Friendly, heroX, heroZ, true);

    // 2. Friendly Royal Retinue (All 6 requested medieval troop classes represented!)
    const initialSquad: UnitType[] = [
      UnitType.ShieldSoldier,
      UnitType.ShieldSoldier,
      UnitType.Spearman,
      UnitType.Spearman,
      UnitType.SwordInfantry,
      UnitType.SwordInfantry,
      UnitType.Knight,
      UnitType.Horseman,
      UnitType.Archer,
      UnitType.Archer,
    ];
    initialSquad.forEach((ut, idx) => {
      const sx = arena.centerX + ((idx % 5) - 2) * 2.1;
      const sz = arena.centerZ + arena.friendlySpawnOffsetZ + Math.floor(idx / 5) * 2.4;
      const u = this.createUnit(ut, Team.Friendly, sx, sz, false);
      u.selected = true;
    });
    this.recomputeFriendlyFormationSlots();

    // 3. Initial Enemy AI Army at Greenvale Ford
    this.spawnEnemyWaveForArena(this.activeArena, 1);
  }

  private buildVisualForUnit(type: UnitType, team: Team, isHero: boolean): {
    proceduralRig: RigJoints | null;
    glbInstance: ClonedCharacterInstance | null;
  } {
    // Check if custom GLB/GLTF is loaded for this slot
    if (isHero) {
      if (this.charRegistry.heroAsset) {
        return {
          proceduralRig: null,
          glbInstance: this.charRegistry.instantiateCharacter(
            this.charRegistry.heroAsset,
            Team.Friendly,
            true,
            this.textures.contactShadow
          ),
        };
      }
      // Honest 3D placeholder rig — never replace user's hero with a generic character
      return {
        proceduralRig: buildPlaceholderRig(Team.Friendly, true, this.textures.contactShadow),
        glbInstance: null,
      };
    }

    if (team === Team.Friendly && this.applyHeroModelToFriendlySquad && this.charRegistry.heroAsset && type !== UnitType.Horseman) {
      return {
        proceduralRig: null,
        glbInstance: this.charRegistry.instantiateCharacter(
          this.charRegistry.heroAsset,
          Team.Friendly,
          false,
          this.textures.contactShadow
        ),
      };
    }

    if (team === Team.Enemy && this.charRegistry.enemyAsset && type !== UnitType.Horseman) {
      return {
        proceduralRig: null,
        glbInstance: this.charRegistry.instantiateCharacter(
          this.charRegistry.enemyAsset,
          Team.Enemy,
          false,
          this.textures.contactShadow
        ),
      };
    }

    return {
      proceduralRig: buildProceduralUnitRig(type, team, this.textures.contactShadow),
      glbInstance: null,
    };
  }

  private createUnit(
    type: UnitType,
    team: Team,
    x: number,
    z: number,
    isHero: boolean
  ): UnitEntity {
    const spec = UNIT_SPECS[type];
    const y = groundHeightAt(x, z);
    const { proceduralRig, glbInstance } = this.buildVisualForUnit(type, team, isHero);
    const rootObj = proceduralRig ? proceduralRig.root : glbInstance!.root;
    rootObj.position.set(x, y, z);
    const yaw = team === Team.Friendly ? Math.PI : 0;
    rootObj.rotation.y = yaw;
    this.unitsGroup.add(rootObj);

    const entity: UnitEntity = {
      id: isHero ? 'hero_player' : `u_${team}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      team,
      isHero,
      x,
      y,
      z,
      vx: 0,
      vz: 0,
      yaw,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      attackTimer: 0,
      attackAnimTimer: 0,
      blocking: false,
      sprinting: false,
      selected: false,
      dead: false,
      deathTimer: 0,
      order: team === Team.Friendly ? this.activeOrder : OrderType.Defend,
      slotTargetX: x,
      slotTargetZ: z,
      walkPhase: Math.random() * Math.PI * 2,
      proceduralRig,
      glbInstance,
    };

    rootObj.userData.unitId = entity.id;
    this.units.push(entity);
    return entity;
  }

  private rebuildUnitVisuals(filterFn: (u: UnitEntity) => boolean): void {
    for (const u of this.units) {
      if (u.dead || !filterFn(u)) continue;
      const oldRoot = u.proceduralRig ? u.proceduralRig.root : u.glbInstance!.root;
      this.unitsGroup.remove(oldRoot);

      const { proceduralRig, glbInstance } = this.buildVisualForUnit(u.type, u.team, u.isHero);
      u.proceduralRig = proceduralRig;
      u.glbInstance = glbInstance;
      const newRoot = proceduralRig ? proceduralRig.root : glbInstance!.root;
      newRoot.position.set(u.x, u.y, u.z);
      newRoot.rotation.y = u.yaw;
      newRoot.userData.unitId = u.id;
      this.unitsGroup.add(newRoot);
    }
  }

  public spawnEnemyWaveForArena(arenaId: BattleArenaId, wave: number): void {
    const arena = BATTLE_ARENAS[arenaId];
    const baseZ = arena.centerZ + arena.enemySpawnOffsetZ;

    const composition: UnitType[] = [
      UnitType.ShieldSoldier,
      UnitType.ShieldSoldier,
      UnitType.Spearman,
      UnitType.Spearman,
      UnitType.SwordInfantry,
      UnitType.SwordInfantry,
      UnitType.Archer,
      UnitType.Archer,
    ];

    // Scale composition with wave number
    if (wave >= 2) {
      composition.push(UnitType.Horseman, UnitType.Knight);
    }
    if (wave >= 3) {
      composition.push(UnitType.Knight, UnitType.Archer, UnitType.Spearman);
    }

    composition.forEach((ut, idx) => {
      const col = (idx % 5) - 2;
      const row = Math.floor(idx / 5);
      const ex = arena.centerX + col * 2.2 + (Math.random() - 0.5) * 0.4;
      const ez = baseZ - row * 2.3;
      this.createUnit(ut, Team.Enemy, ex, ez, false);
    });
  }

  private recomputeFriendlyFormationSlots(): void {
    const activeTroops = this.units.filter(
      (u) =>
        !u.dead &&
        u.team === Team.Friendly &&
        !u.isHero &&
        (u.selected || this.getSelectedFriendlyUnits().length === 0)
    );
    const views: TacticalUnitView[] = activeTroops.map((u) => ({
      id: u.id,
      type: u.type,
      team: u.team,
      x: u.x,
      z: u.z,
      hp: u.hp,
      maxHp: u.maxHp,
      dead: u.dead,
    }));

    const slots = computeFormationSlots(
      views,
      this.activeFormation,
      this.rallyX,
      this.rallyZ,
      this.rallyYaw
    );

    for (const u of activeTroops) {
      const slot = slots.get(u.id);
      if (slot) {
        u.slotTargetX = slot.x;
        u.slotTargetZ = slot.z;
      }
    }
  }

  private getSelectedFriendlyUnits(): UnitEntity[] {
    return this.units.filter((u) => !u.dead && u.team === Team.Friendly && !u.isHero && u.selected);
  }

  // ==================== PUBLIC UI ACTIONS ====================

  public setMode(nextMode: GameMode): void {
    this.mode = nextMode;
    this.selectedBuilding = null;
    this.demolishMode = false;
    this.buildingManager.updateGhost(null, 0, 0, 0);

    if (nextMode === GameMode.Soldier) {
      this.orbitControls.enabled = false;
      this.statusMessage =
        'Soldier Mode: WASD to move, Shift to sprint, Left-Click/Space to attack, Right-Click/F to block, drag mouse or Q/E to look.';
    } else if (nextMode === GameMode.Commander) {
      this.orbitControls.enabled = true;
      const arena = BATTLE_ARENAS[this.activeArena];
      const ay = groundHeightAt(arena.centerX, arena.centerZ);
      this.smoothedCamLook.set(arena.centerX, ay, arena.centerZ);
      this.orbitControls.target.copy(this.smoothedCamLook);
      this.camera.position.set(arena.centerX - 10, ay + 34, arena.centerZ + 32);
      this.statusMessage =
        'Commander Mode: Drag Left-Click to select troops, Right-Click terrain to position formation, and issue orders.';
    } else {
      this.orbitControls.enabled = true;
      this.camera.fov = 56;
      this.camera.updateProjectionMatrix();
      this.statusMessage =
        'King Mode: Construct castle & village blocks, recruit troops, and choose where battles take place.';
    }
    this.emitSnapshot(true);
  }

  public selectBuildingTool(type: BuildingType | null): void {
    if (this.mode !== GameMode.King) {
      this.setMode(GameMode.King);
    }
    this.demolishMode = false;
    this.selectedBuilding = this.selectedBuilding === type ? null : type;
    if (!this.selectedBuilding) {
      this.buildingManager.updateGhost(null, 0, 0, 0);
    } else {
      const spec = BUILDING_SPECS[this.selectedBuilding];
      this.statusMessage = `Placing ${spec.label}: Left-Click grid to build, press R to rotate 90°, Esc to cancel.`;
    }
    this.emitSnapshot(true);
  }

  public toggleDemolishMode(): void {
    if (this.mode !== GameMode.King) {
      this.setMode(GameMode.King);
    }
    this.selectedBuilding = null;
    this.buildingManager.updateGhost(null, 0, 0, 0);
    this.demolishMode = !this.demolishMode;
    this.statusMessage = this.demolishMode
      ? 'Demolish Active: Left-Click any player-placed structure to dismantle (50% refund).'
      : 'Demolish cancelled.';
    this.emitSnapshot(true);
  }

  public rotateBuilding(): void {
    this.buildingRotationSteps = (this.buildingRotationSteps + 1) % 4;
    this.emitSnapshot(true);
  }

  public recruitUnit(type: UnitType): void {
    if (type === UnitType.Hero) return;
    const spec = UNIT_SPECS[type];
    const bonuses = this.buildingManager.computeEconomyBonuses();
    const friendlyCount = this.units.filter(
      (u) => !u.dead && u.team === Team.Friendly && !u.isHero
    ).length;

    if (friendlyCount >= bonuses.armyCap) {
      this.statusMessage = `Army capacity reached (${friendlyCount}/${bonuses.armyCap}). Build Houses or Barracks to expand capacity.`;
      this.emitSnapshot(true);
      return;
    }
    if (this.gold < spec.goldCost || this.food < spec.foodCost) {
      this.statusMessage = `Insufficient resources for ${spec.label} (needs ${spec.goldCost} Gold, ${spec.foodCost} Food).`;
      this.emitSnapshot(true);
      return;
    }

    this.gold -= spec.goldCost;
    this.food -= spec.foodCost;

    // Spawn near active rally banner
    const angle = Math.random() * Math.PI * 2;
    const sx = this.rallyX + Math.cos(angle) * 2.5;
    const sz = this.rallyZ + Math.sin(angle) * 2.5;
    const unit = this.createUnit(type, Team.Friendly, sx, sz, false);
    unit.selected = true;
    unit.order = this.activeOrder;
    this.recomputeFriendlyFormationSlots();
    soundEngine.playBuildPlace();
    this.statusMessage = `Recruited ${spec.label} to active formation.`;
    this.emitSnapshot(true);
  }

  public issueOrder(order: OrderType): void {
    this.activeOrder = order;
    const selected = this.getSelectedFriendlyUnits();
    const targets =
      selected.length > 0
        ? selected
        : this.units.filter((u) => !u.dead && u.team === Team.Friendly && !u.isHero);

    for (const u of targets) {
      u.order = order;
    }

    if (order === OrderType.Retreat) {
      // Fall back toward Village / Castle road
      this.rallyX = -18;
      this.rallyZ = 14;
      this.updateRallyMarkerTransform();
      this.recomputeFriendlyFormationSlots();
    } else if (order === OrderType.Charge) {
      soundEngine.playWarhorn();
    }

    this.statusMessage = `Order issued to ${targets.length} soldiers: ${order.toUpperCase()}.`;
    this.emitSnapshot(true);
  }

  public setFormation(formation: FormationType): void {
    this.activeFormation = formation;
    this.recomputeFriendlyFormationSlots();
    this.statusMessage = `Army formation set to ${formation.replace('_', ' ')}.`;
    this.emitSnapshot(true);
  }

  public selectUnitsByClass(filter: UnitType | 'all'): void {
    this.selectedUnitFilter = filter;
    for (const u of this.units) {
      if (u.dead || u.team !== Team.Friendly || u.isHero) continue;
      u.selected = filter === 'all' || u.type === filter;
    }
    this.emitSnapshot(true);
  }

  public selectBattleArena(arenaId: BattleArenaId): void {
    this.activeArena = arenaId;
    const arena = BATTLE_ARENAS[arenaId];
    this.rallyX = arena.centerX;
    this.rallyZ = arena.centerZ + arena.friendlySpawnOffsetZ;
    this.rallyYaw = Math.PI;
    this.updateRallyMarkerTransform();
    this.recomputeFriendlyFormationSlots();

    // Move hero near new battleground if in King/Commander mode
    if (!this.heroUnit.dead) {
      this.heroUnit.x = arena.centerX - 3;
      this.heroUnit.z = arena.centerZ + arena.friendlySpawnOffsetZ + 2;
      this.heroUnit.y = groundHeightAt(this.heroUnit.x, this.heroUnit.z);
    }

    const ay = groundHeightAt(arena.centerX, arena.centerZ);
    if (this.mode !== GameMode.Soldier) {
      this.orbitControls.target.set(arena.centerX, ay, arena.centerZ);
      this.camera.position.set(arena.centerX - 14, ay + 30, arena.centerZ + 34);
    }

    this.statusMessage = `Selected battlefield: ${arena.name}. Friendly army marching to position.`;
    this.emitSnapshot(true);
  }

  public launchNextBattleWave(): void {
    const aliveEnemies = this.units.filter((u) => !u.dead && u.team === Team.Enemy).length;
    if (aliveEnemies === 0) {
      this.waveNumber += 1;
    }
    this.spawnEnemyWaveForArena(this.activeArena, this.waveNumber);
    soundEngine.playWarhorn();
    const arena = BATTLE_ARENAS[this.activeArena];
    this.statusMessage = `Wave ${this.waveNumber} engaged at ${arena.name}!`;
    this.emitSnapshot(true);
  }

  public setQuality(q: QualityTier): void {
    this.quality = q;
    const enableShadows = !this.isSoftwareGl && q !== QualityTier.Low;
    this.renderer.shadowMap.enabled = enableShadows;
    this.sunLight.castShadow = enableShadows;
    this.renderer.setPixelRatio(
      this.isSoftwareGl || q === QualityTier.Low
        ? 1
        : q === QualityTier.High
          ? Math.min(window.devicePixelRatio, 2)
          : Math.min(window.devicePixelRatio, 1.5)
    );
    this.emitSnapshot(true);
  }

  public toggleSound(): void {
    soundEngine.enabled = !soundEngine.enabled;
    this.emitSnapshot(true);
  }

  public setApplyHeroModelToSquad(apply: boolean): void {
    this.applyHeroModelToFriendlySquad = apply;
    this.rebuildUnitVisuals((u) => u.team === Team.Friendly && !u.isHero);
    this.emitSnapshot(true);
  }

  public async importCharacterFile(slot: 'hero' | 'enemy', file: File): Promise<void> {
    const asset = await this.charRegistry.loadFromFile(slot, file);
    if (slot === 'hero') {
      this.heroModelInfo = asset.info;
      this.rebuildUnitVisuals(
        (u) => u.isHero || (this.applyHeroModelToFriendlySquad && u.team === Team.Friendly)
      );
      this.statusMessage = `Loaded custom 3D Hero model "${file.name}" (${asset.clips.length} animation clips).`;
    } else {
      this.enemyModelInfo = asset.info;
      this.rebuildUnitVisuals((u) => u.team === Team.Enemy);
      this.statusMessage = `Loaded Opposite Team 3D model "${file.name}".`;
    }
    this.emitSnapshot(true);
  }

  public async importCharacterUrl(slot: 'hero' | 'enemy', url: string): Promise<void> {
    const asset = await this.charRegistry.loadFromUrl(slot, url);
    if (slot === 'hero') {
      this.heroModelInfo = asset.info;
      this.rebuildUnitVisuals(
        (u) => u.isHero || (this.applyHeroModelToFriendlySquad && u.team === Team.Friendly)
      );
      this.statusMessage = `Loaded custom 3D Hero model from URL (${asset.clips.length} animation clips).`;
    } else {
      this.enemyModelInfo = asset.info;
      this.rebuildUnitVisuals((u) => u.team === Team.Enemy);
      this.statusMessage = `Loaded Opposite Team 3D model from URL.`;
    }
    this.emitSnapshot(true);
  }

  public async loadSampleTestGlb(slot: 'hero' | 'enemy'): Promise<void> {
    const sampleFile = await this.charRegistry.generateSampleAnimatedGlbFile(slot);
    await this.importCharacterFile(slot, sampleFile);
  }

  // ==================== INPUT & INTERACTION ====================

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    const dom = this.renderer.domElement;
    dom.addEventListener('contextmenu', this.handleContextMenu);
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private handleResize = (): void => {
    if (!this.renderer || !this.camera) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (
      document.activeElement &&
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
    ) {
      return;
    }

    this.keys[e.code] = true;

    if (e.code === 'Digit1') this.setMode(GameMode.King);
    if (e.code === 'Digit2') this.setMode(GameMode.Soldier);
    if (e.code === 'Digit3') this.setMode(GameMode.Commander);

    if (e.code === 'KeyR' && this.mode === GameMode.King && this.selectedBuilding) {
      this.rotateBuilding();
    }
    if (e.code === 'Escape') {
      if (this.selectedBuilding || this.demolishMode) {
        this.selectedBuilding = null;
        this.demolishMode = false;
        this.buildingManager.updateGhost(null, 0, 0, 0);
        this.emitSnapshot(true);
      }
    }
    if (e.code === 'Space' && this.mode === GameMode.Soldier) {
      e.preventDefault();
      this.triggerHeroAttack();
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };

  private getCanvasNormalizedMouse(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _rayMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _rayMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycastTerrain(clientX: number, clientY: number): THREE.Vector3 | null {
    this.getCanvasNormalizedMouse(clientX, clientY);
    this.raycaster.setFromCamera(_rayMouse, this.camera);
    const hits = this.raycaster.intersectObject(this.world.terrainMesh, false);
    return hits.length > 0 ? hits[0].point : null;
  }

  private handlePointerDown = (e: PointerEvent): void => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };

    if (e.button === 2) {
      this.isRightMouseDown = true;
    }
    if (e.button === 0) {
      this.isLeftMouseDown = true;
    }

    if (this.mode === GameMode.Soldier) {
      if (e.button === 0) {
        this.triggerHeroAttack();
      }
      return;
    }

    // King Mode Building Placement or Demolition on Left Click
    if (this.mode === GameMode.King && e.button === 0) {
      if (this.selectedBuilding) {
        const pt = this.raycastTerrain(e.clientX, e.clientY);
        if (pt) {
          this.tryConstructAt(this.selectedBuilding, pt.x, pt.z);
        }
        return;
      }
      if (this.demolishMode) {
        this.tryDemolishAt(e.clientX, e.clientY);
        return;
      }
    }

    // Box selection start on Left Click in Commander / King Mode
    if (e.button === 0 && !this.selectedBuilding && !this.demolishMode) {
      this.isDraggingBox = true;
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.mode === GameMode.Soldier) {
      // Smooth third-person camera orbit when dragging left/right mouse (works cleanly in all iframes without pointer-lock issues!)
      if (this.isRightMouseDown || (this.isLeftMouseDown && e.movementX !== 0)) {
        this.heroCamYaw -= e.movementX * 0.0055;
        this.heroCamPitch = THREE.MathUtils.clamp(
          this.heroCamPitch + e.movementY * 0.004,
          0.12,
          0.95
        );
      }
      return;
    }

    // Update box selection rectangle if dragging
    if (this.isDraggingBox) {
      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      if (Math.hypot(dx, dy) > 6) {
        this.onSelectionBox({
          active: true,
          x: Math.min(this.pointerDownPos.x, e.clientX),
          y: Math.min(this.pointerDownPos.y, e.clientY),
          width: Math.abs(dx),
          height: Math.abs(dy),
        });
      }
      return;
    }

    // Throttled building ghost raycast in King Mode
    if (this.mode === GameMode.King && this.selectedBuilding) {
      const now = performance.now();
      if (now - this.lastHoverRaycast < 32) return;
      this.lastHoverRaycast = now;
      const pt = this.raycastTerrain(e.clientX, e.clientY);
      if (pt) {
        this.buildingManager.updateGhost(
          this.selectedBuilding,
          pt.x,
          pt.z,
          this.buildingRotationSteps
        );
      }
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (e.button === 2) {
      this.isRightMouseDown = false;
      // Quick Right-Click (not orbit drag) in Commander or King Mode sets Rally / Move Position!
      if (this.mode !== GameMode.Soldier) {
        const dragDist = Math.hypot(
          e.clientX - this.pointerDownPos.x,
          e.clientY - this.pointerDownPos.y
        );
        if (dragDist < 7) {
          const pt = this.raycastTerrain(e.clientX, e.clientY);
          if (pt) {
            this.setRallyPositionFromClick(pt.x, pt.z);
          }
        }
      }
    }

    if (e.button === 0) {
      this.isLeftMouseDown = false;
      if (this.isDraggingBox) {
        this.isDraggingBox = false;
        this.onSelectionBox({ active: false, x: 0, y: 0, width: 0, height: 0 });
        const dragDist = Math.hypot(
          e.clientX - this.pointerDownPos.x,
          e.clientY - this.pointerDownPos.y
        );
        if (dragDist >= 8) {
          this.finishBoxSelection(
            Math.min(this.pointerDownPos.x, e.clientX),
            Math.min(this.pointerDownPos.y, e.clientY),
            Math.max(this.pointerDownPos.x, e.clientX),
            Math.max(this.pointerDownPos.y, e.clientY)
          );
        } else if (this.mode !== GameMode.Soldier && !this.selectedBuilding && !this.demolishMode) {
          this.handleSingleClickSelect(e.clientX, e.clientY, e.shiftKey);
        }
      }
    }
  };

  private setRallyPositionFromClick(wx: number, wz: number): void {
    this.rallyX = THREE.MathUtils.clamp(wx, -75, 75);
    this.rallyZ = THREE.MathUtils.clamp(wz, -75, 75);

    // Orient formation toward nearest enemy centroid (or north)
    const enemies = this.units.filter((u) => !u.dead && u.team === Team.Enemy);
    if (enemies.length > 0) {
      let ex = 0;
      let ez = 0;
      enemies.forEach((en) => {
        ex += en.x;
        ez += en.z;
      });
      ex /= enemies.length;
      ez /= enemies.length;
      this.rallyYaw = Math.atan2(ex - this.rallyX, ez - this.rallyZ);
    }

    this.updateRallyMarkerTransform();
    if (this.activeOrder === OrderType.Stand || this.activeOrder === OrderType.Retreat) {
      this.activeOrder = OrderType.Advance;
      this.units.forEach((u) => {
        if (!u.dead && u.team === Team.Friendly && !u.isHero && u.selected) {
          u.order = OrderType.Advance;
        }
      });
    }
    this.recomputeFriendlyFormationSlots();
    this.statusMessage = `Formation ordered to (${Math.round(this.rallyX)}, ${Math.round(this.rallyZ)}).`;
    this.emitSnapshot(true);
  }

  private tryConstructAt(type: BuildingType, wx: number, wz: number): void {
    const spec = BUILDING_SPECS[type];
    if (
      this.gold < spec.goldCost ||
      this.wood < spec.woodCost ||
      this.stone < spec.stoneCost
    ) {
      this.statusMessage = `Need ${spec.goldCost} Gold, ${spec.woodCost} Wood, ${spec.stoneCost} Stone to build ${spec.label}.`;
      this.emitSnapshot(true);
      return;
    }

    const ghostInfo = this.buildingManager.updateGhost(
      type,
      wx,
      wz,
      this.buildingRotationSteps
    );
    if (!ghostInfo) return;

    const placed = this.buildingManager.placeBuilding(
      type,
      ghostInfo.gridX,
      ghostInfo.gridZ,
      this.buildingRotationSteps,
      true
    );
    if (!placed) {
      this.statusMessage = 'Cannot place here — footprint overlaps an existing structure.';
      this.emitSnapshot(true);
      return;
    }

    this.gold -= spec.goldCost;
    this.wood -= spec.woodCost;
    this.stone -= spec.stoneCost;
    soundEngine.playBuildPlace();

    // Update ghost height immediately if stackable
    this.buildingManager.updateGhost(type, wx, wz, this.buildingRotationSteps);
    this.statusMessage = `Constructed ${spec.label}.`;
    this.emitSnapshot(true);
  }

  private tryDemolishAt(clientX: number, clientY: number): void {
    this.getCanvasNormalizedMouse(clientX, clientY);
    this.raycaster.setFromCamera(_rayMouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.buildingManager.group.children, true);
    if (hits.length === 0) return;

    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !obj.userData.buildingId) {
      obj = obj.parent;
    }
    if (!obj?.userData.buildingId) return;

    const target = this.buildingManager.buildings.find((b) => b.id === obj!.userData.buildingId);
    if (!target) return;
    if (!target.playerPlaced) {
      this.statusMessage = 'Royal Citadel core structures cannot be demolished.';
      this.emitSnapshot(true);
      return;
    }

    const removed = this.buildingManager.removeBuildingById(target.id);
    if (removed) {
      const spec = BUILDING_SPECS[removed.type];
      this.gold += Math.floor(spec.goldCost * 0.5);
      this.wood += Math.floor(spec.woodCost * 0.5);
      this.stone += Math.floor(spec.stoneCost * 0.5);
      soundEngine.playBuildPlace();
      this.statusMessage = `Dismantled ${spec.label} (50% resources refunded).`;
      this.emitSnapshot(true);
    }
  }

  private handleSingleClickSelect(clientX: number, clientY: number, additive: boolean): void {
    this.getCanvasNormalizedMouse(clientX, clientY);
    this.raycaster.setFromCamera(_rayMouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.unitsGroup.children, true);

    let clickedId: string | null = null;
    for (const h of hits) {
      let curr: THREE.Object3D | null = h.object;
      while (curr && !curr.userData.unitId) {
        curr = curr.parent;
      }
      if (curr?.userData.unitId) {
        clickedId = curr.userData.unitId;
        break;
      }
    }

    if (!clickedId) {
      if (additive) {
        const pt = this.raycastTerrain(clientX, clientY);
        if (pt) this.setRallyPositionFromClick(pt.x, pt.z);
      }
      return;
    }

    const clickedUnit = this.units.find((u) => u.id === clickedId);
    if (!clickedUnit || clickedUnit.team !== Team.Friendly || clickedUnit.isHero) return;

    if (!additive) {
      this.units.forEach((u) => {
        if (u.team === Team.Friendly && !u.isHero) u.selected = false;
      });
    }
    clickedUnit.selected = true;
    this.selectedUnitFilter = 'all';
    this.emitSnapshot(true);
  }

  private finishBoxSelection(minX: number, minY: number, maxX: number, maxY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    let count = 0;

    for (const u of this.units) {
      if (u.dead || u.team !== Team.Friendly || u.isHero) continue;
      _v1.set(u.x, u.y + 1.1, u.z).project(this.camera);
      if (_v1.z > 1) {
        u.selected = false;
        continue;
      }
      const sx = ((_v1.x + 1) * 0.5) * rect.width + rect.left;
      const sy = ((-_v1.y + 1) * 0.5) * rect.height + rect.top;
      const inside = sx >= minX && sx <= maxX && sy >= minY && sy <= maxY;
      u.selected = inside;
      if (inside) count++;
    }

    this.selectedUnitFilter = 'all';
    if (count > 0) {
      this.statusMessage = `Selected ${count} friendly soldier${count === 1 ? '' : 's'}. Right-Click terrain to deploy.`;
    }
    this.emitSnapshot(true);
  }

  // ==================== HERO COMBAT & SIMULATION LOOP ====================

  private triggerHeroAttack(): void {
    const hero = this.heroUnit;
    if (!hero || hero.dead || hero.attackTimer > 0) return;

    const spec = UNIT_SPECS[UnitType.Hero];
    hero.attackTimer = spec.attackCooldown;
    hero.attackAnimTimer = 0.36;
    hero.blocking = false;
    this.heroStamina = Math.max(0, this.heroStamina - 14);
    soundEngine.playSwordSwing();

    if (hero.glbInstance) {
      hero.glbInstance.setAnimState('attack');
    }

    // Cleave enemies in forward arc within 2.75m
    const forwardX = Math.sin(hero.yaw);
    const forwardZ = Math.cos(hero.yaw);
    let hitAny = false;

    for (const enemy of this.units) {
      if (enemy.dead || enemy.team !== Team.Enemy) continue;
      const dx = enemy.x - hero.x;
      const dz = enemy.z - hero.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= spec.attackRange + 0.35) {
        const dot = (dx * forwardX + dz * forwardZ) / Math.max(dist, 0.001);
        if (dot > 0.15 || dist < 1.35) {
          this.applyDamage(hero, enemy, spec.damage, true);
          // Knockback impulse
          enemy.vx += (dx / Math.max(dist, 0.1)) * 4.2;
          enemy.vz += (dz / Math.max(dist, 0.1)) * 4.2;
          hitAny = true;
        }
      }
    }

    if (hitAny) {
      soundEngine.playSwordHit();
    }
  }

  private applyDamage(
    attacker: UnitEntity | null,
    target: UnitEntity,
    rawDamage: number,
    isHeroStrike = false
  ): void {
    if (target.dead) return;
    const targetSpec = UNIT_SPECS[target.type];
    let dmg = rawDamage * (1 - targetSpec.armor);

    // Anti-cavalry spear bonus
    if (attacker && UNIT_SPECS[attacker.type].antiCavalryBonus && targetSpec.isMounted) {
      dmg *= UNIT_SPECS[attacker.type].antiCavalryBonus!;
    }

    // Charge bonus
    if (attacker && attacker.order === OrderType.Charge && attacker.sprinting) {
      dmg *= 1.22;
    }

    // Blocking & Defend Order mitigation
    if (target.blocking) {
      dmg *= target.isHero ? 0.2 : 0.42;
      if (target.isHero) {
        soundEngine.playShieldClang();
      }
    } else if (target.order === OrderType.Defend) {
      dmg *= 0.68;
    }

    target.hp -= dmg;
    this.spawnHitSparks(target.x, target.y + 1.25, target.z, target.blocking ? 2 : 4);

    if (target.hp <= 0) {
      target.hp = 0;
      target.dead = true;
      target.deathTimer = 2.5;
      if (target.glbInstance) {
        target.glbInstance.setAnimState('death');
      }
      if (target.team === Team.Enemy) {
        this.gold += 14;
        if (isHeroStrike || attacker?.isHero) {
          this.heroKills += 1;
        }
      }
      if (target.isHero) {
        this.heroRespawnTimer = 4.0;
        this.statusMessage = 'Hero wounded! Rallying at the Royal Standard in 4s...';
      }
    }
  }

  private spawnHitSparks(x: number, y: number, z: number, count: number): void {
    if (this.sparks.length > 36) return;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      m.position.set(x, y, z);
      this.fxGroup.add(m);
      this.sparks.push({
        mesh: m,
        vx: (Math.random() - 0.5) * 5.5,
        vy: 1.8 + Math.random() * 3.5,
        vz: (Math.random() - 0.5) * 5.5,
        life: 0.28 + Math.random() * 0.16,
      });
    }
  }

  private spawnArrow(shooter: UnitEntity, target: UnitEntity, damage: number): void {
    const startY = shooter.y + 1.48;
    const dx = target.x - shooter.x;
    const dz = target.z - shooter.z;
    const dist = Math.max(Math.hypot(dx, dz), 1);
    const speed = 24;
    const flightTime = dist / speed;
    const gravity = 9.8;
    const targetY = target.y + 1.15;
    const vy = (targetY - startY + 0.5 * gravity * flightTime * flightTime) / flightTime;

    const arrowGroup = new THREE.Group();
    const shaft = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    arrowGroup.add(shaft);
    arrowGroup.position.set(shooter.x, startY, shooter.z);
    this.fxGroup.add(arrowGroup);

    this.arrows.push({
      mesh: arrowGroup,
      team: shooter.team,
      x: shooter.x,
      y: startY,
      z: shooter.z,
      vx: (dx / dist) * speed + (Math.random() - 0.5) * 0.65,
      vy,
      vz: (dz / dist) * speed + (Math.random() - 0.5) * 0.65,
      damage,
      age: 0,
    });
  }

  private updateSimulation(dt: number): void {
    // 1. Kingdom Passive Economy Tick (every 3.5s)
    this.economyTimer += dt;
    if (this.economyTimer >= 3.5) {
      this.economyTimer = 0;
      const b = this.buildingManager.computeEconomyBonuses();
      this.gold += b.goldPerTick;
      this.wood += b.woodPerTick;
      this.stone += b.stonePerTick;
      this.food += b.foodPerTick;
    }

    // 2. Hero Respawn & Stamina Recovery
    if (this.heroUnit.dead) {
      this.heroRespawnTimer -= dt;
      if (this.heroRespawnTimer <= 0) {
        this.heroUnit.dead = false;
        this.heroUnit.hp = this.heroUnit.maxHp;
        this.heroUnit.x = this.rallyX - 2;
        this.heroUnit.z = this.rallyZ + 2;
        this.heroUnit.y = groundHeightAt(this.heroUnit.x, this.heroUnit.z);
        const rootObj = this.heroUnit.proceduralRig
          ? this.heroUnit.proceduralRig.root
          : this.heroUnit.glbInstance!.root;
        rootObj.rotation.x = 0;
        rootObj.position.set(this.heroUnit.x, this.heroUnit.y, this.heroUnit.z);
        if (this.heroUnit.glbInstance) {
          this.heroUnit.glbInstance.setAnimState('idle');
        }
        this.statusMessage = 'Hero rallied back to the battlefield!';
      }
    }

    // 3. Evaluate Enemy AI Commander
    const arena = BATTLE_ARENAS[this.activeArena];
    const aliveEnemies = this.units.filter((u) => !u.dead && u.team === Team.Enemy);
    const aliveFriendlies = this.units.filter((u) => !u.dead && u.team === Team.Friendly);

    const enemyViews: TacticalUnitView[] = aliveEnemies.map((u) => ({
      id: u.id,
      type: u.type,
      team: u.team,
      x: u.x,
      z: u.z,
      hp: u.hp,
      maxHp: u.maxHp,
      dead: u.dead,
    }));
    const friendlyViews: TacticalUnitView[] = aliveFriendlies.map((u) => ({
      id: u.id,
      type: u.type,
      team: u.team,
      x: u.x,
      z: u.z,
      hp: u.hp,
      maxHp: u.maxHp,
      dead: u.dead,
    }));

    const aiDecision = this.enemyAI.evaluate(this.elapsed, arena, enemyViews, friendlyViews);
    const enemySlots = computeFormationSlots(
      enemyViews,
      aiDecision.formation,
      aiDecision.anchorX,
      aiDecision.anchorZ,
      aiDecision.facingYaw
    );
    for (const en of aliveEnemies) {
      en.order = aiDecision.order;
      const sl = enemySlots.get(en.id);
      if (sl) {
        en.slotTargetX = sl.x;
        en.slotTargetZ = sl.z;
      }
    }

    // 4. Update Playable Hero Controls (Soldier Mode vs Strategic Auto-Guard)
    this.updateHeroMovement(dt);

    // 5. Update AI & Friendly Soldiers (Movement, Separation, Targeting, Attacks)
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.attackTimer > 0) u.attackTimer = Math.max(0, u.attackTimer - dt);
      if (u.attackAnimTimer > 0) u.attackAnimTimer = Math.max(0, u.attackAnimTimer - dt);

      if (u.dead) {
        u.deathTimer -= dt;
        const rootObj = u.proceduralRig ? u.proceduralRig.root : u.glbInstance!.root;
        if (!u.glbInstance?.actions.death) {
          rootObj.rotation.x = THREE.MathUtils.damp(rootObj.rotation.x, -Math.PI * 0.46, 8, dt);
        } else {
          u.glbInstance.update(dt);
        }
        if (u.deathTimer <= 0 && !u.isHero) {
          this.unitsGroup.remove(rootObj);
          this.units.splice(i, 1);
        }
        continue;
      }

      if (!u.isHero) {
        this.stepSoldierAI(u, dt, u.team === Team.Friendly ? aliveEnemies : aliveFriendlies);
      }

      // Soft unit-to-unit collision separation
      for (let j = 0; j < this.units.length; j++) {
        const other = this.units[j];
        if (other === u || other.dead) continue;
        const dx = u.x - other.x;
        const dz = u.z - other.z;
        const dSq = dx * dx + dz * dz;
        const minSep = u.type === UnitType.Horseman || other.type === UnitType.Horseman ? 1.35 : 0.92;
        if (dSq > 0.0001 && dSq < minSep * minSep) {
          const dist = Math.sqrt(dSq);
          const push = ((minSep - dist) / dist) * 6.0 * dt;
          u.x += dx * push;
          u.z += dz * push;
        }
      }

      // Apply velocity damping & clamp inside valley bounds
      u.x = THREE.MathUtils.clamp(u.x + u.vx * dt, -80, 80);
      u.z = THREE.MathUtils.clamp(u.z + u.vz * dt, -80, 80);
      u.vx *= Math.exp(-8 * dt);
      u.vz *= Math.exp(-8 * dt);
      u.y = groundHeightAt(u.x, u.z);

      this.syncUnitVisual(u, dt);
    }

    // 6. Update Ballistic Arrows
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.age += dt;
      a.vy -= 9.8 * dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.z += a.vz * dt;

      a.mesh.position.set(a.x, a.y, a.z);
      _v1.set(a.x + a.vx, a.y + a.vy, a.z + a.vz);
      a.mesh.lookAt(_v1);

      let hit = false;
      const foes = a.team === Team.Friendly ? aliveEnemies : aliveFriendlies;
      for (const foe of foes) {
        if (foe.dead) continue;
        if (Math.abs(a.y - (foe.y + 1.05)) < 1.1 && Math.hypot(a.x - foe.x, a.z - foe.z) < 0.72) {
          this.applyDamage(null, foe, a.damage, false);
          hit = true;
          break;
        }
      }

      const groundY = groundHeightAt(a.x, a.z);
      if (hit || a.y <= groundY || a.age > 4.2) {
        this.fxGroup.remove(a.mesh);
        this.arrows.splice(i, 1);
      }
    }

    // 7. Update Hit Sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.vy -= 12 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      if (s.life <= 0) {
        this.fxGroup.remove(s.mesh);
        this.sparks.splice(i, 1);
      }
    }
  }

  private updateHeroMovement(dt: number): void {
    const hero = this.heroUnit;
    if (!hero || hero.dead) return;

    if (this.mode !== GameMode.Soldier) {
      hero.blocking = false;
      hero.sprinting = false;
      this.heroStamina = Math.min(100, this.heroStamina + 18 * dt);
      return;
    }

    // Keyboard camera yaw assist (Q / E or ArrowLeft / ArrowRight)
    if (this.keys['KeyQ'] || this.keys['ArrowLeft']) this.heroCamYaw += 2.1 * dt;
    if (this.keys['KeyE'] || this.keys['ArrowRight']) this.heroCamYaw -= 2.1 * dt;

    hero.blocking = Boolean(this.isRightMouseDown || this.keys['KeyF']);
    const moveFwd = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const moveStrafe = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);

    const wantsSprint =
      (this.keys['ShiftLeft'] || this.keys['ShiftRight']) &&
      !hero.blocking &&
      (moveFwd !== 0 || moveStrafe !== 0) &&
      this.heroStamina > 5;

    hero.sprinting = wantsSprint;
    if (wantsSprint) {
      this.heroStamina = Math.max(0, this.heroStamina - 22 * dt);
    } else {
      this.heroStamina = Math.min(100, this.heroStamina + 16 * dt);
    }

    // Smooth dynamic FOV cue when sprinting
    const targetFov = wantsSprint ? 63 : 56;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
      this.camera.updateProjectionMatrix();
    }

    if (moveFwd !== 0 || moveStrafe !== 0) {
      const camDirX = Math.sin(this.heroCamYaw);
      const camDirZ = Math.cos(this.heroCamYaw);
      const rightX = -camDirZ;
      const rightZ = camDirX;

      let mx = camDirX * moveFwd + rightX * moveStrafe;
      let mz = camDirZ * moveFwd + rightZ * moveStrafe;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;

      const baseSpeed = UNIT_SPECS[UnitType.Hero].speed;
      const mult = hero.blocking ? 0.52 : wantsSprint ? 1.52 : 1.0;
      const step = baseSpeed * mult;

      hero.x += mx * step * dt;
      hero.z += mz * step * dt;
      hero.walkPhase += dt * (wantsSprint ? 13 : 8.5);

      const targetYaw = Math.atan2(mx, mz);
      let diff = targetYaw - hero.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      hero.yaw += diff * Math.min(1, dt * 12);
    } else if (hero.blocking) {
      hero.yaw = this.heroCamYaw;
    }
  }

  private stepSoldierAI(u: UnitEntity, dt: number, opponents: UnitEntity[]): void {
    const spec = UNIT_SPECS[u.type];

    // Find nearest living opponent
    let nearest: UnitEntity | null = null;
    let nearestDist = Infinity;
    for (const opp of opponents) {
      if (opp.dead) continue;
      const d = Math.hypot(opp.x - u.x, opp.z - u.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = opp;
      }
    }

    u.blocking = u.order === OrderType.Defend || (u.type === UnitType.ShieldSoldier && nearestDist < 9);
    u.sprinting = u.order === OrderType.Charge;

    let goalX = u.slotTargetX;
    let goalZ = u.slotTargetZ;
    let shouldMove = false;

    if (u.order === OrderType.Charge && nearest) {
      goalX = nearest.x;
      goalZ = nearest.z;
      shouldMove = nearestDist > spec.attackRange * 0.85;
    } else if (u.order === OrderType.Advance && nearest) {
      if (spec.isRanged) {
        // Archers advance only until within comfortable bow range, or retreat slightly if melee closes in
        if (nearestDist > spec.attackRange * 0.88) {
          goalX = nearest.x;
          goalZ = nearest.z;
          shouldMove = true;
        } else if (nearestDist < 7.0) {
          goalX = u.x - (nearest.x - u.x);
          goalZ = u.z - (nearest.z - u.z);
          shouldMove = true;
        }
      } else if (nearestDist < 22) {
        goalX = nearest.x;
        goalZ = nearest.z;
        shouldMove = nearestDist > spec.attackRange * 0.88;
      } else {
        shouldMove = Math.hypot(u.slotTargetX - u.x, u.slotTargetZ - u.z) > 0.65;
      }
    } else if (u.order === OrderType.HoldPosition || u.order === OrderType.Stand) {
      shouldMove = Math.hypot(u.slotTargetX - u.x, u.slotTargetZ - u.z) > 0.65;
    } else if (u.order === OrderType.Defend) {
      if (!spec.isRanged && nearest && nearestDist < 5.5) {
        goalX = nearest.x;
        goalZ = nearest.z;
        shouldMove = nearestDist > spec.attackRange * 0.88;
      } else {
        shouldMove = Math.hypot(u.slotTargetX - u.x, u.slotTargetZ - u.z) > 0.6;
      }
    } else if (u.order === OrderType.Retreat) {
      shouldMove = Math.hypot(u.slotTargetX - u.x, u.slotTargetZ - u.z) > 0.8;
    }

    // Move toward goal
    if (shouldMove) {
      const dx = goalX - u.x;
      const dz = goalZ - u.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.15) {
        const mult = u.order === OrderType.Charge ? 1.32 : u.order === OrderType.Defend ? 0.85 : 1.0;
        const spd = spec.speed * mult;
        u.x += (dx / dist) * spd * dt;
        u.z += (dz / dist) * spd * dt;
        u.walkPhase += dt * (u.sprinting ? 12 : 7.5);

        const desiredYaw = Math.atan2(dx, dz);
        let diff = desiredYaw - u.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        u.yaw += diff * Math.min(1, dt * 9);
      }
    } else if (nearest) {
      // Face nearest opponent when holding/firing
      const desiredYaw = Math.atan2(nearest.x - u.x, nearest.z - u.z);
      let diff = desiredYaw - u.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      u.yaw += diff * Math.min(1, dt * 8);
    }

    // Execute Ranged or Melee Attack if in range and not retreating
    if (nearest && u.order !== OrderType.Retreat && nearestDist <= spec.attackRange && u.attackTimer <= 0) {
      u.attackTimer = spec.attackCooldown * (0.9 + Math.random() * 0.2);
      u.attackAnimTimer = 0.34;
      if (u.glbInstance) {
        u.glbInstance.setAnimState('attack');
      }
      if (spec.isRanged) {
        this.spawnArrow(u, nearest, spec.damage);
        if (Math.random() < 0.25) soundEngine.playBowRelease();
      } else {
        this.applyDamage(u, nearest, spec.damage, false);
        if (Math.random() < 0.22) soundEngine.playSwordHit();
      }
    }
  }

  private syncUnitVisual(u: UnitEntity, dt: number): void {
    const isMoving =
      u.isHero && this.mode === GameMode.Soldier
        ? Boolean(this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD'])
        : Math.hypot(u.slotTargetX - u.x, u.slotTargetZ - u.z) > 0.7 || u.sprinting;

    const hpFrac = THREE.MathUtils.clamp(u.hp / u.maxHp, 0.001, 1);

    if (u.glbInstance) {
      const inst = u.glbInstance;
      inst.root.position.set(u.x, u.y, u.z);
      inst.root.rotation.y = u.yaw;

      if (u.attackAnimTimer <= 0) {
        if (u.blocking) inst.setAnimState('block');
        else if (isMoving && u.sprinting) inst.setAnimState('run');
        else if (isMoving) inst.setAnimState('walk');
        else inst.setAnimState('idle');
      }
      inst.update(dt);

      // Fallback subtle procedural root bob/lunge if imported GLB had 0 skeletal clips
      if (!inst.mixer) {
        inst.modelRoot.position.y = isMoving ? Math.abs(Math.sin(u.walkPhase)) * 0.08 : 0;
        inst.modelRoot.rotation.x = u.attackAnimTimer > 0 ? 0.28 : u.blocking ? -0.12 : 0;
      }

      inst.hpBarFill.scale.x = hpFrac;
      inst.hpBarGroup.quaternion.copy(this.camera.quaternion);
      const ringMat = inst.selectionRing.material as THREE.MeshBasicMaterial;
      ringMat.opacity = u.isHero ? 0.9 : u.selected ? 0.85 : 0.0;
      return;
    }

    if (u.proceduralRig) {
      const rig = u.proceduralRig;
      rig.root.position.set(u.x, u.y, u.z);
      rig.root.rotation.y = u.yaw;

      const swing = isMoving ? Math.sin(u.walkPhase) * (u.sprinting ? 0.68 : 0.45) : 0;
      if (rig.horseLegs) {
        rig.horseLegs[0].rotation.x = swing;
        rig.horseLegs[3].rotation.x = swing;
        rig.horseLegs[1].rotation.x = -swing;
        rig.horseLegs[2].rotation.x = -swing;
        rig.bodyPivot.position.y = isMoving ? Math.abs(Math.sin(u.walkPhase * 2)) * 0.06 : 0;
      } else {
        rig.leftLeg.rotation.x = swing;
        rig.rightLeg.rotation.x = -swing;
        rig.bodyPivot.position.y = isMoving ? Math.abs(Math.sin(u.walkPhase)) * 0.04 : 0;
      }

      // Right arm attack slash vs walk swing
      if (u.attackAnimTimer > 0) {
        const p = 1 - u.attackAnimTimer / 0.36;
        rig.rightArm.rotation.x = -1.35 + Math.sin(p * Math.PI) * 2.15;
        rig.rightArm.rotation.z = -0.18;
      } else {
        rig.rightArm.rotation.x = THREE.MathUtils.damp(
          rig.rightArm.rotation.x,
          -swing * 0.55,
          10,
          dt
        );
        rig.rightArm.rotation.z = 0;
      }

      // Left arm shield block vs rest
      if (u.type !== UnitType.Archer) {
        const targetBlockX = u.blocking ? -0.95 : swing * 0.35;
        const targetBlockY = u.blocking ? 0.55 : 0;
        rig.leftArm.rotation.x = THREE.MathUtils.damp(rig.leftArm.rotation.x, targetBlockX, 12, dt);
        rig.leftArm.rotation.y = THREE.MathUtils.damp(rig.leftArm.rotation.y, targetBlockY, 12, dt);
      }

      rig.hpBarFill.scale.x = hpFrac;
      rig.hpBarGroup.quaternion.copy(this.camera.quaternion);
      const ringMat = rig.selectionRing.material as THREE.MeshBasicMaterial;
      ringMat.opacity = u.isHero ? 0.9 : u.selected ? 0.85 : 0.0;
    }
  }

  private updateCameras(dt: number): void {
    if (this.mode === GameMode.Soldier && this.heroUnit) {
      // Smooth third-person over-the-shoulder chase camera
      const dist = 6.2;
      const height = 2.35 + Math.sin(this.heroCamPitch) * 2.6;
      const horiz = Math.cos(this.heroCamPitch) * dist;

      // Shoulder offset slightly right of hero
      const shoulderX = -Math.cos(this.heroCamYaw) * 0.45;
      const shoulderZ = Math.sin(this.heroCamYaw) * 0.45;

      const desiredX = this.heroUnit.x - Math.sin(this.heroCamYaw) * horiz + shoulderX;
      const desiredZ = this.heroUnit.z - Math.cos(this.heroCamYaw) * horiz + shoulderZ;
      const groundAtCam = groundHeightAt(desiredX, desiredZ);
      const desiredY = Math.max(this.heroUnit.y + height, groundAtCam + 1.15);

      const dampFactor = 1 - Math.exp(-12 * dt);
      this.smoothedCamPos.lerp(_v2.set(desiredX, desiredY, desiredZ), dampFactor);
      this.camera.position.copy(this.smoothedCamPos);

      _v3.set(
        this.heroUnit.x + Math.sin(this.heroCamYaw) * 4.5,
        this.heroUnit.y + 1.55,
        this.heroUnit.z + Math.cos(this.heroCamYaw) * 4.5
      );
      this.smoothedCamLook.lerp(_v3, 1 - Math.exp(-15 * dt));
      this.camera.lookAt(this.smoothedCamLook);
    } else {
      // Strategic WASD camera panning in King & Commander Modes
      const panSpeed = (this.keys['ShiftLeft'] ? 44 : 26) * dt;
      const fwd = (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) -
                  (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
      const right = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) -
                    (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);

      if (fwd !== 0 || right !== 0) {
        this.camera.getWorldDirection(_camForward);
        _camForward.y = 0;
        _camForward.normalize();
        _camRight.crossVectors(_camForward, THREE.Object3D.DEFAULT_UP).normalize();

        _v1.set(0, 0, 0)
          .addScaledVector(_camForward, fwd * panSpeed)
          .addScaledVector(_camRight, right * panSpeed);

        this.orbitControls.target.add(_v1);
        this.camera.position.add(_v1);
        this.orbitControls.target.x = THREE.MathUtils.clamp(this.orbitControls.target.x, -78, 78);
        this.orbitControls.target.z = THREE.MathUtils.clamp(this.orbitControls.target.z, -78, 78);
      }

      this.orbitControls.update();
      this.smoothedCamPos.copy(this.camera.position);
    }

    // Keep shadow frustum centered near camera focus so shadows stay razor-sharp everywhere
    const focusX = this.mode === GameMode.Soldier ? this.heroUnit.x : this.orbitControls.target.x;
    const focusZ = this.mode === GameMode.Soldier ? this.heroUnit.z : this.orbitControls.target.z;
    this.sunLight.position.set(focusX - 42, 68, focusZ + 36);
    this.sunLight.target.position.set(focusX, 0, focusZ);
    this.sunLight.target.updateMatrixWorld();
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private tick = (): void => {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.08);
    this.elapsed += dt;

    this.world.update(this.elapsed, this.activeArena);
    this.updateSimulation(dt);
    this.updateCameras(dt);

    this.renderer.render(this.scene, this.camera);

    const now = performance.now();
    if (now - this.lastUiEmit > 160) {
      this.emitSnapshot(false);
    }

    this.scheduleNextTick();
  };

  private emitSnapshot(force: boolean): void {
    if (!force) {
      this.lastUiEmit = performance.now();
    }
    const bonuses = this.buildingManager.computeEconomyBonuses();
    const friendlySoldiers = this.units.filter(
      (u) => !u.dead && u.team === Team.Friendly && !u.isHero
    );
    const enemySoldiers = this.units.filter((u) => !u.dead && u.team === Team.Enemy);
    const selectedSoldiers = friendlySoldiers.filter((u) => u.selected);

    this.onSnapshot({
      mode: this.mode,
      gold: Math.floor(this.gold),
      wood: Math.floor(this.wood),
      stone: Math.floor(this.stone),
      food: Math.floor(this.food),
      armyCount: friendlySoldiers.length,
      armyCap: bonuses.armyCap,
      enemyCount: enemySoldiers.length,
      selectedUnitCount: selectedSoldiers.length,
      selectedUnitFilter: this.selectedUnitFilter,
      activeOrder: this.activeOrder,
      activeFormation: this.activeFormation,
      selectedBuilding: this.selectedBuilding,
      demolishMode: this.demolishMode,
      buildingRotationSteps: this.buildingRotationSteps,
      activeArena: this.activeArena,
      waveNumber: this.waveNumber,
      battleActive: enemySoldiers.length > 0,
      aiPosture: this.enemyAI.currentDecision.postureLabel,
      heroHp: Math.ceil(this.heroUnit?.hp ?? 0),
      heroMaxHp: this.heroUnit?.maxHp ?? 320,
      heroStamina: Math.round(this.heroStamina),
      heroBlocking: Boolean(this.heroUnit?.blocking),
      heroKills: this.heroKills,
      quality: this.quality,
      soundEnabled: soundEngine.enabled,
      isSoftwareGl: this.isSoftwareGl,
      heroModelInfo: this.heroModelInfo,
      enemyModelInfo: this.enemyModelInfo,
      applyHeroModelToFriendlySquad: this.applyHeroModelToFriendlySquad,
      statusMessage: this.statusMessage,
    });
  }

  private cancelLoop(): void {
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  }

  public dispose(): void {
    this.disposed = true;
    this.cancelLoop();

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('pointerup', this.handlePointerUp);

    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('contextmenu', this.handleContextMenu);
      this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
      this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    }

    this.arrowGeo.dispose();
    this.arrowMat.dispose();
    this.sparkGeo.dispose();
    this.sparkMat.dispose();
    this.world?.dispose();
    this.buildingManager?.dispose();
    this.textures?.dispose();
    this.charRegistry.dispose();
    this.orbitControls?.dispose();
    this.renderer?.dispose();
  }
}
