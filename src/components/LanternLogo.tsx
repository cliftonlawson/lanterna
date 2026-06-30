type Props = {
  size?: number;
  className?: string;
};

export function LanternLogo({ size = 32, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Glow effect */}
      <defs>
        <radialGradient id="lantern-glow" cx="50%" cy="60%" r="50%">
          <stop offset="0%" stopColor="#fb923c" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </radialGradient>
        <filter id="glow-filter">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Glow halo */}
      <ellipse cx="20" cy="26" rx="10" ry="8" fill="url(#lantern-glow)" />

      {/* Lantern top handle */}
      <path
        d="M20 3 L20 7"
        stroke="#f97316"
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#glow-filter)"
      />

      {/* Lantern top cap */}
      <path
        d="M14 10 Q14 7 20 7 Q26 7 26 10 L27 13 L13 13 Z"
        fill="#292524"
        stroke="#f97316"
        strokeWidth="1.2"
        strokeLinejoin="round"
        filter="url(#glow-filter)"
      />

      {/* Lantern body */}
      <rect
        x="12"
        y="13"
        width="16"
        height="16"
        rx="3"
        fill="#1c1917"
        stroke="#f97316"
        strokeWidth="1.2"
        filter="url(#glow-filter)"
      />

      {/* Glass panels with warm glow */}
      <rect x="13" y="14" width="6" height="14" rx="1" fill="rgba(251,146,60,0.12)" />
      <rect x="21" y="14" width="6" height="14" rx="1" fill="rgba(251,146,60,0.12)" />

      {/* Play icon inside lantern */}
      <polygon
        points="17,18 17,26 25,22"
        fill="#fb923c"
        filter="url(#glow-filter)"
      />

      {/* Lantern bottom cap */}
      <path
        d="M13 29 L27 29 L26 32 Q26 33 20 33 Q14 33 14 32 Z"
        fill="#292524"
        stroke="#f97316"
        strokeWidth="1.2"
        strokeLinejoin="round"
        filter="url(#glow-filter)"
      />

      {/* Side decorative bars */}
      <line x1="12" y1="17" x2="12" y2="25" stroke="#f97316" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="28" y1="17" x2="28" y2="25" stroke="#f97316" strokeWidth="1" strokeOpacity="0.5" />
    </svg>
  );
}
