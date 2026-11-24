import {
  AppearanceTraits,
  ClubRoom,
  ConsumableItem,
  Employee,
  EmployeeSkills,
  RecruitCandidate,
  SkillKey,
} from './types';
import {
  CITY_GRID,
  CONSUMABLE_CATALOG,
  RECRUIT_NAME_POOL,
  gridToWorld,
} from './worldData';
import {
  buildStaticCityBuildingBoxes,
  findClearStreetSpawn,
} from './npcNavigation';

const HAIR_COLORS = ['#1e1b18', '#eab308', '#991b1b', '#7c2d12', '#f472b6', '#4c1d95'];
const SKIN_TONES = ['#f5d0b5', '#e8b998', '#d49a76', '#f9dcc8'];
const BASE_COLORS = ['#ec4899', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#10b981'];
const HAIR_STYLES: AppearanceTraits['hairStyle'][] = ['long', 'bob', 'ponytail', 'bun', 'wavy'];

export const SKILL_LABELS: Record<SkillKey, string> = {
  bilocan: 'Bilocan',
  yuzGelimi: 'Yüz Gelimi',
  arkaSokak: 'Arka Sokak',
  elIsi: 'El İşi',
};

function randomRange(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min);
}

/**
 * Generates diverse adult recruitable candidates (18-35) around city streets,
 * ensuring nicknames do not endlessly repeat across active employees and pool.
 */
export function generateRecruitPool(
  count: number,
  existingNames: Set<string>,
  rng: () => number = Math.random,
): RecruitCandidate[] {
  const availableSeeds = RECRUIT_NAME_POOL.filter(
    (s) => !existingNames.has(`${s.firstName} (${s.nickname})`),
  );
  const sourcePool = availableSeeds.length >= count ? availableSeeds : RECRUIT_NAME_POOL;

  // Shuffle copy
  const shuffled = [...sourcePool].sort(() => rng() - 0.5);
  const result: RecruitCandidate[] = [];

  // Spawn around sidewalks near city blocks (excluding graveyard/empty)
  const buildingBoxes = buildStaticCityBuildingBoxes();
  const spawnBlocks = CITY_GRID.filter(
    (b) => b.category !== 'graveyard' && b.category !== 'empty' && b.category !== 'lake',
  );

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const seed = shuffled[i];
    const age = Math.floor(randomRange(18, 36, rng)); // 18..35 inclusive
    const experienceLevel = Math.min(5, Math.max(1, Math.floor(1 + rng() * 4)));
    const baseSkill = 22 + experienceLevel * 8;

    const skills: EmployeeSkills = {
      bilocan: Math.min(95, Math.round(baseSkill + (seed.specialty === 'bilocan' ? 24 : rng() * 22))),
      yuzGelimi: Math.min(95, Math.round(baseSkill + (seed.specialty === 'yuzGelimi' ? 24 : rng() * 22))),
      arkaSokak: Math.min(95, Math.round(baseSkill + (seed.specialty === 'arkaSokak' ? 24 : rng() * 22))),
      elIsi: Math.min(95, Math.round(baseSkill + (seed.specialty === 'elIsi' ? 24 : rng() * 22))),
    };

    const baseCustomerRevenue = Math.round(
      480 + experienceLevel * 140 + (skills[seed.specialty] - 40) * 6,
    );
    const expectedCommissionPct = Math.min(
      78,
      Math.max(45, Math.round(52 + experienceLevel * 4 + rng() * 10)),
    );

    const block = spawnBlocks[Math.floor(rng() * spawnBlocks.length)];
    const center = gridToWorld(block.row, block.col);
    // Offset onto sidewalk perimeter (14.5m from block center) and guarantee clear street spawn
    const sideAngle = Math.floor(rng() * 4) * (Math.PI / 2);
    const rawX = center.x + Math.cos(sideAngle) * 14.5 + (rng() - 0.5) * 4;
    const rawZ = center.z + Math.sin(sideAngle) * 14.5 + (rng() - 0.5) * 4;
    const clearPos = findClearStreetSpawn(rawX, rawZ, 0.7, buildingBoxes);

    result.push({
      id: `rec_${Date.now().toString(36)}_${i}_${Math.floor(rng() * 9999)}`,
      firstName: seed.firstName,
      nickname: seed.nickname,
      fullDisplayName: `${seed.firstName} (${seed.nickname})`,
      age,
      experienceLevel,
      skills,
      baseCustomerRevenue,
      expectedCommissionPct,
      personality: seed.personality,
      appearance: {
        hairColor: HAIR_COLORS[Math.floor(rng() * HAIR_COLORS.length)],
        hairStyle: HAIR_STYLES[Math.floor(rng() * HAIR_STYLES.length)],
        skinTone: SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)],
        baseColor: BASE_COLORS[Math.floor(rng() * BASE_COLORS.length)],
        heightScale: 0.94 + rng() * 0.1,
      },
      worldX: clearPos.x,
      worldZ: clearPos.z,
      rejectedCooldownDays: 0,
    });
  }

  return result;
}

/**
 * Calculates acceptance probability (0..100%) for a commission negotiation offer.
 */
export function calculateNegotiationChance(
  candidate: RecruitCandidate,
  offeredCommissionPct: number,
  clubReputation: number,
): number {
  const diff = offeredCommissionPct - candidate.expectedCommissionPct;
  // Base 62% if offered == expected
  let chance = 62 + diff * 2.6;

  // Reputation bonus: up to +22%
  chance += Math.min(22, (clubReputation / 1000) * 24);

  // Personality modifier
  if (candidate.personality === 'loyal') chance += 8;
  if (candidate.personality === 'luxury' && clubReputation < 200) chance -= 10;
  if (candidate.personality === 'ambitious' && diff < -10) chance -= 12;

  // Experienced candidates are pickier on lowball offers
  if (diff < -15) {
    chance -= candidate.experienceLevel * 5;
  }

  return Math.max(5, Math.min(98, Math.round(chance)));
}

export function convertCandidateToEmployee(
  candidate: RecruitCandidate,
  agreedCommissionPct: number,
): Employee {
  return {
    id: `emp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    firstName: candidate.firstName,
    nickname: candidate.nickname,
    fullDisplayName: candidate.fullDisplayName,
    age: candidate.age,
    hasWorkPermit: candidate.age >= 21, // 21+ is auto-valid; 18-20 requires City Council permit
    level: candidate.experienceLevel,
    xp: 0,
    xpToNext: 100 * candidate.experienceLevel,
    skillPoints: 1,
    skills: { ...candidate.skills },
    commissionPct: agreedCommissionPct,
    baseCustomerRevenue: candidate.baseCustomerRevenue,
    restLevel: 100,
    cooldownRemaining: 0,
    cooldownTotal: 0,
    activeBuffType: null,
    activeBuffReduction: 0,
    energyDrinkUsesToday: 0,
    equippedOutfitId: 'outfit_default',
    state: 'dancing',
    assignedRoomId: null,
    appearance: { ...candidate.appearance },
    totalServed: 0,
    totalEarnedForClub: 0,
  };
}

/**
 * Computes post-session rest cooldown in seconds based on age, level, skills,
 * session duration, room tier, current rest level, and active consumable buff.
 */
export function calculateCooldownSeconds(
  employee: Employee,
  room: ClubRoom,
): number {
  const avgSkill =
    (employee.skills.bilocan +
      employee.skills.yuzGelimi +
      employee.skills.arkaSokak +
      employee.skills.elIsi) /
    4;
  const ageFactor = 0.85 + Math.max(0, employee.age - 18) * 0.015;
  const skillDiscount = Math.max(0.55, 1 - avgSkill / 220);
  const levelDiscount = Math.max(0.65, 1 - (employee.level - 1) * 0.06);
  const roomFactor = room.isVip ? 1.25 : 1.0;
  const fatigueFactor = 1 + (100 - employee.restLevel) / 160;
  const buffMultiplier = 1 - Math.min(0.6, employee.activeBuffReduction);

  const raw =
    (room.sessionDuration * 1.45) *
    ageFactor *
    skillDiscount *
    levelDiscount *
    roomFactor *
    fatigueFactor *
    buffMultiplier;

  return Math.max(4, Math.round(raw));
}

export function applyConsumableToEmployee(
  employee: Employee,
  itemId: string,
): { updated: Employee; error?: string; item?: ConsumableItem } {
  const item = CONSUMABLE_CATALOG.find((c) => c.id === itemId);
  if (!item) {
    return { updated: employee, error: 'Ürün bulunamadı.' };
  }

  if (
    item.dailyLimitPerEmployee &&
    employee.energyDrinkUsesToday >= item.dailyLimitPerEmployee
  ) {
    return {
      updated: employee,
      error: `${employee.firstName} bugün maksimum ${item.dailyLimitPerEmployee} adet ${item.name} tüketti.`,
    };
  }

  const nextCooldown = Math.max(0, employee.cooldownRemaining - item.cooldownReductionSec);
  const nextRest = Math.min(100, employee.restLevel + item.restRestore);
  const nextBuffReduction =
    item.category === 'energy_drink'
      ? 0.4
      : item.category === 'special_meal'
      ? 0.3
      : item.category === 'coffee'
      ? 0.2
      : employee.activeBuffReduction;

  const nextState =
    employee.state === 'resting' && nextCooldown <= 0 ? 'waiting' : employee.state;

  return {
    item,
    updated: {
      ...employee,
      cooldownRemaining: nextCooldown,
      restLevel: nextRest,
      activeBuffType: item.buffLabel,
      activeBuffReduction: nextBuffReduction,
      energyDrinkUsesToday:
        item.category === 'energy_drink'
          ? employee.energyDrinkUsesToday + 1
          : employee.energyDrinkUsesToday,
      state: nextState,
    },
  };
}

export function grantEmployeeXp(employee: Employee, xpGain: number): Employee {
  let xp = employee.xp + xpGain;
  let level = employee.level;
  let xpToNext = employee.xpToNext;
  let skillPoints = employee.skillPoints;
  let baseRev = employee.baseCustomerRevenue;

  while (xp >= xpToNext && level < 10) {
    xp -= xpToNext;
    level += 1;
    xpToNext = Math.round(xpToNext * 1.35);
    skillPoints += 2;
    baseRev = Math.round(baseRev * 1.08);
  }

  return {
    ...employee,
    xp,
    level,
    xpToNext,
    skillPoints,
    baseCustomerRevenue: baseRev,
  };
}

export function upgradeEmployeeSkill(
  employee: Employee,
  skill: SkillKey,
  amount = 5,
): Employee {
  if (employee.skillPoints <= 0 || employee.skills[skill] >= 100) {
    return employee;
  }
  return {
    ...employee,
    skillPoints: employee.skillPoints - 1,
    skills: {
      ...employee.skills,
      [skill]: Math.min(100, employee.skills[skill] + amount),
    },
  };
}
