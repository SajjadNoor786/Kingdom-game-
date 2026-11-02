import * as THREE from 'three';
import { BUILDING_SPECS, GRID_CELL_SIZE } from './constants';
import { ProceduralTextureSet } from './textures';
import { BuildingType } from './types';
import { groundHeightAt } from './world';

export interface PlacedBuilding {
  id: string;
  type: BuildingType;
  gridX: number;
  gridZ: number;
  baseY: number;
  rotationSteps: number;
  mesh: THREE.Group;
  playerPlaced: boolean;
}

export class BuildingManager {
  public readonly group = new THREE.Group();
  public readonly ghostGroup = new THREE.Group();
  public buildings: PlacedBuilding[] = [];
  private textures: ProceduralTextureSet;
  private currentGhostType: BuildingType | null = null;
  private materials: Record<string, THREE.MeshStandardMaterial>;

  constructor(textures: ProceduralTextureSet) {
    this.textures = textures;
    this.group.name = 'BuildingsGroup';
    this.ghostGroup.name = 'BuildingGhost';
    this.ghostGroup.visible = false;

    this.materials = {
      stone: new THREE.MeshStandardMaterial({
        map: textures.stoneWall,
        roughness: 0.86,
        metalness: 0.05,
      }),
      stoneDark: new THREE.MeshStandardMaterial({
        color: '#57534e',
        roughness: 0.78,
        metalness: 0.12,
      }),
      timber: new THREE.MeshStandardMaterial({
        map: textures.timberWall,
        roughness: 0.82,
        metalness: 0.04,
      }),
      wood: new THREE.MeshStandardMaterial({
        color: '#5c3d24',
        roughness: 0.85,
        metalness: 0.05,
      }),
      roof: new THREE.MeshStandardMaterial({
        map: textures.roofShingle,
        roughness: 0.76,
        metalness: 0.06,
      }),
      slateRoof: new THREE.MeshStandardMaterial({
        color: '#293548',
        roughness: 0.65,
        metalness: 0.18,
      }),
      iron: new THREE.MeshStandardMaterial({
        color: '#27272a',
        roughness: 0.42,
        metalness: 0.82,
      }),
      wheat: new THREE.MeshStandardMaterial({
        map: textures.wheatField,
        roughness: 0.92,
        metalness: 0.02,
      }),
      banner: new THREE.MeshStandardMaterial({
        map: textures.friendlyBanner,
        side: THREE.DoubleSide,
        roughness: 0.75,
      }),
      windowGlow: new THREE.MeshStandardMaterial({
        color: '#fbbf24',
        emissive: '#d97706',
        emissiveIntensity: 0.55,
        roughness: 0.35,
      }),
    };
  }

  // Construct 3–12 part procedural medieval buildings pivoted cleanly at bottom-center (y = 0)
  public createBuildingMesh(type: BuildingType, isGhost = false): THREE.Group {
    const g = new THREE.Group();
    const m = this.materials;

    switch (type) {
      case BuildingType.Wall: {
        // 1x1 cell (2x2m) stackable ashlar wall block + stone plinth + merlon crenellations
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.3, 2.04), m.stoneDark);
        plinth.position.y = 0.15;
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.94, 1.7, 1.94), m.stone);
        body.position.y = 1.15;
        const walkway = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 2.02), m.stoneDark);
        walkway.position.y = 2.1;
        g.add(plinth, body, walkway);
        for (const mx of [-0.62, 0.62]) {
          const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.42), m.stone);
          merlon.position.set(mx, 2.41, 0.78);
          const merlonBack = merlon.clone();
          merlonBack.position.z = -0.78;
          g.add(merlon, merlonBack);
        }
        break;
      }

      case BuildingType.Tower: {
        // 2x2 cells (4x4m) fortified watchtower: battered plinth, main shaft, corbelled parapet, conical slate roof, pennant
        const base = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.9, 3.8), m.stoneDark);
        base.position.y = 0.45;
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(3.3, 4.4, 3.3), m.stone);
        shaft.position.y = 3.1;
        const corbel = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.55, 3.9), m.stoneDark);
        corbel.position.y = 5.55;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.65, 2.4, 4), m.slateRoof);
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 7.0;
        // Arrow slits
        const slitN = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 3.38), m.iron);
        slitN.position.y = 3.5;
        const slitE = new THREE.Mesh(new THREE.BoxGeometry(3.38, 1.1, 0.22), m.iron);
        slitE.position.y = 3.5;
        // Pennant pole
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), m.iron);
        pole.position.y = 8.5;
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.45), m.banner);
        flag.position.set(0.42, 8.85, 0);
        g.add(base, shaft, corbel, roof, slitN, slitE, pole, flag);
        break;
      }

      case BuildingType.Gate: {
        // 3x1 cells (6x2m) arched gatehouse with twin piers, overhead gallery, iron portcullis
        const leftPier = new THREE.Mesh(new THREE.BoxGeometry(1.75, 4.4, 2.2), m.stone);
        leftPier.position.set(-2.1, 2.2, 0);
        const rightPier = new THREE.Mesh(new THREE.BoxGeometry(1.75, 4.4, 2.2), m.stone);
        rightPier.position.set(2.1, 2.2, 0);
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.35, 2.25), m.stone);
        lintel.position.set(0, 3.72, 0);
        const parapet = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.45, 2.45), m.stoneDark);
        parapet.position.set(0, 4.62, 0);
        // Portcullis iron bars
        for (let bx = -0.9; bx <= 0.9; bx += 0.45) {
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), m.iron);
          bar.position.set(bx, 1.95, 0);
          g.add(bar);
        }
        const crossBar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.14), m.iron);
        crossBar.position.set(0, 2.55, 0);
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.35), m.banner);
        banner.position.set(0, 3.65, 1.16);
        g.add(leftPier, rightPier, lintel, parapet, crossBar, banner);
        break;
      }

      case BuildingType.Keep: {
        // 4x4 cells (8x8m) monumental castle keep with 4 corner turrets, grand entrance stair, royal standard
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(7.8, 1.1, 7.8), m.stoneDark);
        plinth.position.y = 0.55;
        const core = new THREE.Mesh(new THREE.BoxGeometry(6.6, 7.4, 6.6), m.stone);
        core.position.y = 4.8;
        const crown = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.6, 7.1), m.stoneDark);
        crown.position.y = 8.7;
        g.add(plinth, core, crown);

        for (const [tx, tz] of [
          [-3.1, -3.1],
          [3.1, -3.1],
          [-3.1, 3.1],
          [3.1, 3.1],
        ]) {
          const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 9.6, 8), m.stone);
          turret.position.set(tx, 4.8, tz);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.9, 8), m.slateRoof);
          cap.position.set(tx, 10.5, tz);
          g.add(turret, cap);
        }

        const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.5, 0.35), m.wood);
        door.position.set(0, 2.2, 3.32);
        const steps = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 1.4), m.stoneDark);
        steps.position.set(0, 0.5, 4.1);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.0, 6), m.iron);
        mast.position.set(0, 10.4, 0);
        const royalBanner = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.0), m.banner);
        royalBanner.position.set(0.65, 10.9, 0);
        g.add(door, steps, mast, royalBanner);
        break;
      }

      case BuildingType.House: {
        // 2x2 cells (4x4m) medieval timber-frame cottage with stone foundation, pitched roof, chimney, glowing windows
        const found = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.55, 3.5), m.stoneDark);
        found.position.y = 0.275;
        const walls = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.3, 3.3), m.timber);
        walls.position.y = 1.7;
        // Pitched prism roof (4-sided cone stretched or rotated cylinder)
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.9, 4), m.roof);
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 3.78;
        const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.2, 0.55), m.stone);
        chimney.position.set(1.15, 3.6, -0.8);
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.45, 0.12), m.wood);
        door.position.set(0, 1.25, 1.68);
        const winL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.12), m.windowGlow);
        winL.position.set(-1.0, 1.75, 1.67);
        const winR = winL.clone();
        winR.position.x = 1.0;
        g.add(found, walls, roof, chimney, door, winL, winR);
        break;
      }

      case BuildingType.Farm: {
        // 3x3 cells (6x6m) plowed golden wheat plot with timber rail fences & grain granary bin
        const soil = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.22, 5.7), m.wheat);
        soil.position.y = 0.11;
        g.add(soil);
        // 3D golden wheat crop strips
        const cropMat = new THREE.MeshStandardMaterial({
          color: '#d4a638',
          roughness: 0.88,
        });
        for (let row = -2.1; row <= 2.1; row += 0.85) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.42, 0.42), cropMat);
          strip.position.set(0, 0.4, row);
          g.add(strip);
        }
        // Corner fence posts & rails
        for (const fx of [-2.75, 2.75]) {
          for (const fz of [-2.75, 0, 2.75]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.9, 6), m.wood);
            post.position.set(fx, 0.45, fz);
            g.add(post);
          }
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 5.5), m.wood);
          rail.position.set(fx, 0.68, 0);
          g.add(rail);
        }
        break;
      }

      case BuildingType.Barracks: {
        // 3x2 cells (6x4m) fortified military hall + training yard rack + faction standard
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.5, 3.8), m.stoneDark);
        plinth.position.y = 0.25;
        const hall = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.6, 3.5), m.timber);
        hall.position.set(-0.75, 1.8, 0);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.8, 4), m.slateRoof);
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(1.15, 1, 0.92);
        roof.position.set(-0.75, 3.95, 0);
        // Weapon rack & training dummy on yard side
        const dummyPost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 6), m.wood);
        dummyPost.position.set(2.0, 1.1, 0.6);
        const dummyShoulders = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.18), m.wood);
        dummyShoulders.position.set(2.0, 1.55, 0.6);
        const bannerPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 4.2, 6), m.iron);
        bannerPole.position.set(2.1, 2.3, -1.1);
        const bannerCloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), m.banner);
        bannerCloth.position.set(2.58, 3.3, -1.1);
        g.add(plinth, hall, roof, dummyPost, dummyShoulders, bannerPole, bannerCloth);
        break;
      }
    }

    g.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (isGhost) {
          mesh.material = new THREE.MeshStandardMaterial({
            color: '#38bdf8',
            emissive: '#0284c7',
            emissiveIntensity: 0.45,
            transparent: true,
            opacity: 0.52,
            depthWrite: false,
          });
          mesh.castShadow = false;
          mesh.receiveShadow = false;
        } else {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      }
    });

    if (isGhost) {
      // Forward heading arrow on ghost so rotation is unmistakable
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 0.75, 4),
        new THREE.MeshBasicMaterial({ color: '#facc15' })
      );
      arrow.rotation.x = Math.PI / 2;
      const spec = BUILDING_SPECS[type];
      arrow.position.set(0, 0.5, spec.footprintZ * GRID_CELL_SIZE * 0.5 + 0.55);
      g.add(arrow);
    }

    return g;
  }

  public updateGhost(
    type: BuildingType | null,
    worldX: number,
    worldZ: number,
    rotationSteps: number
  ): { gridX: number; gridZ: number; baseY: number } | null {
    if (!type) {
      this.ghostGroup.visible = false;
      this.currentGhostType = null;
      return null;
    }

    if (this.currentGhostType !== type) {
      this.ghostGroup.clear();
      this.ghostGroup.add(this.createBuildingMesh(type, true));
      this.currentGhostType = type;
    }

    const gridX = Math.round(worldX / GRID_CELL_SIZE);
    const gridZ = Math.round(worldZ / GRID_CELL_SIZE);
    const snappedX = gridX * GRID_CELL_SIZE;
    const snappedZ = gridZ * GRID_CELL_SIZE;
    const baseY = this.computePlacementY(type, gridX, gridZ);

    this.ghostGroup.visible = true;
    this.ghostGroup.position.set(snappedX, baseY, snappedZ);
    this.ghostGroup.rotation.y = (rotationSteps % 4) * (Math.PI / 2);

    return { gridX, gridZ, baseY };
  }

  public computePlacementY(type: BuildingType, gridX: number, gridZ: number): number {
    const spec = BUILDING_SPECS[type];
    const worldX = gridX * GRID_CELL_SIZE;
    const worldZ = gridZ * GRID_CELL_SIZE;
    let y = groundHeightAt(worldX, worldZ);

    if (spec.stackable) {
      // Allow Minecraft-style vertical stacking on top of existing stackable blocks at same cell
      for (const b of this.buildings) {
        if (b.gridX === gridX && b.gridZ === gridZ && BUILDING_SPECS[b.type].stackable) {
          const topY = b.baseY + BUILDING_SPECS[b.type].blockHeight;
          if (topY > y) y = topY;
        }
      }
    }
    return y;
  }

  public canPlace(type: BuildingType, gridX: number, gridZ: number): boolean {
    const spec = BUILDING_SPECS[type];
    if (spec.stackable) {
      return true;
    }
    for (const b of this.buildings) {
      const otherSpec = BUILDING_SPECS[b.type];
      const dx = Math.abs(b.gridX - gridX);
      const dz = Math.abs(b.gridZ - gridZ);
      const minX = (spec.footprintX + otherSpec.footprintX) * 0.5;
      const minZ = (spec.footprintZ + otherSpec.footprintZ) * 0.5;
      if (dx < minX && dz < minZ) {
        return false;
      }
    }
    return true;
  }

  public placeBuilding(
    type: BuildingType,
    gridX: number,
    gridZ: number,
    rotationSteps: number,
    playerPlaced = true
  ): PlacedBuilding | null {
    if (!this.canPlace(type, gridX, gridZ)) return null;

    const baseY = this.computePlacementY(type, gridX, gridZ);
    const mesh = this.createBuildingMesh(type, false);
    const worldX = gridX * GRID_CELL_SIZE;
    const worldZ = gridZ * GRID_CELL_SIZE;
    mesh.position.set(worldX, baseY, worldZ);
    mesh.rotation.y = (rotationSteps % 4) * (Math.PI / 2);

    const record: PlacedBuilding = {
      id: `bld_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      gridX,
      gridZ,
      baseY,
      rotationSteps,
      mesh,
      playerPlaced,
    };
    mesh.userData.buildingId = record.id;

    this.buildings.push(record);
    this.group.add(mesh);
    return record;
  }

  public removeBuildingById(id: string): PlacedBuilding | null {
    const idx = this.buildings.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    const [removed] = this.buildings.splice(idx, 1);
    this.group.remove(removed.mesh);
    return removed;
  }

  // Spawn initial working vertical slice: One Castle on NW plateau + One Village & Farms below!
  public populateInitialKingdom(): void {
    // Castle Keep at (-19, -14) grid -> world (-38, -28)
    this.placeBuilding(BuildingType.Keep, -19, -14, 0, false);

    // Castle Curtain Walls & Corner Watchtowers
    this.placeBuilding(BuildingType.Tower, -23, -18, 0, false);
    this.placeBuilding(BuildingType.Tower, -15, -18, 0, false);
    this.placeBuilding(BuildingType.Tower, -23, -10, 0, false);
    this.placeBuilding(BuildingType.Tower, -15, -10, 0, false);

    // North curtain wall
    for (let gx = -21; gx <= -17; gx++) {
      this.placeBuilding(BuildingType.Wall, gx, -18, 0, false);
    }
    // West & East curtain walls
    for (let gz = -16; gz <= -12; gz++) {
      this.placeBuilding(BuildingType.Wall, -23, gz, 1, false);
      this.placeBuilding(BuildingType.Wall, -15, gz, 1, false);
    }
    // South wall + Gatehouse opening onto the road
    this.placeBuilding(BuildingType.Wall, -21, -10, 0, false);
    this.placeBuilding(BuildingType.Gate, -19, -10, 0, false);
    this.placeBuilding(BuildingType.Wall, -17, -10, 0, false);

    // Royal Garrison Barracks beside castle road
    this.placeBuilding(BuildingType.Barracks, -12, -13, 3, false);

    // Small Medieval Village & Farms along the valley terrace (-30, 20) -> grid (-15, 10)
    this.placeBuilding(BuildingType.House, -17, 7, 1, false);
    this.placeBuilding(BuildingType.House, -17, 11, 1, false);
    this.placeBuilding(BuildingType.House, -12, 8, 3, false);
    this.placeBuilding(BuildingType.Barracks, -12, 13, 0, false);
    this.placeBuilding(BuildingType.Farm, -18, 16, 0, false);
    this.placeBuilding(BuildingType.Farm, -13, 18, 0, false);
  }

  public computeEconomyBonuses(): {
    armyCap: number;
    goldPerTick: number;
    woodPerTick: number;
    stonePerTick: number;
    foodPerTick: number;
  } {
    let armyCap = 12;
    let goldPerTick = 5;
    let woodPerTick = 3;
    let stonePerTick = 3;
    let foodPerTick = 4;

    for (const b of this.buildings) {
      if (b.type === BuildingType.Keep) goldPerTick += 8;
      if (b.type === BuildingType.House) {
        armyCap += 4;
        goldPerTick += 3;
      }
      if (b.type === BuildingType.Barracks) {
        armyCap += 8;
      }
      if (b.type === BuildingType.Farm) {
        foodPerTick += 6;
        woodPerTick += 4;
      }
      if (b.type === BuildingType.Tower) {
        stonePerTick += 1;
      }
    }

    return { armyCap, goldPerTick, woodPerTick, stonePerTick, foodPerTick };
  }

  public dispose(): void {
    Object.values(this.materials).forEach((m) => m.dispose());
  }
}
