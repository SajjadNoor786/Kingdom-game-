import * as THREE from 'three';

export interface ProceduralTextureSet {
  stoneWall: THREE.CanvasTexture;
  timberWall: THREE.CanvasTexture;
  roofShingle: THREE.CanvasTexture;
  wheatField: THREE.CanvasTexture;
  friendlyBanner: THREE.CanvasTexture;
  enemyBanner: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Stone ashlar masonry texture
  const [stoneCanvas, sCtx] = makeCanvas(256, 256);
  sCtx.fillStyle = '#79766f';
  sCtx.fillRect(0, 0, 256, 256);
  const rows = 8;
  const rowH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 4;
    const colW = 256 / cols;
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const shade = 108 + ((r * 17 + c * 31) % 34);
      sCtx.fillStyle = `rgb(${shade}, ${shade - 3}, ${shade - 8})`;
      sCtx.fillRect(c * colW + offset + 2, r * rowH + 2, colW - 4, rowH - 4);
      // subtle stone speckle
      sCtx.fillStyle = `rgba(40,36,32,0.16)`;
      sCtx.fillRect(c * colW + offset + 8, r * rowH + 6, colW * 0.35, 3);
    }
  }
  const stoneWall = new THREE.CanvasTexture(stoneCanvas);
  stoneWall.colorSpace = THREE.SRGBColorSpace;
  stoneWall.wrapS = THREE.RepeatWrapping;
  stoneWall.wrapT = THREE.RepeatWrapping;
  stoneWall.anisotropy = maxAnisotropy;

  // 2. Timber-frame wattle & daub wall
  const [timberCanvas, tCtx] = makeCanvas(256, 256);
  tCtx.fillStyle = '#ddd3be';
  tCtx.fillRect(0, 0, 256, 256);
  // subtle plaster grain
  for (let i = 0; i < 160; i++) {
    tCtx.fillStyle = i % 2 === 0 ? 'rgba(160,145,120,0.14)' : 'rgba(255,250,240,0.12)';
    tCtx.fillRect((i * 47) % 256, (i * 83) % 256, 12, 4);
  }
  // dark oak beams
  tCtx.fillStyle = '#4a321f';
  tCtx.fillRect(0, 0, 256, 18);
  tCtx.fillRect(0, 238, 256, 18);
  tCtx.fillRect(0, 118, 256, 14);
  tCtx.fillRect(0, 0, 18, 256);
  tCtx.fillRect(238, 0, 18, 256);
  tCtx.fillRect(120, 0, 16, 256);
  tCtx.strokeStyle = '#4a321f';
  tCtx.lineWidth = 12;
  tCtx.beginPath();
  tCtx.moveTo(14, 240);
  tCtx.lineTo(124, 124);
  tCtx.moveTo(242, 240);
  tCtx.lineTo(132, 124);
  tCtx.stroke();

  const timberWall = new THREE.CanvasTexture(timberCanvas);
  timberWall.colorSpace = THREE.SRGBColorSpace;
  timberWall.wrapS = THREE.RepeatWrapping;
  timberWall.wrapT = THREE.RepeatWrapping;
  timberWall.anisotropy = maxAnisotropy;

  // 3. Roof shingles
  const [roofCanvas, rCtx] = makeCanvas(256, 256);
  rCtx.fillStyle = '#5c3828';
  rCtx.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 10; r++) {
    const y = r * 25.6;
    for (let c = 0; c < 8; c++) {
      const x = c * 32 + ((r % 2) * 16);
      const tone = 78 + ((r * 13 + c * 29) % 28);
      rCtx.fillStyle = `rgb(${tone + 24}, ${tone - 6}, ${tone - 20})`;
      rCtx.fillRect((x % 256) + 1, y + 1, 30, 23);
    }
  }
  const roofShingle = new THREE.CanvasTexture(roofCanvas);
  roofShingle.colorSpace = THREE.SRGBColorSpace;
  roofShingle.wrapS = THREE.RepeatWrapping;
  roofShingle.wrapT = THREE.RepeatWrapping;
  roofShingle.anisotropy = maxAnisotropy;

  // 4. Wheat farm rows
  const [wheatCanvas, wCtx] = makeCanvas(256, 256);
  wCtx.fillStyle = '#4f3a24';
  wCtx.fillRect(0, 0, 256, 256);
  for (let x = 8; x < 256; x += 24) {
    wCtx.fillStyle = '#3d2c1a';
    wCtx.fillRect(x - 4, 0, 8, 256);
    wCtx.fillStyle = '#c89d3c';
    wCtx.fillRect(x + 4, 6, 12, 244);
    wCtx.fillStyle = '#dfb858';
    for (let y = 10; y < 246; y += 16) {
      wCtx.fillRect(x + 6, y, 8, 9);
    }
  }
  const wheatField = new THREE.CanvasTexture(wheatCanvas);
  wheatField.colorSpace = THREE.SRGBColorSpace;
  wheatField.wrapS = THREE.RepeatWrapping;
  wheatField.wrapT = THREE.RepeatWrapping;
  wheatField.anisotropy = maxAnisotropy;

  // 5. Friendly Royal Banner (Cobalt & Gold Lion/Crown motif)
  const [fbCanvas, fbCtx] = makeCanvas(128, 256);
  fbCtx.fillStyle = '#1d4ed8';
  fbCtx.fillRect(0, 0, 128, 256);
  fbCtx.strokeStyle = '#eab308';
  fbCtx.lineWidth = 8;
  fbCtx.strokeRect(8, 8, 112, 240);
  // Gold chevron & crown emblem
  fbCtx.fillStyle = '#facc15';
  fbCtx.beginPath();
  fbCtx.moveTo(64, 58);
  fbCtx.lineTo(94, 110);
  fbCtx.lineTo(64, 96);
  fbCtx.lineTo(34, 110);
  fbCtx.closePath();
  fbCtx.fill();
  fbCtx.fillRect(42, 130, 44, 12);
  const friendlyBanner = new THREE.CanvasTexture(fbCanvas);
  friendlyBanner.colorSpace = THREE.SRGBColorSpace;
  friendlyBanner.anisotropy = maxAnisotropy;

  // 6. Enemy Banner (Obsidian & Crimson Iron Cross/Raven motif)
  const [ebCanvas, ebCtx] = makeCanvas(128, 256);
  ebCtx.fillStyle = '#1c1917';
  ebCtx.fillRect(0, 0, 128, 256);
  ebCtx.strokeStyle = '#dc2626';
  ebCtx.lineWidth = 8;
  ebCtx.strokeRect(8, 8, 112, 240);
  ebCtx.fillStyle = '#dc2626';
  ebCtx.beginPath();
  ebCtx.moveTo(64, 52);
  ebCtx.lineTo(98, 122);
  ebCtx.lineTo(64, 158);
  ebCtx.lineTo(30, 122);
  ebCtx.closePath();
  ebCtx.fill();
  const enemyBanner = new THREE.CanvasTexture(ebCanvas);
  enemyBanner.colorSpace = THREE.SRGBColorSpace;
  enemyBanner.anisotropy = maxAnisotropy;

  // 7. Soft radial contact shadow
  const [shCanvas, shCtx] = makeCanvas(128, 128);
  const grad = shCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(10, 10, 12, 0.55)');
  grad.addColorStop(0.55, 'rgba(10, 10, 12, 0.22)');
  grad.addColorStop(1, 'rgba(10, 10, 12, 0.0)');
  shCtx.fillStyle = grad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(shCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;

  return {
    stoneWall,
    timberWall,
    roofShingle,
    wheatField,
    friendlyBanner,
    enemyBanner,
    contactShadow,
    dispose: () => {
      stoneWall.dispose();
      timberWall.dispose();
      roofShingle.dispose();
      wheatField.dispose();
      friendlyBanner.dispose();
      enemyBanner.dispose();
      contactShadow.dispose();
    },
  };
}
