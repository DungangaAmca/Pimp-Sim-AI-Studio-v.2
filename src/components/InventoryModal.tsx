import React from 'react';
import { X } from 'lucide-react';
import { GameState } from '../game/types';
import { CONSUMABLE_CATALOG, OUTFIT_CATALOG } from '../game/worldData';

interface InventoryModalProps {
  gameState: GameState;
  onUseConsumable: (empId: string, itemId: string) => void;
  onClose: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  gameState,
  onUseConsumable,
  onClose,
}) => {
  const [selectedEmpId, setSelectedEmpId] = React.useState<string>(
    gameState.employees[0]?.id ?? '',
  );

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75">
      <div
        className="w-full max-w-2xl border border-amber-500/40 rounded-lg p-6 text-slate-100 shadow-2xl"
        style={{ backgroundColor: '#0e1326' }}
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <h2 className="text-2xl font-display font-bold text-white">İşletme Envanteri</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Envanteri Kapat"
            className="p-2 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <label htmlFor="inv-emp-select" className="text-xs text-slate-400 block mb-1">
            Ürün Verilecek Çalışan
          </label>
          <select
            id="inv-emp-select"
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white"
          >
            {gameState.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullDisplayName} · Dinlenme: {Math.round(e.restLevel)}/100
                {e.cooldownRemaining > 0 ? ` (${Math.ceil(e.cooldownRemaining)}s bekleme)` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2.5 mb-5">
          <div className="text-xs font-semibold text-slate-300">Yiyecek &amp; İçecekler</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CONSUMABLE_CATALOG.map((item) => {
              const qty = gameState.inventoryConsumables[item.id] ?? 0;
              return (
                <div
                  key={item.id}
                  className="p-3 rounded-md border border-slate-800 bg-slate-900 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-sm font-bold text-white">{item.name}</div>
                    <div className="text-xs font-mono-num text-amber-400">Adet: {qty}</div>
                  </div>
                  <button
                    type="button"
                    disabled={qty <= 0 || !selectedEmpId}
                    onClick={() => onUseConsumable(selectedEmpId, item.id)}
                    className="px-3 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 rounded cursor-pointer"
                  >
                    Kullan
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-300 mb-2">Sahip Olunan Kıyafetler</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {gameState.ownedOutfits.map((oid) => {
              const outfit = OUTFIT_CATALOG.find((o) => o.id === oid);
              if (!outfit) return null;
              return (
                <div
                  key={oid}
                  className="p-2.5 rounded border border-slate-800 bg-slate-950 text-xs flex items-center justify-between"
                >
                  <span className="text-slate-100 font-medium">{outfit.name}</span>
                  <span className="text-amber-400 font-mono-num">
                    +%{Math.round(outfit.satisfactionBonus * 100)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
