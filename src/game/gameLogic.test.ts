import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY_GRID, CLUB_WORLD_POS, gridToWorld } from './worldData';
import {
  applyConsumableToEmployee,
  calculateNegotiationChance,
  convertCandidateToEmployee,
  generateRecruitPool,
  upgradeEmployeeSkill,
} from './EmployeeManagementComponent';
import { calculateSessionPayout, computeClubLevel } from './EconomyComponent';
import {
  applyPlayerAttackToBoss,
  calculatePoliceRisk,
  resolvePoliceInspection,
  startAbrahamBossFight,
  startGangAttack,
} from './EventsManager';
import {
  calculateClubSecurityRating,
  generateSecurityApplicant,
  hireSecurityApplicant,
  upgradeSafeRoom,
} from './SecurityManagementComponent';
import { deserializeGameState, serializeGameState } from './SaveGameManager';
import { createInitialGameState, stepSimulation } from './SimulationEngine';
import {
  buildStaticCityBuildingBoxes,
  collidesWithBoxes,
  computeRoomApplauseVolume,
  computeRoomNavigationTarget,
  findClearStreetSpawn,
  getClubRoomLocalLayout,
  getClubRoomWallColliders,
  getVehicleAABB,
  moveActorWithCollisions,
  pickStreetWaypoint,
  stepVehicleActor,
  VEHICLE_LANE_OFFSET,
  VehicleSimState,
} from './npcNavigation';

test('5x5 city grid matches exact 25-cell layout and Number One Club location', () => {
  assert.equal(CITY_GRID.length, 25);
  const club = CITY_GRID.find((c) => c.id === 'number_one_club');
  assert.ok(club);
  assert.equal(club.row, 1);
  assert.equal(club.col, 3);
  assert.equal(club.enterable, true);

  const pos = gridToWorld(1, 3);
  assert.equal(pos.x, CLUB_WORLD_POS.x);
  assert.equal(pos.z, CLUB_WORLD_POS.z);

  const council = CITY_GRID.find((c) => c.id === 'city_council');
  assert.equal(council?.row, 0);
  assert.equal(council?.col, 4);

  const lake = CITY_GRID.find((c) => c.id === 'nasreddin_hodja_lake');
  assert.equal(lake?.row, 4);
  assert.equal(lake?.col, 2);
});

test('Recruitment pool respects 18-35 age range, unique nicknames, and negotiation probability', () => {
  const pool = generateRecruitPool(8, new Set());
  assert.equal(pool.length, 8);
  const names = new Set(pool.map((c) => c.fullDisplayName));
  assert.equal(names.size, 8);

  for (const c of pool) {
    assert.ok(c.age >= 18 && c.age <= 35);
    assert.ok(c.fullDisplayName.includes('(') && c.fullDisplayName.includes(')'));
    assert.ok(c.skills.bilocan >= 1 && c.skills.bilocan <= 100);
    assert.ok(c.skills.yuzGelimi >= 1 && c.skills.yuzGelimi <= 100);
    assert.ok(c.skills.arkaSokak >= 1 && c.skills.arkaSokak <= 100);
    assert.ok(c.skills.elIsi >= 1 && c.skills.elIsi <= 100);
  }

  const candidate = pool[0];
  const lowChance = calculateNegotiationChance(candidate, 30, 50);
  const highChance = calculateNegotiationChance(candidate, 80, 500);
  assert.ok(highChance > lowChance);
});

test('Employee skills, consumables cooldown reduction, and room payouts calculate accurately', () => {
  const state = createInitialGameState();
  let emp = state.employees[0];
  const initialBilocan = emp.skills.bilocan;

  emp = upgradeEmployeeSkill(emp, 'bilocan', 6);
  assert.equal(emp.skills.bilocan, Math.min(100, initialBilocan + 6));

  emp = {
    ...emp,
    state: 'resting',
    cooldownRemaining: 30,
    cooldownTotal: 30,
    restLevel: 40,
  };
  const coffeeRes = applyConsumableToEmployee(emp, 'coffee');
  assert.equal(coffeeRes.error, undefined);
  assert.ok(coffeeRes.updated.cooldownRemaining < 30);
  assert.ok(coffeeRes.updated.restLevel > 40);

  // Energy drink daily limit check (max 2/day)
  const ed1 = applyConsumableToEmployee(coffeeRes.updated, 'energy_drink');
  const ed2 = applyConsumableToEmployee(ed1.updated, 'energy_drink');
  const ed3 = applyConsumableToEmployee(ed2.updated, 'energy_drink');
  assert.ok(ed3.error);

  const vipRoom = state.rooms.find((r) => r.isVip)!;
  const stdRoom = state.rooms[0];
  const stdPay = calculateSessionPayout(emp, stdRoom, 1);
  const vipPay = calculateSessionPayout(emp, vipRoom, 3);
  assert.ok(vipPay.clubNet > stdPay.clubNet);
});

test('Police inspection checks 18-20 work permits and City Council licenses', () => {
  const base = createInitialGameState();
  const youngCandidate = {
    ...base.recruitPool[0],
    age: 19,
  };
  const youngEmp = convertCandidateToEmployee(youngCandidate, 55);
  assert.equal(youngEmp.hasWorkPermit, false);

  const riskyState = {
    ...base,
    employees: [...base.employees, youngEmp],
  };
  assert.ok(calculatePoliceRisk(riskyState) > calculatePoliceRisk(base));

  const inspectedFail = resolvePoliceInspection(riskyState);
  assert.equal(inspectedFail.police.lastOutcome?.passed, false);
  assert.ok((inspectedFail.police.lastOutcome?.fine ?? 0) > 0);

  // Grant permit -> should pass inspection
  const compliantState = {
    ...riskyState,
    employees: riskyState.employees.map((e) => ({ ...e, hasWorkPermit: true })),
  };
  const inspectedPass = resolvePoliceInspection(compliantState);
  assert.equal(inspectedPass.police.lastOutcome?.passed, true);
  assert.equal(inspectedPass.police.lastOutcome?.fine, 0);
});

test('Security rating, Safe Room evacuation, Gang Raid, and Abraham Sweetvoice Boss Fight work end-to-end', () => {
  let state = createInitialGameState();
  const applicant = generateSecurityApplicant(() => 0.5);
  const guard = hireSecurityApplicant(applicant);
  state = { ...state, guards: [guard] };

  const secRating = calculateClubSecurityRating(state.guards, state.securityTraining, 1);
  assert.ok(secRating > 20);

  const upgradedSafe = upgradeSafeRoom(state.safeRoom, 'capacity');
  assert.ok(upgradedSafe && upgradedSafe.next.capacity === 5);

  state = startGangAttack(state, 0);
  assert.equal(state.gangAttack.active, true);
  assert.equal(state.employees[0].state, 'in_saferoom');

  // Clear gang attack before boss fight
  state = { ...state, gangAttack: { ...state.gangAttack, active: false } };
  state = startAbrahamBossFight(state);
  assert.equal(state.bossFight.active, true);
  assert.equal(state.bossFight.bossName, 'Abraham Sweetvoice');

  // Attack through minions and boss until victory
  let safety = 0;
  while (state.bossFight.active && safety < 50) {
    state = { ...state, bossFight: { ...state.bossFight, attackCooldown: 0 } };
    const res = applyPlayerAttackToBoss(state, 80);
    state = res.next;
    safety++;
  }
  assert.equal(state.bossFight.defeated, true);
  assert.equal(state.victoryAchieved, true);
  assert.ok(state.money > 2800);
});

test('Simulation step progresses clock/sessions and SaveGameManager round-trips cleanly', () => {
  let state = createInitialGameState(() => 0.1);
  // Step enough seconds for a customer session to start and finish
  for (let i = 0; i < 30; i++) {
    state = stepSimulation(state, 0.5, () => 0.05);
  }
  assert.ok(state.minuteOfDay > 20 * 60);
  assert.ok(state.totalCustomersServed >= 1);
  assert.equal(computeClubLevel(350), 3);

  const raw = serializeGameState(state);
  const loaded = deserializeGameState(raw);
  assert.ok(loaded);
  assert.equal(loaded.money, state.money);
  assert.equal(loaded.employees.length, state.employees.length);
});

test('NPC navigation blocks wall penetration, slides along walls, and spawns recruitables on clear streets', () => {
  const boxes = buildStaticCityBuildingBoxes();
  assert.ok(boxes.length >= 15);

  // Generated recruit pool candidates must never spawn inside building colliders
  const pool = generateRecruitPool(10, new Set());
  for (const cand of pool) {
    assert.equal(
      collidesWithBoxes(cand.worldX, cand.worldZ, 0.55, boxes),
      false,
      `Candidate ${cand.fullDisplayName} spawned inside a building at (${cand.worldX}, ${cand.worldZ})`,
    );
  }

  // Walking straight into Number One Club west/south wall must be stopped outside collider
  const clubCenter = gridToWorld(1, 3);
  const wallTestStartX = clubCenter.x - 14.0; // outside west wall (-11.2 collider)
  const wallTestStartZ = clubCenter.z;
  let x = wallTestStartX;
  let z = wallTestStartZ;
  for (let i = 0; i < 40; i++) {
    const res = moveActorWithCollisions(x, z, clubCenter.x, clubCenter.z, 4.0, 0.1, 0.55, boxes);
    x = res.x;
    z = res.z;
    assert.equal(collidesWithBoxes(x, z, 0.55, boxes), false);
  }
  assert.ok(x < clubCenter.x - 11.2, 'NPC must remain outside Number One Club wall');

  // Diagonal target across a wall must slide along the clear axis rather than pass through
  const slideRes = moveActorWithCollisions(
    clubCenter.x - 12.2,
    clubCenter.z,
    clubCenter.x,
    clubCenter.z + 10,
    4.0,
    0.1,
    0.55,
    boxes,
  );
  assert.equal(collidesWithBoxes(slideRes.x, slideRes.z, 0.55, boxes), false);
  assert.ok(slideRes.z > clubCenter.z, 'NPC should slide along Z when X is blocked by wall');

  // Clear street spawn rescues a coordinate inside a building
  const rescued = findClearStreetSpawn(clubCenter.x, clubCenter.z, 0.55, boxes);
  assert.equal(collidesWithBoxes(rescued.x, rescued.z, 0.55, boxes), false);

  // Waypoints remain within world bounds and follow street corridors
  const wp = pickStreetWaypoint(16, -16, () => 0.25);
  assert.ok(Math.abs(wp.x) <= 60 && Math.abs(wp.z) <= 60);
});

test('Moving vehicles stay on clear roads, brake for obstacles, and block actors as solid AABBs', () => {
  const buildingBoxes = buildStaticCityBuildingBoxes();
  const car: VehicleSimState = {
    id: 'test_taxi',
    x: 0,
    z: -16 + VEHICLE_LANE_OFFSET,
    yaw: Math.PI / 2,
    dir: 0,
    maxSpeed: 8,
    currentSpeed: 8,
    targetCoord: 16,
    waitTimer: 0,
  };

  // Drive across multiple intersections without ever colliding with a building
  for (let i = 0; i < 80; i++) {
    stepVehicleActor(car, 0.1, [], [], () => 0.4);
    const carBox = getVehicleAABB(car.x, car.z, car.yaw);
    for (const b of buildingBoxes) {
      const overlaps =
        carBox.maxX > b.minX &&
        carBox.minX < b.maxX &&
        carBox.maxZ > b.minZ &&
        carBox.minZ < b.maxZ;
      assert.equal(overlaps, false, `Vehicle overlapped building at (${car.x}, ${car.z})`);
    }
  }

  // Vehicle acts as a solid collider blocking actors from passing through it
  const parkedCarBox = getVehicleAABB(16, -14.1, Math.PI / 2);
  let ax = 12;
  let az = -14.1;
  for (let i = 0; i < 30; i++) {
    const res = moveActorWithCollisions(ax, az, 22, -14.1, 5, 0.1, 0.55, [parkedCarBox]);
    ax = res.x;
    az = res.z;
    assert.equal(collidesWithBoxes(ax, az, 0.55, [parkedCarBox]), false);
  }
  assert.ok(ax < parkedCarBox.minX, 'Actor must be stopped outside solid vehicle AABB');

  // Vehicle brakes cleanly when a pedestrian stands directly ahead in its lane
  const brakingCar: VehicleSimState = {
    id: 'test_brake',
    x: 0,
    z: -14.1,
    yaw: Math.PI / 2,
    dir: 0,
    maxSpeed: 8,
    currentSpeed: 8,
    targetCoord: 16,
    waitTimer: 0,
  };
  let braked = false;
  for (let i = 0; i < 15; i++) {
    const step = stepVehicleActor(brakingCar, 0.05, [{ x: 4.5, z: -14.1, radius: 0.6 }], []);
    if (step.braking) braked = true;
  }
  assert.equal(braked, true);
  assert.ok(brakingCar.currentSpeed < 8);
});

test('Gang attacks damage the club venue (clubDoorIntegrity) rather than chasing player HP', () => {
  let state = createInitialGameState(() => 0.1);
  const initialPlayerHp = state.playerHp;
  state = startGangAttack(state, 0);
  const startIntegrity = state.gangAttack.clubDoorIntegrity;
  assert.equal(state.gangAttack.active, true);

  // Advance simulation without player input -> venue integrity drains while player HP stays untouched
  for (let i = 0; i < 8; i++) {
    state = stepSimulation(state, 0.5, () => 0.99);
  }
  assert.equal(state.playerHp, initialPlayerHp);
  assert.ok(state.gangAttack.clubDoorIntegrity < startIntegrity);
});

test('Employees and customers enter and exit hollow club service rooms through doorways, and applause scales by proximity', () => {
  const roomBoxes = [0, 1, 2, 3, 4, 5].flatMap((idx) =>
    getClubRoomWallColliders(CLUB_WORLD_POS.x, CLUB_WORLD_POS.z, idx),
  );
  const doorXs = [0, 1, 2, 3, 4, 5].map((idx) => getClubRoomLocalLayout(idx).rx);
  const targetRoom = getClubRoomLocalLayout(0);

  // Employee starting from dance floor enters room 0
  let empX = CLUB_WORLD_POS.x - 2.5;
  let empZ = CLUB_WORLD_POS.z + 1.5;
  const empGoalX = CLUB_WORLD_POS.x + targetRoom.rx - 0.36;
  const empGoalZ = CLUB_WORLD_POS.z - 8.25;
  for (let i = 0; i < 90; i++) {
    const nav = computeRoomNavigationTarget(
      empX,
      empZ,
      empGoalX,
      empGoalZ,
      doorXs,
      CLUB_WORLD_POS.x,
      CLUB_WORLD_POS.z,
    );
    const step = moveActorWithCollisions(empX, empZ, nav.tx, nav.tz, 3.5, 0.1, 0.33, roomBoxes);
    empX = step.x;
    empZ = step.z;
    assert.equal(collidesWithBoxes(empX, empZ, 0.33, roomBoxes), false);
  }
  assert.ok(empZ < CLUB_WORLD_POS.z - 7.8, `Employee should enter room interior (got z=${empZ})`);
  assert.ok(Math.abs(empX - empGoalX) < 0.45);

  // Customer starting from waiting lounge enters room 0 alongside employee
  let custX = CLUB_WORLD_POS.x + 5.5;
  let custZ = CLUB_WORLD_POS.z + 4.0;
  const custGoalX = CLUB_WORLD_POS.x + targetRoom.rx + 0.36;
  const custGoalZ = CLUB_WORLD_POS.z - 8.4;
  for (let i = 0; i < 120; i++) {
    const nav = computeRoomNavigationTarget(
      custX,
      custZ,
      custGoalX,
      custGoalZ,
      doorXs,
      CLUB_WORLD_POS.x,
      CLUB_WORLD_POS.z,
    );
    const step = moveActorWithCollisions(custX, custZ, nav.tx, nav.tz, 3.2, 0.1, 0.33, roomBoxes);
    custX = step.x;
    custZ = step.z;
    assert.equal(collidesWithBoxes(custX, custZ, 0.33, roomBoxes), false);
  }
  assert.ok(custZ < CLUB_WORLD_POS.z - 7.9, `Customer should enter room interior (got z=${custZ})`);
  assert.ok(Math.abs(custX - custGoalX) < 0.45);

  // Customer cleanly exits back out through doorway to lounge
  const loungeGoalX = CLUB_WORLD_POS.x + 5.5;
  const loungeGoalZ = CLUB_WORLD_POS.z + 4.0;
  for (let i = 0; i < 120; i++) {
    const nav = computeRoomNavigationTarget(
      custX,
      custZ,
      loungeGoalX,
      loungeGoalZ,
      doorXs,
      CLUB_WORLD_POS.x,
      CLUB_WORLD_POS.z,
    );
    const step = moveActorWithCollisions(custX, custZ, nav.tx, nav.tz, 2.5, 0.1, 0.33, roomBoxes);
    custX = step.x;
    custZ = step.z;
    assert.equal(collidesWithBoxes(custX, custZ, 0.33, roomBoxes), false);
  }
  assert.ok(custZ > CLUB_WORLD_POS.z, `Customer should exit room back to lounge (got z=${custZ})`);

  // Spatial applause volume check
  assert.equal(computeRoomApplauseVolume(CLUB_WORLD_POS.x, CLUB_WORLD_POS.z, true, []), 0);
  assert.equal(
    computeRoomApplauseVolume(-60, -60, false, [{ x: CLUB_WORLD_POS.x + targetRoom.rx, z: CLUB_WORLD_POS.z - 8.5 }]),
    0,
  );
  const nearVol = computeRoomApplauseVolume(
    CLUB_WORLD_POS.x + targetRoom.rx,
    CLUB_WORLD_POS.z - 4.0,
    true,
    [{ x: CLUB_WORLD_POS.x + targetRoom.rx, z: CLUB_WORLD_POS.z - 8.5 }],
  );
  const farVol = computeRoomApplauseVolume(
    CLUB_WORLD_POS.x,
    CLUB_WORLD_POS.z + 9.0,
    true,
    [{ x: CLUB_WORLD_POS.x + targetRoom.rx, z: CLUB_WORLD_POS.z - 8.5 }],
  );
  assert.ok(nearVol > farVol && nearVol >= 0.25);
});

