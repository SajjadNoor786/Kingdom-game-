import * as THREE from 'three';
import { BATTLE_ARENAS } from './constants';
import { ProceduralTextureSet } from './textures';
import { BattleArenaId, QualityTier } from './types';

// Deterministic smooth medieval valley heightfield.
// Playable region ~[-85..85, -85..85], extended terrain [-160..160] surrounded by natural mountain ridges.
export function groundHeightAt(x: number, z: number): number {
  // 1. Base rolling valley floor
  let h =
    Math.sin(x * 0.032) * Math.cos(z * 0.028) * 1.15 +
    Math.sin(x * 0.075 + z * 0.05) * 0.35;

  // 2. Flatten key settlement & battle zones so castles, villages, and formations stand cleanly
  // Castle crag plateau around (-38, -28)
  const dxCastle = x - -38;
  const dzCastle = z - -28;
  const distCastle = Math.sqrt(dxCastle * dxCastle + dzCastle * dzCastle);
  if (distCastle < 26) {
    const plateauBlend = THREE.MathUtils.smoothstep(26 - distCastle, 0, 10);
    h = THREE.MathUtils.lerp(h, 5.2, plateauBlend);
  }

  // Approach ramp from castle gate (-26, -20) toward village (-28, 12)
  const rampT = THREE.MathUtils.clamp((z - -20) / 28, 0, 1);
  const rampCenterX = THREE.MathUtils.lerp(-30, -28, rampT);
  const distRamp = Math.abs(x - rampCenterX);
  if (z >= -22 && z <= 10 && distRamp < 7) {
    const rb = THREE.MathUtils.smoothstep(7 - distRamp, 0, 4);
    const targetRampH = THREE.MathUtils.lerp(5.2, 0.8, rampT);
    h = THREE.MathUtils.lerp(h, targetRampH, rb * 0.85);
  }

  // Village & Farm terrace around (-30, 20)
  const dxVil = x - -30;
  const dzVil = z - 20;
  const distVil = Math.sqrt(dxVil * dxVil + dzVil * dzVil);
  if (distVil < 24) {
    const vb = THREE.MathUtils.smoothstep(24 - distVil, 0, 9);
    h = THREE.MathUtils.lerp(h, 0.8, vb);
  }

  // Flatten the 3 battle arenas gently for crisp unit combat
  Object.values(BATTLE_ARENAS).forEach((arena) => {
    const dx = x - arena.centerX;
    const dz = z - arena.centerZ;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 24) {
      const ab = THREE.MathUtils.smoothstep(24 - d, 0, 9);
      const targetH = arena.id === BattleArenaId.HighcragPass ? 2.4 : 0.45;
      h = THREE.MathUtils.lerp(h, targetH, ab);
    }
  });

  // Shallow river stream running north-south near x = 42 (outside central arena) with ford
  const streamCenterX = 44 + Math.sin(z * 0.04) * 6;
  const distStream = Math.abs(x - streamCenterX);
  if (distStream < 6.5) {
    const sb = THREE.MathUtils.smoothstep(6.5 - distStream, 0, 4);
    h -= sb * 1.45;
  }

  // Natural perimeter mountain ring beyond radius 78m (no rectangular indoor walls!)
  const radial = Math.sqrt(x * x + z * z);
  if (radial > 76) {
    const mFactor = (radial - 76) / 65;
    const ridgeNoise =
      Math.abs(Math.sin(x * 0.065) * Math.cos(z * 0.065)) * 14 +
      Math.abs(Math.sin(x * 0.13 - z * 0.11)) * 6;
    h += mFactor * mFactor * (26 + ridgeNoise);
  }

  return h;
}

// Check if (x, z) lies on one of the medieval dirt/cobble roads
export function roadMaskAt(x: number, z: number): number {
  // Road 1: Castle (-38, -16) -> Village (-30, 18)
  let minRoadDist = 999;

  // Segment helper
  const segDist = (ax: number, az: number, bx: number, bz: number) => {
    const vx = bx - ax;
    const vz = bz - az;
    const wx = x - ax;
    const wz = z - az;
    const lenSq = vx * vx + vz * vz;
    const t = THREE.MathUtils.clamp((wx * vx + wz * vz) / lenSq, 0, 1);
    const px = ax + t * vx;
    const pz = az + t * vz;
    return Math.hypot(x - px, z - pz);
  };

  minRoadDist = Math.min(
    minRoadDist,
    segDist(-34, -17, -29, 16), // Castle to Village
    segDist(-29, 16, 16, 4), // Village to Greenvale Ford
    segDist(16, 4, 12, -36), // Ford to Highcrag Pass
    segDist(16, 4, 20, 38), // Ford to Harvest Crossroads
    segDist(16, 4, 58, 2) // Ford across river east
  );

  const wobble = Math.sin(x * 0.25 + z * 0.2) * 0.35;
  const d = minRoadDist + wobble;
  if (d > 3.1) return 0;
  return THREE.MathUtils.smoothstep(3.1 - d, 0, 1.4);
}

export interface WorldHandles {
  group: THREE.Group;
  terrainMesh: THREE.Mesh;
  arenaBannerGroups: Record<BattleArenaId, THREE.Group>;
  update: (elapsed: number, activeArena: BattleArenaId) => void;
  dispose: () => void;
}

export function buildMedievalWorld(
  textures: ProceduralTextureSet,
  quality: QualityTier
): WorldHandles {
  const group = new THREE.Group();
  group.name = 'MedievalWorld';

  // 1. Heightfield Terrain Mesh with Vertex Colors
  const segs = quality === QualityTier.Low ? 110 : 160;
  const size = 280;
  const terrainGeo = new THREE.PlaneGeometry(size, size, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);

  const pos = terrainGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color('#4d6b34');
  const cLush = new THREE.Color('#3d5a2b');
  const cRoad = new THREE.Color('#8c7456');
  const cRock = new THREE.Color('#6a6864');
  const cSnow = new THREE.Color('#e5e9ef');
  const cSand = new THREE.Color('#98896b');
  const tmpColor = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeightAt(x, z);
    pos.setY(i, y);

    const road = roadMaskAt(x, z);
    const patch = (Math.sin(x * 0.09) * Math.cos(z * 0.09) + 1) * 0.5;
    tmpColor.copy(cGrass).lerp(cLush, patch * 0.65);

    if (y < -0.25) {
      tmpColor.lerp(cSand, THREE.MathUtils.clamp((-y - 0.2) * 0.9, 0, 0.9));
    }
    if (road > 0) {
      tmpColor.lerp(cRoad, road * 0.9);
    }
    if (y > 4.2) {
      const rockBlend = THREE.MathUtils.clamp((y - 4.2) / 5.5, 0, 1);
      tmpColor.lerp(cRock, rockBlend * 0.72);
    }
    if (y > 16.5) {
      const snowBlend = THREE.MathUtils.clamp((y - 16.5) / 8.0, 0, 1);
      tmpColor.lerp(cSnow, snowBlend);
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.name = 'TerrainMesh';
  group.add(terrainMesh);

  // 2. River Stream Water Plane (offset cleanly to avoid z-fighting)
  const waterGeo = new THREE.PlaneGeometry(26, 200);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: '#2b5876',
    roughness: 0.18,
    metalness: 0.55,
    transparent: true,
    opacity: 0.82,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(44, -0.52, 0);
  group.add(waterMesh);

  // 3. Instanced Pine Forests (3-part composite silhouette via 4 InstancedMeshes: trunk + 3 tiered cones)
  const treeCount = quality === QualityTier.Low ? 130 : 240;
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.5, 6);
  trunkGeo.translate(0, 0.75, 0);
  const cone1Geo = new THREE.ConeGeometry(1.35, 2.3, 7);
  cone1Geo.translate(0, 2.2, 0);
  const cone2Geo = new THREE.ConeGeometry(1.05, 2.0, 7);
  cone2Geo.translate(0, 3.45, 0);
  const cone3Geo = new THREE.ConeGeometry(0.7, 1.65, 7);
  cone3Geo.translate(0, 4.55, 0);

  const trunkMat = new THREE.MeshStandardMaterial({
    color: '#4a3525',
    roughness: 0.9,
    metalness: 0.02,
  });
  const foliageMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.82,
    metalness: 0.03,
  });

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const c1Inst = new THREE.InstancedMesh(cone1Geo, foliageMat, treeCount);
  const c2Inst = new THREE.InstancedMesh(cone2Geo, foliageMat, treeCount);
  const c3Inst = new THREE.InstancedMesh(cone3Geo, foliageMat, treeCount);

  trunkInst.castShadow = true;
  c1Inst.castShadow = true;
  c2Inst.castShadow = true;
  c1Inst.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let placedTrees = 0;
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let attempt = 0; attempt < 1800 && placedTrees < treeCount; attempt++) {
    const tx = (rand() - 0.5) * 190;
    const tz = (rand() - 0.5) * 190;

    // Keep roads, castle plateau, village, stream, and arena centers clear
    if (roadMaskAt(tx, tz) > 0.05) continue;
    if (Math.hypot(tx - -38, tz - -28) < 23) continue;
    if (Math.hypot(tx - -30, tz - 20) < 21) continue;
    if (Math.abs(tx - (44 + Math.sin(tz * 0.04) * 6)) < 7.5) continue;

    let nearArena = false;
    for (const a of Object.values(BATTLE_ARENAS)) {
      if (Math.hypot(tx - a.centerX, tz - a.centerZ) < 20) {
        nearArena = true;
        break;
      }
    }
    if (nearArena) continue;

    const ty = groundHeightAt(tx, tz);
    if (ty > 15 || ty < -0.2) continue;

    const s = 0.82 + rand() * 0.45;
    dummy.position.set(tx, ty, tz);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(s, s * (0.92 + rand() * 0.22), s);
    dummy.updateMatrix();

    trunkInst.setMatrixAt(placedTrees, dummy.matrix);
    c1Inst.setMatrixAt(placedTrees, dummy.matrix);
    c2Inst.setMatrixAt(placedTrees, dummy.matrix);
    c3Inst.setMatrixAt(placedTrees, dummy.matrix);

    tint.setHSL(0.27 + (rand() - 0.5) * 0.04, 0.42, 0.22 + rand() * 0.09);
    c1Inst.setColorAt(placedTrees, tint);
    c2Inst.setColorAt(placedTrees, tint.clone().offsetHSL(0, 0, 0.03));
    c3Inst.setColorAt(placedTrees, tint.clone().offsetHSL(0, 0, 0.06));
    placedTrees++;
  }

  trunkInst.count = placedTrees;
  c1Inst.count = placedTrees;
  c2Inst.count = placedTrees;
  c3Inst.count = placedTrees;
  [trunkInst, c1Inst, c2Inst, c3Inst].forEach((im) => {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
  });

  // 4. Instanced Field Boulders & Crag Rocks
  const rockCount = quality === QualityTier.Low ? 55 : 95;
  const rockGeo = new THREE.DodecahedronGeometry(1.0, 0);
  rockGeo.translate(0, 0.55, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.88,
    metalness: 0.06,
  });
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rockInst.castShadow = true;
  rockInst.receiveShadow = true;

  let placedRocks = 0;
  for (let i = 0; i < 600 && placedRocks < rockCount; i++) {
    const rx = (rand() - 0.5) * 185;
    const rz = (rand() - 0.5) * 185;
    if (roadMaskAt(rx, rz) > 0.1) continue;
    if (Math.hypot(rx - -38, rz - -28) < 16) continue;
    if (Math.hypot(rx - -30, rz - 20) < 17) continue;
    let inArena = false;
    for (const a of Object.values(BATTLE_ARENAS)) {
      if (Math.hypot(rx - a.centerX, rz - a.centerZ) < 17) inArena = true;
    }
    if (inArena) continue;

    const ry = groundHeightAt(rx, rz);
    dummy.position.set(rx, ry - 0.15, rz);
    dummy.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
    dummy.scale.set(0.7 + rand() * 1.6, 0.5 + rand() * 1.1, 0.7 + rand() * 1.5);
    dummy.updateMatrix();
    rockInst.setMatrixAt(placedRocks, dummy.matrix);
    const g = 0.38 + rand() * 0.18;
    tint.setRGB(g, g * 0.98, g * 0.94);
    rockInst.setColorAt(placedRocks, tint);
    placedRocks++;
  }
  rockInst.count = placedRocks;
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  group.add(rockInst);

  // 5. Stone Ford Bridge at Greenvale River Crossing (x=44, z=2.5)
  const bridgeGroup = new THREE.Group();
  const bridgeY = groundHeightAt(44, 2.5);
  const deckGeo = new THREE.BoxGeometry(11.5, 0.65, 4.4);
  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.stoneWall,
    roughness: 0.85,
    metalness: 0.05,
  });
  const deck = new THREE.Mesh(deckGeo, stoneMat);
  deck.position.set(0, 1.35, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  bridgeGroup.add(deck);
  for (const sideZ of [-1.95, 1.95]) {
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.65, 0.4), stoneMat);
    parapet.position.set(0, 1.9, sideZ);
    parapet.castShadow = true;
    bridgeGroup.add(parapet);
  }
  for (const px of [-4.2, 0, 4.2]) {
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.2, 8), stoneMat);
    pier.position.set(px, 0.4, 0);
    bridgeGroup.add(pier);
  }
  bridgeGroup.position.set(44, bridgeY, 2.5);
  group.add(bridgeGroup);

  // 6. Three Battle Arena Standards & Ground Rings
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 4.8, 8);
  poleGeo.translate(0, 2.4, 0);
  const poleMat = new THREE.MeshStandardMaterial({
    color: '#6b4f35',
    roughness: 0.7,
    metalness: 0.15,
  });
  const finialGeo = new THREE.OctahedronGeometry(0.22, 0);
  const goldMat = new THREE.MeshStandardMaterial({
    color: '#eab308',
    roughness: 0.3,
    metalness: 0.85,
  });
  const clothGeo = new THREE.PlaneGeometry(1.1, 2.1, 4, 6);
  const friendlyClothMat = new THREE.MeshStandardMaterial({
    map: textures.friendlyBanner,
    side: THREE.DoubleSide,
    roughness: 0.75,
  });
  const enemyClothMat = new THREE.MeshStandardMaterial({
    map: textures.enemyBanner,
    side: THREE.DoubleSide,
    roughness: 0.75,
  });

  const arenaBannerGroups = {} as Record<BattleArenaId, THREE.Group>;
  const bannerCloths: THREE.Mesh[] = [];

  Object.values(BATTLE_ARENAS).forEach((arena) => {
    const ag = new THREE.Group();
    const cy = groundHeightAt(arena.centerX, arena.centerZ);
    ag.position.set(arena.centerX, cy, arena.centerZ);

    // Subtle battlefield ring marker on ground (polygonOffset prevents z-fighting)
    const ringGeo = new THREE.RingGeometry(13.5, 14.1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#eab308',
      transparent: true,
      opacity: 0.35,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.08;
    ring.name = 'ArenaRing';
    ag.add(ring);

    // Friendly & Enemy war standards on opposite ends of the arena
    const makeStandard = (offsetZ: number, isFriendly: boolean) => {
      const sg = new THREE.Group();
      const sy = groundHeightAt(arena.centerX - 8, arena.centerZ + offsetZ) - cy;
      sg.position.set(-8, sy, offsetZ);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.castShadow = true;
      sg.add(pole);
      const finial = new THREE.Mesh(finialGeo, goldMat);
      finial.position.y = 4.9;
      sg.add(finial);
      const cloth = new THREE.Mesh(
        clothGeo,
        isFriendly ? friendlyClothMat : enemyClothMat
      );
      cloth.position.set(0.6, 3.6, 0);
      cloth.castShadow = true;
      bannerCloths.push(cloth);
      sg.add(cloth);
      return sg;
    };

    ag.add(makeStandard(arena.friendlySpawnOffsetZ, true));
    ag.add(makeStandard(arena.enemySpawnOffsetZ, false));

    arenaBannerGroups[arena.id] = ag;
    group.add(ag);
  });

  const update = (elapsed: number, activeArena: BattleArenaId) => {
    // Gentle wind wave on banner cloths
    bannerCloths.forEach((cloth, idx) => {
      cloth.rotation.y = Math.sin(elapsed * 2.6 + idx * 1.3) * 0.18;
    });

    (Object.keys(arenaBannerGroups) as BattleArenaId[]).forEach((id) => {
      const ag = arenaBannerGroups[id];
      const ring = ag.getObjectByName('ArenaRing') as THREE.Mesh | undefined;
      if (ring) {
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = id === activeArena ? 0.55 : 0.14;
        mat.color.set(id === activeArena ? '#facc15' : '#a8a29e');
      }
    });
  };

  const dispose = () => {
    terrainGeo.dispose();
    terrainMat.dispose();
    waterGeo.dispose();
    waterMat.dispose();
    trunkGeo.dispose();
    cone1Geo.dispose();
    cone2Geo.dispose();
    cone3Geo.dispose();
    trunkMat.dispose();
    foliageMat.dispose();
    rockGeo.dispose();
    rockMat.dispose();
    deckGeo.dispose();
    stoneMat.dispose();
    poleGeo.dispose();
    poleMat.dispose();
    finialGeo.dispose();
    goldMat.dispose();
    clothGeo.dispose();
    friendlyClothMat.dispose();
    enemyClothMat.dispose();
  };

  return {
    group,
    terrainMesh,
    arenaBannerGroups,
    update,
    dispose,
  };
}
