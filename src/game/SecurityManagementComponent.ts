import {
  SafeRoomState,
  SecurityApplicant,
  SecurityGuard,
  SecurityTrainingState,
} from './types';
import { GUARD_NAMES } from './worldData';

export interface GuardTrainingOption {
  key: keyof SecurityTrainingState;
  label: string;
  description: string;
  baseCost: number;
}

export const GUARD_TRAINING_OPTIONS: GuardTrainingOption[] = [
  {
    key: 'physical',
    label: 'Fiziksel Eğitim',
    description: 'Tüm korumaların Güç ve Dayanıklılık puanlarını +8 artırır.',
    baseCost: 600,
  },
  {
    key: 'defense',
    label: 'Savunma Eğitimi',
    description: 'Saldırılarda kapı bütünlüğünü ve koruma savunmasını +10 güçlendirir.',
    baseCost: 650,
  },
  {
    key: 'equipment',
    label: 'Ekipman Geliştirme',
    description: 'Koruma ekipman seviyesini artırarak saldırı gücünü yükseltir.',
    baseCost: 850,
  },
  {
    key: 'coordination',
    label: 'Takım Koordinasyonu',
    description: 'Ekip sinerjisiyle toplam kulüp güvenlik derecesine +%15 bonus ekler.',
    baseCost: 750,
  },
  {
    key: 'leadership',
    label: 'Liderlik Eğitimi',
    description: 'Korumaların sadakatini yükseltir ve kriz anında kayıp riskini azaltır.',
    baseCost: 900,
  },
];

export function generateSecurityApplicant(rng: () => number = Math.random): SecurityApplicant {
  const name = GUARD_NAMES[Math.floor(rng() * GUARD_NAMES.length)];
  const exp = 1 + Math.floor(rng() * 5);
  const strength = Math.min(95, Math.round(40 + exp * 7 + rng() * 18));
  const endurance = Math.min(95, Math.round(42 + exp * 7 + rng() * 18));
  const attack = Math.min(95, Math.round(38 + exp * 8 + rng() * 18));
  const defense = Math.min(95, Math.round(40 + exp * 7 + rng() * 18));
  const dailySalary = Math.round(140 + exp * 35 + (strength + defense) * 0.6);
  const signingFee = Math.round(dailySalary * 2.2);

  return {
    id: `gapp_${Date.now().toString(36)}_${Math.floor(rng() * 9999)}`,
    name,
    strength,
    endurance,
    attack,
    defense,
    experience: exp,
    dailySalary,
    signingFee,
    loyalty: 75 + Math.floor(rng() * 20),
  };
}

export function hireSecurityApplicant(applicant: SecurityApplicant): SecurityGuard {
  return {
    id: `grd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: applicant.name,
    strength: applicant.strength,
    endurance: applicant.endurance,
    attack: applicant.attack,
    defense: applicant.defense,
    experience: applicant.experience,
    dailySalary: applicant.dailySalary,
    loyalty: applicant.loyalty,
    equipmentLevel: 1,
  };
}

export function calculateClubSecurityRating(
  guards: SecurityGuard[],
  training: SecurityTrainingState,
  securityRoomLevel: number,
): number {
  if (guards.length === 0) {
    return Math.min(20, securityRoomLevel * 5);
  }
  const guardSum = guards.reduce((sum, g) => {
    const base = (g.strength + g.endurance + g.attack + g.defense) / 4;
    const equipMult = 1 + (g.equipmentLevel - 1) * 0.12 + training.equipment * 0.08;
    return sum + base * equipMult;
  }, 0);

  const coordMult = 1 + training.coordination * 0.12;
  const roomBonus = (securityRoomLevel - 1) * 18;
  return Math.round(guardSum * 0.45 * coordMult + roomBonus);
}

export function upgradeSafeRoom(
  safeRoom: SafeRoomState,
  upgradeType: 'capacity' | 'armor' | 'speed' | 'emergency',
): { next: SafeRoomState; cost: number; label: string } | null {
  if (upgradeType === 'capacity') {
    if (safeRoom.capacity >= 12) return null;
    const cost = 700 + (safeRoom.capacity - 3) * 350;
    return {
      cost,
      label: 'Güvenli Sığınak Kapasite Artışı',
      next: { ...safeRoom, capacity: safeRoom.capacity + 2 },
    };
  }
  if (upgradeType === 'armor') {
    if (safeRoom.doorArmorLevel >= 5) return null;
    const cost = 600 * safeRoom.doorArmorLevel;
    return {
      cost,
      label: 'Sığınak Çelik Kapı Güçlendirme',
      next: { ...safeRoom, doorArmorLevel: safeRoom.doorArmorLevel + 1 },
    };
  }
  if (upgradeType === 'speed') {
    if (safeRoom.entrySpeedLevel >= 5) return null;
    const cost = 500 * safeRoom.entrySpeedLevel;
    return {
      cost,
      label: 'Acil Sığınak Geçiş Hızı',
      next: { ...safeRoom, entrySpeedLevel: safeRoom.entrySpeedLevel + 1 },
    };
  }
  if (upgradeType === 'emergency') {
    if (safeRoom.emergencySystemUnlocked) return null;
    return {
      cost: 1800,
      label: 'Acil Durum Kilit & Siren Sistemi',
      next: { ...safeRoom, emergencySystemUnlocked: true },
    };
  }
  return null;
}
