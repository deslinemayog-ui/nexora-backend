import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export const NexoraIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className = '' }) => {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 56 56" fill="none" className="w-full h-full drop-shadow-md">
        <defs>
          <linearGradient id="iconG1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="50%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
          <linearGradient id="iconG2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
        </defs>
        <rect width="56" height="56" rx="14" fill="#0F172A" stroke="#1E293B" strokeWidth="1.5" />
        <path d="M28 5L48 16V40L28 51L8 40V16L28 5Z" stroke="url(#iconG1)" strokeWidth="2" strokeLinejoin="round" fill="none" opacity="0.6" />
        <path d="M17 38V18L28 32V46L17 38Z" fill="url(#iconG2)" />
        <path d="M28 18L39 32V46L28 32V18Z" fill="url(#iconG1)" />
        <circle cx="28" cy="28" r="4.5" fill="#38BDF8" />
        <circle cx="28" cy="28" r="2" fill="#FFFFFF" />
      </svg>
    </div>
  );
};

export const NexoraLogo: React.FC<LogoProps> = ({ size = 'md', showSubtitle = true }) => {
  const iconSize = size === 'sm' ? 28 : size === 'md' ? 36 : 48;
  const textSize = size === 'sm' ? 'text-lg' : size === 'md' ? 'text-2xl' : 'text-3xl';

  return (
    <div className="flex items-center gap-3 select-none">
      <div className="relative flex items-center justify-center" style={{ width: iconSize, height: iconSize }}>
        <svg viewBox="0 0 56 56" fill="none" className="w-full h-full drop-shadow-md">
          <defs>
            <linearGradient id="logoG1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="50%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#A855F7" />
            </linearGradient>
            <linearGradient id="logoG2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#06B6D4" />
              <stop offset="100%" stopColor="#3B82F6" />
            </linearGradient>
          </defs>
          <rect width="56" height="56" rx="14" fill="#0F172A" stroke="#1E293B" strokeWidth="1.5" />
          <path d="M28 5L48 16V40L28 51L8 40V16L28 5Z" stroke="url(#logoG1)" strokeWidth="2" strokeLinejoin="round" fill="none" opacity="0.6" />
          <path d="M17 38V18L28 32V46L17 38Z" fill="url(#logoG2)" />
          <path d="M28 18L39 32V46L28 32V18Z" fill="url(#logoG1)" />
          <circle cx="28" cy="28" r="4.5" fill="#38BDF8" className="animate-pulse" />
          <circle cx="28" cy="28" r="2" fill="#FFFFFF" />
        </svg>
      </div>

      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className={`font-black tracking-widest text-white ${textSize} leading-none`}>
            NEXORA
          </span>
          <span className="bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-500 text-white font-black text-xs px-1.5 py-0.5 rounded shadow-sm">
            AI
          </span>
        </div>
        {showSubtitle && (
          <span className="text-[9px] font-semibold tracking-wider text-slate-400 uppercase mt-0.5">
            Autonomous Workforce
          </span>
        )}
      </div>
    </div>
  );
};
