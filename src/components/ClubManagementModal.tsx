import React, { useState } from 'react';
import { Shield, Skull, X } from 'lucide-react';
import { calculateDailyUpkeep, getOutfitById } from '../game/EconomyComponent';
import { SKILL_LABELS } from '../game/EmployeeManagementComponent';
import { calculatePoliceRisk } from '../game/EventsManager';
import {
  GUARD_TRAINING_OPTIONS,
  calculateClubSecurityRating,
} from '../game/SecurityManagementComponent';
import { GameState, SkillKey } from '../game/types';
import { CONSUMABLE_CATALOG, OUTFIT_CATALOG } from '../game/worldData';

export type ManagementTab = 'rooms' | 'staff' | 'shop' | 'security' | 'permits';

interface ClubManagementModalProps {
  gameState: GameState;
  initialTab?: ManagementTab;
  onUnlockRoom: (roomId: string) => void;
  onExpandClub: (type: 'dance' | 'lounge' | 'security_room') => void;
  onUpgradeSkill: (empId: string, skill: SkillKey, useMoney: boolean) => void;
  onUseConsumable: (empId: string, itemId: string) => void;
  onEquipOutfit: (empId: string, outfitId: string) => void;
  onBuyConsumable: (itemId: string) => void;
  onBuyOutfit: (outfitId: string) => void;
  onHireGuard: (applicantId: string) => void;
  onTrainGuards: (key: keyof GameState['securityTraining']) => void;
  onUpgradeSafeRoom: (type: 'capacity' | 'armor' | 'speed' | 'emergency') => void;
  onBuyPermit: (permit: 'business' | 'vip' | 'extended' | 'emp_permits') => void;
  onTriggerPoliceInspection: () => void;
  onTriggerGangDrill: () => void;
  onStartBossFight: () => void;
  onSaveGame: () => void;
  onClose: () => void;
}

export const ClubManagementModal: React.FC<ClubManagementModalProps> = ({
  gameState,
  initialTab = 'rooms',
  onUnlockRoom,
  onExpandClub,
  onUpgradeSkill,
  onUseConsumable,
  onEquipOutfit,
  onBuyConsumable,
  onBuyOutfit,
  onHireGuard,
  onTrainGuards,
  onUpgradeSafeRoom,
  onBuyPermit,
  onTriggerPoliceInspection,
  onTriggerGangDrill,
  onStartBossFight,
  onSaveGame,
  onClose,
}) => {
  const [tab, setTab] = useState<ManagementTab>(initialTab);
  const upkeep = calculateDailyUpkeep(gameState);
  const securityRating = calculateClubSecurityRating(
    gameState.guards,
    gameState.securityTraining,
    gameState.expansions.securityRoomLevel,
  );
  const policeRisk = calculatePoliceRisk(gameState);
  const unpermittedYoungCount = gameState.employees.filter(
    (e) => e.age >= 18 && e.age <= 20 && !e.hasWorkPermit,
  ).length;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75">
      <div
        className="w-full max-w-6xl h-[88vh] border border-amber-500/40 rounded-lg flex flex-col text-slate-100 shadow-2xl overflow-hidden"
        style={{ backgroundColor: '#0c1021' }}
      >
        {/* Header & Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-2xl font-display font-bold text-white tracking-wide">
              Number One Club — İşletme Bilgisayarı
            </h2>
            <div className="text-xs text-slate-400 font-mono-num mt-0.5">
              Kasa: ${Math.round(gameState.money).toLocaleString('tr-TR')} · Seviye{' '}
              {gameState.clubLevel} ({gameState.reputation} İtibar) · Günlük Gider: $
              {upkeep.totalDailyCost}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSaveGame}
              className="px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-md cursor-pointer whitespace-nowrap shrink-0"
            >
              İlerlemeyi Kaydet
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Yönetim Panelini Kapat"
              className="p-2 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 px-6 py-2.5 border-b border-slate-800 bg-slate-950/60 overflow-x-auto">
          {(
            [
              ['rooms', 'Odalar & Mekan'],
              ['staff', 'Çalışanlar & Yetenekler'],
              ['shop', 'PC Sipariş & Mağaza'],
              ['security', 'Güvenlik & Sığınak'],
              ['permits', 'İzinler, Ekonomi & Boss'],
            ] as [ManagementTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                tab === id
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {tab === 'rooms' && (
            <>
              <div>
                <h3 className="text-lg font-display font-bold text-white mb-3">
                  Oda Durumları ve Kapalı Kapı Takibi
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {gameState.rooms.map((room) => {
                    const occupant = gameState.employees.find(
                      (e) => e.id === room.occupiedByEmployeeId,
                    );
                    return (
                      <div
                        key={room.id}
                        className={`p-4 rounded-md border ${
                          !room.unlocked
                            ? 'border-slate-800 bg-slate-950/60'
                            : occupant
                            ? 'border-rose-500/60 bg-slate-900'
                            : 'border-slate-700 bg-slate-900/90'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-bold text-white">{room.name}</div>
                            <div className="text-xs text-slate-400 font-mono-num">
                              {room.isVip ? 'VIP Oda' : 'Standart'} · Çarpan:{' '}
                              {room.priceMultiplier.toFixed(2)}x · Bakım: ${room.upkeepCost}/gün
                            </div>
                          </div>
                          <span
                            className={`text-xs font-semibold ${
                              !room.unlocked
                                ? 'text-slate-400'
                                : occupant
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {!room.unlocked ? 'Kilitli' : occupant ? 'Kapı Kapalı (Aktif)' : 'Müsait'}
                          </span>
                        </div>

                        {room.unlocked ? (
                          occupant ? (
                            <div className="mt-4 space-y-2">
                              <div className="text-xs text-slate-200">
                                <strong>{occupant.fullDisplayName}</strong> · Müşteri:{' '}
                                {room.occupiedByCustomerName}
                              </div>
                              <div className="w-full h-2 bg-slate-800 rounded-sm overflow-hidden">
                                <div
                                  className="h-full bg-amber-400 transition-all duration-150"
                                  style={{ width: `${Math.round(room.sessionProgress * 100)}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[11px] font-mono-num text-slate-400">
                                <span>İşlem: %{Math.round(room.sessionProgress * 100)}</span>
                                <span className="text-emerald-400">
                                  Tahmini Gelir: +${room.expectedPayout}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-4 text-xs text-slate-400">
                              Dans pistinden veya bekleme alanından uygun çalışan bekleniyor.
                            </div>
                          )
                        ) : (
                          <div className="mt-4 flex items-center justify-between gap-2">
                            <div className="text-xs text-slate-400 font-mono-num">
                              Gereken Seviye: {room.requiredClubLevel}
                            </div>
                            <button
                              type="button"
                              disabled={
                                gameState.money < room.unlockCost ||
                                gameState.clubLevel < room.requiredClubLevel
                              }
                              onClick={() => onUnlockRoom(room.id)}
                              className="px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer"
                            >
                              Aç (${room.unlockCost})
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-800 pt-5">
                <h3 className="text-lg font-display font-bold text-white mb-3">
                  Mekan & Tesis Genişletmeleri
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-md border border-slate-800 bg-slate-900/90 flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-sm text-white">Ek Dans Alanı</div>
                      <p className="text-xs text-slate-400 mt-1">
                        Daha fazla çalışanı aynı anda sahnede tutar ve +30 İtibar sağlar.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={gameState.expansions.extraDanceFloor || gameState.money < 1600}
                      onClick={() => onExpandClub('dance')}
                      className="mt-4 px-3 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer"
                    >
                      {gameState.expansions.extraDanceFloor ? 'Kuruldu' : 'Genişlet ($1.600)'}
                    </button>
                  </div>

                  <div className="p-4 rounded-md border border-slate-800 bg-slate-900/90 flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-sm text-white">
                        Dinlenme Alanı (Sv.{gameState.expansions.loungeAreaLevel}/3)
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Bekleyen çalışanların dinlenme hızını ve müşteri konforunu artırır.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={gameState.expansions.loungeAreaLevel >= 3 || gameState.money < 1100}
                      onClick={() => onExpandClub('lounge')}
                      className="mt-4 px-3 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer"
                    >
                      {gameState.expansions.loungeAreaLevel >= 3
                        ? 'Maksimum Seviye'
                        : 'Geliştir ($1.100)'}
                    </button>
                  </div>

                  <div className="p-4 rounded-md border border-slate-800 bg-slate-900/90 flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-sm text-white">
                        Güvenlik Odası (Sv.{gameState.expansions.securityRoomLevel}/3)
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Korumaların kamera ve koordinasyon desteğini artırır (+18 Güvenlik).
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={gameState.expansions.securityRoomLevel >= 3 || gameState.money < 1300}
                      onClick={() => onExpandClub('security_room')}
                      className="mt-4 px-3 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer"
                    >
                      {gameState.expansions.securityRoomLevel >= 3
                        ? 'Maksimum Seviye'
                        : 'Geliştir ($1.300)'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'staff' && (
            <div className="space-y-4">
              {gameState.employees.map((emp) => {
                const outfit = getOutfitById(emp.equippedOutfitId);
                return (
                  <div
                    key={emp.id}
                    className="p-4 rounded-md border border-slate-800 bg-slate-900/90 grid grid-cols-1 lg:grid-cols-3 gap-5"
                  >
                    {/* Left: Profile & State */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-base font-bold text-white">{emp.fullDisplayName}</h4>
                        <span className="text-xs font-mono-num text-amber-400">
                          Sv.{emp.level}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono-num">
                        Yaş: {emp.age} · Komisyon: %{emp.commissionPct} · Taban: $
                        {emp.baseCustomerRevenue}
                      </div>
                      <div className="text-xs">
                        Durum:{' '}
                        <strong className="text-amber-300">
                          {emp.state === 'dancing'
                            ? 'Dans Alanında'
                            : emp.state === 'waiting'
                            ? 'Bekleme Alanında'
                            : emp.state === 'in_room'
                            ? 'Odada (Hizmette)'
                            : emp.state === 'in_saferoom'
                            ? 'Güvenli Sığınakta'
                            : `Dinleniyor (${Math.ceil(emp.cooldownRemaining)}s)`}
                        </strong>
                      </div>
                      <div className="text-xs text-slate-300 font-mono-num">
                        Dinlenme Seviyesi: {Math.round(emp.restLevel)}/100 · Yasal İzin:{' '}
                        <span className={emp.hasWorkPermit ? 'text-emerald-400' : 'text-rose-400'}>
                          {emp.hasWorkPermit ? 'Onaylı' : 'Eksik (City Council)'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Kıyafet: <span className="text-slate-200">{outfit.name}</span>
                      </div>

                      <div className="pt-1">
                        <label className="text-[11px] text-slate-400 block mb-1">
                          Kıyafet Değiştir
                        </label>
                        <select
                          aria-label={`${emp.firstName} için kıyafet seç`}
                          value={emp.equippedOutfitId}
                          onChange={(e) => onEquipOutfit(emp.id, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100"
                        >
                          {gameState.ownedOutfits.map((oid) => {
                            const o = getOutfitById(oid);
                            return (
                              <option key={oid} value={oid}>
                                {o.name} (+%{Math.round(o.satisfactionBonus * 100)} Memnuniyet)
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    {/* Middle: 4 Skills Upgrade */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-semibold">Yetenek Geliştirme</span>
                        <span className="font-mono-num text-amber-400">
                          Puan: {emp.skillPoints} · Eğitim: $350
                        </span>
                      </div>
                      {(Object.keys(SKILL_LABELS) as SkillKey[]).map((key) => (
                        <div key={key} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-200 w-24">{SKILL_LABELS[key]}</span>
                          <div className="flex-1 h-2 bg-slate-800 rounded-sm overflow-hidden">
                            <div
                              className="h-full bg-amber-400"
                              style={{ width: `${emp.skills[key]}%` }}
                            />
                          </div>
                          <span className="font-mono-num w-7 text-right">{emp.skills[key]}</span>
                          <button
                            type="button"
                            disabled={
                              emp.skills[key] >= 100 ||
                              (emp.skillPoints <= 0 && gameState.money < 350)
                            }
                            onClick={() => onUpgradeSkill(emp.id, key, emp.skillPoints <= 0)}
                            className="px-2 py-1 text-[11px] font-bold bg-slate-800 hover:bg-amber-500 hover:text-slate-950 disabled:opacity-35 rounded cursor-pointer whitespace-nowrap shrink-0"
                          >
                            {emp.skillPoints > 0 ? '+5 (1 P)' : '+5 ($350)'}
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Right: Consumables for Cooldown & Rest */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-300">
                        Yiyecek &amp; İçecek Ver (Bekleme Azalt)
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {CONSUMABLE_CATALOG.map((item) => {
                          const qty = gameState.inventoryConsumables[item.id] ?? 0;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              disabled={qty <= 0}
                              onClick={() => onUseConsumable(emp.id, item.id)}
                              className="p-2 text-left rounded border border-slate-700 bg-slate-950/80 hover:border-amber-500/60 disabled:opacity-40 cursor-pointer"
                            >
                              <div className="text-xs font-semibold text-slate-100 truncate">
                                {item.name}
                              </div>
                              <div className="text-[11px] font-mono-num text-amber-400">
                                Stok: {qty} · -{item.cooldownReductionSec}s
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'shop' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Food & Drinks from Market & Restaurants */}
              <div className="space-y-3">
                <h3 className="text-lg font-display font-bold text-white">
                  Market &amp; Restoran Siparişleri (Envantere Teslim)
                </h3>
                {CONSUMABLE_CATALOG.map((item) => {
                  const owned = gameState.inventoryConsumables[item.id] ?? 0;
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-md border border-slate-800 bg-slate-900/90 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="text-sm font-bold text-white">{item.name}</div>
                        <div className="text-xs text-slate-400">
                          {item.source} · {item.buffLabel}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Envanterde: <span className="font-mono-num text-slate-300">{owned}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={gameState.money < item.cost}
                        onClick={() => onBuyConsumable(item.id)}
                        className="px-3.5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Sipariş Ver (${item.cost})
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Outfits from Alina's Lingerie & Mall */}
              <div className="space-y-3">
                <h3 className="text-lg font-display font-bold text-white">
                  Kıyafet Mağazaları (Alina&apos;s Lingerie &amp; Mall)
                </h3>
                {OUTFIT_CATALOG.filter((o) => o.cost > 0).map((outfit) => {
                  const isOwned = gameState.ownedOutfits.includes(outfit.id);
                  return (
                    <div
                      key={outfit.id}
                      className="p-3.5 rounded-md border border-slate-800 bg-slate-900/90 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="text-sm font-bold text-white">{outfit.name}</div>
                        <div className="text-xs text-slate-400">
                          {outfit.store} · +%{Math.round(outfit.satisfactionBonus * 100)} Gelir · +
                          {outfit.reputationBonus} İtibar Bonusu
                        </div>
                        <div className="text-[11px] font-mono-num text-slate-500 mt-0.5">
                          Gereken Kulüp Seviyesi: {outfit.requiredClubLevel}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={
                          isOwned ||
                          gameState.money < outfit.cost ||
                          gameState.clubLevel < outfit.requiredClubLevel
                        }
                        onClick={() => onBuyOutfit(outfit.id)}
                        className="px-3.5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {isOwned ? 'Sahip Olundu' : `Satın Al ($${outfit.cost})`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'security' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-md border border-slate-800 bg-slate-900/90">
                <div className="flex items-center gap-3">
                  <Shield className="w-6 h-6 text-sky-400" />
                  <div>
                    <div className="text-sm font-bold text-white">
                      Toplam Kulüp Güvenlik Derecesi: {securityRating}
                    </div>
                    <div className="text-xs text-slate-400 font-mono-num">
                      Aktif Koruma: {gameState.guards.length} · Günlük Koruma Maaşı: $
                      {upkeep.guardSalaries} · Güvenli Sığınak Kapasitesi:{' '}
                      {gameState.safeRoom.capacity} kişi
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onTriggerGangDrill}
                  disabled={gameState.gangAttack.active || gameState.bossFight.active}
                  className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-md cursor-pointer whitespace-nowrap shrink-0"
                >
                  Çete Savunma Tatbikatı / Baskın Testi
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Active Guards & Applicants */}
                <div className="space-y-4">
                  <h3 className="text-base font-display font-bold text-white">
                    Koruma Başvuruları &amp; Ekip
                  </h3>
                  {gameState.guardApplicants.length === 0 ? (
                    <div className="p-3 text-xs text-slate-400 border border-slate-800 rounded-md">
                      Şu an bekleyen yeni koruma başvurusu yok. Yeni günlerde seyrek olarak başvurular gelir.
                    </div>
                  ) : (
                    gameState.guardApplicants.map((app) => (
                      <div
                        key={app.id}
                        className="p-3.5 rounded-md border border-sky-500/40 bg-slate-900 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm font-bold text-white">{app.name} (Aday)</div>
                          <div className="text-xs text-slate-300 font-mono-num mt-0.5">
                            Güç:{app.strength} · Day:{app.endurance} · Saldırı:{app.attack} · Sav:{app.defense} · Sadakat:{app.loyalty}
                          </div>
                          <div className="text-[11px] text-amber-400 font-mono-num mt-0.5">
                            İmza: ${app.signingFee} · Maaş: ${app.dailySalary}/gün
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={gameState.money < app.signingFee}
                          onClick={() => onHireGuard(app.id)}
                          className="px-3 py-2 text-xs font-bold bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                        >
                          İşe Al
                        </button>
                      </div>
                    ))
                  )}

                  {gameState.guards.map((g) => (
                    <div
                      key={g.id}
                      className="p-3 rounded-md border border-slate-800 bg-slate-950/70 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{g.name}</div>
                        <div className="text-xs text-slate-400 font-mono-num">
                          Güç:{g.strength} · Saldırı:{g.attack} · Sav:{g.defense} · Sadakat:{g.loyalty}%
                        </div>
                      </div>
                      <div className="text-xs font-mono-num text-amber-400">
                        ${g.dailySalary}/gün
                      </div>
                    </div>
                  ))}
                </div>

                {/* Guard Training & Safe Room Upgrades */}
                <div className="space-y-4">
                  <h3 className="text-base font-display font-bold text-white">
                    Koruma Eğitimleri &amp; Güvenli Sığınak
                  </h3>
                  <div className="space-y-2">
                    {GUARD_TRAINING_OPTIONS.map((opt) => {
                      const lvl = gameState.securityTraining[opt.key];
                      const cost = opt.baseCost + lvl * 300;
                      return (
                        <div
                          key={opt.key}
                          className="p-3 rounded-md border border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="text-xs font-bold text-white">
                              {opt.label} (Sv.{lvl}/5)
                            </div>
                            <div className="text-[11px] text-slate-400">{opt.description}</div>
                          </div>
                          <button
                            type="button"
                            disabled={lvl >= 5 || gameState.money < cost}
                            onClick={() => onTrainGuards(opt.key)}
                            className="px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                          >
                            {lvl >= 5 ? 'Maks' : `$${cost}`}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <div className="text-sm font-bold text-white mb-2">
                      Güvenli Sığınak Geliştirmeleri
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onUpgradeSafeRoom('capacity')}
                        className="p-2.5 text-left rounded border border-slate-700 bg-slate-900 hover:border-amber-500/60 cursor-pointer"
                      >
                        <div className="text-xs font-bold text-white">
                          Kapasite ({gameState.safeRoom.capacity}/12)
                        </div>
                        <div className="text-[11px] text-amber-400 font-mono-num">+2 Kişi</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpgradeSafeRoom('armor')}
                        className="p-2.5 text-left rounded border border-slate-700 bg-slate-900 hover:border-amber-500/60 cursor-pointer"
                      >
                        <div className="text-xs font-bold text-white">
                          Çelik Kapı (Sv.{gameState.safeRoom.doorArmorLevel}/5)
                        </div>
                        <div className="text-[11px] text-amber-400 font-mono-num">Dayanıklılık</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpgradeSafeRoom('speed')}
                        className="p-2.5 text-left rounded border border-slate-700 bg-slate-900 hover:border-amber-500/60 cursor-pointer"
                      >
                        <div className="text-xs font-bold text-white">
                          Hızlı Giriş (Sv.{gameState.safeRoom.entrySpeedLevel}/5)
                        </div>
                        <div className="text-[11px] text-amber-400 font-mono-num">Tahliye Hızı</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpgradeSafeRoom('emergency')}
                        disabled={gameState.safeRoom.emergencySystemUnlocked}
                        className="p-2.5 text-left rounded border border-slate-700 bg-slate-900 hover:border-amber-500/60 disabled:opacity-40 cursor-pointer"
                      >
                        <div className="text-xs font-bold text-white">Acil Durum Sistemi</div>
                        <div className="text-[11px] text-amber-400 font-mono-num">
                          {gameState.safeRoom.emergencySystemUnlocked ? 'Aktif' : '$1.800'}
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'permits' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Legal Permits & Police Risk + Boss Fight */}
              <div className="space-y-4">
                <div className="p-4 rounded-md border border-slate-800 bg-slate-900/90 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-display font-bold text-white">
                      Polis Denetim Riski &amp; City Council Belgeleri
                    </h3>
                    <span className="font-mono-num text-sm font-bold text-amber-400">
                      Risk: %{policeRisk}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    18–20 yaş arası izinsiz çalışan: <strong className="text-rose-400">{unpermittedYoungCount}</strong> ·
                    Geçmiş denetim: {gameState.police.pastInspections}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={gameState.permits.businessLicense || gameState.money < 500}
                      onClick={() => onBuyPermit('business')}
                      className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-45 rounded cursor-pointer"
                    >
                      {gameState.permits.businessLicense ? 'İşletme Ruhsatı Var' : 'İşletme Ruhsatı ($500)'}
                    </button>
                    <button
                      type="button"
                      disabled={gameState.permits.vipPermit || gameState.money < 950}
                      onClick={() => onBuyPermit('vip')}
                      className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-45 rounded cursor-pointer"
                    >
                      {gameState.permits.vipPermit ? 'VIP Ruhsatı Var' : 'VIP Ruhsatı ($950)'}
                    </button>
                    <button
                      type="button"
                      disabled={unpermittedYoungCount === 0 || gameState.money < 300 * unpermittedYoungCount}
                      onClick={() => onBuyPermit('emp_permits')}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded cursor-pointer"
                    >
                      18–20 Çalışma İzinlerini Al (${300 * unpermittedYoungCount})
                    </button>
                    <button
                      type="button"
                      onClick={onTriggerPoliceInspection}
                      className="px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded cursor-pointer"
                    >
                      Denetimi Şimdi Çağır
                    </button>
                  </div>
                </div>

                {/* Boss Fight: Abraham Sweetvoice */}
                <div className="p-4 rounded-md border border-rose-500/50 bg-rose-950/25 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Skull className="w-5 h-5 text-rose-400" />
                    <h3 className="text-base font-display font-bold text-white">
                      Son Aşama Hesaplaşması: Abraham Sweetvoice
                    </h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Şehrin en güçlü çete lideri Abraham Sweetvoice ile yüzleş. Yenildiğinde +$5.000
                    ödül, +220 İtibar ve çete etkisinin kırılması sağlanır. (Önerilen: En az 1
                    Koruma veya Kulüp Seviyesi 2+)
                  </p>
                  <button
                    type="button"
                    disabled={gameState.bossFight.active || gameState.bossFight.defeated}
                    onClick={() => {
                      onStartBossFight();
                      onClose();
                    }}
                    className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-md cursor-pointer"
                  >
                    {gameState.bossFight.defeated
                      ? 'Abraham Sweetvoice Yenildi'
                      : 'Abraham Sweetvoice Boss Fight Başlat'}
                  </button>
                </div>
              </div>

              {/* Financial Ledger */}
              <div className="p-4 rounded-md border border-slate-800 bg-slate-900/90 flex flex-col max-h-[380px]">
                <h3 className="text-base font-display font-bold text-white mb-3">
                  Merkezi Ekonomi Defteri (Son İşlemler)
                </h3>
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {gameState.ledger.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800/70"
                    >
                      <span className="text-slate-300 truncate pr-2">
                        G{entry.day} {String(entry.hour).padStart(2, '0')}:00 · {entry.label}
                      </span>
                      <span
                        className={`font-mono-num font-bold whitespace-nowrap shrink-0 ${
                          entry.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {entry.amount >= 0 ? `+$${entry.amount}` : `-$${Math.abs(entry.amount)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
