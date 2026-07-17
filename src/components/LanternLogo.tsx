import { useId } from 'react';

type Props = {
  size?: number;
  className?: string;
};

export function LanternLogo({ size = 32, className = '' }: Props) {
  const id = useId().replace(/:/g, '');
  const flameId = `lantern-flame-${id}`;
  const haloId = `lantern-halo-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={flameId} x1="48" y1="50" x2="80" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#DFFBFF" />
          <stop offset="0.45" stopColor="#6EE7F9" />
          <stop offset="1" stopColor="#818CF8" />
        </linearGradient>
        <radialGradient id={haloId} cx="0.5" cy="0.46" r="0.55">
          <stop offset="0" stopColor="#6EE7F9" stopOpacity="0.55" />
          <stop offset="1" stopColor="#6EE7F9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="64" r="42" fill={`url(#${haloId})`} />
      <path d="M53 19a7 7 0 0 1 14 0" stroke="#9CC3E8" strokeWidth="3.4" strokeLinecap="round" />
      <rect x="56.5" y="22" width="7" height="7" rx="2" fill="#9CC3E8" />
      <path d="M45.5 33h29l-4 8h-21z" fill="#9CC3E8" />
      <path d="M50 41c-5.5 9-5.5 43 0 52h20c5.5-9 5.5-43 0-52z" fill="#0B1322" stroke="#9CC3E8" strokeWidth="3.6" strokeLinejoin="round" />
      <path d="M60 41v52" stroke="#9CC3E8" strokeWidth="1.4" opacity="0.4" />
      <rect x="47" y="93" width="26" height="6" rx="3" fill="#9CC3E8" />
      <rect x="51" y="99.5" width="18" height="4" rx="2" fill="#9CC3E8" />
      <path d="M53.5 53v28L76 67z" fill={`url(#${flameId})`} opacity="0.4" />
      <path d="M54 54v26l20.5-13z" fill={`url(#${flameId})`} stroke={`url(#${flameId})`} strokeWidth="3.4" strokeLinejoin="round" />
    </svg>
  );
}
