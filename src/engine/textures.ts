import * as THREE from 'three';

/**
 * Procedural CanvasTextures with SRGBColorSpace and max anisotropy.
 * Zero external image/404 dependencies.
 */

export interface ProceduralTextures {
  asphaltMap: THREE.CanvasTexture;
  sidewalkMap: THREE.CanvasTexture;
  facadeMap: THREE.CanvasTexture;
  danceFloorMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  clubSignMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createBuildingLabelTexture(
  title: string,
  accentColor: string,
  subtitle?: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#090d1a';
  ctx.fillRect(0, 0, 512, 128);

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 34px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title.toUpperCase(), 256, subtitle ? 50 : 64, 468);

  if (subtitle) {
    ctx.fillStyle = accentColor;
    ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(subtitle, 256, 92, 468);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createProceduralTextures(maxAniso: number): ProceduralTextures {
  // 1. Asphalt texture
  const aspCanvas = document.createElement('canvas');
  aspCanvas.width = 256;
  aspCanvas.height = 256;
  const aspCtx = aspCanvas.getContext('2d')!;
  aspCtx.fillStyle = '#181c28';
  aspCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 22 + Math.floor(Math.random() * 20);
    aspCtx.fillStyle = `rgb(${v},${v + 3},${v + 10})`;
    aspCtx.fillRect(x, y, 2, 2);
  }
  const asphaltMap = new THREE.CanvasTexture(aspCanvas);
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.wrapS = THREE.RepeatWrapping;
  asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.repeat.set(30, 30);
  asphaltMap.anisotropy = maxAniso;

  // 2. Sidewalk tiles
  const swCanvas = document.createElement('canvas');
  swCanvas.width = 256;
  swCanvas.height = 256;
  const swCtx = swCanvas.getContext('2d')!;
  swCtx.fillStyle = '#2d3345';
  swCtx.fillRect(0, 0, 256, 256);
  swCtx.strokeStyle = '#1e2433';
  swCtx.lineWidth = 3;
  for (let p = 0; p <= 256; p += 64) {
    swCtx.beginPath();
    swCtx.moveTo(p, 0);
    swCtx.lineTo(p, 256);
    swCtx.stroke();
    swCtx.beginPath();
    swCtx.moveTo(0, p);
    swCtx.lineTo(256, p);
    swCtx.stroke();
  }
  const sidewalkMap = new THREE.CanvasTexture(swCanvas);
  sidewalkMap.colorSpace = THREE.SRGBColorSpace;
  sidewalkMap.wrapS = THREE.RepeatWrapping;
  sidewalkMap.wrapT = THREE.RepeatWrapping;
  sidewalkMap.repeat.set(4, 4);
  sidewalkMap.anisotropy = maxAniso;

  // 3. Lit night building windows facade
  const facCanvas = document.createElement('canvas');
  facCanvas.width = 256;
  facCanvas.height = 256;
  const facCtx = facCanvas.getContext('2d')!;
  facCtx.fillStyle = '#1b2234';
  facCtx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const lit = (row * 7 + col * 13) % 3 !== 0;
      facCtx.fillStyle = lit ? '#fde68a' : '#0f172a';
      facCtx.fillRect(16 + col * 60, 18 + row * 60, 32, 38);
      facCtx.strokeStyle = '#090d16';
      facCtx.lineWidth = 2;
      facCtx.strokeRect(16 + col * 60, 18 + row * 60, 32, 38);
    }
  }
  const facadeMap = new THREE.CanvasTexture(facCanvas);
  facadeMap.colorSpace = THREE.SRGBColorSpace;
  facadeMap.wrapS = THREE.RepeatWrapping;
  facadeMap.wrapT = THREE.RepeatWrapping;
  facadeMap.anisotropy = maxAniso;

  // 4. Club Dance Floor
  const dfCanvas = document.createElement('canvas');
  dfCanvas.width = 256;
  dfCanvas.height = 256;
  const dfCtx = dfCanvas.getContext('2d')!;
  const colors = ['#1e1b4b', '#312e81', '#581c87', '#701a75'];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      dfCtx.fillStyle = colors[(r + c) % colors.length];
      dfCtx.fillRect(c * 32, r * 32, 32, 32);
      dfCtx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
      dfCtx.lineWidth = 2;
      dfCtx.strokeRect(c * 32, r * 32, 32, 32);
    }
  }
  const danceFloorMap = new THREE.CanvasTexture(dfCanvas);
  danceFloorMap.colorSpace = THREE.SRGBColorSpace;
  danceFloorMap.wrapS = THREE.RepeatWrapping;
  danceFloorMap.wrapT = THREE.RepeatWrapping;
  danceFloorMap.anisotropy = maxAniso;

  // 5. Radial Contact Shadow Disc
  const shCanvas = document.createElement('canvas');
  shCanvas.width = 128;
  shCanvas.height = 128;
  const shCtx = shCanvas.getContext('2d')!;
  const grad = shCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0,0,0,0.65)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  shCtx.fillStyle = grad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shCanvas);

  // 6. Number One Club Neon Marquee
  const clubSignMap = createBuildingLabelTexture(
    'NUMBER ONE CLUB',
    '#f59e0b',
    'VIP LOUNGE & NIGHTLIFE',
  );
  clubSignMap.anisotropy = maxAniso;

  return {
    asphaltMap,
    sidewalkMap,
    facadeMap,
    danceFloorMap,
    contactShadowMap,
    clubSignMap,
    dispose: () => {
      asphaltMap.dispose();
      sidewalkMap.dispose();
      facadeMap.dispose();
      danceFloorMap.dispose();
      contactShadowMap.dispose();
      clubSignMap.dispose();
    },
  };
}

const faceTextureCache = new Map<string, THREE.CanvasTexture>();

export function createFaceTexture(options: {
  skinTone: string;
  hairColor: string;
  eyeColor?: string;
  isFemale: boolean;
  facialHair?: 'none' | 'stubble' | 'goatee';
}): THREE.CanvasTexture {
  const eyeColor = options.eyeColor ?? (options.isFemale ? '#3b7a57' : '#4a3525');
  const facialHair = options.facialHair ?? 'none';
  const cacheKey = `${options.skinTone}|${options.hairColor}|${eyeColor}|${options.isFemale}|${facialHair}`;
  const cached = faceTextureCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Base skin fill
  ctx.fillStyle = options.skinTone;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle forehead & cheek soft warmth/contour around u = 0.5 (x = 128)
  const cheekGradL = ctx.createRadialGradient(104, 140, 2, 104, 140, 20);
  cheekGradL.addColorStop(0, options.isFemale ? 'rgba(225, 95, 110, 0.28)' : 'rgba(180, 95, 75, 0.16)');
  cheekGradL.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = cheekGradL;
  ctx.fillRect(82, 118, 44, 44);

  const cheekGradR = ctx.createRadialGradient(152, 140, 2, 152, 140, 20);
  cheekGradR.addColorStop(0, options.isFemale ? 'rgba(225, 95, 110, 0.28)' : 'rgba(180, 95, 75, 0.16)');
  cheekGradR.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = cheekGradR;
  ctx.fillRect(130, 118, 44, 44);

  // Subtle under-chin & neck shadow
  const chinGrad = ctx.createLinearGradient(0, 175, 0, 256);
  chinGrad.addColorStop(0, 'rgba(0,0,0,0)');
  chinGrad.addColorStop(1, 'rgba(40, 20, 15, 0.26)');
  ctx.fillStyle = chinGrad;
  ctx.fillRect(0, 175, 256, 81);

  // Eyebrows
  ctx.strokeStyle = options.hairColor === '#eab308' ? '#713f12' : options.hairColor;
  ctx.lineWidth = options.isFemale ? 3.2 : 4.6;
  ctx.lineCap = 'round';
  const drawBrow = (cx: number, dir: number) => {
    ctx.beginPath();
    ctx.moveTo(cx - 12 * dir, 102);
    ctx.quadraticCurveTo(cx, options.isFemale ? 94 : 97, cx + 11 * dir, 100);
    ctx.stroke();
  };
  drawBrow(110, 1);
  drawBrow(146, -1);

  // Realistic Almond Eyes (left & right around x = 110, 146; y = 116)
  const drawEye = (cx: number) => {
    // Eye socket soft shadow
    ctx.fillStyle = 'rgba(60, 35, 25, 0.16)';
    ctx.beginPath();
    ctx.ellipse(cx, 116, 11, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sclera
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.ellipse(cx, 116, 9, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Iris
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(cx, 116, 4.3, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(cx, 116, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Corneal catchlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 1.3, 114.6, 1.0, 0, Math.PI * 2);
    ctx.fill();

    // Upper eyelid & lash line
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = options.isFemale ? 2.4 : 1.8;
    ctx.beginPath();
    ctx.ellipse(cx, 116, 9.2, 5.3, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  };
  drawEye(110);
  drawEye(146);

  // Subtle nose bridge shading
  ctx.fillStyle = 'rgba(80, 40, 30, 0.15)';
  ctx.beginPath();
  ctx.ellipse(128, 134, 4.5, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Optional stubble or goatee
  if (facialHair === 'stubble') {
    ctx.fillStyle = 'rgba(20, 20, 25, 0.16)';
    ctx.beginPath();
    ctx.ellipse(128, 168, 22, 16, 0, 0, Math.PI);
    ctx.fill();
  } else if (facialHair === 'goatee') {
    ctx.fillStyle = '#1c1917';
    // Mustache
    ctx.beginPath();
    ctx.moveTo(114, 154);
    ctx.quadraticCurveTo(128, 148, 142, 154);
    ctx.lineTo(138, 157);
    ctx.quadraticCurveTo(128, 152, 118, 157);
    ctx.closePath();
    ctx.fill();
    // Chin beard
    ctx.beginPath();
    ctx.ellipse(128, 174, 10, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Expressive Lips / Mouth (y = 158)
  ctx.fillStyle = options.isFemale ? '#be185d' : '#9f5c52';
  ctx.beginPath();
  ctx.moveTo(117, 159);
  ctx.quadraticCurveTo(123, 155, 128, 157);
  ctx.quadraticCurveTo(133, 155, 139, 159);
  ctx.quadraticCurveTo(128, 166, 117, 159);
  ctx.fill();

  // Mouth parting crease
  ctx.strokeStyle = 'rgba(40, 15, 15, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(118, 159.5);
  ctx.quadraticCurveTo(128, 161, 138, 159.5);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  faceTextureCache.set(cacheKey, tex);
  return tex;
}

const nameplateTextureCache = new Map<string, THREE.CanvasTexture>();

export function createNameplateTexture(
  name: string,
  accentColor: string,
): THREE.CanvasTexture {
  const key = `${name}|${accentColor}`;
  const cached = nameplateTextureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 88;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 384, 88);

  // Dark translucent nameplate backing (sharp-angled HUD discipline)
  ctx.fillStyle = 'rgba(9, 13, 26, 0.88)';
  ctx.fillRect(6, 10, 372, 68);

  // Colored border + top accent strip
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 10, 372, 68);

  ctx.fillStyle = accentColor;
  ctx.fillRect(6, 10, 372, 6);

  // Name text
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 4;
  ctx.fillText(name, 192, 47, 344);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  nameplateTextureCache.set(key, tex);
  return tex;
}

