import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  SKILL_LABELS,
  calculateNegotiationChance,
} from '../game/EmployeeManagementComponent';
import { RecruitCandidate, SkillKey } from '../game/types';

interface RecruitmentModalProps {
  candidate: RecruitCandidate;
  clubReputation: number;
  onAttemptHire: (candidateId: string, offeredPct: number) => { accepted: boolean; message: string };
  onClose: () => void;
}

export const RecruitmentModal: React.FC<RecruitmentModalProps> = ({
  candidate,
  clubReputation,
  onAttemptHire,
  onClose,
}) => {
  const [offeredPct, setOfferedPct] = useState<number>(
    Math.max(40, candidate.expectedCommissionPct - 10),
  );
  const [feedback, setFeedback] = useState<{ accepted: boolean; message: string } | null>(null);

  const chance = calculateNegotiationChance(candidate, offeredPct, clubReputation);
  const presetOffers = [
    Math.max(35, candidate.expectedCommissionPct - 18),
    Math.max(40, candidate.expectedCommissionPct - 8),
    candidate.expectedCommissionPct,
    Math.min(85, candidate.expectedCommissionPct + 8),
  ];

  const handleSubmitOffer = () => {
    const res = onAttemptHire(candidate.id, offeredPct);
    setFeedback(res);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75">
      <div
        className="w-full max-w-xl border border-amber-500/40 rounded-lg p-6 text-slate-100 shadow-2xl"
        style={{ backgroundColor: '#0e1326' }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs text-amber-400 font-semibold">İşe Alım Görüşmesi</div>
            <h2 className="text-2xl font-display font-bold tracking-wide text-white mt-0.5">
              {candidate.fullDisplayName}
            </h2>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
              <span>Yaş: {candidate.age}</span>
              <span aria-hidden="true">·</span>
              <span>Deneyim Seviyesi: {candidate.experienceLevel}</span>
              <span aria-hidden="true">·</span>
              <span>
                {candidate.age >= 21
                  ? '21+ Tam Uygun'
                  : '18–20 Yaş (City Council İzni Gerekir)'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Görüşmeyi Kapat"
            className="p-2 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metrics & 4 Skills */}
        <div className="grid grid-cols-2 gap-4 my-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-md p-3.5">
            <div className="text-xs text-slate-400">Müşteri Başına Kazanç</div>
            <div className="text-2xl font-bold font-mono-num text-emerald-400 mt-1">
              ${candidate.baseCustomerRevenue}
            </div>
            <div className="text-xs text-slate-400 mt-3">Beklenen Komisyon Payı</div>
            <div className="text-lg font-bold font-mono-num text-amber-400">
              %{candidate.expectedCommissionPct}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-md p-3.5 space-y-2">
            <div className="text-xs text-slate-400 mb-1">Temel Yetenek Seviyeleri</div>
            {(Object.keys(SKILL_LABELS) as SkillKey[]).map((key) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-slate-200">{SKILL_LABELS[key]}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-slate-800 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-amber-400"
                      style={{ width: `${candidate.skills[key]}%` }}
                    />
                  </div>
                  <span className="font-mono-num text-slate-300 w-6 text-right">
                    {candidate.skills[key]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Negotiation Controls */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-md p-4 space-y-4">
          <div className="flex items-center justify-between">
            <label htmlFor="commission-slider" className="text-sm font-semibold text-slate-200">
              Teklif Edilen Gelir Payı: <span className="text-amber-400 font-mono-num">%{offeredPct}</span>
            </label>
            <span className="text-xs font-mono-num text-slate-300">
              Kabul İhtimali:{' '}
              <strong
                className={
                  chance >= 70
                    ? 'text-emerald-400'
                    : chance >= 45
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }
              >
                %{chance}
              </strong>
            </span>
          </div>

          <input
            id="commission-slider"
            type="range"
            min={30}
            max={85}
            step={1}
            value={offeredPct}
            onChange={(e) => setOfferedPct(Number(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer"
          />

          <div className="flex flex-wrap gap-2">
            {presetOffers.map((pct, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setOfferedPct(pct)}
                className={`px-3 py-1.5 text-xs font-mono-num font-semibold rounded-md border transition-colors cursor-pointer ${
                  offeredPct === pct
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-800 text-slate-200 border-slate-700 hover:border-amber-500/50'
                }`}
              >
                %{pct} Teklif Et
              </button>
            ))}
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 p-3 rounded-md border text-sm ${
              feedback.accepted
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 rounded-md cursor-pointer"
          >
            {feedback?.accepted ? 'Tamam' : 'Ayrıl'}
          </button>
          {!feedback?.accepted && (
            <button
              type="button"
              onClick={handleSubmitOffer}
              disabled={candidate.rejectedCooldownDays > 0}
              className="px-5 py-2 text-sm font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-md cursor-pointer"
            >
              Anlaşma Teklif Et (%{offeredPct})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
