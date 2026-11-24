import {
  addLedgerEntry,
  applyReputationDelta,
  calculateSessionPayout,
  settleDailyExpenses,
} from './EconomyComponent';
import {
  calculateCooldownSeconds,
  convertCandidateToEmployee,
  generateRecruitPool,
  grantEmployeeXp,
} from './EmployeeManagementComponent';
import {
  calculatePoliceRisk,
  resolveGangAttackVictoryOrLoss,
  resolvePoliceInspection,
  startGangAttack,
} from './EventsManager';
import {
  calculateClubSecurityRating,
  generateSecurityApplicant,
} from './SecurityManagementComponent';
import { GameState } from './types';
import { CUSTOMER_NAMES, INITIAL_ROOMS, RECRUIT_NAME_POOL } from './worldData';

/**
 * SimulationEngine
 * Deterministic initial state factory + pure time-step simulation tick
 * managing clock, customer matching, room sessions, cooldowns, guard salaries,
 * police risk checks, gang raids, and boss combat timers.
 */

export function createInitialGameState(rng: () => number = Math.random): GameState {
  // Give the player 1 starter employee so the club has immediate life on entry,
  // while leaving plenty of unique street candidates to discover and negotiate with!
  const starterSeed = RECRUIT_NAME_POOL[0]; // Nilay (Yalayut Nilay)
  const starterCandidate = {
    id: 'starter_nilay',
    firstName: starterSeed.firstName,
    nickname: starterSeed.nickname,
    fullDisplayName: `${starterSeed.firstName} (${starterSeed.nickname})`,
    age: 22,
    experienceLevel: 1,
    skills: {
      bilocan: 52,
      yuzGelimi: 64,
      arkaSokak: 45,
      elIsi: 50,
    },
    baseCustomerRevenue: 650,
    expectedCommissionPct: 60,
    personality: starterSeed.personality,
    appearance: {
      hairColor: '#1e1b18',
      hairStyle: 'long' as const,
      skinTone: '#f5d0b5',
      baseColor: '#ec4899',
      heightScale: 1.0,
    },
    worldX: 0,
    worldZ: 0,
    rejectedCooldownDays: 0,
  };
  const starterEmployee = convertCandidateToEmployee(starterCandidate, 55);

  const existingNames = new Set([starterEmployee.fullDisplayName]);
  const recruitPool = generateRecruitPool(8, existingNames, rng);
  const initialGuardApplicant = generateSecurityApplicant(rng);

  return {
    money: 2800,
    clubLevel: 1,
    reputation: 65,
    day: 1,
    minuteOfDay: 20 * 60, // 20:00 evening opening
    playerHp: 100,
    playerMaxHp: 100,
    employees: [starterEmployee],
    recruitPool,
    rooms: INITIAL_ROOMS.map((r) => ({ ...r })),
    expansions: {
      extraDanceFloor: false,
      loungeAreaLevel: 1,
      securityRoomLevel: 1,
      emptyLotBuilt: false,
    },
    inventoryConsumables: {
      coffee: 2,
      sandwich: 1,
    },
    ownedOutfits: ['outfit_default'],
    guards: [],
    guardApplicants: [initialGuardApplicant],
    securityTraining: {
      physical: 0,
      defense: 0,
      equipment: 0,
      coordination: 0,
      leadership: 0,
    },
    safeRoom: {
      capacity: 3,
      doorArmorLevel: 1,
      entrySpeedLevel: 1,
      emergencySystemUnlocked: false,
    },
    permits: {
      businessLicense: true,
      vipPermit: false,
      extendedHoursLicense: false,
    },
    police: {
      active: false,
      riskScore: 18,
      suspiciousIncidents: 0,
      cityPoliceDensity: 1.0,
      pastInspections: 0,
      temporaryClosureHours: 0,
      lastOutcome: null,
    },
    gangAttack: {
      active: false,
      gang: null,
      enemiesRemaining: 0,
      enemiesTotal: 0,
      timeRemaining: 0,
      clubDoorIntegrity: 100,
      employeesSheltered: 0,
      employeesExposed: 0,
      playerHitsDealt: 0,
    },
    bossFight: {
      active: false,
      defeated: false,
      bossName: 'Abraham Sweetvoice',
      bossHp: 600,
      bossMaxHp: 600,
      phase: 1,
      minionsRemaining: 2,
      telegraphTimer: 0,
      telegraphType: 'none',
      playerHp: 100,
      playerMaxHp: 100,
      dodgeCooldown: 0,
      attackCooldown: 0,
      bossPosX: 32,
      bossPosZ: -20,
    },
    activeCustomersCount: 2,
    totalCustomersServed: 0,
    ledger: [
      {
        id: 'init_seed',
        day: 1,
        hour: 20,
        label: 'Başlangıç İşletme Sermayesi',
        amount: 2800,
        category: 'service',
      },
    ],
    lastNotification: 'Number One Club açıldı! Sokaklarda yeni adaylar keşfet veya kulübünü yönet.',
    gameOverReason: null,
    victoryAchieved: false,
  };
}

/**
 * Advances simulation by `dt` real seconds (1 real sec = 4 game minutes).
 */
export function stepSimulation(
  state: GameState,
  dt: number,
  rng: () => number = Math.random,
): GameState {
  if (state.gameOverReason) return state;

  let next = state;

  // 1. Advance Day / Time clock (4 game minutes per real second)
  const minutesAdded = dt * 4;
  let totalMinutes = next.minuteOfDay + minutesAdded;
  let dayChanged = false;
  let nextDay = next.day;

  if (totalMinutes >= 1440) {
    totalMinutes -= 1440;
    nextDay += 1;
    dayChanged = true;
  }

  let nextClosureHours = Math.max(
    0,
    next.police.temporaryClosureHours - minutesAdded / 60,
  );

  next = {
    ...next,
    day: nextDay,
    minuteOfDay: totalMinutes,
    police: {
      ...next.police,
      temporaryClosureHours: nextClosureHours,
      riskScore: calculatePoliceRisk(next),
    },
  };

  // Daily midnight settlement
  if (dayChanged) {
    next = {
      ...next,
      employees: next.employees.map((e) => ({
        ...e,
        energyDrinkUsesToday: 0,
        restLevel: Math.min(100, e.restLevel + 15),
      })),
      recruitPool: next.recruitPool.map((r) => ({
        ...r,
        rejectedCooldownDays: Math.max(0, r.rejectedCooldownDays - 1),
      })),
    };

    // Replenish recruit pool if low
    if (next.recruitPool.length < 6) {
      const usedNames = new Set([
        ...next.employees.map((e) => e.fullDisplayName),
        ...next.recruitPool.map((r) => r.fullDisplayName),
      ]);
      const fresh = generateRecruitPool(8 - next.recruitPool.length, usedNames, rng);
      next = { ...next, recruitPool: [...next.recruitPool, ...fresh] };
    }

    // Occasional security guard applicant
    if (next.guardApplicants.length < 3 && rng() < 0.65) {
      next = {
        ...next,
        guardApplicants: [...next.guardApplicants, generateSecurityApplicant(rng)],
        lastNotification: 'Yeni bir koruma adayı Number One Club için iş başvurusu yaptı!',
      };
    }

    next = settleDailyExpenses(next);
    if (next.gameOverReason) return next;
  }

  // 2. Boss Fight active timers
  if (next.bossFight.active) {
    const bf = next.bossFight;
    let telegraphTimer = bf.telegraphTimer;
    let telegraphType = bf.telegraphType;
    let playerHp = bf.playerHp;

    if (telegraphTimer > 0) {
      telegraphTimer -= dt;
      if (telegraphTimer <= 0) {
        // Boss strike lands unless player is actively dodging
        if (bf.dodgeCooldown <= 1.0) {
          // Player took hit if not in i-frames
          const dmg = bf.phase === 3 ? 22 : 16;
          playerHp = Math.max(0, playerHp - dmg);
        }
        telegraphTimer = 0;
        telegraphType = 'none';
      }
    } else if (rng() < dt * (0.28 + bf.phase * 0.12)) {
      telegraphTimer = 1.4;
      telegraphType = bf.phase >= 2 && rng() < 0.5 ? 'shockwave' : 'rush';
    }

    const nextGameOver =
      playerHp <= 0
        ? 'Abraham Sweetvoice ile yapılan çatışmada ağır yaralandın. Kulüp savunmasız kaldı.'
        : next.gameOverReason;

    next = {
      ...next,
      playerHp,
      gameOverReason: nextGameOver,
      bossFight: {
        ...bf,
        playerHp,
        telegraphTimer,
        telegraphType,
        dodgeCooldown: Math.max(0, bf.dodgeCooldown - dt),
        attackCooldown: Math.max(0, bf.attackCooldown - dt),
      },
    };
    return next;
  }

  // 3. Gang Attack active simulation (gang attacks the venue / club doors)
  if (next.gangAttack.active) {
    const ga = next.gangAttack;
    const secRating = calculateClubSecurityRating(
      next.guards,
      next.securityTraining,
      next.expansions.securityRoomLevel,
    );
    const gangPower = ga.gang?.power ?? 50;
    // Guards slowly chip away at attackers
    const guardDps = Math.max(0.05, secRating / 180);
    let timeRemaining = ga.timeRemaining - dt;
    let enemiesRemaining = ga.enemiesRemaining;

    // Attackers directly damage the club venue / doors instead of chasing the player
    const armorMitigation = 1 - Math.min(0.55, next.safeRoom.doorArmorLevel * 0.08 + secRating / 380);
    const venueDps = Math.max(0.6, enemiesRemaining * (0.95 + gangPower / 120) * armorMitigation);
    const clubDoorIntegrity = Math.max(0, ga.clubDoorIntegrity - venueDps * dt);

    if (rng() < dt * guardDps && enemiesRemaining > 0) {
      enemiesRemaining -= 1;
    }

    if (enemiesRemaining <= 0) {
      return resolveGangAttackVictoryOrLoss(next, true);
    }
    if (timeRemaining <= 0 || clubDoorIntegrity <= 0) {
      return resolveGangAttackVictoryOrLoss(
        {
          ...next,
          gangAttack: { ...ga, clubDoorIntegrity },
        },
        false,
      );
    }

    return {
      ...next,
      gangAttack: {
        ...ga,
        timeRemaining,
        enemiesRemaining,
        clubDoorIntegrity,
      },
    };
  }

  // 4. Employee rest cooldown ticks
  const employees = next.employees.map((emp) => {
    if (emp.state === 'resting') {
      const rem = Math.max(0, emp.cooldownRemaining - dt);
      const restGain = dt * 2.2;
      if (rem <= 0) {
        return {
          ...emp,
          cooldownRemaining: 0,
          restLevel: Math.min(100, emp.restLevel + restGain),
          state: 'dancing' as const,
          activeBuffType: null,
          activeBuffReduction: 0,
        };
      }
      return {
        ...emp,
        cooldownRemaining: rem,
        restLevel: Math.min(100, emp.restLevel + restGain),
      };
    }
    return emp;
  });

  // 5. Room session ticks & completions
  let updatedEmployees = [...employees];
  let updatedRooms = next.rooms.map((room) => ({ ...room }));
  let totalServicePayout = 0;
  let totalReputationGain = 0;
  let completedCount = 0;
  let lastCompletionMsg: string | null = null;

  for (let i = 0; i < updatedRooms.length; i++) {
    const room = updatedRooms[i];
    if (!room.unlocked || !room.occupiedByEmployeeId) continue;

    const nextProg = room.sessionProgress + dt / room.sessionDuration;
    if (nextProg >= 1) {
      // Complete session!
      const empIdx = updatedEmployees.findIndex(
        (e) => e.id === room.occupiedByEmployeeId,
      );
      if (empIdx !== -1) {
        const emp = updatedEmployees[empIdx];
        const payout = calculateSessionPayout(emp, room, next.clubLevel);
        totalServicePayout += payout.clubNet;
        totalReputationGain += payout.reputationGain;
        completedCount += 1;
        lastCompletionMsg = `${emp.firstName} (${room.name}) müşteri hizmetini tamamladı: +$${payout.clubNet} net gelir.`;

        const leveledEmp = grantEmployeeXp(
          {
            ...emp,
            restLevel: Math.max(15, emp.restLevel - (room.isVip ? 22 : 14)),
            totalServed: emp.totalServed + 1,
            totalEarnedForClub: emp.totalEarnedForClub + payout.clubNet,
          },
          room.isVip ? 45 : 28,
        );
        const cd = calculateCooldownSeconds(leveledEmp, room);
        updatedEmployees[empIdx] = {
          ...leveledEmp,
          state: 'resting',
          assignedRoomId: null,
          cooldownTotal: cd,
          cooldownRemaining: cd,
        };
      }

      updatedRooms[i] = {
        ...room,
        occupiedByEmployeeId: null,
        occupiedByCustomerName: null,
        sessionProgress: 0,
        expectedPayout: 0,
      };
    } else {
      updatedRooms[i] = {
        ...room,
        sessionProgress: nextProg,
      };
    }
  }

  // 6. Match arriving customers with idle employees & free unlocked rooms (unless closed by police)
  if (nextClosureHours <= 0) {
    const freeRooms = updatedRooms.filter((r) => r.unlocked && !r.occupiedByEmployeeId);
    const availableEmps = updatedEmployees.filter(
      (e) => e.state === 'dancing' || e.state === 'waiting',
    );

    const arrivalChance = dt * (0.28 + next.clubLevel * 0.1 + next.reputation / 1200);
    if (freeRooms.length > 0 && availableEmps.length > 0 && rng() < arrivalChance) {
      // Prefer VIP room if unlocked and employee is level 2+
      const chosenRoom =
        freeRooms.find((r) => r.isVip) && availableEmps[0].level >= 2
          ? freeRooms.find((r) => r.isVip)!
          : freeRooms[0];
      const chosenEmp = availableEmps[0];
      const payoutPreview = calculateSessionPayout(chosenEmp, chosenRoom, next.clubLevel);
      const custName = CUSTOMER_NAMES[Math.floor(rng() * CUSTOMER_NAMES.length)];

      const empIdx = updatedEmployees.findIndex((e) => e.id === chosenEmp.id);
      const roomIdx = updatedRooms.findIndex((r) => r.id === chosenRoom.id);
      if (empIdx !== -1 && roomIdx !== -1) {
        updatedEmployees[empIdx] = {
          ...updatedEmployees[empIdx],
          state: 'in_room',
          assignedRoomId: chosenRoom.id,
        };
        updatedRooms[roomIdx] = {
          ...updatedRooms[roomIdx],
          occupiedByEmployeeId: chosenEmp.id,
          occupiedByCustomerName: custName,
          sessionProgress: 0.02,
          expectedPayout: payoutPreview.clubNet,
        };
      }
    }
  }

  const occupiedCount = updatedRooms.filter((r) => r.occupiedByEmployeeId !== null).length;
  const targetCustomers =
    nextClosureHours > 0
      ? 0
      : Math.min(12, occupiedCount + 1 + next.clubLevel + Math.floor(next.reputation / 180));

  next = {
    ...next,
    employees: updatedEmployees,
    rooms: updatedRooms,
    activeCustomersCount: targetCustomers,
    totalCustomersServed: next.totalCustomersServed + completedCount,
    lastNotification: lastCompletionMsg ?? next.lastNotification,
  };

  if (totalServicePayout > 0) {
    next = addLedgerEntry(
      next,
      completedCount > 1
        ? `${completedCount} Oda Hizmeti Geliri`
        : lastCompletionMsg ?? 'Kulüp Hizmet Geliri',
      totalServicePayout,
      'service',
    );
  }
  if (totalReputationGain > 0) {
    next = applyReputationDelta(next, totalReputationGain);
  }

  // 7. Periodic Police Inspection or Gang Raid checks (gentle rate so gameplay flows naturally)
  const risk = next.police.riskScore;
  if (!next.police.active && next.day >= 2 && rng() < dt * (risk / 4500)) {
    next = resolvePoliceInspection(next);
  } else if (
    !next.gangAttack.active &&
    next.clubLevel >= 2 &&
    next.day >= 2 &&
    rng() < dt * 0.0045
  ) {
    next = startGangAttack(next);
  }

  return next;
}
