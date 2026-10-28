import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
}) => {
  const sizeMap = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-20 h-20',
    xl: 'w-28 h-28',
  };

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {/* Imperial Crown + Crossed Shears + Mustache Vector SVG */}
      <div className={`relative ${sizeMap[size]} transition-transform duration-300 hover:scale-105 drop-shadow-[0_4px_12px_rgba(212,175,55,0.35)]`}>
        <svg
          viewBox="0 0 512 512"
          className="w-full h-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="logoGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFF7C8" />
              <stop offset="30%" stopColor="#E6C25B" />
              <stop offset="70%" stopColor="#D4AF37" />
              <stop offset="100%" stopColor="#967417" />
            </linearGradient>
            <linearGradient id="logoLight" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#D4AF37" />
            </linearGradient>
            <radialGradient id="logoBg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#27272A" />
              <stop offset="100%" stopColor="#09090B" />
            </radialGradient>
          </defs>

          {/* Dark Background Medallion */}
          <rect width="512" height="512" rx="90" fill="url(#logoBg)" stroke="url(#logoGold)" strokeWidth="4" />
          <circle cx="256" cy="256" r="226" stroke="url(#logoGold)" strokeWidth="2" strokeDasharray="6 6" opacity="0.6" />

          {/* Top Imperial Crown */}
          <g id="crown" fill="url(#logoGold)">
            {/* Crown Base */}
            <path d="M175,185 L337,185 L328,204 L184,204 Z" />
            <ellipse cx="256" cy="194.5" rx="76" ry="4" fill="#09090B" opacity="0.5" />
            
            {/* Pearls on band */}
            <circle cx="205" cy="194.5" r="3.5" fill="#FFF" />
            <circle cx="230" cy="194.5" r="3.5" fill="#FFF" />
            <circle cx="256" cy="194.5" r="4.5" fill="#FFF" />
            <circle cx="282" cy="194.5" r="3.5" fill="#FFF" />
            <circle cx="307" cy="194.5" r="3.5" fill="#FFF" />

            {/* Peaks */}
            <path d="M178,185 Q164,136 188,130 Q205,142 216,174 Q234,116 256,106 Q278,116 296,174 Q307,142 324,130 Q348,136 334,185 Z" />
            
            {/* Imperial Orbe with Cross */}
            <circle cx="256" cy="98" r="8" fill="url(#logoLight)" />
            <rect x="254" y="80" width="4" height="15" fill="url(#logoLight)" />
            <rect x="249" y="84" width="14" height="4" fill="url(#logoLight)" />

            {/* Side Spheres */}
            <circle cx="188" cy="127" r="5" fill="url(#logoLight)" />
            <circle cx="324" cy="127" r="5" fill="url(#logoLight)" />
          </g>

          {/* Crossed Barber Shears */}
          <g id="shears" fill="url(#logoGold)">
            {/* Left-to-right blade */}
            <path
              d="M140,195 C146,190 230,248 256,268 L330,342 C338,338 355,340 365,350 C378,363 378,385 365,398 C352,411 330,411 317,398 C307,388 305,371 309,363 L245,299 C225,273 140,195 140,195 Z"
              opacity="0.95"
            />
            <circle cx="341" cy="374" r="14" fill="#09090B" />

            {/* Right-to-left blade */}
            <path
              d="M372,195 C366,190 282,248 256,268 L182,342 C174,338 157,340 147,350 C134,363 134,385 147,398 C160,411 182,411 195,398 C205,388 207,371 203,363 L267,299 C287,273 372,195 372,195 Z"
              opacity="0.95"
            />
            <circle cx="171" cy="374" r="14" fill="#09090B" />

            {/* Center Pivot */}
            <circle cx="256" cy="274" r="7" fill="#FFF7C8" stroke="#7A5805" strokeWidth="2" />
          </g>

          {/* Classic Gentleman Mustache */}
          <g id="mustache" fill="url(#logoLight)">
            <path d="M256,312 C246,304 226,296 200,300 C168,306 140,324 122,346 C118,351 124,356 128,352 C152,330 184,318 220,322 C238,324 248,332 256,340 C264,332 274,324 292,322 C328,318 360,330 384,352 C388,356 394,351 390,346 C372,324 344,306 312,300 C286,296 266,304 256,312 Z" />
          </g>

          {/* Bottom Stars */}
          <g fill="url(#logoGold)">
            <polygon points="256,430 260,440 271,441 262,448 265,459 256,453 247,459 250,448 241,441 252,440" />
            <polygon points="216,435 219,442 227,443 221,448 223,456 216,452 209,456 211,448 205,443 213,442" opacity="0.7" />
            <polygon points="296,435 299,442 307,443 301,448 303,456 296,452 289,456 291,448 285,443 293,442" opacity="0.7" />
          </g>
        </svg>
      </div>

      {showText && (
        <div className="mt-2 text-center">
          <h1 className="font-cinzel text-xl md:text-2xl font-extrabold tracking-[0.2em] gold-text-gradient uppercase">
            Barbería Barón
          </h1>
          <p className="text-[10px] md:text-xs tracking-[0.25em] text-zinc-400 uppercase font-medium">
            Alquiler & Control de Puestos
          </p>
        </div>
      )}
    </div>
  );
};
