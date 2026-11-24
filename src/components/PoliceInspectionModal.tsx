import React from 'react';
import { ShieldAlert, Trophy } from 'lucide-react';
import { GameScreenState, GameState } from '../game/types';

interface PoliceInspectionModalProps {
  gameState: GameState;
  onAcknowledge: () => void;
}

export const PoliceInspectionModal: React.FC<PoliceInspectionModalProps> = ({
  gameState,
  onAcknowledge,
}) => {
  const outcome = gameState.police.lastOutcome;
  if (!gameState.police.active || !outcome) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80">
      <div
        className="w-full max-w-lg border border-sky-500/50 rounded-lg p-6 text-slate-100 shadow-2xl"
        style={{ backgroundColor: '#0c1328' }}
      >
        <div className="flex items-center gap-3 border-b border-slate-800 pb-3 mb-4">
          <ShieldAlert className={`w-6 h-6 ${outcome.passed ? 'text-emerald-400' : 'text-rose-400'}`} />
          <div>
            <div className="text-xs font-semibold text-sky-400">Şehir Emniyeti Denetimi</div>
            <h2 className="text-xl font-display font-bold text-white">
              {outcome.passed ? 'Denetim Temiz Geçildi' : 'Denetim İhlali Tespit Edildi'}
            </h2>
          </div>
        </div>

        <p className="text-sm text-slate-200 leading-relaxed mb-4">{outcome.summary}</p>

        {outcome.violations.length > 0 && (
          <ul className="space-y-1.5 mb-4 p-3 rounded bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200">
            {outcome.violations.map((v, i) => (
              <li key={i}>• {v}</li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between text-xs font-mono-num text-slate-300 mb-5">
          <span>Kesilen Ceza: ${outcome.fine}</span>
          <span>
            İtibar Etkisi:{' '}
            {outcome.reputationDelta >= 0
              ? `+${outcome.reputationDelta}`
              : outcome.reputationDelta}
          </span>
        </div>

        <button
          type="button"
          onClick={onAcknowledge}
          className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm rounded-md cursor-pointer"
        >
          Tamam
        </button>
      </div>
    </div>
  );
};

interface PauseAndEndModalProps {
  screenState: GameScreenState;
  gameState: GameState;
  onResume: () => void;
  onRestart: () => void;
  onSave: () => void;
  onReturnTitle: () => void;
  onContinueAfterVictory: () => void;
}

export const PauseAndEndModal: React.FC<PauseAndEndModalProps> = ({
  screenState,
  gameState,
  onResume,
  onRestart,
  onSave,
  onReturnTitle,
  onContinueAfterVictory,
}) => {
  if (screenState === 'paused') {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80">
        <div
          className="w-full max-w-sm border border-amber-500/40 rounded-lg p-6 text-slate-100 shadow-2xl space-y-4"
          style={{ backgroundColor: '#0e1326' }}
        >
          <h2 className="text-2xl font-display font-bold text-white text-center">Oyun Duraklatıldı</h2>
          <div className="grid grid-cols-2 gap-2 text-center bg-slate-900 p-3 rounded-md font-mono-num text-xs">
            <div>
              <div className="text-slate-400">Kasa</div>
              <div className="text-amber-400 font-bold text-base">${gameState.money}</div>
            </div>
            <div>
              <div className="text-slate-400">Gün · Seviye</div>
              <div className="text-white font-bold text-base">
                G{gameState.day} · Sv.{gameState.clubLevel}
              </div>
            </div>
          </div>
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-md cursor-pointer"
            >
              Devam Et
            </button>
            <button
              type="button"
              onClick={onSave}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm rounded-md cursor-pointer"
            >
              Kaydet
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm rounded-md cursor-pointer"
            >
              Yeniden Başlat
            </button>
            <button
              type="button"
              onClick={onReturnTitle}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-900 text-slate-400 font-medium text-sm rounded-md border border-slate-800 cursor-pointer"
            >
              Ana Menüye Dön
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screenState === 'gameover') {
    const isVictory = gameState.victoryAchieved && !gameState.gameOverReason;
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/85">
        <div
          className="w-full max-w-md border border-amber-500/50 rounded-lg p-7 text-slate-100 shadow-2xl space-y-5 text-center"
          style={{ backgroundColor: '#0e1326' }}
        >
          {isVictory && <Trophy className="w-10 h-10 text-amber-400 mx-auto" />}
          <h2 className="text-3xl font-display font-bold text-white">
            {isVictory ? 'Şehrin Hakimi: Zafer!' : 'Oyun Bitti'}
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            {isVictory
              ? 'Abraham Sweetvoice yenildi ve çete baskısı sona erdi. Number One Club artık şehrin zirvesinde!'
              : gameState.gameOverReason}
          </p>

          <div className="grid grid-cols-3 gap-2 bg-slate-900 p-3.5 rounded-md font-mono-num text-xs">
            <div>
              <div className="text-slate-400">Final Kasa</div>
              <div className="text-amber-400 font-bold text-sm">${gameState.money}</div>
            </div>
            <div>
              <div className="text-slate-400">Hizmet</div>
              <div className="text-white font-bold text-sm">{gameState.totalCustomersServed}</div>
            </div>
            <div>
              <div className="text-slate-400">İtibar</div>
              <div className="text-emerald-400 font-bold text-sm">{gameState.reputation}</div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {isVictory && (
              <button
                type="button"
                onClick={onContinueAfterVictory}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-md cursor-pointer"
              >
                Serbest Modda Oynamaya Devam Et
              </button>
            )}
            <button
              type="button"
              data-start="true"
              onClick={onRestart}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-md cursor-pointer"
            >
              Yeni Oyun Başlat
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
