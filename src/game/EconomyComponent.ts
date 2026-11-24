import {
  ClubRoom,
  Employee,
  GameState,
  LedgerEntry,
  OutfitItem,
} from './types';
import { OUTFIT_CATALOG, REPUTATION_LEVEL_THRESHOLDS } from './worldData';

/**
 * EconomyComponent
 * Centralized income/expense ledger, club level calculation, service revenue math,
 * and daily maintenance & guard payroll settlement.
 */

export function computeClubLevel(reputation: number): number {
  let lvl = 1;
  for (let i = 0; i < REPUTATION_LEVEL_THRESHOLDS.length; i++) {
    if (reputation >= REPUTATION_LEVEL_THRESHOLDS[i]) {
      lvl = i + 1;
    }
  }
  return Math.min(5, Math.max(1, lvl));
}

export function addLedgerEntry(
  state: GameState,
  label: string,
  amount: number,
  category: LedgerEntry['category'],
): GameState {
  const hour = Math.floor(state.minuteOfDay / 60);
  const entry: LedgerEntry = {
    id: `led_${state.day}_${state.minuteOfDay}_${Math.random().toString(36).slice(2, 7)}`,
    day: state.day,
    hour,
    label,
    amount: Math.round(amount),
    category,
  };
  const nextMoney = Math.round(state.money + amount);
  return {
    ...state,
    money: nextMoney,
    ledger: [entry, ...state.ledger].slice(0, 40),
  };
}

export function applyReputationDelta(state: GameState, delta: number): GameState {
  const nextRep = Math.max(0, Math.min(1000, Math.round(state.reputation + delta)));
  const nextLevel = computeClubLevel(nextRep);
  return {
    ...state,
    reputation: nextRep,
    clubLevel: nextLevel,
  };
}

export function getOutfitById(id: string): OutfitItem {
  return OUTFIT_CATALOG.find((o) => o.id === id) ?? OUTFIT_CATALOG[0];
}

export function calculateSessionPayout(
  employee: Employee,
  room: ClubRoom,
  clubLevel: number,
): {
  gross: number;
  employeeShare: number;
  clubNet: number;
  reputationGain: number;
} {
  const avgSkill =
    (employee.skills.bilocan +
      employee.skills.yuzGelimi +
      employee.skills.arkaSokak +
      employee.skills.elIsi) /
    4;
  const skillFactor = 0.75 + (avgSkill / 100) * 0.75; // 0.75x .. 1.5x
  const outfit = getOutfitById(employee.equippedOutfitId);
  const outfitMult = 1 + outfit.satisfactionBonus;
  const levelMult = 1 + (employee.level - 1) * 0.12 + (clubLevel - 1) * 0.08;

  const gross = Math.round(
    employee.baseCustomerRevenue * skillFactor * room.priceMultiplier * outfitMult * levelMult,
  );
  const employeeShare = Math.round((gross * employee.commissionPct) / 100);
  const clubNet = Math.max(0, gross - employeeShare);
  const reputationGain = Math.round(
    (room.isVip ? 8 : 4) + outfit.reputationBonus * 0.08 + (avgSkill > 70 ? 2 : 0),
  );

  return { gross, employeeShare, clubNet, reputationGain };
}

export function calculateDailyUpkeep(state: GameState): {
  roomUpkeep: number;
  guardSalaries: number;
  totalDailyCost: number;
} {
  const roomUpkeep = state.rooms
    .filter((r) => r.unlocked)
    .reduce((acc, r) => acc + r.upkeepCost, 0);
  const guardSalaries = state.guards.reduce((acc, g) => acc + g.dailySalary, 0);
  return {
    roomUpkeep,
    guardSalaries,
    totalDailyCost: roomUpkeep + guardSalaries,
  };
}

export function settleDailyExpenses(state: GameState): GameState {
  const { roomUpkeep, guardSalaries } = calculateDailyUpkeep(state);
  let next = state;

  if (roomUpkeep > 0) {
    next = addLedgerEntry(next, `Gün ${state.day} Oda & Kulüp Bakımı`, -roomUpkeep, 'upgrade');
  }

  if (guardSalaries > 0) {
    if (next.money >= guardSalaries) {
      next = addLedgerEntry(next, `Gün ${state.day} Koruma Maaşları`, -guardSalaries, 'payroll');
    } else {
      // Cannot pay guards: loyalty drops and lowest-loyalty guard leaves!
      const updatedGuards = next.guards
        .map((g) => ({ ...g, loyalty: g.loyalty - 35 }))
        .filter((g) => g.loyalty > 15);
      const departedCount = next.guards.length - updatedGuards.length;
      next = {
        ...next,
        guards: updatedGuards,
        lastNotification:
          departedCount > 0
            ? `Koruma maaşları ödenemedi! ${departedCount} koruma işten ayrıldı.`
            : 'Koruma maaşları ödenemedi! Korumaların sadakati düştü.',
      };
    }
  }

  // Bankruptcy check
  if (next.money <= -1500) {
    next = {
      ...next,
      gameOverReason:
        'Number One Club borç batağına saplandı ve işletme mali kriz nedeniyle kapandı.',
    };
  }

  return next;
}
