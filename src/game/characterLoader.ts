import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { PROVIDED_ENEMY_LINK, PROVIDED_HERO_LINK } from './constants';
import { CharacterModelInfo, Team } from './types';

export type AnimStateKey = 'idle' | 'walk' | 'run' | 'attack' | 'block' | 'death';

export interface LoadedCharacterAsset {
  templateScene: THREE.Group;
  clips: THREE.AnimationClip[];
  mappedClipNames: Record<AnimStateKey, string | null>;
  info: CharacterModelInfo;
}

export interface ClonedCharacterInstance {
  root: THREE.Group;
  modelRoot: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  actions: Partial<Record<AnimStateKey, THREE.AnimationAction>>;
  currentState: AnimStateKey | null;
  selectionRing: THREE.Mesh;
  hpBarFill: THREE.Mesh;
  hpBarGroup: THREE.Group;
  setAnimState: (state: AnimStateKey) => void;
  update: (dt: number) => void;
}

const CLIP_PATTERNS: Record<AnimStateKey, RegExp> = {
  idle: /idle|stand|breathe|wait|rest|pose/i,
  walk: /walk|march|patrol|step|move/i,
  run: /run|sprint|jog|charge|dash/i,
  attack: /attack|slash|strike|swing|hit|punch|shoot|combat|melee/i,
  block: /block|defend|guard|parry|shield/i,
  death: /death|die|dead|fall|defeat/i,
};

export function createInitialCharacterInfo(slot: 'hero' | 'enemy'): CharacterModelInfo {
  if (slot === 'hero') {
    return {
      slot: 'hero',
      status: 'placeholder_from_image_link',
      providedUrl: PROVIDED_HERO_LINK,
      resolvedSummary:
        'Shared Google Image link pointing to Sketchfab preview "British NATO Military Soldier" (download disabled, 0 skeletal animations, JPEG thumbnail only — not a .glb/.gltf 3D file).',
      fileName: null,
      hasSkeletalAnimations: false,
      detectedClips: [],
      mappedStates: {
        idle: null,
        walk: null,
        run: null,
        attack: null,
        block: null,
        death: null,
      },
      vertexCount: 0,
    };
  }
  return {
    slot: 'enemy',
    status: 'placeholder_from_image_link',
    providedUrl: PROVIDED_ENEMY_LINK,
    resolvedSummary:
      'Shared Google Image link pointing to an Instagram 2D photo (instagram.com/p/Deo3lfHji44/ — 2D image only, not a .glb/.gltf 3D model).',
    fileName: null,
    hasSkeletalAnimations: false,
    detectedClips: [],
    mappedStates: {
      idle: null,
      walk: null,
      run: null,
      attack: null,
      block: null,
      death: null,
    },
    vertexCount: 0,
  };
}

export class CharacterAssetRegistry {
  private gltfLoader: GLTFLoader;
  private dracoLoader: DRACOLoader;
  public heroAsset: LoadedCharacterAsset | null = null;
  public enemyAsset: LoadedCharacterAsset | null = null;

  constructor() {
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
  }

  public async loadFromFile(slot: 'hero' | 'enemy', file: File): Promise<LoadedCharacterAsset> {
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.glb') && !ext.endsWith('.gltf')) {
      throw new Error(
        `Unsupported file "${file.name}". Please upload a 3D .glb or .gltf character model (2D images cannot be used as 3D characters).`
      );
    }

    const buffer = await file.arrayBuffer();
    const gltf = await new Promise<GLTF>((resolve, reject) => {
      this.gltfLoader.parse(buffer, '', resolve, reject);
    });

    return this.processLoadedGLTF(slot, gltf, file.name, `Local file (${file.name})`);
  }

  public async loadFromUrl(slot: 'hero' | 'enemy', url: string): Promise<LoadedCharacterAsset> {
    const trimmed = url.trim();
    if (!trimmed) {
      throw new Error('Please enter a direct URL to a .glb or .gltf model file.');
    }
    if (trimmed.includes('share.google') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(trimmed)) {
      throw new Error(
        'That link points to a 2D image or web search preview, not a .glb/.gltf 3D character binary. Upload a .glb file or provide a direct .glb/.gltf URL.'
      );
    }

    const gltf = await new Promise<GLTF>((resolve, reject) => {
      this.gltfLoader.load(trimmed, resolve, undefined, () => {
        reject(
          new Error(
            'Could not fetch or parse .glb/.gltf from URL (check CORS headers or download the .glb and upload it directly).'
          )
        );
      });
    });

    const fileName = trimmed.split('/').pop()?.split('?')[0] || 'remote_character.glb';
    return this.processLoadedGLTF(slot, gltf, fileName, trimmed);
  }

  private processLoadedGLTF(
    slot: 'hero' | 'enemy',
    gltf: GLTF,
    fileName: string,
    sourceLabel: string
  ): LoadedCharacterAsset {
    const rawScene = gltf.scene;
    let vertexCount = 0;
    let hasSkinnedMesh = false;

    rawScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.geometry?.attributes?.position) {
          vertexCount += mesh.geometry.attributes.position.count;
        }
        if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
          hasSkinnedMesh = true;
        }
      }
    });

    // Normalize character height to ~1.88m and ground feet cleanly at y = 0
    const wrapper = new THREE.Group();
    wrapper.add(rawScene);
    wrapper.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(rawScene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const targetHeight = 1.88;
    const maxDim = Math.max(size.y, 0.001);
    const scale = targetHeight / maxDim;

    rawScene.scale.multiplyScalar(scale);
    rawScene.updateMatrixWorld(true);

    const scaledBox = new THREE.Box3().setFromObject(rawScene);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    rawScene.position.x -= scaledCenter.x;
    rawScene.position.z -= scaledCenter.z;
    rawScene.position.y -= scaledBox.min.y;
    void center;

    const clips = gltf.animations || [];
    const clipNames = clips.map((c) => c.name || 'UnnamedClip');

    const mappedClipNames: Record<AnimStateKey, string | null> = {
      idle: null,
      walk: null,
      run: null,
      attack: null,
      block: null,
      death: null,
    };

    (Object.keys(CLIP_PATTERNS) as AnimStateKey[]).forEach((stateKey) => {
      const regex = CLIP_PATTERNS[stateKey];
      const match = clips.find((c) => regex.test(c.name));
      if (match) {
        mappedClipNames[stateKey] = match.name;
      }
    });

    // Sensible fallbacks if a model has generic clip names
    if (!mappedClipNames.idle && clips[0]) {
      mappedClipNames.idle = clips[0].name;
    }
    if (!mappedClipNames.walk && mappedClipNames.run) {
      mappedClipNames.walk = mappedClipNames.run;
    }
    if (!mappedClipNames.run && mappedClipNames.walk) {
      mappedClipNames.run = mappedClipNames.walk;
    }

    const info: CharacterModelInfo = {
      slot,
      status: 'loaded_glb',
      providedUrl: sourceLabel,
      resolvedSummary:
        clips.length > 0
          ? `Active 3D GLB/GLTF character (${clips.length} animation clip${clips.length === 1 ? '' : 's'}${hasSkinnedMesh ? ', SkinnedMesh rig' : ''}).`
          : 'Active 3D GLB/GLTF mesh loaded (0 embedded animation clips — procedural combat motion applied).',
      fileName,
      hasSkeletalAnimations: clips.length > 0,
      detectedClips: clipNames,
      mappedStates: mappedClipNames,
      vertexCount,
    };

    const asset: LoadedCharacterAsset = {
      templateScene: wrapper,
      clips,
      mappedClipNames,
      info,
    };

    if (slot === 'hero') {
      this.heroAsset = asset;
    } else {
      this.enemyAsset = asset;
    }

    return asset;
  }

  public instantiateCharacter(
    asset: LoadedCharacterAsset,
    team: Team,
    isHero: boolean,
    contactShadow: THREE.Texture
  ): ClonedCharacterInstance {
    const root = new THREE.Group();
    const clonedModel = SkeletonUtils.clone(asset.templateScene);
    root.add(clonedModel);

    // Contact shadow
    const shadowGeo = new THREE.PlaneGeometry(1.35, 1.35);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({
        map: contactShadow,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      })
    );
    shadow.position.y = 0.03;
    root.add(shadow);

    // Selection ring
    const ringGeo = new THREE.RingGeometry(isHero ? 0.69 : 0.53, isHero ? 0.78 : 0.62, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const selectionRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: isHero ? '#facc15' : team === Team.Friendly ? '#38bdf8' : '#ef4444',
        transparent: true,
        opacity: isHero ? 0.85 : 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    selectionRing.position.y = 0.05;
    root.add(selectionRing);

    // Overhead HP Bar
    const hpBarGroup = new THREE.Group();
    hpBarGroup.position.y = isHero ? 2.28 : 2.12;
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.11),
      new THREE.MeshBasicMaterial({ color: '#1c1917', side: THREE.DoubleSide })
    );
    const fillGeo = new THREE.PlaneGeometry(0.86, 0.07);
    fillGeo.translate(0.43, 0, 0);
    const hpBarFill = new THREE.Mesh(
      fillGeo,
      new THREE.MeshBasicMaterial({
        color: isHero ? '#facc15' : team === Team.Friendly ? '#22c55e' : '#ef4444',
        side: THREE.DoubleSide,
      })
    );
    hpBarFill.position.set(-0.43, 0, 0.01);
    hpBarGroup.add(bg, hpBarFill);
    root.add(hpBarGroup);

    let mixer: THREE.AnimationMixer | null = null;
    const actions: Partial<Record<AnimStateKey, THREE.AnimationAction>> = {};

    if (asset.clips.length > 0) {
      mixer = new THREE.AnimationMixer(clonedModel);
      (Object.keys(asset.mappedClipNames) as AnimStateKey[]).forEach((stateKey) => {
        const clipName = asset.mappedClipNames[stateKey];
        if (!clipName) return;
        const clip = asset.clips.find((c) => c.name === clipName);
        if (clip && mixer) {
          const action = mixer.clipAction(clip);
          if (stateKey === 'attack' || stateKey === 'death') {
            action.loop = THREE.LoopOnce;
            action.clampWhenFinished = stateKey === 'death';
          }
          actions[stateKey] = action;
        }
      });
    }

    const instance: ClonedCharacterInstance = {
      root,
      modelRoot: clonedModel,
      mixer,
      actions,
      currentState: null,
      selectionRing,
      hpBarFill,
      hpBarGroup,
      setAnimState(nextState: AnimStateKey) {
        if (this.currentState === nextState && nextState !== 'attack') return;
        const nextAction = this.actions[nextState] || this.actions.idle;
        if (!nextAction) {
          this.currentState = nextState;
          return;
        }
        const prevAction = this.currentState ? this.actions[this.currentState] : undefined;
        if (prevAction && prevAction !== nextAction) {
          prevAction.fadeOut(0.16);
        }
        nextAction.reset().fadeIn(0.16).play();
        this.currentState = nextState;
      },
      update(dt: number) {
        if (this.mixer) {
          this.mixer.update(dt);
        }
      },
    };

    instance.setAnimState('idle');
    return instance;
  }

  /**
   * Generates a real, downloadable/importable animated .GLB character binary in-browser via GLTFExporter
   * so users without a local .glb file handy can test the full GLB/GLTF animation loader pipeline.
   */
  public async generateSampleAnimatedGlbFile(variant: 'hero' | 'enemy'): Promise<File> {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.name = 'CustomCommanderRig';

    const primaryColor = variant === 'hero' ? '#365314' : '#18181b'; // NATO olive vs Shadow obsidian
    const accentColor = variant === 'hero' ? '#eab308' : '#dc2626';

    const armorMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      roughness: 0.45,
      metalness: 0.45,
    });
    const plateMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.25,
      metalness: 0.85,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.4,
      metalness: 0.6,
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.3), armorMat);
    torso.name = 'Torso';
    torso.position.y = 1.22;

    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.34), accentMat);
    chestPlate.position.y = 1.28;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), armorMat);
    head.name = 'Head';
    head.position.y = 1.75;

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.06), plateMat);
    visor.position.set(0, 1.76, 0.16);

    const rArm = new THREE.Group();
    rArm.name = 'RightArm';
    rArm.position.set(0.34, 1.46, 0);
    const rArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.14), armorMat);
    rArmMesh.position.y = -0.26;
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.95), plateMat);
    sword.position.set(0, -0.5, 0.5);
    rArm.add(rArmMesh, sword);

    const lArm = new THREE.Group();
    lArm.name = 'LeftArm';
    lArm.position.set(-0.34, 1.46, 0);
    const lArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.14), armorMat);
    lArmMesh.position.y = -0.26;
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.68, 0.5), accentMat);
    shield.position.set(-0.08, -0.32, 0.15);
    lArm.add(lArmMesh, shield);

    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.88, 0.18), armorMat);
    lLeg.name = 'LeftLeg';
    lLeg.position.set(-0.14, 0.44, 0);

    const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.88, 0.18), armorMat);
    rLeg.name = 'RightLeg';
    rLeg.position.set(0.14, 0.44, 0);

    root.add(torso, chestPlate, head, visor, rArm, lArm, lLeg, rLeg);
    scene.add(root);

    // Build Idle, Walk, Run, Attack, Block AnimationClips
    const q = (rx: number, ry = 0, rz = 0) => {
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
      return [quat.x, quat.y, quat.z, quat.w];
    };

    const idleClip = new THREE.AnimationClip('Idle', 1.6, [
      new THREE.VectorKeyframeTrack('Torso.position', [0, 0.8, 1.6], [0, 1.22, 0, 0, 1.25, 0, 0, 1.22, 0]),
    ]);

    const walkClip = new THREE.AnimationClip('Walk', 0.8, [
      new THREE.QuaternionKeyframeTrack('LeftLeg.quaternion', [0, 0.2, 0.4, 0.6, 0.8], [
        ...q(0), ...q(0.45), ...q(0), ...q(-0.45), ...q(0),
      ]),
      new THREE.QuaternionKeyframeTrack('RightLeg.quaternion', [0, 0.2, 0.4, 0.6, 0.8], [
        ...q(0), ...q(-0.45), ...q(0), ...q(0.45), ...q(0),
      ]),
    ]);

    const runClip = new THREE.AnimationClip('Run', 0.5, [
      new THREE.QuaternionKeyframeTrack('LeftLeg.quaternion', [0, 0.125, 0.25, 0.375, 0.5], [
        ...q(0), ...q(0.75), ...q(0), ...q(-0.75), ...q(0),
      ]),
      new THREE.QuaternionKeyframeTrack('RightLeg.quaternion', [0, 0.125, 0.25, 0.375, 0.5], [
        ...q(0), ...q(-0.75), ...q(0), ...q(0.75), ...q(0),
      ]),
    ]);

    const attackClip = new THREE.AnimationClip('Attack', 0.45, [
      new THREE.QuaternionKeyframeTrack('RightArm.quaternion', [0, 0.14, 0.28, 0.45], [
        ...q(0), ...q(-1.35, 0.2), ...q(0.85, -0.25), ...q(0),
      ]),
    ]);

    const blockClip = new THREE.AnimationClip('Block', 0.4, [
      new THREE.QuaternionKeyframeTrack('LeftArm.quaternion', [0, 0.2, 0.4], [
        ...q(0), ...q(-0.85, 0.55), ...q(-0.85, 0.55),
      ]),
    ]);

    const exporter = new GLTFExporter();
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        scene,
        (result) => {
          if (result instanceof ArrayBuffer) resolve(result);
          else reject(new Error('Expected binary GLB output'));
        },
        (err) => reject(err),
        {
          binary: true,
          animations: [idleClip, walkClip, runClip, attackClip, blockClip],
        }
      );
    });

    const filename =
      variant === 'hero' ? 'custom_tactical_hero.glb' : 'shadow_vanguard_enemy.glb';
    return new File([arrayBuffer], filename, { type: 'model/gltf-binary' });
  }

  public dispose(): void {
    this.dracoLoader.dispose();
  }
}
