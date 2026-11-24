import * as THREE from 'three';
import { AppearanceTraits, BuildingCell } from '../game/types';
import { BLOCK_SIZE, CLUB_HALF_D, CLUB_HALF_W, gridToWorld } from '../game/worldData';
import {
  ProceduralTextures,
  createBuildingLabelTexture,
  createFaceTexture,
  createNameplateTexture,
} from './textures';
import {
  getClubRoomLocalLayout,
  getClubRoomWallColliders,
} from '../game/npcNavigation';

export interface CharacterRig {
  root: THREE.Group;
  torso: THREE.Mesh;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  outfitMesh: THREE.Mesh;
  accentMesh?: THREE.Mesh;
  weaponMesh?: THREE.Mesh;
  indicatorRing?: THREE.Mesh;
}

export type CharacterRole =
  | 'player'
  | 'recruitable'
  | 'employee'
  | 'customer'
  | 'citizen'
  | 'guard'
  | 'police'
  | 'gang'
  | 'boss';

export function createNameplateSprite(name: string, accentColor: string): THREE.Sprite {
  const tex = createNameplateTexture(name, accentColor);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(0, 2.34, 0);
  sprite.scale.set(2.15, 0.5, 1);
  sprite.renderOrder = 6;
  return sprite;
}

export function updateNameplateSprite(
  sprite: THREE.Sprite,
  name: string,
  accentColor: string,
): void {
  const mat = sprite.material as THREE.SpriteMaterial;
  const nextTex = createNameplateTexture(name, accentColor);
  if (mat.map !== nextTex) {
    mat.map = nextTex;
    mat.needsUpdate = true;
  }
}

export function createCharacterRig(
  role: CharacterRole,
  textures: ProceduralTextures,
  appearance?: Partial<AppearanceTraits>,
): CharacterRig {
  const root = new THREE.Group();
  const scale = role === 'boss' ? 1.28 : appearance?.heightScale ?? 1.0;

  // Ground contact shadow disc
  const shadowGeo = new THREE.CircleGeometry(0.42 * scale, 16);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadowMap,
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  // Palette by role
  let primaryHex = appearance?.baseColor ?? '#334155';
  let accentHex = '#f59e0b';
  let pantsHex = '#1e293b';
  const skinHex = appearance?.skinTone ?? '#f0c6a8';
  const hairHex = appearance?.hairColor ?? '#1c1917';

  if (role === 'player') {
    primaryHex = '#0f172a'; // tailored dark suit
    accentHex = '#f59e0b'; // gold tie/lapel
    pantsHex = '#0f172a';
  } else if (role === 'guard') {
    primaryHex = '#1e293b';
    accentHex = '#fbbf24';
    pantsHex = '#0f172a';
  } else if (role === 'police') {
    primaryHex = '#1d4ed8';
    accentHex = '#93c5fd';
    pantsHex = '#172554';
  } else if (role === 'gang') {
    primaryHex = '#7f1d1d';
    accentHex = '#ef4444';
    pantsHex = '#18181b';
  } else if (role === 'boss') {
    primaryHex = '#450a0a'; // crimson fur-trimmed coat
    accentHex = '#fbbf24'; // gold chains
    pantsHex = '#09090b';
  } else if (role === 'customer') {
    primaryHex = '#475569';
    accentHex = '#38bdf8';
  }

  const skinMat = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.65, metalness: 0.05 });
  const outfitMat = new THREE.MeshStandardMaterial({ color: primaryHex, roughness: 0.55, metalness: 0.15 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsHex, roughness: 0.78, metalness: 0.05 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.25, metalness: 0.75 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairHex, roughness: 0.7, metalness: 0.1 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: '#09090b', roughness: 0.35, metalness: 0.2 });

  const bodyContainer = new THREE.Group();
  bodyContainer.scale.setScalar(scale);
  root.add(bodyContainer);

  // Legs (articulated at hip y = 0.82)
  const makeLeg = (xOffset: number) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(xOffset, 0.82, 0);
    const legMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.52, 4, 8), pantsMat);
    legMesh.position.y = -0.34;
    legMesh.castShadow = true;
    legPivot.add(legMesh);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.28), shoeMat);
    shoe.position.set(0, -0.74, 0.05);
    legPivot.add(shoe);
    return legPivot;
  };

  const leftLeg = makeLeg(-0.15);
  const rightLeg = makeLeg(0.15);
  bodyContainer.add(leftLeg, rightLeg);

  // Torso (y = 1.15)
  const isFemale = role === 'recruitable' || role === 'employee';
  const torsoGeo = isFemale
    ? new THREE.CylinderGeometry(0.22, 0.26, 0.68, 10)
    : new THREE.BoxGeometry(0.52, 0.68, 0.28);
  const torso = new THREE.Mesh(torsoGeo, outfitMat);
  torso.position.y = 1.16;
  torso.castShadow = true;
  bodyContainer.add(torso);

  // Accent detail (tie, lapel, belt, or necklace) — front-facing only
  const accentMesh = new THREE.Mesh(
    role === 'boss'
      ? new THREE.TorusGeometry(0.19, 0.035, 8, 16)
      : new THREE.BoxGeometry(0.12, 0.42, 0.08),
    accentMat,
  );
  if (role === 'boss') {
    accentMesh.rotation.x = Math.PI / 2.4;
    accentMesh.position.set(0, 1.42, 0.12);
  } else {
    accentMesh.position.set(0, 1.18, 0.12);
  }
  bodyContainer.add(accentMesh);

  // Arms (shoulder y = 1.44)
  const makeArm = (xOffset: number) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(xOffset, 1.44, 0);
    const sleeve = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.085, 0.44, 4, 8),
      role === 'employee' || role === 'recruitable' ? skinMat : outfitMat,
    );
    sleeve.position.y = -0.26;
    sleeve.castShadow = true;
    armPivot.add(sleeve);
    return armPivot;
  };
  const leftArm = makeArm(isFemale ? -0.28 : -0.34);
  const rightArm = makeArm(isFemale ? 0.28 : 0.34);
  bodyContainer.add(leftArm, rightArm);

  // Weapon / Bat for player, guard, gang, boss
  let weaponMesh: THREE.Mesh | undefined;
  if (role === 'player' || role === 'gang' || role === 'boss' || role === 'guard') {
    const batGeo = new THREE.CylinderGeometry(
      role === 'boss' ? 0.055 : 0.04,
      0.025,
      role === 'boss' ? 1.05 : 0.78,
      8,
    );
    const batMat = new THREE.MeshStandardMaterial({
      color: role === 'boss' ? '#fbbf24' : '#78350f',
      metalness: role === 'boss' ? 0.85 : 0.2,
      roughness: role === 'boss' ? 0.2 : 0.65,
    });
    weaponMesh = new THREE.Mesh(batGeo, batMat);
    weaponMesh.position.set(0, -0.55, 0.22);
    weaponMesh.rotation.x = Math.PI / 3;
    weaponMesh.visible = role !== 'player'; // player pulls bat out in combat
    rightArm.add(weaponMesh);
  }

  // Head + Realistic Face Texture + 3D Nose, Ears, Neck + Hair/Hat
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.67, 0);
  bodyContainer.add(headGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 0.14, 10), skinMat);
  neck.position.y = -0.17;
  headGroup.add(neck);

  const eyePalette = ['#2563eb', '#15803d', '#6b4226', '#475569'];
  const eyeColor = eyePalette[(primaryHex.charCodeAt(1) + hairHex.charCodeAt(1)) % eyePalette.length];
  const facialHair: 'none' | 'stubble' | 'goatee' =
    role === 'boss' ? 'goatee' : role === 'guard' || role === 'gang' ? 'stubble' : 'none';

  const faceTex = createFaceTexture({
    skinTone: skinHex,
    hairColor: hairHex,
    eyeColor,
    isFemale,
    facialHair,
  });

  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTex,
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0.04,
  });

  // Sculpted cranium/jaw proportions; rotated -PI/2 so u=0.5 faces +Z forward
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.205, 18, 16), faceMat);
  headMesh.scale.set(0.96, 1.08, 0.92);
  headMesh.rotation.y = -Math.PI / 2;
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // 3D Sculpted Nose
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.085, 6), skinMat);
  nose.position.set(0, -0.02, 0.195);
  nose.rotation.x = Math.PI * 0.42;
  headGroup.add(nose);

  // 3D Ears
  [-0.185, 0.185].forEach((ex) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), skinMat);
    ear.scale.set(0.45, 1.15, 0.7);
    ear.position.set(ex, -0.015, 0.01);
    headGroup.add(ear);
  });

  // Translucent tinted shades for guard & boss so realistic brows/eyes/face still read clearly
  if (role === 'guard' || role === 'boss') {
    const glasses = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.058, 0.05),
      new THREE.MeshStandardMaterial({
        color: role === 'boss' ? '#450a0a' : '#09090b',
        roughness: 0.12,
        metalness: 0.75,
        transparent: true,
        opacity: 0.55,
      }),
    );
    glasses.position.set(0, 0.028, 0.188);
    headGroup.add(glasses);
  }

  // Hair / Hat
  if (role === 'police' || role === 'guard') {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.205, 0.215, 0.11, 14),
      new THREE.MeshStandardMaterial({
        color: role === 'police' ? '#1e3a8a' : '#09090b',
        roughness: 0.4,
      }),
    );
    cap.position.y = 0.175;
    headGroup.add(cap);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.27, 0.024, 0.16),
      new THREE.MeshStandardMaterial({ color: '#09090b', roughness: 0.2 }),
    );
    visor.position.set(0, 0.132, 0.175);
    headGroup.add(visor);
  } else if (role === 'boss') {
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.03, 16),
      new THREE.MeshStandardMaterial({ color: '#450a0a', roughness: 0.5 }),
    );
    brim.position.y = 0.168;
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.22, 0.18, 14),
      new THREE.MeshStandardMaterial({ color: '#7f1d1d', roughness: 0.4 }),
    );
    crown.position.y = 0.255;
    headGroup.add(brim, crown);
  } else {
    // Tilt hair dome back off the forehead so eyebrows and realistic eyes remain clearly visible
    const hairTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.206, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.48),
      hairMat,
    );
    hairTop.scale.set(0.97, 1.04, 0.96);
    hairTop.position.set(0, 0.045, -0.036);
    hairTop.rotation.x = -0.3;
    headGroup.add(hairTop);

    const style = appearance?.hairStyle ?? 'bob';
    if (isFemale && (style === 'long' || style === 'wavy')) {
      const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.46, 0.14), hairMat);
      hairBack.position.set(0, -0.15, -0.135);
      headGroup.add(hairBack);
    } else if (isFemale && (style === 'ponytail' || style === 'bun')) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), hairMat);
      bun.position.set(0, 0.12, -0.2);
      headGroup.add(bun);
    }
  }

  // Recruitable / Boss ground marker ring
  let indicatorRing: THREE.Mesh | undefined;
  if (role === 'recruitable' || role === 'boss' || role === 'gang') {
    const ringGeo = new THREE.RingGeometry(0.52, 0.66, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: role === 'recruitable' ? '#f472b6' : '#ef4444',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    indicatorRing = new THREE.Mesh(ringGeo, ringMat);
    indicatorRing.rotation.x = -Math.PI / 2;
    indicatorRing.position.y = 0.035;
    root.add(indicatorRing);
  }

  return {
    root,
    torso,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    outfitMesh: torso,
    accentMesh,
    weaponMesh,
    indicatorRing,
  };
}

export function animateCharacterRig(
  rig: CharacterRig,
  speed: number,
  walkPhase: number,
  mode: 'idle' | 'walk' | 'run' | 'dance' | 'attack',
) {
  if (mode === 'dance') {
    rig.leftArm.rotation.x = -Math.PI * 0.65 + Math.sin(walkPhase * 1.4) * 0.45;
    rig.rightArm.rotation.x = -Math.PI * 0.65 + Math.cos(walkPhase * 1.4) * 0.45;
    rig.leftLeg.rotation.x = Math.sin(walkPhase * 1.4) * 0.18;
    rig.rightLeg.rotation.x = -Math.sin(walkPhase * 1.4) * 0.18;
    rig.torso.rotation.y = Math.sin(walkPhase * 0.7) * 0.25;
    rig.headGroup.rotation.z = Math.sin(walkPhase * 0.9) * 0.08;
    return;
  }

  if (mode === 'attack') {
    rig.rightArm.rotation.x = -Math.PI * 0.7 + Math.sin(walkPhase * 3.5) * 1.1;
    rig.leftArm.rotation.x = 0.25;
    rig.torso.rotation.y = Math.sin(walkPhase * 3.5) * 0.35;
    return;
  }

  if (speed > 0.15) {
    const amp = mode === 'run' ? 0.75 : 0.5;
    rig.leftLeg.rotation.x = Math.sin(walkPhase) * amp;
    rig.rightLeg.rotation.x = -Math.sin(walkPhase) * amp;
    rig.leftArm.rotation.x = -Math.sin(walkPhase) * amp * 0.85;
    rig.rightArm.rotation.x = Math.sin(walkPhase) * amp * 0.85;
    rig.torso.rotation.y = Math.sin(walkPhase) * 0.06;
  } else {
    rig.leftLeg.rotation.x *= 0.85;
    rig.rightLeg.rotation.x *= 0.85;
    rig.leftArm.rotation.x *= 0.85;
    rig.rightArm.rotation.x *= 0.85;
    rig.torso.rotation.y *= 0.85;
    rig.headGroup.rotation.z = Math.sin(walkPhase * 0.25) * 0.03;
  }
}

export function createVehicleGroup(
  bodyColor: string,
  isPolice = false,
): THREE.Group {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: bodyColor,
    metalness: 0.65,
    roughness: 0.25,
    clearcoat: 0.9,
  });
  const cabinMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.15, metalness: 0.8 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.85, metalness: 0.1 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.2, metalness: 0.9 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.72, 4.4), bodyMat);
  chassis.position.y = 0.62;
  chassis.castShadow = true;
  car.add(chassis);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.62, 2.2), cabinMat);
  cabin.position.set(0, 1.24, -0.15);
  car.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelOffsets: [number, number][] = [
    [-1.02, 1.35],
    [1.02, 1.35],
    [-1.02, -1.35],
    [1.02, -1.35],
  ];
  for (const [wx, wz] of wheelOffsets) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.36, wz);
    car.add(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.28, 10), rimMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx, 0.36, wz);
    car.add(hub);
  }

  // Headlights & Taillights
  const headMat = new THREE.MeshBasicMaterial({ color: '#fef08a' });
  const tailMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });
  [-0.7, 0.7].forEach((hx) => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.08), headMat);
    hl.position.set(hx, 0.65, 2.21);
    car.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.08), tailMat);
    tl.position.set(hx, 0.65, -2.21);
    car.add(tl);
  });

  if (isPolice) {
    const barRed = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.26), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
    barRed.position.set(-0.24, 1.62, -0.1);
    const barBlue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.26), new THREE.MeshBasicMaterial({ color: '#3b82f6' }));
    barBlue.position.set(0.24, 1.62, -0.1);
    car.add(barRed, barBlue);
  }

  return car;
}

export function createStreetLampGroup(): THREE.Group {
  const lamp = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.75, roughness: 0.35 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.45, 8), poleMat);
  base.position.y = 0.225;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.6, 8), poleMat);
  pole.position.y = 2.5;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.1), poleMat);
  arm.position.set(0, 4.75, 0.45);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshBasicMaterial({ color: '#fde68a' }),
  );
  bulb.position.set(0, 4.58, 0.92);
  lamp.add(base, pole, arm, bulb);
  return lamp;
}

export interface ClubInteriorRefs {
  roofGroup: THREE.Group;
  roomDoors: Map<string, { doorMesh: THREE.Mesh; statusLight: THREE.Mesh; baseX: number }>;
  danceSpots: THREE.Mesh[];
  pcPosition: THREE.Vector3;
  safeRoomPosition: THREE.Vector3;
  danceFloorCenter: THREE.Vector3;
  waitingLoungeCenter: THREE.Vector3;
  entranceDoorwayPos: THREE.Vector3;
}

export interface CityBuildResult {
  group: THREE.Group;
  colliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  clubInterior: ClubInteriorRefs;
  entranceMarkers: Map<string, THREE.Vector3>;
}

export function buildCityWorld(
  grid: BuildingCell[],
  textures: ProceduralTextures,
): CityBuildResult {
  const group = new THREE.Group();
  const colliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
  const entranceMarkers = new Map<string, THREE.Vector3>();

  // Extended ground plane beyond playable zone (avoid void edges)
  const groundMat = new THREE.MeshStandardMaterial({
    map: textures.asphaltMap,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.05,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Subtle street lane dashed lines between blocks
  const lineMat = new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.4 });
  for (let i = -2; i <= 1; i++) {
    const roadCoord = (i + 0.5) * 32;
    const hLine = new THREE.Mesh(new THREE.PlaneGeometry(168, 0.25), lineMat);
    hLine.rotation.x = -Math.PI / 2;
    hLine.position.set(0, 0.02, roadCoord);
    group.add(hLine);

    const vLine = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 168), lineMat);
    vLine.rotation.x = -Math.PI / 2;
    vLine.position.set(roadCoord, 0.02, 0);
    group.add(vLine);
  }

  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: textures.sidewalkMap,
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.05,
  });

  let clubInterior!: ClubInteriorRefs;

  for (const cell of grid) {
    const center = gridToWorld(cell.row, cell.col);

    // Raised sidewalk pad (Y = 0.06, avoids Z-fighting with asphalt at Y = 0)
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(BLOCK_SIZE, 0.12, BLOCK_SIZE),
      sidewalkMat,
    );
    pad.position.set(center.x, 0.06, center.z);
    pad.receiveShadow = true;
    group.add(pad);

    // Special block types
    if (cell.category === 'club') {
      clubInterior = buildNumberOneClub(cell, center, group, colliders, textures);
      entranceMarkers.set(cell.id, new THREE.Vector3(center.x, 0.12, center.z + CLUB_HALF_D + 1.8));
      continue;
    }

    if (cell.category === 'empty') {
      // Boş Arazi: low wooden perimeter posts & signage
      const dirt = new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK_SIZE - 3, 0.06, BLOCK_SIZE - 3),
        new THREE.MeshStandardMaterial({ color: '#3f3a2e', roughness: 0.95 }),
      );
      dirt.position.set(center.x, 0.14, center.z);
      group.add(dirt);
      addSignPost(group, center.x, center.z + 9.5, cell.name, cell.accentColor, cell.subtitle);
      entranceMarkers.set(cell.id, new THREE.Vector3(center.x, 0.12, center.z + 11.5));
      continue;
    }

    if (cell.category === 'park') {
      // House of Roses Park: grass lawn, central stone fountain, rose planters, benches
      const grass = new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK_SIZE - 2.5, 0.08, BLOCK_SIZE - 2.5),
        new THREE.MeshStandardMaterial({ color: '#14532d', roughness: 0.9 }),
      );
      grass.position.set(center.x, 0.15, center.z);
      group.add(grass);

      const basin = new THREE.Mesh(
        new THREE.CylinderGeometry(3.4, 3.8, 0.7, 16),
        new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.5 }),
      );
      basin.position.set(center.x, 0.5, center.z);
      const water = new THREE.Mesh(
        new THREE.CylinderGeometry(3.0, 3.0, 0.74, 16),
        new THREE.MeshStandardMaterial({ color: '#0284c7', roughness: 0.1, metalness: 0.4 }),
      );
      water.position.set(center.x, 0.5, center.z);
      const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.55, 2.2, 10),
        new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.4 }),
      );
      spire.position.set(center.x, 1.3, center.z);
      group.add(basin, water, spire);

      // Rose beds
      [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(([ox, oz]) => {
        const bed = new THREE.Mesh(
          new THREE.BoxGeometry(3.5, 0.45, 3.5),
          new THREE.MeshStandardMaterial({ color: '#9f1239', roughness: 0.75 }),
        );
        bed.position.set(center.x + ox, 0.35, center.z + oz);
        group.add(bed);
      });
      addSignPost(group, center.x, center.z + 10.2, cell.name, cell.accentColor, cell.subtitle);
      continue;
    }

    if (cell.category === 'lake') {
      // Nasreddin Hodja Lake
      const rim = new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK_SIZE - 2, 0.18, BLOCK_SIZE - 2),
        new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.8 }),
      );
      rim.position.set(center.x, 0.15, center.z);
      const water = new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK_SIZE - 4, 0.22, BLOCK_SIZE - 4),
        new THREE.MeshStandardMaterial({ color: '#0369a1', roughness: 0.08, metalness: 0.55 }),
      );
      water.position.set(center.x, 0.16, center.z);
      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 0.3, 8.5),
        new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.8 }),
      );
      pier.position.set(center.x, 0.34, center.z + 6);
      group.add(rim, water, pier);
      addSignPost(group, center.x, center.z + 10.6, cell.name, cell.accentColor, cell.subtitle);
      continue;
    }

    if (cell.category === 'graveyard') {
      const grass = new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK_SIZE - 2.5, 0.08, BLOCK_SIZE - 2.5),
        new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.95 }),
      );
      grass.position.set(center.x, 0.15, center.z);
      group.add(grass);
      const stoneMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.85 });
      for (let gx = -6; gx <= 6; gx += 4) {
        for (let gz = -6; gz <= 4; gz += 5) {
          const tomb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 0.4), stoneMat);
          tomb.position.set(center.x + gx, 0.9, center.z + gz);
          group.add(tomb);
        }
      }
      addSignPost(group, center.x, center.z + 10.2, cell.name, cell.accentColor, cell.subtitle);
      continue;
    }

    if (cell.category === 'playground') {
      const turf = new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK_SIZE - 2.5, 0.08, BLOCK_SIZE - 2.5),
        new THREE.MeshStandardMaterial({ color: '#065f46', roughness: 0.85 }),
      );
      turf.position.set(center.x, 0.15, center.z);
      const court = new THREE.Mesh(
        new THREE.BoxGeometry(12, 0.12, 10),
        new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.7 }),
      );
      court.position.set(center.x, 0.17, center.z);
      group.add(turf, court);
      addSignPost(group, center.x, center.z + 10.2, cell.name, cell.accentColor, cell.subtitle);
      continue;
    }

    // Standard multi-part 3D building
    const bW = 16.5;
    const bD = 16.5;
    const bH = cell.buildingHeight;

    const bldg = new THREE.Group();
    bldg.position.set(center.x, 0.12, center.z);

    // 1. Plinth / Base
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(bW + 0.8, 0.6, bD + 0.8),
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.85 }),
    );
    plinth.position.y = 0.3;
    bldg.add(plinth);

    // 2. Main Facade Body
    const wallMat = new THREE.MeshStandardMaterial({
      map: textures.facadeMap,
      color: '#cbd5e1',
      roughness: 0.7,
      metalness: 0.1,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bD), wallMat);
    body.position.y = 0.6 + bH / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    bldg.add(body);

    // 3. Roof Cornice & Parapet
    const cornice = new THREE.Mesh(
      new THREE.BoxGeometry(bW + 0.7, 0.55, bD + 0.7),
      new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.5, metalness: 0.3 }),
    );
    cornice.position.y = 0.6 + bH + 0.25;
    bldg.add(cornice);

    // 4. Accent Neon Trim Strip
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(bW + 0.9, 0.22, bD + 0.9),
      new THREE.MeshBasicMaterial({ color: cell.accentColor }),
    );
    trim.position.y = 0.6 + bH - 0.1;
    bldg.add(trim);

    // 5. Entrance Awning & Glowing Doorway on South (+Z) face
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.35, 2.2),
      new THREE.MeshStandardMaterial({ color: cell.accentColor, roughness: 0.35 }),
    );
    awning.position.set(0, 3.2, bD / 2 + 1.0);
    bldg.add(awning);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 2.7, 0.2),
      new THREE.MeshStandardMaterial({
        color: cell.enterable ? '#fde68a' : '#0f172a',
        emissive: cell.enterable ? cell.accentColor : '#000000',
        emissiveIntensity: cell.enterable ? 0.55 : 0,
        roughness: 0.25,
      }),
    );
    door.position.set(0, 1.5, bD / 2 + 0.08);
    bldg.add(door);

    // 6. Front Fascia Sign Board
    const signTex = createBuildingLabelTexture(cell.name, cell.accentColor, cell.subtitle);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(8.5, 2.1),
      new THREE.MeshBasicMaterial({ map: signTex }),
    );
    sign.position.set(0, 4.7, bD / 2 + 0.14);
    bldg.add(sign);

    // Special architectural rooftop crowns for key landmarks
    if (cell.category === 'council') {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(4.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.75, roughness: 0.25 }),
      );
      dome.position.y = 0.6 + bH + 0.5;
      bldg.add(dome);
    } else if (cell.category === 'church') {
      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(2.5, 6.5, 4),
        new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.5 }),
      );
      spire.position.y = 0.6 + bH + 3.6;
      spire.rotation.y = Math.PI / 4;
      bldg.add(spire);
    } else if (cell.category === 'police') {
      const beacon = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.6, 0.8),
        new THREE.MeshBasicMaterial({ color: '#3b82f6' }),
      );
      beacon.position.set(0, 0.6 + bH + 0.8, bD / 2 - 1);
      bldg.add(beacon);
    }

    group.add(bldg);

    // Register AABB collider for solid buildings
    colliders.push({
      minX: center.x - bW / 2 - 0.5,
      maxX: center.x + bW / 2 + 0.5,
      minZ: center.z - bD / 2 - 0.5,
      maxZ: center.z + bD / 2 + 0.5,
    });

    if (cell.enterable) {
      entranceMarkers.set(cell.id, new THREE.Vector3(center.x, 0.12, center.z + bD / 2 + 2.2));
    }
  }

  // Streetlamps & parked cars around avenues
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const center = gridToWorld(r, c);
      const lamp = createStreetLampGroup();
      lamp.position.set(center.x + 11.2, 0.12, center.z + 11.2);
      lamp.rotation.y = Math.PI / 4;
      group.add(lamp);
    }
  }

  return { group, colliders, clubInterior, entranceMarkers };
}

function addSignPost(
  group: THREE.Group,
  x: number,
  z: number,
  title: string,
  color: string,
  subtitle?: string,
) {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 2.8, 8),
    new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.6 }),
  );
  post.position.set(x, 1.5, z);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(5.5, 1.4, 0.18),
    new THREE.MeshBasicMaterial({ map: createBuildingLabelTexture(title, color, subtitle) }),
  );
  board.position.set(x, 2.7, z);
  group.add(post, board);
}

/**
 * Builds Number One Club as a physically enterable 3D structure with:
 * - Wide South entrance doorway (+Z) with velvet ropes
 * - Dance Floor + Rotating Spotlights
 * - Waiting Lounge Sofas
 * - Management Office + Glowing Computer Desk
 * - Security Room + Safe Room Bunker Door
 * - 6 Distinct Rooms (Standard & VIP) with animated sliding/swinging doors
 * - Removable Roof Group when player walks inside
 */
function buildNumberOneClub(
  cell: BuildingCell,
  center: { x: number; z: number },
  parentGroup: THREE.Group,
  colliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>,
  textures: ProceduralTextures,
): ClubInteriorRefs {
  const clubGroup = new THREE.Group();
  clubGroup.position.set(center.x, 0.12, center.z);
  parentGroup.add(clubGroup);

  const w = CLUB_HALF_W * 2; // 22.4m
  const d = CLUB_HALF_D * 2; // 22.4m
  const wallH = 5.4;

  // Interior floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.4, d - 0.4),
    new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.4, metalness: 0.2 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.04;
  floor.receiveShadow = true;
  clubGroup.add(floor);

  // Dance Floor (center-left)
  const danceFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 7.2),
    new THREE.MeshStandardMaterial({
      map: textures.danceFloorMap,
      emissive: '#3b0764',
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.3,
    }),
  );
  danceFloor.rotation.x = -Math.PI / 2;
  danceFloor.position.set(-2.5, 0.07, 1.5);
  clubGroup.add(danceFloor);

  // Dance Spotlights
  const danceSpots: THREE.Mesh[] = [];
  [-4.2, -0.8].forEach((sx, idx) => {
    const spot = new THREE.Mesh(
      new THREE.ConeGeometry(2.1, 4.4, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: idx === 0 ? '#ec4899' : '#f59e0b',
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    spot.position.set(sx, 2.3, 1.5);
    clubGroup.add(spot);
    danceSpots.push(spot);
  });

  // Outer Walls (with 4.4m wide South Entrance gap at z = +CLUB_HALF_D)
  const wallMat = new THREE.MeshStandardMaterial({ color: '#1e1b2e', roughness: 0.65, metalness: 0.15 });
  const neonTrimMat = new THREE.MeshBasicMaterial({ color: '#f59e0b' });

  // North wall
  const northWall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, 0.5), wallMat);
  northWall.position.set(0, wallH / 2, -CLUB_HALF_D + 0.25);
  clubGroup.add(northWall);
  colliders.push({
    minX: center.x - CLUB_HALF_W,
    maxX: center.x + CLUB_HALF_W,
    minZ: center.z - CLUB_HALF_D - 0.3,
    maxZ: center.z - CLUB_HALF_D + 0.8,
  });

  // West wall
  const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, wallH, d), wallMat);
  westWall.position.set(-CLUB_HALF_W + 0.25, wallH / 2, 0);
  clubGroup.add(westWall);
  colliders.push({
    minX: center.x - CLUB_HALF_W - 0.3,
    maxX: center.x - CLUB_HALF_W + 0.8,
    minZ: center.z - CLUB_HALF_D,
    maxZ: center.z + CLUB_HALF_D,
  });

  // East wall
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, wallH, d), wallMat);
  eastWall.position.set(CLUB_HALF_W - 0.25, wallH / 2, 0);
  clubGroup.add(eastWall);
  colliders.push({
    minX: center.x + CLUB_HALF_W - 0.8,
    maxX: center.x + CLUB_HALF_W + 0.3,
    minZ: center.z - CLUB_HALF_D,
    maxZ: center.z + CLUB_HALF_D,
  });

  const roofGroup = new THREE.Group();

  // South Left & Right wall segments leaving open doorway [-2.4 .. +2.4]
  // Lower 1.1m base stays visible as cutaway sill; upper wall + lintel + marquee hide cleanly with roofGroup when inside
  const segW = (w - 4.8) / 2;
  const lowH = 1.1;
  const upperH = wallH - lowH;
  const southLeftLow = new THREE.Mesh(new THREE.BoxGeometry(segW, lowH, 0.5), wallMat);
  southLeftLow.position.set(-CLUB_HALF_W + segW / 2, lowH / 2, CLUB_HALF_D - 0.25);
  const southRightLow = new THREE.Mesh(new THREE.BoxGeometry(segW, lowH, 0.5), wallMat);
  southRightLow.position.set(CLUB_HALF_W - segW / 2, lowH / 2, CLUB_HALF_D - 0.25);
  clubGroup.add(southLeftLow, southRightLow);

  const southLeftUpper = new THREE.Mesh(new THREE.BoxGeometry(segW, upperH, 0.5), wallMat);
  southLeftUpper.position.set(-CLUB_HALF_W + segW / 2, lowH + upperH / 2, CLUB_HALF_D - 0.25);
  const southRightUpper = new THREE.Mesh(new THREE.BoxGeometry(segW, upperH, 0.5), wallMat);
  southRightUpper.position.set(CLUB_HALF_W - segW / 2, lowH + upperH / 2, CLUB_HALF_D - 0.25);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.5, 0.6), wallMat);
  lintel.position.set(0, wallH - 0.75, CLUB_HALF_D - 0.25);
  roofGroup.add(southLeftUpper, southRightUpper, lintel);

  colliders.push({
    minX: center.x - CLUB_HALF_W,
    maxX: center.x - 2.4,
    minZ: center.z + CLUB_HALF_D - 0.8,
    maxZ: center.z + CLUB_HALF_D + 0.3,
  });
  colliders.push({
    minX: center.x + 2.4,
    maxX: center.x + CLUB_HALF_W,
    minZ: center.z + CLUB_HALF_D - 0.8,
    maxZ: center.z + CLUB_HALF_D + 0.3,
  });

  // Grand Neon Marquee above entrance (hides with roofGroup when player is inside)
  const marquee = new THREE.Mesh(
    new THREE.BoxGeometry(11.5, 2.2, 0.4),
    new THREE.MeshBasicMaterial({ map: textures.clubSignMap }),
  );
  marquee.position.set(0, wallH + 1.2, CLUB_HALF_D + 0.15);
  roofGroup.add(marquee);

  const neonBar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.2, 0.6), neonTrimMat);
  neonBar.position.set(0, wallH + 0.05, CLUB_HALF_D - 0.1);
  roofGroup.add(neonBar);

  // Glowing Entrance Pillars & Red Carpet Runner
  [-2.55, 2.55].forEach((px) => {
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 3.6, 0.6),
      new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#b45309', emissiveIntensity: 0.4, roughness: 0.3 }),
    );
    pillar.position.set(px, 1.8, CLUB_HALF_D + 0.15);
    clubGroup.add(pillar);
  });
  const carpet = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 4.6),
    new THREE.MeshStandardMaterial({ color: '#9f1239', roughness: 0.85 }),
  );
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.05, CLUB_HALF_D - 0.5);
  clubGroup.add(carpet);

  // Waiting Lounge Sofas (Front-Right inside) + collider
  const sofaMat = new THREE.MeshStandardMaterial({ color: '#881337', roughness: 0.6 });
  const sofa = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.85, 1.4), sofaMat);
  sofa.position.set(5.5, 0.45, 6.2);
  clubGroup.add(sofa);
  colliders.push({
    minX: center.x + 3.4,
    maxX: center.x + 7.6,
    minZ: center.z + 5.5,
    maxZ: center.z + 6.9,
  });

  // Management PC Desk (South-West corner inside) + collider
  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.9, 1.3),
    new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.4, metalness: 0.3 }),
  );
  desk.position.set(-7.6, 0.45, 7.2);
  const monitor = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.72, 0.12),
    new THREE.MeshBasicMaterial({ color: '#38bdf8' }),
  );
  monitor.position.set(-7.6, 1.32, 7.2);
  clubGroup.add(desk, monitor);
  colliders.push({
    minX: center.x - 8.9,
    maxX: center.x - 6.3,
    minZ: center.z + 6.55,
    maxZ: center.z + 7.85,
  });

  // Safe Room Bunker (North-West corner) + collider
  const bunker = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 3.6, 4.2),
    new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.7, roughness: 0.35 }),
  );
  bunker.position.set(-8.2, 1.8, -8.2);
  const bunkerDoor = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 2.5, 0.25),
    new THREE.MeshStandardMaterial({ color: '#f59e0b', metalness: 0.8, roughness: 0.25 }),
  );
  bunkerDoor.position.set(-8.2, 1.3, -6.0);
  clubGroup.add(bunker, bunkerDoor);
  colliders.push({
    minX: center.x - 10.45,
    maxX: center.x - 5.95,
    minZ: center.z - 10.3,
    maxZ: center.z - 6.1,
  });

  // 6 Hollow Enterable Service Rooms along North side with Doors, Interior Props, Status Lights & Wall Colliders
  const roomIds = ['std_1', 'std_2', 'std_3', 'large_1', 'vip_1', 'vip_2'];
  const roomDoors = new Map<string, { doorMesh: THREE.Mesh; statusLight: THREE.Mesh; baseX: number }>();

  roomIds.forEach((rid, idx) => {
    const isVip = rid.startsWith('vip');
    const layout = getClubRoomLocalLayout(idx);
    const { rx, rz, halfW, halfD, wallThickness, doorHalfW } = layout;
    const roomWallH = 3.2;

    const boothMat = new THREE.MeshStandardMaterial({
      color: isVip ? '#4c1d95' : '#1e293b',
      roughness: 0.55,
    });
    const carpetMat = new THREE.MeshStandardMaterial({
      color: isVip ? '#7e22ce' : '#881337',
      roughness: 0.88,
    });
    const couchMat = new THREE.MeshStandardMaterial({
      color: isVip ? '#fbbf24' : '#be123c',
      roughness: 0.5,
    });
    const sconceMat = new THREE.MeshBasicMaterial({
      color: isVip ? '#f59e0b' : '#f472b6',
    });

    // Interior plush carpet
    const roomCarpet = new THREE.Mesh(
      new THREE.PlaneGeometry(halfW * 2 - wallThickness * 2, halfD * 2 - wallThickness * 2),
      carpetMat,
    );
    roomCarpet.rotation.x = -Math.PI / 2;
    roomCarpet.position.set(rx, 0.045, rz);
    clubGroup.add(roomCarpet);

    // Interior lounge daybed placed flush at back wall
    const daybed = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.48, 0.68), couchMat);
    daybed.position.set(rx, 0.28, rz - halfD + wallThickness + 0.38);
    clubGroup.add(daybed);

    // Interior glowing wall sconce on back wall
    const sconce = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.08), sconceMat);
    sconce.position.set(rx, 2.0, rz - halfD + wallThickness + 0.05);
    clubGroup.add(sconce);

    // Left & Right side walls
    const sideWallGeo = new THREE.BoxGeometry(wallThickness, roomWallH, halfD * 2);
    const leftWall = new THREE.Mesh(sideWallGeo, boothMat);
    leftWall.position.set(rx - halfW + wallThickness / 2, roomWallH / 2, rz);
    const rightWall = new THREE.Mesh(sideWallGeo, boothMat);
    rightWall.position.set(rx + halfW - wallThickness / 2, roomWallH / 2, rz);

    // Back wall (North)
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 2, roomWallH, wallThickness),
      boothMat,
    );
    backWall.position.set(rx, roomWallH / 2, rz - halfD + wallThickness / 2);

    // Front doorway jambs + overhead lintel leaving clear 1.28m doorway
    const jambW = halfW - doorHalfW;
    const jambGeo = new THREE.BoxGeometry(jambW, roomWallH, wallThickness);
    const frontLeftJamb = new THREE.Mesh(jambGeo, boothMat);
    frontLeftJamb.position.set(rx - halfW + jambW / 2, roomWallH / 2, rz + halfD - wallThickness / 2);
    const frontRightJamb = new THREE.Mesh(jambGeo, boothMat);
    frontRightJamb.position.set(rx + halfW - jambW / 2, roomWallH / 2, rz + halfD - wallThickness / 2);
    const doorLintel = new THREE.Mesh(
      new THREE.BoxGeometry(doorHalfW * 2 + 0.12, 0.72, wallThickness + 0.04),
      boothMat,
    );
    doorLintel.position.set(rx, roomWallH - 0.36, rz + halfD - wallThickness / 2);

    clubGroup.add(leftWall, rightWall, backWall, frontLeftJamb, frontRightJamb, doorLintel);

    // Push 5 hollow room wall/jamb colliders (doorway & interior remain walkable!)
    const roomWallBoxes = getClubRoomWallColliders(center.x, center.z, idx);
    for (const box of roomWallBoxes) {
      colliders.push(box);
    }

    const doorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.26, 2.42, 0.14),
      new THREE.MeshStandardMaterial({
        color: isVip ? '#fbbf24' : '#64748b',
        metalness: 0.5,
        roughness: 0.3,
      }),
    );
    doorMesh.position.set(rx, 1.24, rz + halfD + 0.06);
    clubGroup.add(doorMesh);

    const statusLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#22c55e' }),
    );
    statusLight.position.set(rx, 2.75, rz + halfD + 0.15);
    clubGroup.add(statusLight);

    roomDoors.set(rid, { doorMesh, statusLight, baseX: rx });
  });

  // Removable Roof & South Upper Facade Group (hides when player walks inside Number One Club)
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.8, 0.5, d + 0.8),
    new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.6, metalness: 0.25 }),
  );
  roof.position.set(0, wallH + 0.25, 0);
  roofGroup.add(roof);
  clubGroup.add(roofGroup);

  return {
    roofGroup,
    roomDoors,
    danceSpots,
    pcPosition: new THREE.Vector3(center.x - 7.6, 0.12, center.z + 7.2),
    safeRoomPosition: new THREE.Vector3(center.x - 8.2, 0.12, center.z - 5.2),
    danceFloorCenter: new THREE.Vector3(center.x - 2.5, 0.12, center.z + 1.5),
    waitingLoungeCenter: new THREE.Vector3(center.x + 5.5, 0.12, center.z + 4.5),
    entranceDoorwayPos: new THREE.Vector3(center.x, 0.12, center.z + CLUB_HALF_D + 1.5),
  };
}
