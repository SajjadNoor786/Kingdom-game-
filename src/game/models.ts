import * as THREE from 'three';
import { Team, UnitType } from './types';

export interface RigJoints {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  horseLegs?: THREE.Group[];
  selectionRing: THREE.Mesh;
  hpBarFill: THREE.Mesh;
  hpBarGroup: THREE.Group;
}

function makeLabelSprite(text: string, borderColor: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(12, 10, 9, 0.86)';
  ctx.fillRect(8, 12, 496, 72);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 12, 496, 72);
  ctx.fillStyle = '#fafaf9';
  ctx.font = 'bold 26px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 48);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.35, 0.45, 1);
  return sprite;
}

function createHpAndSelectionAttachment(
  root: THREE.Group,
  contactShadow: THREE.Texture,
  team: Team,
  isHero: boolean,
  isMounted: boolean
): { selectionRing: THREE.Mesh; hpBarFill: THREE.Mesh; hpBarGroup: THREE.Group } {
  // Ground contact shadow
  const shadowGeo = new THREE.PlaneGeometry(isMounted ? 2.1 : 1.35, isMounted ? 2.5 : 1.35);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.03;
  root.add(shadow);

  // Selection ring
  const ringRadius = isMounted ? 0.95 : isHero ? 0.78 : 0.62;
  const ringGeo = new THREE.RingGeometry(ringRadius - 0.09, ringRadius, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isHero ? '#facc15' : team === Team.Friendly ? '#38bdf8' : '#ef4444',
    transparent: true,
    opacity: isHero ? 0.85 : 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const selectionRing = new THREE.Mesh(ringGeo, ringMat);
  selectionRing.position.y = 0.05;
  root.add(selectionRing);

  // Compact overhead health bar
  const hpBarGroup = new THREE.Group();
  hpBarGroup.position.y = isMounted ? 2.85 : isHero ? 2.38 : 2.15;

  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.11),
    new THREE.MeshBasicMaterial({ color: '#1c1917', side: THREE.DoubleSide })
  );
  const fillGeo = new THREE.PlaneGeometry(0.86, 0.07);
  fillGeo.translate(0.43, 0, 0); // left-aligned scaling
  const fillMat = new THREE.MeshBasicMaterial({
    color: isHero ? '#facc15' : team === Team.Friendly ? '#22c55e' : '#ef4444',
    side: THREE.DoubleSide,
  });
  const hpBarFill = new THREE.Mesh(fillGeo, fillMat);
  hpBarFill.position.set(-0.43, 0, 0.01);

  hpBarGroup.add(bg, hpBarFill);
  root.add(hpBarGroup);

  return { selectionRing, hpBarFill, hpBarGroup };
}

/**
 * Explicit Articulated 3D Calibration Placeholder Rig.
 * Used when the user has only provided an image/page link rather than a downloadable .GLB/.GLTF 3D character.
 * Never pretends a 2D image is a 3D model, and never replaces the user's hero with a generic knight.
 */
export function buildPlaceholderRig(
  team: Team,
  isHero: boolean,
  contactShadow: THREE.Texture
): RigJoints {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const frameMat = new THREE.MeshStandardMaterial({
    color: team === Team.Friendly ? '#334155' : '#27272a',
    roughness: 0.55,
    metalness: 0.35,
  });
  const wireMat = new THREE.MeshBasicMaterial({
    color: isHero ? '#38bdf8' : team === Team.Friendly ? '#60a5fa' : '#f87171',
    wireframe: true,
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: isHero ? '#facc15' : team === Team.Friendly ? '#38bdf8' : '#ef4444',
    emissive: isHero ? '#ca8a04' : team === Team.Friendly ? '#0284c7' : '#b91c1c',
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.7,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    roughness: 0.22,
    metalness: 0.88,
  });

  // Pelvis & Torso calibration mannequin
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.26), frameMat);
  pelvis.position.y = 0.88;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.56, 0.28), frameMat);
  torso.position.y = 1.3;
  const torsoCage = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.59, 0.31), wireMat);
  torsoCage.position.y = 1.3;

  // Articulated Head + Orientation Visor
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 1), frameMat);
  head.position.y = 1.78;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.14), jointMat);
  visor.position.set(0, 1.79, 0.15);

  bodyPivot.add(pelvis, torso, torsoCage, head, visor);

  // Left & Right Legs
  const makeLeg = (offsetX: number) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(offsetX, 0.85, 0);
    const hipJoint = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), jointMat);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.42, 8), frameMat);
    thigh.position.y = -0.22;
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), jointMat);
    knee.position.y = -0.44;
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.4, 8), frameMat);
    shin.position.y = -0.65;
    legGroup.add(hipJoint, thigh, knee, shin);
    return legGroup;
  };
  const leftLeg = makeLeg(-0.14);
  const rightLeg = makeLeg(0.14);
  bodyPivot.add(leftLeg, rightLeg);

  // Left Arm (Calibration Guard Frame)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.32, 1.5, 0);
  const lShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), jointMat);
  const lLimb = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.56, 8), frameMat);
  lLimb.position.y = -0.28;
  // Translucentホロ-shield socket
  const guardPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.62, 0.48),
    new THREE.MeshStandardMaterial({
      color: isHero ? '#38bdf8' : '#ef4444',
      transparent: true,
      opacity: 0.55,
      roughness: 0.25,
      metalness: 0.5,
    })
  );
  guardPlate.position.set(-0.08, -0.34, 0.14);
  leftArm.add(lShoulder, lLimb, guardPlate);

  // Right Arm (Weapon Socket)
  const rightArm = new THREE.Group();
  rightArm.position.set(0.32, 1.5, 0);
  const rShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), jointMat);
  const rLimb = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.56, 8), frameMat);
  rLimb.position.y = -0.28;
  // Calibration test blade
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.06), jointMat);
  hilt.position.set(0, -0.55, 0.18);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.92), steelMat);
  blade.position.set(0, -0.55, 0.66);
  rightArm.add(rShoulder, rLimb, hilt, blade);

  bodyPivot.add(leftArm, rightArm);

  if (isHero) {
    const badge = makeLabelSprite('HERO PLACEHOLDER — IMPORT .GLB', '#facc15');
    badge.position.set(0, 2.75, 0);
    root.add(badge);
  }

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const { selectionRing, hpBarFill, hpBarGroup } = createHpAndSelectionAttachment(
    root,
    contactShadow,
    team,
    isHero,
    false
  );

  return {
    root,
    bodyPivot,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    selectionRing,
    hpBarFill,
    hpBarGroup,
  };
}

/**
 * Composite 3–12 Part Procedural Medieval Army Unit Rigs
 * Supports Sword Infantry, Spearmen, Archers, Shield Soldiers, Horsemen (with 8-part warhorse), and Knights.
 */
export function buildProceduralUnitRig(
  type: UnitType,
  team: Team,
  contactShadow: THREE.Texture
): RigJoints {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const isFriendly = team === Team.Friendly;
  const isMounted = type === UnitType.Horseman;

  const surcoatMat = new THREE.MeshStandardMaterial({
    color: isFriendly ? '#1d4ed8' : '#991b1b',
    roughness: 0.78,
    metalness: 0.06,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: isFriendly ? '#eab308' : '#27272a',
    roughness: 0.42,
    metalness: 0.65,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: type === UnitType.Knight ? '#d4d4d8' : '#94a3b8',
    roughness: type === UnitType.Knight ? 0.22 : 0.36,
    metalness: type === UnitType.Knight ? 0.88 : 0.75,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: '#4a321f',
    roughness: 0.84,
    metalness: 0.05,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: '#d6a988',
    roughness: 0.72,
    metalness: 0.02,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: '#6b4423',
    roughness: 0.8,
    metalness: 0.05,
  });
  const steelBladeMat = new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    roughness: 0.18,
    metalness: 0.92,
  });

  const horseLegs: THREE.Group[] = [];
  let riderYOffset = 0;

  // Optional 8-part Warhorse for Horsemen
  if (isMounted) {
    riderYOffset = 0.78;
    const horseMat = new THREE.MeshStandardMaterial({
      color: isFriendly ? '#5c4033' : '#1f1d1b',
      roughness: 0.76,
      metalness: 0.04,
    });
    const horseGroup = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.62, 1.55), horseMat);
    barrel.position.set(0, 1.02, 0);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.62), surcoatMat);
    saddle.position.set(0, 1.34, -0.05);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.68, 0.42), horseMat);
    neck.position.set(0, 1.44, 0.68);
    neck.rotation.x = 0.35;
    const horseHead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.56), horseMat);
    horseHead.position.set(0, 1.72, 0.96);
    horseHead.rotation.x = 0.45;
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 0.65, 6), leatherMat);
    tail.position.set(0, 0.95, -0.86);
    tail.rotation.x = -0.35;
    horseGroup.add(barrel, saddle, neck, horseHead, tail);

    for (const [lx, lz] of [
      [-0.23, 0.55],
      [0.23, 0.55],
      [-0.23, -0.55],
      [0.23, -0.55],
    ]) {
      const hLeg = new THREE.Group();
      hLeg.position.set(lx, 0.78, lz);
      const limb = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.78, 0.16), horseMat);
      limb.position.y = -0.39;
      hLeg.add(limb);
      horseGroup.add(hLeg);
      horseLegs.push(hLeg);
    }
    bodyPivot.add(horseGroup);
  }

  // Humanoid Torso & Surcoat
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.56, 0.28),
    type === UnitType.Knight ? armorMat : surcoatMat
  );
  torso.position.y = 1.18 + riderYOffset;
  const tabard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.3), surcoatMat);
  tabard.position.y = 1.12 + riderYOffset;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.31), leatherMat);
  belt.position.y = 0.94 + riderYOffset;
  bodyPivot.add(torso, tabard, belt);

  if (type === UnitType.Knight) {
    // Pauldron shoulder plates
    for (const sx of [-0.3, 0.3]) {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), armorMat);
      pauldron.position.set(sx, 1.42 + riderYOffset, 0);
      bodyPivot.add(pauldron);
    }
  }

  // Head & Class-Distinctive Helmet / Hood
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), skinMat);
  head.position.y = 1.65 + riderYOffset;
  bodyPivot.add(head);

  if (type === UnitType.Knight) {
    const greathelm = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.34, 10), armorMat);
    greathelm.position.y = 1.68 + riderYOffset;
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 6), surcoatMat);
    plume.rotation.x = -Math.PI / 3;
    plume.position.set(0, 1.9 + riderYOffset, -0.08);
    bodyPivot.add(greathelm, plume);
  } else if (type === UnitType.Spearman) {
    // Kettle hat brimmed helmet
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), armorMat);
    dome.position.y = 1.68 + riderYOffset;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.04, 12), armorMat);
    brim.position.y = 1.69 + riderYOffset;
    bodyPivot.add(dome, brim);
  } else if (type === UnitType.Archer) {
    // Ranger hood + back quiver
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.32, 8), leatherMat);
    hood.position.y = 1.76 + riderYOffset;
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.52, 8), leatherMat);
    quiver.position.set(0.12, 1.28 + riderYOffset, -0.2);
    quiver.rotation.z = -0.28;
    bodyPivot.add(hood, quiver);
  } else {
    // Nasal steel helm
    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.26, 10), armorMat);
    helm.position.y = 1.78 + riderYOffset;
    bodyPivot.add(helm);
  }

  // Legs
  const makeSoldierLeg = (ox: number) => {
    const lg = new THREE.Group();
    lg.position.set(ox, 0.88 + riderYOffset, 0);
    const legMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.07, isMounted ? 0.56 : 0.86, 8),
      type === UnitType.Knight ? armorMat : leatherMat
    );
    legMesh.position.y = isMounted ? -0.28 : -0.43;
    lg.add(legMesh);
    if (isMounted) {
      lg.rotation.z = ox < 0 ? 0.32 : -0.32;
    }
    return lg;
  };
  const leftLeg = makeSoldierLeg(-0.13);
  const rightLeg = makeSoldierLeg(0.13);
  bodyPivot.add(leftLeg, rightLeg);

  // Left Arm (Shield or Bow)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.3, 1.4 + riderYOffset, 0);
  const lSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.52, 8), armorMat);
  lSleeve.position.y = -0.24;
  leftArm.add(lSleeve);

  if (type === UnitType.ShieldSoldier) {
    // Large Kite / Tower Shield
    const shieldBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.95, 0.62), surcoatMat);
    shieldBody.position.set(-0.08, -0.32, 0.18);
    const shieldRim = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.99, 0.66), trimMat);
    shieldRim.position.set(-0.07, -0.32, 0.18);
    leftArm.add(shieldRim, shieldBody);
  } else if (type === UnitType.Knight || type === UnitType.SwordInfantry) {
    // Heater / Round buckler shield
    const buckler = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 12), surcoatMat);
    buckler.rotation.z = Math.PI / 2;
    buckler.position.set(-0.08, -0.34, 0.14);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), armorMat);
    boss.position.set(-0.12, -0.34, 0.14);
    leftArm.add(buckler, boss);
  } else if (type === UnitType.Archer) {
    // Curved Yew Longbow
    const bowArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.03, 6, 14, Math.PI * 0.85),
      woodMat
    );
    bowArc.rotation.y = Math.PI / 2;
    bowArc.rotation.z = -Math.PI * 0.42;
    bowArc.position.set(0, -0.35, 0.22);
    leftArm.add(bowArc);
    leftArm.rotation.x = -0.8;
  }

  // Right Arm (Weapon: Sword, Spear, Lance, or Bowstring hand)
  const rightArm = new THREE.Group();
  rightArm.position.set(0.3, 1.4 + riderYOffset, 0);
  const rSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.52, 8), armorMat);
  rSleeve.position.y = -0.24;
  rightArm.add(rSleeve);

  if (type === UnitType.Spearman || type === UnitType.Horseman) {
    const shaftLen = type === UnitType.Spearman ? 2.35 : 2.55;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, shaftLen, 6), woodMat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0, -0.45, 0.72);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.28, 6), steelBladeMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, -0.45, 0.72 + shaftLen * 0.5 + 0.12);
    rightArm.add(shaft, tip);
  } else if (type !== UnitType.Archer) {
    // Arming Sword / Knight Broadsword
    const bladeLen = type === UnitType.Knight ? 1.02 : 0.82;
    const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.06), trimMat);
    crossguard.position.set(0, -0.48, 0.16);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.08, bladeLen), steelBladeMat);
    blade.position.set(0, -0.48, 0.18 + bladeLen * 0.5);
    rightArm.add(crossguard, blade);
  }

  bodyPivot.add(leftArm, rightArm);

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const { selectionRing, hpBarFill, hpBarGroup } = createHpAndSelectionAttachment(
    root,
    contactShadow,
    team,
    false,
    isMounted
  );

  return {
    root,
    bodyPivot,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    horseLegs: horseLegs.length > 0 ? horseLegs : undefined,
    selectionRing,
    hpBarFill,
    hpBarGroup,
  };
}
