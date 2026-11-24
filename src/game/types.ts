/**
 * Core Domain Types for Number One Club (Modular Architecture)
 * Mirrors UE5 modular component contracts: Player, NPC, Recruitable, Employee,
 * Customer, SecurityGuard, GangMember, GangBoss, Economy, ClubManager, Events, SaveGame.
 */

export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type BuildingCategory =
  | 'club'
  | 'market'
  | 'council'
  | 'police'
  | 'restaurant'
  | 'cafe'
  | 'lingerie'
  | 'mall'
  | 'park'
  | 'lake'
  | 'empty'
  | 'service'
  | 'studio'
  | 'cinema'
  | 'church'
  | 'news'
  | 'gym'
  | 'hospital'
  | 'graveyard'
  | 'residence'
  | 'playground';

export interface BuildingCell {
  id: string;
  row: number; // 0..4
  col: number; // 0..4
  name: string;
  subtitle?: string;
  category: BuildingCategory;
  enterable: boolean;
  accentColor: string;
  buildingHeight: number;
  description: string;
}

/** Four required employee talent stats (1..100) */
export interface EmployeeSkills {
  bilocan: number;
  yuzGelimi: number;
  arkaSokak: number;
  elIsi: number;
}

export type SkillKey = keyof EmployeeSkills;

export type EmployeeActivityState =
  | 'dancing'
  | 'waiting'
  | 'in_room'
  | 'resting'
  | 'in_saferoom';

export interface AppearanceTraits {
  hairColor: string;
  hairStyle: 'long' | 'bob' | 'ponytail' | 'bun' | 'wavy';
  skinTone: string;
  baseColor: string;
  heightScale: number;
}

export interface RecruitCandidate {
  id: string;
  firstName: string;
  nickname: string;
  fullDisplayName: string; // e.g. "Nilay (Yalayut Nilay)"
  age: number; // 18..35
  experienceLevel: number; // 1..5
  skills: EmployeeSkills;
  baseCustomerRevenue: number; // $ per customer
  expectedCommissionPct: number; // e.g. 55..75
  personality: 'ambitious' | 'pragmatic' | 'loyal' | 'luxury';
  appearance: AppearanceTraits;
  worldX: number;
  worldZ: number;
  rejectedCooldownDays: number;
}

export interface Employee {
  id: string;
  firstName: string;
  nickname: string;
  fullDisplayName: string;
  age: number; // 18..35
  hasWorkPermit: boolean; // Required by Police if age 18..20
  level: number;
  xp: number;
  xpToNext: number;
  skillPoints: number;
  skills: EmployeeSkills;
  commissionPct: number; // Agreed share %
  baseCustomerRevenue: number;
  restLevel: number; // 0..100
  cooldownRemaining: number; // seconds left in rest
  cooldownTotal: number;
  activeBuffType: string | null;
  activeBuffReduction: number; // 0..0.6
  energyDrinkUsesToday: number;
  equippedOutfitId: string;
  state: EmployeeActivityState;
  assignedRoomId: string | null;
  appearance: AppearanceTraits;
  totalServed: number;
  totalEarnedForClub: number;
}

export type RoomTier = 'standard' | 'large' | 'vip' | 'luxury_vip';

export interface ClubRoom {
  id: string;
  name: string;
  tier: RoomTier;
  isVip: boolean;
  unlocked: boolean;
  unlockCost: number;
  requiredClubLevel: number;
  priceMultiplier: number;
  upkeepCost: number;
  reputationBonus: number;
  occupiedByEmployeeId: string | null;
  occupiedByCustomerName: string | null;
  sessionProgress: number; // 0..1
  sessionDuration: number; // seconds
  expectedPayout: number;
}

export interface ConsumableItem {
  id: string;
  name: string;
  source: 'Groove Super Market' | 'Restoran & Kafe';
  category: 'coffee' | 'energy_drink' | 'sandwich' | 'special_meal';
  cost: number;
  cooldownReductionSec: number;
  restRestore: number;
  buffLabel: string;
  dailyLimitPerEmployee?: number;
  description: string;
}

export interface OutfitItem {
  id: string;
  name: string;
  store: "Alina's Lingerie" | "Cock's and Pussy's Mall" | 'Başlangıç';
  tier: 'standard' | 'special' | 'vip' | 'dance' | 'luxury';
  cost: number;
  primaryColor: string;
  accentColor: string;
  satisfactionBonus: number; // e.g. +0.15
  reputationBonus: number;
  requiredClubLevel: number;
}

export interface SecurityGuard {
  id: string;
  name: string;
  strength: number; // 1..100
  endurance: number; // 1..100
  attack: number; // 1..100
  defense: number; // 1..100
  experience: number; // 1..10
  dailySalary: number;
  loyalty: number; // 0..100
  equipmentLevel: number; // 1..5
}

export interface SecurityApplicant {
  id: string;
  name: string;
  strength: number;
  endurance: number;
  attack: number;
  defense: number;
  experience: number;
  dailySalary: number;
  signingFee: number;
  loyalty: number;
}

export interface SecurityTrainingState {
  physical: number; // 0..5
  defense: number; // 0..5
  equipment: number; // 0..5
  coordination: number; // 0..5
  leadership: number; // 0..5
}

export interface SafeRoomState {
  capacity: number; // Starts at 3
  doorArmorLevel: number; // 1..5
  entrySpeedLevel: number; // 1..5
  emergencySystemUnlocked: boolean;
}

export interface GangInfo {
  id: string;
  name: string;
  leader: string;
  power: number;
  memberCount: number;
  attackFrequency: number;
  territory: string;
  attackStyle: string;
}

export interface GangAttackState {
  active: boolean;
  gang: GangInfo | null;
  enemiesRemaining: number;
  enemiesTotal: number;
  timeRemaining: number;
  clubDoorIntegrity: number; // 0..100
  employeesSheltered: number;
  employeesExposed: number;
  playerHitsDealt: number;
}

export interface BossFightState {
  active: boolean;
  defeated: boolean;
  bossName: string; // "Abraham Sweetvoice"
  bossHp: number;
  bossMaxHp: number;
  phase: 1 | 2 | 3;
  minionsRemaining: number;
  telegraphTimer: number; // > 0 means incoming slam
  telegraphType: 'shockwave' | 'rush' | 'none';
  playerHp: number;
  playerMaxHp: number;
  dodgeCooldown: number;
  attackCooldown: number;
  bossPosX: number;
  bossPosZ: number;
}

export interface PoliceInspectionState {
  active: boolean;
  riskScore: number; // 0..100
  suspiciousIncidents: number;
  cityPoliceDensity: number; // 0.5..1.5
  pastInspections: number;
  temporaryClosureHours: number;
  lastOutcome: {
    passed: boolean;
    fine: number;
    reputationDelta: number;
    violations: string[];
    summary: string;
  } | null;
}

export interface CityPermits {
  businessLicense: boolean;
  vipPermit: boolean;
  extendedHoursLicense: boolean;
}

export interface LedgerEntry {
  id: string;
  day: number;
  hour: number;
  label: string;
  amount: number; // positive = income, negative = expense
  category: 'service' | 'vip' | 'payroll' | 'shop' | 'upgrade' | 'fine' | 'boss';
}

export interface ClubExpansions {
  extraDanceFloor: boolean;
  loungeAreaLevel: number; // 1..3
  securityRoomLevel: number; // 1..3
  emptyLotBuilt: boolean;
}

export interface GameState {
  money: number;
  clubLevel: number; // 1..5
  reputation: number; // 0..1000
  day: number;
  minuteOfDay: number; // 0..1439 (starts evening 20:00 = 1200)
  playerHp: number;
  playerMaxHp: number;
  employees: Employee[];
  recruitPool: RecruitCandidate[];
  rooms: ClubRoom[];
  expansions: ClubExpansions;
  inventoryConsumables: Record<string, number>;
  ownedOutfits: string[];
  guards: SecurityGuard[];
  guardApplicants: SecurityApplicant[];
  securityTraining: SecurityTrainingState;
  safeRoom: SafeRoomState;
  permits: CityPermits;
  police: PoliceInspectionState;
  gangAttack: GangAttackState;
  bossFight: BossFightState;
  activeCustomersCount: number;
  totalCustomersServed: number;
  ledger: LedgerEntry[];
  lastNotification: string | null;
  gameOverReason: string | null;
  victoryAchieved: boolean;
}
