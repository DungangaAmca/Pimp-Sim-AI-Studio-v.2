import React from 'react';

interface TitleScreenProps {
  hasSave: boolean;
  onStartNew: () => void;
  onContinueSave: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  hasSave,
  onStartNew,
  onContinueSave,
}) => {
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-8 md:p-12 pointer-events-none bg-gradient-to-r from-[#090b16]/90 via-[#090b16]/45 to-transparent">
      {/* Top Safe Margin */}
      <div className="h-2" />

      {/* Left-Third Editorial Title Lockup over Calm Negative Space */}
      <div className="max-w-lg pointer-events-auto space-y-6">
        <svg
          viewBox="0 0 380 120"
          className="w-full max-w-[360px] h-auto"
          aria-label="Number One Club Amblemi"
        >
          <rect
            x="4"
            y="8"
            width="372"
            height="104"
            rx="6"
            fill="rgba(12, 16, 33, 0.85)"
            stroke="#f59e0b"
            strokeWidth="2.5"
          />
          <rect
            x="12"
            y="16"
            width="356"
            height="88"
            rx="3"
            fill="none"
            stroke="rgba(245, 158, 11, 0.35)"
            strokeWidth="1"
          />
          <polygon points="34,42 46,24 58,42 46,52" fill="#f59e0b" />
          <circle cx="46" cy="76" r="14" fill="none" stroke="#f43f5e" strokeWidth="2.5" />
          <text
            x="46"
            y="82"
            textAnchor="middle"
            fill="#f8fafc"
            fontFamily="Barlow Condensed, sans-serif"
            fontWeight="800"
            fontSize="16"
          >
            #1
          </text>
          <text
            x="80"
            y="58"
            fill="#f8fafc"
            fontFamily="Barlow Condensed, sans-serif"
            fontWeight="800"
            fontSize="40"
            letterSpacing="2"
          >
            NUMBER ONE
          </text>
          <text
            x="82"
            y="86"
            fill="#f59e0b"
            fontFamily="Barlow Condensed, sans-serif"
            fontWeight="700"
            fontSize="21"
            letterSpacing="5"
          >
            CLUB &amp; CITY SIM
          </text>
        </svg>

        <p className="text-slate-200 text-base leading-relaxed max-w-md">
          Şehrin sokaklarını gez, yetenekli ekibini kur, Number One Club odalarını ve VIP süitlerini yönet,
          polis denetimlerini aş ve Abraham Sweetvoice ile hesaplaş.
        </p>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button
            type="button"
            data-start="true"
            onClick={onStartNew}
            className="px-7 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-base rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-lg"
          >
            {hasSave ? 'Yeni Oyun Başlat' : 'Oyunu Başlat'}
          </button>

          {hasSave && (
            <button
              type="button"
              onClick={onContinueSave}
              className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/40 font-semibold text-base rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Kayıtlı Oyuna Devam Et
            </button>
          )}
        </div>
      </div>

      {/* Bottom 1-line Flat Control Hint */}
      <div className="text-xs text-slate-300 tracking-wide font-medium">
        WASD Hareket · Shift Koş · Sürükle Kamera · E Etkileşim · Tab Yönetim · M Harita · I Envanter · F Saldır · Esc Menü
      </div>
    </div>
  );
};
