import {
  BossFightState,
  GameState,
  GangAttackState,
  GangInfo,
} from './types';
import { addLedgerEntry, applyReputationDelta } from './EconomyComponent';
import { calculateClubSecurityRating } from './SecurityManagementComponent';
import { GANG_POOL } from './worldData';

/**
 * PoliceEventManager + GangEventManager + Abraham Sweetvoice Boss Fight
 */

export function calculatePoliceRisk(state: GameState): number {
  let risk = 12;
  risk += Math.min(25, state.clubLevel * 4.5);
  risk += state.police.suspiciousIncidents * 11;
  risk += Math.max(0, (state.police.cityPoliceDensity - 0.8) * 20);
  risk -= Math.min(18, state.police.pastInspections * 2);

  if (!state.permits.businessLicense) risk += 18;
  const unpermittedYoung = state.employees.filter(
    (e) => e.age >= 18 && e.age <= 20 && !e.hasWorkPermit,
  ).length;
  risk += unpermittedYoung * 15;

  return Math.max(5, Math.min(98, Math.round(risk)));
}

export function resolvePoliceInspection(state: GameState): GameState {
  const violations: string[] = [];
  let fine = 0;
  let repDelta = 15;

  if (!state.permits.businessLicense) {
    violations.push('City Council İşletme Ruhsatı eksik (+$650 ceza)');
    fine += 650;
    repDelta -= 35;
  }

  const unpermitted = state.employees.filter(
    (e) => e.age >= 18 && e.age <= 20 && !e.hasWorkPermit,
  );
  if (unpermitted.length > 0) {
    const perEmpFine = 450 * unpermitted.length;
    violations.push(
      `18–20 yaş arası ${unpermitted.length} çalışan için Belediye Çalışma İzni eksik (+$${perEmpFine} ceza)`,
    );
    fine += perEmpFine;
    repDelta -= 25 * unpermitted.length;
  }

  const hasVipRooms = state.rooms.some((r) => r.isVip && r.unlocked);
  if (hasVipRooms && !state.permits.vipPermit) {
    violations.push('VIP Hizmet Ruhsatı eksik (+$500 ceza)');
    fine += 500;
    repDelta -= 20;
  }

  const passed = violations.length === 0;
  let next: GameState = {
    ...state,
    police: {
      ...state.police,
      active: true,
      pastInspections: state.police.pastInspections + 1,
      suspiciousIncidents: Math.max(0, state.police.suspiciousIncidents - 2),
      temporaryClosureHours: passed ? 0 : violations.length >= 2 ? 4 : 0,
      lastOutcome: {
        passed,
        fine,
        reputationDelta: passed ? 18 : repDelta,
        violations,
        summary: passed
          ? 'Denetim başarıyla geçildi! Tüm yaş doğrulamaları (21+ / Belediye İzinli 18-20) ve ruhsatlar eksiksiz.'
          : `${violations.length} ihlal tespit edildi. Ceza kesildi ve itibar kaybı yaşandı.`,
      },
    },
  };

  if (fine > 0) {
    next = addLedgerEntry(next, 'Polis Denetimi İdari Cezası', -fine, 'fine');
  }
  next = applyReputationDelta(next, passed ? 18 : repDelta);
  next.lastNotification = passed
    ? 'Polis denetimi temiz geçti (+18 İtibar).'
    : `Polis denetiminde ${violations.length} ihlal! -$${fine} ceza.`;

  return next;
}

export function startGangAttack(state: GameState, gangIndex?: number): GameState {
  if (state.gangAttack.active || state.bossFight.active) return state;

  const poolIdx =
    typeof gangIndex === 'number'
      ? Math.max(0, Math.min(GANG_POOL.length - 1, gangIndex))
      : Math.min(GANG_POOL.length - 1, Math.floor((state.clubLevel - 1) * 0.8 + Math.random() * 1.4));
  const gang: GangInfo = GANG_POOL[poolIdx];

  // Employees try to reach Safe Room up to SafeRoom capacity
  const totalEmps = state.employees.length;
  const sheltered = Math.min(totalEmps, state.safeRoom.capacity);
  const exposed = Math.max(0, totalEmps - sheltered);

  const employees = state.employees.map((e, idx) =>
    idx < sheltered
      ? { ...e, state: 'in_saferoom' as const, assignedRoomId: null }
      : { ...e, state: 'waiting' as const, assignedRoomId: null },
  );

  // Free occupied rooms during panic
  const rooms = state.rooms.map((r) => ({
    ...r,
    occupiedByEmployeeId: null,
    occupiedByCustomerName: null,
    sessionProgress: 0,
  }));

  const attackState: GangAttackState = {
    active: true,
    gang,
    enemiesRemaining: gang.memberCount,
    enemiesTotal: gang.memberCount,
    timeRemaining: 35,
    clubDoorIntegrity: 75 + state.safeRoom.doorArmorLevel * 5,
    employeesSheltered: sheltered,
    employeesExposed: exposed,
    playerHitsDealt: 0,
  };

  return {
    ...state,
    employees,
    rooms,
    activeCustomersCount: 0,
    gangAttack: attackState,
    lastNotification: `TEHLİKE: ${gang.name} (${gang.memberCount} üye) Number One Club mekana saldırıyor! Çalışanlar güvenli sığınağa çekildi (${sheltered}/${totalEmps}).`,
  };
}

export function resolveGangAttackVictoryOrLoss(
  state: GameState,
  playerWon: boolean,
): GameState {
  const gang = state.gangAttack.gang;
  const securityRating = calculateClubSecurityRating(
    state.guards,
    state.securityTraining,
    state.expansions.securityRoomLevel,
  );
  const gangPower = gang ? gang.power : 50;

  let next = state;
  const employees = next.employees.map((e) => ({
    ...e,
    state: e.cooldownRemaining > 0 ? ('resting' as const) : ('dancing' as const),
  }));

  if (playerWon || securityRating >= gangPower * 0.9) {
    const reward = 450 + (gang ? gang.power * 6 : 200);
    next = addLedgerEntry(next, `${gang?.name ?? 'Çete'} Saldırısı Püskürtüldü`, reward, 'service');
    next = applyReputationDelta(next, 25);
    next = {
      ...next,
      employees,
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
      lastNotification: `${gang?.name ?? 'Çete'} püskürtüldü! +$${reward} ve +25 İtibar kazanıldı.`,
    };
  } else {
    const exposedPenalty = next.gangAttack.employeesExposed * 220;
    const loss = Math.min(Math.max(300, Math.round(next.money * 0.15) + exposedPenalty), 2200);
    next = addLedgerEntry(next, `${gang?.name ?? 'Çete'} Saldırısı Hasarı`, -loss, 'fine');
    next = applyReputationDelta(next, -25);
    next = {
      ...next,
      employees,
      police: {
        ...next.police,
        suspiciousIncidents: next.police.suspiciousIncidents + 1,
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
      lastNotification: `Çete saldırısı kulübe zarar verdi (-$${loss}). Koruma ekibini ve Güvenli Sığınağı güçlendir!`,
    };
  }
  return next;
}

export function startAbrahamBossFight(state: GameState): GameState {
  if (state.bossFight.active) return state;

  const boss: BossFightState = {
    active: true,
    defeated: false,
    bossName: 'Abraham Sweetvoice',
    bossHp: 600,
    bossMaxHp: 600,
    phase: 1,
    minionsRemaining: 2,
    telegraphTimer: 0,
    telegraphType: 'none',
    playerHp: state.playerMaxHp,
    playerMaxHp: state.playerMaxHp,
    dodgeCooldown: 0,
    attackCooldown: 0,
    bossPosX: 32,
    bossPosZ: -20,
  };

  return {
    ...state,
    employees: state.employees.map((e) => ({ ...e, state: 'in_saferoom' as const })),
    activeCustomersCount: 0,
    bossFight: boss,
    lastNotification:
      'BOSS FIGHT: Güçlü çete lideri Abraham Sweetvoice kulüp önünde! [F] ile saldır, [Space] ile kaçın!',
  };
}

export function applyPlayerAttackToBoss(
  state: GameState,
  baseDamage = 45,
): { next: GameState; hitMinion: boolean; hitBoss: boolean; bossDefeatedNow: boolean } {
  const bf = state.bossFight;
  if (!bf.active || bf.attackCooldown > 0) {
    return { next: state, hitMinion: false, hitBoss: false, bossDefeatedNow: false };
  }

  // Guards also contribute passive support damage
  const guardBonus = Math.min(30, state.guards.length * 6);
  const totalDmg = baseDamage + guardBonus;

  if (bf.minionsRemaining > 0) {
    const rem = bf.minionsRemaining - 1;
    return {
      hitMinion: true,
      hitBoss: false,
      bossDefeatedNow: false,
      next: {
        ...state,
        bossFight: {
          ...bf,
          minionsRemaining: rem,
          attackCooldown: 0.4,
        },
        lastNotification:
          rem > 0
            ? `Abraham'ın koruması indirildi! Kalan yardımcı: ${rem}`
            : 'Yardımcı çete üyeleri temizlendi! Şimdi doğrudan Abraham Sweetvoice’a saldır!',
      },
    };
  }

  const nextHp = Math.max(0, bf.bossHp - totalDmg);
  let nextPhase: 1 | 2 | 3 = bf.phase;
  let nextMinions = bf.minionsRemaining;
  if (nextHp <= 400 && bf.phase === 1) {
    nextPhase = 2;
    nextMinions = 2;
  } else if (nextHp <= 200 && bf.phase === 2) {
    nextPhase = 3;
    nextMinions = 3;
  }

  if (nextHp <= 0) {
    let won = addLedgerEntry(state, 'Abraham Sweetvoice Boss Zaferi Ödülü', 5000, 'boss');
    won = applyReputationDelta(won, 220);
    won = {
      ...won,
      victoryAchieved: true,
      employees: won.employees.map((e) => ({
        ...e,
        state: e.cooldownRemaining > 0 ? ('resting' as const) : ('dancing' as const),
      })),
      bossFight: {
        ...bf,
        active: false,
        defeated: true,
        bossHp: 0,
      },
      lastNotification:
        'ZAFER! Abraham Sweetvoice yenildi! +$5.000 ödül, +220 İtibar ve özel geliştirmeler açıldı!',
    };
    return { next: won, hitMinion: false, hitBoss: true, bossDefeatedNow: true };
  }

  return {
    hitMinion: false,
    hitBoss: true,
    bossDefeatedNow: false,
    next: {
      ...state,
      bossFight: {
        ...bf,
        bossHp: nextHp,
        phase: nextPhase,
        minionsRemaining: nextMinions,
        attackCooldown: 0.45,
      },
    },
  };
}
