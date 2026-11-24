import { BLOCK_SIZE, CITY_GRID, STREET_WIDTH, gridToWorld } from './worldData';

export interface AABBBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Centerlines of the 4 interior streets + 2 outer avenues around the 5x5 grid.
 * Blocks sit at [-64, -32, 0, 32, 64]; open 8m streets + sidewalks center at [-48, -16, 16, 48] and outer perimeter [-78, 78].
 */
export const STREET_CORRIDOR_COORDS = [-48, -16, 16, 48];

export function collidesWithBoxes(
  x: number,
  z: number,
  radius: number,
  boxes: AABBBox[],
): boolean {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ) {
      return true;
    }
  }
  return false;
}

export function buildStaticCityBuildingBoxes(): AABBBox[] {
  const boxes: AABBBox[] = [];
  for (const cell of CITY_GRID) {
    if (
      cell.category === 'empty' ||
      cell.category === 'park' ||
      cell.category === 'lake' ||
      cell.category === 'graveyard' ||
      cell.category === 'playground'
    ) {
      continue;
    }
    const c = gridToWorld(cell.row, cell.col);
    const half = cell.category === 'club' ? 11.2 : 8.25 + 0.5;
    boxes.push({
      minX: c.x - half,
      maxX: c.x + half,
      minZ: c.z - half,
      maxZ: c.z + half,
    });
  }
  return boxes;
}

export function pickStreetWaypoint(
  currentX: number,
  currentZ: number,
  rng: () => number = Math.random,
): { x: number; z: number } {
  const nearestLane = (val: number) => {
    let best = STREET_CORRIDOR_COORDS[0];
    let bestDist = Infinity;
    for (const c of STREET_CORRIDOR_COORDS) {
      const d = Math.abs(val - c);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  };

  const laneX = nearestLane(currentX);
  const laneZ = nearestLane(currentZ);
  const distToLaneX = Math.abs(currentX - laneX);
  const distToLaneZ = Math.abs(currentZ - laneZ);
  const offset = (rng() - 0.5) * 3.0; // sidewalk variation inside open street corridor

  const pickDifferent = (currentLane: number) => {
    const others = STREET_CORRIDOR_COORDS.filter((c) => c !== currentLane);
    return others[Math.floor(rng() * others.length)];
  };

  // If on an E-W street between intersections, keep walking along that E-W street
  if (distToLaneZ <= 3.2 && distToLaneX > 3.2) {
    return { x: pickDifferent(laneX) + offset, z: laneZ + offset };
  }
  // If on a N-S street between intersections, keep walking along that N-S street
  if (distToLaneX <= 3.2 && distToLaneZ > 3.2) {
    return { x: laneX + offset, z: pickDifferent(laneZ) + offset };
  }

  // At an intersection (or off-lane): choose either E-W along laneZ or N-S along laneX
  if (rng() < 0.5) {
    return { x: pickDifferent(laneX) + offset, z: laneZ + offset };
  }
  return { x: laneX + offset, z: pickDifferent(laneZ) + offset };
}

export function findClearStreetSpawn(
  preferredX: number,
  preferredZ: number,
  radius: number,
  boxes: AABBBox[],
): { x: number; z: number } {
  if (!collidesWithBoxes(preferredX, preferredZ, radius, boxes)) {
    return { x: preferredX, z: preferredZ };
  }
  // Fall back to nearest unobstructed street intersection
  let bestX = STREET_CORRIDOR_COORDS[1];
  let bestZ = STREET_CORRIDOR_COORDS[1];
  let bestDist = Infinity;
  for (const sx of STREET_CORRIDOR_COORDS) {
    for (const sz of STREET_CORRIDOR_COORDS) {
      if (!collidesWithBoxes(sx, sz, radius, boxes)) {
        const d = Math.hypot(sx - preferredX, sz - preferredZ);
        if (d < bestDist) {
          bestDist = d;
          bestX = sx;
          bestZ = sz;
        }
      }
    }
  }
  return { x: bestX, z: bestZ };
}

export function moveActorWithCollisions(
  x: number,
  z: number,
  targetX: number,
  targetZ: number,
  speed: number,
  dt: number,
  radius: number,
  boxes: AABBBox[],
  worldBound = (BLOCK_SIZE + STREET_WIDTH) * 2 + 12,
): {
  x: number;
  z: number;
  dx: number;
  dz: number;
  movedDist: number;
  blocked: boolean;
  reached: boolean;
} {
  const toX = targetX - x;
  const toZ = targetZ - z;
  const dist = Math.hypot(toX, toZ);
  if (dist < 0.35) {
    return { x, z, dx: toX, dz: toZ, movedDist: 0, blocked: false, reached: true };
  }

  const step = Math.min(dist, speed * dt);
  const dirX = toX / dist;
  const dirZ = toZ / dist;

  let nextX = Math.max(-worldBound, Math.min(worldBound, x + dirX * step));
  let nextZ = Math.max(-worldBound, Math.min(worldBound, z + dirZ * step));

  let resolvedX = x;
  let resolvedZ = z;
  let blockedX = false;
  let blockedZ = false;

  if (!collidesWithBoxes(nextX, resolvedZ, radius, boxes)) {
    resolvedX = nextX;
  } else {
    blockedX = true;
  }

  if (!collidesWithBoxes(resolvedX, nextZ, radius, boxes)) {
    resolvedZ = nextZ;
  } else {
    blockedZ = true;
  }

  const movedDist = Math.hypot(resolvedX - x, resolvedZ - z);
  const blocked = (blockedX || blockedZ) && movedDist < step * 0.2;

  return {
    x: resolvedX,
    z: resolvedZ,
    dx: dirX,
    dz: dirZ,
    movedDist,
    blocked,
    reached: Math.hypot(targetX - resolvedX, targetZ - resolvedZ) < 0.45,
  };
}

export const VEHICLE_LANE_OFFSET = 1.9;
export type VehicleDir = 0 | 1 | 2 | 3; // 0: +X East, 1: +Z South, 2: -X West, 3: -Z North

export interface VehicleSimState {
  id: string;
  x: number;
  z: number;
  yaw: number;
  dir: VehicleDir;
  maxSpeed: number;
  currentSpeed: number;
  targetCoord: number;
  waitTimer: number;
}

export function dirToYaw(dir: VehicleDir): number {
  if (dir === 0) return Math.PI / 2;
  if (dir === 1) return 0;
  if (dir === 2) return -Math.PI / 2;
  return Math.PI;
}

export function getVehicleAABB(
  x: number,
  z: number,
  yaw: number,
  halfWidth = 1.08,
  halfLength = 2.25,
): AABBBox {
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const hx = halfWidth * c + halfLength * s;
  const hz = halfLength * c + halfWidth * s;
  return {
    minX: x - hx,
    maxX: x + hx,
    minZ: z - hz,
    maxZ: z + hz,
  };
}

export function getVehicleForwardSensor(
  x: number,
  z: number,
  dir: VehicleDir,
  lookAhead = 3.8,
  halfSide = 1.25,
): AABBBox {
  const bumper = 2.25;
  if (dir === 0) {
    return { minX: x + bumper, maxX: x + bumper + lookAhead, minZ: z - halfSide, maxZ: z + halfSide };
  }
  if (dir === 2) {
    return { minX: x - bumper - lookAhead, maxX: x - bumper, minZ: z - halfSide, maxZ: z + halfSide };
  }
  if (dir === 1) {
    return { minX: x - halfSide, maxX: x + halfSide, minZ: z + bumper, maxZ: z + bumper + lookAhead };
  }
  return { minX: x - halfSide, maxX: x + halfSide, minZ: z - bumper - lookAhead, maxZ: z - bumper };
}

function nearestRoadCoord(val: number): number {
  let best = STREET_CORRIDOR_COORDS[0];
  let bestDist = Infinity;
  for (const c of STREET_CORRIDOR_COORDS) {
    const d = Math.abs(val - c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

export function pickNextVehicleTurn(
  ix: number,
  iz: number,
  currentDir: VehicleDir,
  rng: () => number = Math.random,
): { nextDir: VehicleDir; laneX: number; laneZ: number; targetCoord: number } {
  const idxX = STREET_CORRIDOR_COORDS.indexOf(ix);
  const idxZ = STREET_CORRIDOR_COORDS.indexOf(iz);

  const canGo = (d: VehicleDir): boolean => {
    if (d === 0) return idxX < STREET_CORRIDOR_COORDS.length - 1;
    if (d === 2) return idxX > 0;
    if (d === 1) return idxZ < STREET_CORRIDOR_COORDS.length - 1;
    return idxZ > 0;
  };

  // Never reverse 180° immediately unless dead-end (not possible on 4x4 grid)
  const reverseDir = ((currentDir + 2) % 4) as VehicleDir;
  const options = ([0, 1, 2, 3] as VehicleDir[]).filter((d) => d !== reverseDir && canGo(d));
  const nextDir = options.length > 0 ? options[Math.floor(rng() * options.length)] : reverseDir;

  let laneX = ix;
  let laneZ = iz;
  let targetCoord = ix;

  if (nextDir === 0) {
    laneZ = iz + VEHICLE_LANE_OFFSET;
    targetCoord = STREET_CORRIDOR_COORDS[Math.min(STREET_CORRIDOR_COORDS.length - 1, idxX + 1)];
  } else if (nextDir === 2) {
    laneZ = iz - VEHICLE_LANE_OFFSET;
    targetCoord = STREET_CORRIDOR_COORDS[Math.max(0, idxX - 1)];
  } else if (nextDir === 1) {
    laneX = ix - VEHICLE_LANE_OFFSET;
    targetCoord = STREET_CORRIDOR_COORDS[Math.min(STREET_CORRIDOR_COORDS.length - 1, idxZ + 1)];
  } else {
    laneX = ix + VEHICLE_LANE_OFFSET;
    targetCoord = STREET_CORRIDOR_COORDS[Math.max(0, idxZ - 1)];
  }

  return { nextDir, laneX, laneZ, targetCoord };
}

function aabbIntersects(a: AABBBox, b: AABBBox): boolean {
  return a.maxX > b.minX && a.minX < b.maxX && a.maxZ > b.minZ && a.minZ < b.maxZ;
}

export function stepVehicleActor(
  vehicle: VehicleSimState,
  dt: number,
  actorObstacles: Array<{ x: number; z: number; radius: number }>,
  otherVehicleBoxes: AABBBox[],
  rng: () => number = Math.random,
): { braking: boolean } {
  const sensor = getVehicleForwardSensor(vehicle.x, vehicle.z, vehicle.dir);
  let blockedAhead = false;

  for (let i = 0; i < actorObstacles.length; i++) {
    const a = actorObstacles[i];
    if (
      a.x + a.radius > sensor.minX &&
      a.x - a.radius < sensor.maxX &&
      a.z + a.radius > sensor.minZ &&
      a.z - a.radius < sensor.maxZ
    ) {
      blockedAhead = true;
      break;
    }
  }

  if (!blockedAhead) {
    for (let i = 0; i < otherVehicleBoxes.length; i++) {
      if (aabbIntersects(sensor, otherVehicleBoxes[i])) {
        blockedAhead = true;
        break;
      }
    }
  }

  if (blockedAhead) {
    vehicle.currentSpeed = Math.max(0, vehicle.currentSpeed - 18 * dt);
  } else {
    vehicle.currentSpeed = Math.min(vehicle.maxSpeed, vehicle.currentSpeed + 9 * dt);
  }

  const desiredYaw = dirToYaw(vehicle.dir);
  let yawDiff = desiredYaw - vehicle.yaw;
  while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
  while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
  vehicle.yaw += yawDiff * Math.min(1, 9 * dt);

  if (vehicle.currentSpeed <= 0.02) {
    return { braking: blockedAhead };
  }

  const step = vehicle.currentSpeed * dt;
  const horizontal = vehicle.dir === 0 || vehicle.dir === 2;
  const sign = vehicle.dir === 0 || vehicle.dir === 1 ? 1 : -1;

  if (horizontal) {
    const nextX = vehicle.x + sign * step;
    // Check if reaching intersection turn point (aligned to target lane offset)
    const ix = vehicle.targetCoord;
    const iz = nearestRoadCoord(vehicle.z);
    const turnTrigger = sign > 0 ? nextX >= ix - VEHICLE_LANE_OFFSET * 0.25 : nextX <= ix + VEHICLE_LANE_OFFSET * 0.25;
    if (turnTrigger) {
      const turn = pickNextVehicleTurn(ix, iz, vehicle.dir, rng);
      vehicle.dir = turn.nextDir;
      vehicle.targetCoord = turn.targetCoord;
      if (turn.nextDir === 1 || turn.nextDir === 3) {
        vehicle.x = turn.laneX;
        vehicle.z = iz;
      } else {
        vehicle.x = ix;
        vehicle.z = turn.laneZ;
      }
    } else {
      vehicle.x = nextX;
    }
  } else {
    const nextZ = vehicle.z + sign * step;
    const ix = nearestRoadCoord(vehicle.x);
    const iz = vehicle.targetCoord;
    const turnTrigger = sign > 0 ? nextZ >= iz - VEHICLE_LANE_OFFSET * 0.25 : nextZ <= iz + VEHICLE_LANE_OFFSET * 0.25;
    if (turnTrigger) {
      const turn = pickNextVehicleTurn(ix, iz, vehicle.dir, rng);
      vehicle.dir = turn.nextDir;
      vehicle.targetCoord = turn.targetCoord;
      if (turn.nextDir === 0 || turn.nextDir === 2) {
        vehicle.z = turn.laneZ;
        vehicle.x = ix;
      } else {
        vehicle.z = iz;
        vehicle.x = turn.laneX;
      }
    } else {
      vehicle.z = nextZ;
    }
  }

  return { braking: blockedAhead };
}

export interface ClubRoomLocalLayout {
  rx: number;
  rz: number;
  halfW: number;
  halfD: number;
  wallThickness: number;
  doorHalfW: number;
}

export function getClubRoomLocalLayout(roomIndex: number): ClubRoomLocalLayout {
  return {
    rx: -4.0 + roomIndex * 2.62,
    rz: -8.5,
    halfW: 1.22,
    halfD: 2.0,
    wallThickness: 0.18,
    doorHalfW: 0.64,
  };
}

export function getClubRoomWallColliders(
  clubCenterX: number,
  clubCenterZ: number,
  roomIndex: number,
): AABBBox[] {
  const { rx, rz, halfW, halfD, wallThickness, doorHalfW } = getClubRoomLocalLayout(roomIndex);
  const cx = clubCenterX + rx;
  const cz = clubCenterZ + rz;

  return [
    // Left wall
    {
      minX: cx - halfW,
      maxX: cx - halfW + wallThickness,
      minZ: cz - halfD,
      maxZ: cz + halfD,
    },
    // Right wall
    {
      minX: cx + halfW - wallThickness,
      maxX: cx + halfW,
      minZ: cz - halfD,
      maxZ: cz + halfD,
    },
    // Back wall (north)
    {
      minX: cx - halfW,
      maxX: cx + halfW,
      minZ: cz - halfD,
      maxZ: cz - halfD + wallThickness,
    },
    // Front-left doorway jamb
    {
      minX: cx - halfW,
      maxX: cx - doorHalfW,
      minZ: cz + halfD - wallThickness,
      maxZ: cz + halfD,
    },
    // Front-right doorway jamb
    {
      minX: cx + doorHalfW,
      maxX: cx + halfW,
      minZ: cz + halfD - wallThickness,
      maxZ: cz + halfD,
    },
  ];
}

/**
 * 2-step doorway alignment so actors enter/exit hollow service rooms cleanly
 * through the open 1.28m front doorway without snagging on front jambs.
 */
export function computeRoomNavigationTarget(
  curX: number,
  curZ: number,
  goalX: number,
  goalZ: number,
  roomDoorXs: number[],
  clubCenterX: number,
  clubCenterZ: number,
): { tx: number; tz: number } {
  const thresholdZ = clubCenterZ - 6.5;
  const doorOutsideZ = clubCenterZ - 5.1;
  const insideThresholdZ = clubCenterZ - 6.95;

  const findNearestDoorWorldX = (refX: number): number => {
    let best = clubCenterX + (roomDoorXs[0] ?? 0);
    let bestDist = Infinity;
    for (const rx of roomDoorXs) {
      const wx = clubCenterX + rx;
      const d = Math.abs(refX - wx);
      if (d < bestDist) {
        bestDist = d;
        best = wx;
      }
    }
    return best;
  };

  // Entering a room from outside the booth line
  if (goalZ < thresholdZ - 0.2) {
    const doorWorldX = findNearestDoorWorldX(goalX);
    if (curZ > insideThresholdZ) {
      // Align with doorway X outside the jambs (keeping distance > 0.45m so 0.35m deadband never blocks)
      if (Math.abs(curX - doorWorldX) > 0.24 && curZ > thresholdZ - 0.15) {
        const alignZ = curZ < clubCenterZ - 5.3 ? clubCenterZ - 4.6 : clubCenterZ - 5.45;
        return { tx: doorWorldX, tz: alignZ };
      }
      return { tx: doorWorldX, tz: Math.min(goalZ, insideThresholdZ - 0.55) };
    }
    return { tx: goalX, tz: goalZ };
  }

  // Exiting a room toward the club floor / lounge
  if (curZ < thresholdZ + 0.15 && goalZ >= thresholdZ - 0.1) {
    const doorWorldX = findNearestDoorWorldX(curX);
    if (Math.abs(curX - doorWorldX) > 0.24 && curZ < thresholdZ - 0.2) {
      const alignZ = curZ > clubCenterZ - 8.6 ? clubCenterZ - 9.15 : clubCenterZ - 8.05;
      return { tx: doorWorldX, tz: alignZ };
    }
    return { tx: doorWorldX, tz: doorOutsideZ };
  }

  return { tx: goalX, tz: goalZ };
}

export function computeRoomApplauseVolume(
  playerX: number,
  playerZ: number,
  insideClub: boolean,
  activeRoomPositions: Array<{ x: number; z: number }>,
): number {
  if (activeRoomPositions.length === 0) return 0;

  let minDist = Infinity;
  for (const pos of activeRoomPositions) {
    const d = Math.hypot(playerX - pos.x, playerZ - pos.z);
    if (d < minDist) minDist = d;
  }

  if (!insideClub && minDist > 22) return 0;

  const proximity = Math.max(0, 1 - minDist / 24);
  const countBoost = Math.min(0.12, (activeRoomPositions.length - 1) * 0.04);
  if (insideClub) {
    return Math.min(0.42, 0.2 + proximity * 0.16 + countBoost);
  }
  return Math.min(0.2, 0.06 + proximity * 0.12);
}

