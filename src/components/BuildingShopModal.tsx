import React from 'react';
import { X } from 'lucide-react';
import { BuildingCell, GameState } from '../game/types';
import { CONSUMABLE_CATALOG, OUTFIT_CATALOG } from '../game/worldData';

interface BuildingShopModalProps {
  building: BuildingCell;
  gameState: GameState;
  onBuyConsumable: (itemId: string) => void;
  onBuyOutfit: (outfitId: string) => void;
  onBuyPermit: (permit: 'business' | 'vip' | 'extended' | 'emp_permits') => void;
  onDevelopEmptyLot: () => void;
  onPayPoliceClosure: () => void;
  onClose: () => void;
}

export const BuildingShopModal: React.FC<BuildingShopModalProps> = ({
  building,
  gameState,
  onBuyConsumable,
  onBuyOutfit,
  onBuyPermit,
  onDevelopEmptyLot,
  onPayPoliceClosure,
  onClose,
}) => {
  const unpermittedCount = gameState.employees.filter(
    (e) => e.age >= 18 && e.age <= 20 && !e.hasWorkPermit,
  ).length;

  const matchingConsumables = CONSUMABLE_CATALOG.filter((item) => {
    if (building.category === 'market') return item.source === 'Groove Super Market';
    if (building.category === 'restaurant' || building.category === 'cafe') {
      return item.source === 'Restoran & Kafe' || item.category === 'coffee' || item.category === 'sandwich';
    }
    return false;
  });

  const matchingOutfits = OUTFIT_CATALOG.filter((o) => {
    if (building.category === 'lingerie') return o.store === "Alina's Lingerie";
    if (building.category === 'mall') return o.store === "Cock's and Pussy's Mall";
    return false;
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75">
      <div
        className="w-full max-w-xl border border-amber-500/40 rounded-lg p-6 text-slate-100 shadow-2xl"
        style={{ backgroundColor: '#0e1326' }}
      >
        <div className="flex items-start justify-between border-b border-slate-800 pb-4 mb-4">
          <div>
            <div className="text-xs font-semibold text-amber-400">{building.subtitle}</div>
            <h2 className="text-2xl font-display font-bold text-white mt-0.5">{building.name}</h2>
            <p className="text-xs text-slate-400 mt-1">{building.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Mekanı Kapat"
            className="p-2 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-xs font-mono-num text-amber-400 mb-4">
          Mevcut Kasa: ${Math.round(gameState.money).toLocaleString('tr-TR')}
        </div>

        <div className="space-y-3 max-h-[55vh] overflow-y-auto">
          {matchingConsumables.map((item) => (
            <div
              key={item.id}
              className="p-3.5 rounded-md border border-slate-800 bg-slate-900 flex items-center justify-between gap-4"
            >
              <div>
                <div className="text-sm font-bold text-white">{item.name}</div>
                <div className="text-xs text-slate-400">{item.buffLabel}</div>
              </div>
              <button
                type="button"
                disabled={gameState.money < item.cost}
                onClick={() => onBuyConsumable(item.id)}
                className="px-3.5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer whitespace-nowrap shrink-0"
              >
                Satın Al (${item.cost})
              </button>
            </div>
          ))}

          {matchingOutfits.map((outfit) => {
            const owned = gameState.ownedOutfits.includes(outfit.id);
            return (
              <div
                key={outfit.id}
                className="p-3.5 rounded-md border border-slate-800 bg-slate-900 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="text-sm font-bold text-white">{outfit.name}</div>
                  <div className="text-xs text-slate-400">
                    +%{Math.round(outfit.satisfactionBonus * 100)} Müşteri Memnuniyeti · +
                    {outfit.reputationBonus} İtibar
                  </div>
                </div>
                <button
                  type="button"
                  disabled={
                    owned ||
                    gameState.money < outfit.cost ||
                    gameState.clubLevel < outfit.requiredClubLevel
                  }
                  onClick={() => onBuyOutfit(outfit.id)}
                  className="px-3.5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                >
                  {owned ? 'Envanterde' : `Satın Al ($${outfit.cost})`}
                </button>
              </div>
            );
          })}

          {building.category === 'council' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-md border border-slate-800 bg-slate-900 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">İşletme Ruhsatı</div>
                  <div className="text-xs text-slate-400">Polis denetimlerinde temel yasal gereklilik.</div>
                </div>
                <button
                  type="button"
                  disabled={gameState.permits.businessLicense || gameState.money < 500}
                  onClick={() => onBuyPermit('business')}
                  className="px-3 py-2 text-xs font-bold bg-amber-500 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer"
                >
                  {gameState.permits.businessLicense ? 'Onaylı' : 'Al ($500)'}
                </button>
              </div>

              <div className="p-3.5 rounded-md border border-slate-800 bg-slate-900 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">VIP İşletme Belgesi</div>
                  <div className="text-xs text-slate-400">VIP odalar için resmi belediye onayı.</div>
                </div>
                <button
                  type="button"
                  disabled={gameState.permits.vipPermit || gameState.money < 950}
                  onClick={() => onBuyPermit('vip')}
                  className="px-3 py-2 text-xs font-bold bg-amber-500 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer"
                >
                  {gameState.permits.vipPermit ? 'Onaylı' : 'Al ($950)'}
                </button>
              </div>

              <div className="p-3.5 rounded-md border border-slate-800 bg-slate-900 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">
                    18–20 Yaş Çalışma İzinleri ({unpermittedCount} kişi bekliyor)
                  </div>
                  <div className="text-xs text-slate-400">
                    21 yaş altı çalışanlar için yasal çalışma belgesi düzenler.
                  </div>
                </div>
                <button
                  type="button"
                  disabled={unpermittedCount === 0 || gameState.money < unpermittedCount * 300}
                  onClick={() => onBuyPermit('emp_permits')}
                  className="px-3 py-2 text-xs font-bold bg-emerald-500 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer"
                >
                  Düzenle (${unpermittedCount * 300})
                </button>
              </div>
            </div>
          )}

          {building.category === 'police' && (
            <div className="p-4 rounded-md border border-slate-800 bg-slate-900 space-y-3">
              <div className="text-sm font-bold text-white">Emniyet Denetim Kayıtları</div>
              <div className="text-xs text-slate-300 font-mono-num">
                Güncel Risk Puanı: %{gameState.police.riskScore} · Geçmiş Denetim:{' '}
                {gameState.police.pastInspections}
              </div>
              {gameState.police.temporaryClosureHours > 0 ? (
                <button
                  type="button"
                  disabled={gameState.money < 600}
                  onClick={onPayPoliceClosure}
                  className="px-4 py-2 text-xs font-bold bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer"
                >
                  Mühürü Kaldırma Kefaleti Öde ($600)
                </button>
              ) : (
                <div className="text-xs text-emerald-400">
                  Şu an aktif mühür veya ödenmemiş kefalet bulunmuyor.
                </div>
              )}
            </div>
          )}

          {building.category === 'empty' && (
            <div className="p-4 rounded-md border border-slate-800 bg-slate-900 space-y-3">
              <div className="text-sm font-bold text-white">Boş Arazi Yatırım Projesi</div>
              <p className="text-xs text-slate-300">
                Bu boş araziye VIP Vale &amp; Lojistik Deposu inşa ederek kulüp itibarına +60 ve
                günlük ek gelir katkısı sağlayabilirsin.
              </p>
              <button
                type="button"
                disabled={gameState.expansions.emptyLotBuilt || gameState.money < 3200}
                onClick={onDevelopEmptyLot}
                className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer"
              >
                {gameState.expansions.emptyLotBuilt ? 'Tesis İnşa Edildi' : 'Ek Tesis İnşa Et ($3.200)'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
