import React, { useState } from 'react';
import { Navigation, X } from 'lucide-react';
import { BuildingCell } from '../game/types';
import { CITY_GRID, gridToWorld } from '../game/worldData';

interface CityMapModalProps {
  playerX: number;
  playerZ: number;
  onFastTravel: (buildingId: string) => void;
  onClose: () => void;
}

export const CityMapModal: React.FC<CityMapModalProps> = ({
  playerX,
  playerZ,
  onFastTravel,
  onClose,
}) => {
  const [selectedCell, setSelectedCell] = useState<BuildingCell>(
    CITY_GRID.find((c) => c.id === 'number_one_club')!,
  );

  // Determine nearest grid cell to player
  let playerRow = 1;
  let playerCol = 3;
  let bestDist = Infinity;
  for (const cell of CITY_GRID) {
    const p = gridToWorld(cell.row, cell.col);
    const d = Math.hypot(p.x - playerX, p.z - playerZ);
    if (d < bestDist) {
      bestDist = d;
      playerRow = cell.row;
      playerCol = cell.col;
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75">
      <div
        className="w-full max-w-5xl border border-amber-500/40 rounded-lg p-6 text-slate-100 shadow-2xl max-h-[90vh] flex flex-col"
        style={{ backgroundColor: '#0e1326' }}
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div>
            <h2 className="text-2xl font-display font-bold tracking-wide text-white">
              Şehir Haritası (5×5 Bölge Düzeni)
            </h2>
            <p className="text-xs text-slate-400">
              Bir mekana tıklayarak detaylarını incele veya doğrudan girişine git.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Haritayı Kapat"
            className="p-2 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 overflow-y-auto">
          {/* 5x5 Grid */}
          <div className="lg:col-span-2 grid grid-cols-5 gap-2">
            {CITY_GRID.map((cell) => {
              const isSelected = selectedCell.id === cell.id;
              const isClub = cell.id === 'number_one_club';
              const isPlayerHere = cell.row === playerRow && cell.col === playerCol;
              return (
                <button
                  key={cell.id}
                  type="button"
                  onClick={() => setSelectedCell(cell)}
                  className={`relative p-2.5 rounded-md border text-left transition-colors cursor-pointer min-h-[84px] flex flex-col justify-between ${
                    isSelected
                      ? 'border-amber-400 bg-amber-500/15'
                      : isClub
                      ? 'border-amber-500/60 bg-slate-900'
                      : cell.enterable
                      ? 'border-slate-700 bg-slate-900/90 hover:border-slate-500'
                      : 'border-slate-800 bg-slate-950/75 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[10px] font-mono-num text-slate-400">
                    <span>
                      {cell.row + 1},{cell.col + 1}
                    </span>
                    {isPlayerHere && (
                      <span className="text-emerald-400 font-bold">BURADA</span>
                    )}
                  </div>
                  <div className="text-xs font-bold leading-tight text-slate-100 mt-1">
                    {cell.name}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 truncate">
                    {cell.enterable ? 'Girilebilir' : 'Şehir Alanı'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Building Details */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-md p-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="text-xs font-mono-num text-amber-400">
                Satır {selectedCell.row + 1} · Sütun {selectedCell.col + 1}
              </div>
              <h3 className="text-xl font-display font-bold text-white">
                {selectedCell.name}
              </h3>
              {selectedCell.subtitle && (
                <div className="text-xs font-medium text-slate-300">
                  {selectedCell.subtitle}
                </div>
              )}
              <p className="text-sm text-slate-300 leading-relaxed pt-2 border-t border-slate-800">
                {selectedCell.description}
              </p>
              <div className="text-xs text-slate-400 pt-2">
                Durum:{' '}
                <strong className={selectedCell.enterable ? 'text-emerald-400' : 'text-slate-300'}>
                  {selectedCell.enterable ? 'Fiziksel Giriş Aktif' : 'Dekoratif / Açık Alan'}
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onFastTravel(selectedCell.id);
                onClose();
              }}
              className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-md cursor-pointer"
            >
              <Navigation className="w-4 h-4" />
              <span>Bu Konuma Git</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
