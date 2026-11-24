import React from 'react';
import {
  Briefcase,
  Map as MapIcon,
  Package,
  Pause,
  Save,
  Shield,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { NearbyInteraction } from '../engine/CitySceneManager';
import { calculateClubSecurityRating } from '../game/SecurityManagementComponent';
import { GameState } from '../game/types';
import { CITY_GRID, gridToWorld } from '../game/worldData';

interface GameHudProps {
  gameState: GameState;
  playerX: number;
  playerZ: number;
  insideClub: boolean;
  nearby: NearbyInteraction | null;
  muted: boolean;
  onToggleMute: () => void;
  onOpenManagement: () => void;
  onOpenMap: () => void;
  onOpenInventory: () => void;
  onSaveGame: () => void;
  onPause: () => void;
  onTriggerInteraction: (interaction: NearbyInteraction) => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  gameState,
  playerX,
  playerZ,
  insideClub,
  nearby,
  muted,
  onToggleMute,
  onOpenManagement,
  onOpenMap,
  onOpenInventory,
  onSaveGame,
  onPause,
  onTriggerInteraction,
}) => {
  const hours = Math.floor(gameState.minuteOfDay / 60)
    .toString()
    .padStart(2, '0');
  const mins = Math.floor(gameState.minuteOfDay % 60)
    .toString()
    .padStart(2, '0');
  const securityRating = calculateClubSecurityRating(
    gameState.guards,
    gameState.securityTraining,
    gameState.expansions.securityRoomLevel,
  );

  // Minimap coords mapped from [-80..+80] to [0..100%]
  const playerPctX = Math.max(4, Math.min(96, ((playerX + 80) / 160) * 100));
  const playerPctZ = Math.max(4, Math.min(96, ((playerZ + 80) / 160) * 100));

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4">
      {/* Top Row: Left Stats Cluster + Right Compact Action Icons */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left World-Matched Ledger Cluster */}
        <div
          className="pointer-events-auto border border-amber-500/30 rounded-md px-4 py-2.5 shadow-lg"
          style={{ backgroundColor: 'rgba(10, 13, 28, 0.90)' }}
        >
          <div className="flex items-baseline gap-5">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Kasa</div>
              <div
                data-testid="hud-money"
                className={`text-xl font-bold font-mono-num ${
                  gameState.money >= 0 ? 'text-amber-400' : 'text-rose-400'
                }`}
              >
                ${Math.round(gameState.money).toLocaleString('tr-TR')}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Seviye · İtibar</div>
              <div className="text-base font-bold font-mono-num text-slate-100">
                Sv.{gameState.clubLevel} · {Math.round(gameState.reputation)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Zaman</div>
              <div className="text-base font-bold font-mono-num text-slate-100">
                Gün {gameState.day} · {hours}:{mins}
              </div>
            </div>
          </div>

          <div className="mt-1.5 pt-1.5 border-t border-slate-800 flex items-center gap-4 text-xs text-slate-300 font-mono-num">
            <span>Çalışan: {gameState.employees.length}</span>
            <span aria-hidden="true">·</span>
            <span>Müşteri: {gameState.activeCustomersCount}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              Güvenlik: {securityRating}
            </span>
            {insideClub && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-400 font-semibold">Number One Club İçi</span>
              </>
            )}
          </div>
        </div>

        {/* Center Alert for Active Combat / Raid / Closure */}
        <div className="flex flex-col items-center gap-2 max-w-md">
          {gameState.bossFight.active && (
            <div
              className="pointer-events-auto border border-rose-500/70 rounded-md px-5 py-2.5 text-center w-80"
              style={{ backgroundColor: 'rgba(24, 10, 18, 0.94)' }}
            >
              <div className="flex items-center justify-between text-xs font-bold text-rose-300">
                <span>ABRAHAM SWEETVOICE (FAZ {gameState.bossFight.phase})</span>
                <span className="font-mono-num">
                  {gameState.bossFight.bossHp}/{gameState.bossFight.bossMaxHp}
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-900 rounded-sm overflow-hidden mt-1.5">
                <div
                  className="h-full bg-rose-500 transition-all duration-150"
                  style={{
                    width: `${(gameState.bossFight.bossHp / gameState.bossFight.bossMaxHp) * 100}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300 mt-1.5 font-mono-num">
                <span>Senin Canın: {gameState.bossFight.playerHp}</span>
                <span>Yardımcılar: {gameState.bossFight.minionsRemaining}</span>
              </div>
              {gameState.bossFight.telegraphTimer > 0 && (
                <div className="mt-1 text-xs font-bold text-amber-300">
                  DİKKAT: Güçlü Saldırı Geliyor! [Space] ile Kaçın!
                </div>
              )}
            </div>
          )}

          {gameState.gangAttack.active && gameState.gangAttack.gang && (
            <div
              data-testid="hud-gang-attack"
              className="pointer-events-auto border border-rose-500/60 rounded-md px-4 py-2 text-center w-80"
              style={{ backgroundColor: 'rgba(28, 12, 16, 0.93)' }}
            >
              <div className="flex items-center justify-between text-xs font-bold text-rose-400">
                <span>MEKAN SALDIRISI: {gameState.gangAttack.gang.name}</span>
                <span className="font-mono-num">
                  %{Math.round(gameState.gangAttack.clubDoorIntegrity)}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-sm overflow-hidden mt-1.5">
                <div
                  className="h-full bg-amber-500 transition-all duration-150"
                  style={{
                    width: `${Math.max(0, Math.min(100, gameState.gangAttack.clubDoorIntegrity))}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-slate-200 mt-1 font-mono-num">
                Saldırgan: {gameState.gangAttack.enemiesRemaining} · Sığınakta:{' '}
                {gameState.gangAttack.employeesSheltered} · Süre:{' '}
                {Math.ceil(gameState.gangAttack.timeRemaining)}s
              </div>
            </div>
          )}

          {gameState.police.temporaryClosureHours > 0 && (
            <div
              className="border border-sky-500/60 rounded-md px-4 py-1.5 text-xs text-sky-200 font-medium"
              style={{ backgroundColor: 'rgba(12, 20, 38, 0.92)' }}
            >
              Polis Mühürü Aktif · Kalan Süre: {gameState.police.temporaryClosureHours.toFixed(1)} saat
            </div>
          )}
        </div>

        {/* Top-Right Compact Utility & Panel Buttons */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenManagement}
            title="İşletme Yönetimi (Tab)"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-100 hover:text-amber-400 border border-slate-700 hover:border-amber-500/60 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            style={{ backgroundColor: 'rgba(10, 13, 28, 0.90)' }}
          >
            <Briefcase className="w-4 h-4 text-amber-400" />
            <span>Yönetim [Tab]</span>
          </button>

          <button
            type="button"
            onClick={onOpenMap}
            title="Şehir Haritası (M)"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-100 hover:text-amber-400 border border-slate-700 hover:border-amber-500/60 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            style={{ backgroundColor: 'rgba(10, 13, 28, 0.90)' }}
          >
            <MapIcon className="w-4 h-4 text-sky-400" />
            <span>Harita [M]</span>
          </button>

          <button
            type="button"
            onClick={onOpenInventory}
            title="Envanter (I)"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-100 hover:text-amber-400 border border-slate-700 hover:border-amber-500/60 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            style={{ backgroundColor: 'rgba(10, 13, 28, 0.90)' }}
          >
            <Package className="w-4 h-4 text-emerald-400" />
            <span>Envanter [I]</span>
          </button>

          <button
            type="button"
            onClick={onSaveGame}
            aria-label="Oyunu Kaydet"
            title="Kaydet"
            className="p-2 text-slate-200 hover:text-amber-400 border border-slate-700 rounded-md transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(10, 13, 28, 0.90)' }}
          >
            <Save className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Sesi Aç' : 'Sesi Kapat'}
            title={muted ? 'Sesi Aç' : 'Sesi Kapat'}
            className="p-2 text-slate-200 hover:text-amber-400 border border-slate-700 rounded-md transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(10, 13, 28, 0.90)' }}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onPause}
            aria-label="Duraklat"
            title="Duraklat (Esc)"
            className="p-2 text-slate-200 hover:text-amber-400 border border-slate-700 rounded-md transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(10, 13, 28, 0.90)' }}
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Row: Notification + Contextual Interaction Prompt + Minimap */}
      <div className="flex items-end justify-between gap-4">
        {/* Bottom-Left Recent Event Feed (max 1 line) */}
        <div
          className="max-w-sm border border-slate-800 rounded-md px-3.5 py-2 text-xs text-slate-300"
          style={{ backgroundColor: 'rgba(10, 13, 28, 0.88)' }}
        >
          {gameState.lastNotification ?? 'Şehirde serbestçe dolaşabilir veya kulübünü yönetebilirsin.'}
        </div>

        {/* Bottom-Center Interaction Prompt */}
        <div className="flex flex-col items-center gap-2">
          {nearby && (
            <button
              type="button"
              onClick={() => onTriggerInteraction(nearby)}
              className="pointer-events-auto px-5 py-2.5 border border-amber-400 rounded-md text-center shadow-xl cursor-pointer transition-colors hover:bg-amber-500/20"
              style={{ backgroundColor: 'rgba(12, 16, 33, 0.95)' }}
            >
              <div className="text-sm font-bold text-amber-300">{nearby.label}</div>
              {nearby.sublabel && (
                <div className="text-xs text-slate-300 mt-0.5">{nearby.sublabel}</div>
              )}
            </button>
          )}
          <div className="text-[11px] text-slate-400">
            WASD Yürü · Shift Koş · Sürükle Kamera · E Etkileşim
          </div>
        </div>

        {/* Bottom-Right Live 5x5 Corner Minimap */}
        <button
          type="button"
          onClick={onOpenMap}
          aria-label="Şehir Mini Haritası"
          className="pointer-events-auto relative w-32 h-32 border border-slate-700 rounded-md overflow-hidden cursor-pointer hover:border-amber-500/60 transition-colors"
          style={{ backgroundColor: 'rgba(9, 12, 24, 0.92)' }}
        >
          {CITY_GRID.map((cell) => {
            const wPos = gridToWorld(cell.row, cell.col);
            const left = ((wPos.x + 80) / 160) * 100 - 7;
            const top = ((wPos.z + 80) / 160) * 100 - 7;
            return (
              <div
                key={cell.id}
                className="absolute w-[14%] h-[14%] rounded-[1px]"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  backgroundColor:
                    cell.id === 'number_one_club'
                      ? '#f59e0b'
                      : cell.enterable
                      ? 'rgba(148, 163, 184, 0.45)'
                      : 'rgba(51, 65, 85, 0.45)',
                }}
              />
            );
          })}
          {/* Player marker */}
          <div
            className="absolute w-2.5 h-2.5 bg-white border border-slate-950 rounded-full -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${playerPctX}%`, top: `${playerPctZ}%` }}
          />
        </button>
      </div>
    </div>
  );
};
