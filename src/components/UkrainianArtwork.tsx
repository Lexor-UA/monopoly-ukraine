import React, { useId } from 'react';
import { BoardCell, SectorId, TokenId } from '../shared/types';

export const TryzubLogo: React.FC<{ className?: string }> = ({
  className = 'w-6 h-6',
}) => {
  const uid = useId();
  const goldLightId = `tryzub_gold_l_${uid}`;
  const goldDarkId = `tryzub_gold_r_${uid}`;

  return (
    <svg viewBox="0 0 64 64" fill="none" className={className}>
      <defs>
        <linearGradient id={goldLightId} x1="12" y1="6" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF7C2" />
          <stop offset="45%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id={goldDarkId} x1="32" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="55%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#92400E" />
        </linearGradient>
      </defs>
      {/* 3D Base Extrusion Shadow */}
      <path
        d="M32 8L36.5 21.5V45L45 37.5V16L52 11.5V42C52 49.2 46.5 53 39.5 53H35.5L32 60L28.5 53H24.5C17.5 53 12 49.2 12 42V11.5L19 16V37.5L27.5 45V21.5L32 8Z"
        fill="#78350F"
        opacity="0.55"
      />
      {/* Main 3D Illuminated Gold Body */}
      <path
        d="M32 6L36.5 19.5V43L45 35.5V14L52 9.5V40C52 47.2 46.5 51 39.5 51H35.5L32 58L28.5 51H24.5C17.5 51 12 47.2 12 40V9.5L19 14V35.5L27.5 43V19.5L32 6Z"
        fill={`url(#${goldLightId})`}
      />
      {/* Right-Half 3D Facet Shading for Sculpted Depth */}
      <path
        d="M32 6L36.5 19.5V43L45 35.5V14L52 9.5V40C52 47.2 46.5 51 39.5 51H35.5L32 58V6Z"
        fill={`url(#${goldDarkId})`}
        opacity="0.48"
      />
      {/* Central Crossbar Bevel */}
      <path
        d="M25 32H39"
        stroke="#FFFBEB"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
};

export const KabzdaBoltIcon: React.FC<{
  className?: string;
  variant?: 'ingot' | 'glow';
}> = ({ className = 'w-3 h-3', variant = 'glow' }) => {
  const uid = useId();
  const gradId = `kabzda_bolt_${uid}`;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {variant === 'glow' && (
        <defs>
          <linearGradient
            id={gradId}
            x1="4"
            y1="2"
            x2="20"
            y2="22"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FFFBEB" />
            <stop offset="45%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M13.5 2L4.5 13.2H11.4L9.8 22L19.5 10.4H12.6L13.5 2Z"
        fill={variant === 'ingot' ? 'currentColor' : `url(#${gradId})`}
        stroke={variant === 'ingot' ? 'none' : '#78350F'}
        strokeWidth={variant === 'ingot' ? '0' : '0.8'}
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const MagnatBrandIcon: React.FC<{
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ size = 'lg', className = '' }) => {
  const dims =
    size === 'xs'
      ? 'w-7 h-7 rounded-lg p-[1.5px]'
      : size === 'sm'
        ? 'w-9.5 h-9.5 2xl:w-10.5 2xl:h-10.5 rounded-xl p-[1.5px]'
        : size === 'md'
          ? 'w-11.5 h-11.5 sm:w-12.5 sm:h-12.5 rounded-xl sm:rounded-2xl p-[1.5px]'
          : 'w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-[17px] p-[1.5px]';

  const innerRadius =
    size === 'xs'
      ? 'rounded-[6.5px]'
      : size === 'sm'
        ? 'rounded-[10.5px]'
        : 'rounded-[10.5px] sm:rounded-[15.5px]';

  return (
    <div
      className={`magnat-3d-emblem-shell relative shrink-0 select-none transition-transform duration-300 hover:scale-[1.05] hover:-rotate-1 ${dims} ${className}`}
    >
      <div
        className={`relative w-full h-full ${innerRadius} overflow-hidden bg-[#050C1A]`}
      >
        <img
          src="/images/kabzda-cat-icon.jpg?v=2"
          alt="КАБЗДА.UA — Кіт-Магнат, 3D-Кубики та Блискавки"
          decoding="async"
          className="w-full h-full object-cover contrast-[1.04] saturate-[1.06]"
        />
        {/* Subtle Crystal Top-Left Rim Sheen + Inner Vignette Ring */}
        <div
          className="absolute inset-0 pointer-events-none rounded-[inherit] ring-1 ring-inset ring-white/15"
          style={{
            background:
              'linear-gradient(145deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.03) 34%, transparent 52%)',
          }}
        />
      </div>
    </div>
  );
};

export const MagnatWordmark: React.FC<{
  size?: 'xs' | 'sm' | 'lg';
  showCountryBadge?: boolean;
  ingotClassName?: string;
}> = ({
  size = 'lg',
  showCountryBadge = false,
  ingotClassName = 'inline-flex',
}) => {
  const textClass =
    size === 'xs'
      ? 'text-[11.5px] tracking-[0.035em]'
      : size === 'sm'
        ? 'text-xs sm:text-[13.5px] 2xl:text-[15px] tracking-[0.04em]'
        : 'text-lg sm:text-[23px] tracking-[0.045em]';

  const ingotClass =
    size === 'xs'
      ? 'h-[16px] px-1.5 text-[8px] rounded-full'
      : size === 'sm'
        ? 'h-[18px] 2xl:h-[19px] px-2 text-[9px] 2xl:text-[9.5px] rounded-full'
        : 'h-[21px] sm:h-[23px] px-2.5 sm:px-3 text-[10px] sm:text-[11px] rounded-full';

  const boltSizeClass =
    size === 'xs'
      ? 'w-2.5 h-2.5'
      : size === 'sm'
        ? 'w-2.5 h-2.5 2xl:w-3 2xl:h-3'
        : 'w-3 h-3 sm:w-3.5 sm:h-3.5';

  const badgeHeightClass =
    size === 'xs'
      ? 'h-[16px] px-2 text-[8px]'
      : size === 'sm'
        ? 'h-[18px] 2xl:h-[19px] px-2.5 text-[8.5px]'
        : 'h-[21px] sm:h-[23px] px-3 text-[9.5px]';

  return (
    <div className="inline-flex items-center gap-2 shrink-0">
      <div className="inline-flex items-center gap-2 shrink-0 whitespace-nowrap select-none py-0.5">
        {/* True 3D Extruded Block Wordmark (zero Chromium background-clip + filter dark-box glitch) */}
        <span
          className={`relative inline-grid shrink-0 font-display font-extrabold ${textClass} leading-none`}
        >
          <span
            aria-hidden="true"
            className="col-start-1 row-start-1 magnat-wordmark-extrude pointer-events-none select-none"
          >
            КАБЗДА
          </span>
          <span className="col-start-1 row-start-1 magnat-wordmark-face">
            КАБЗДА
          </span>
        </span>

        {/* Minted 3D 24K Gold UA Deed Ingot with Crisp Vector Lightning Bolt */}
        <span
          className={`magnat-ua-ingot ${ingotClassName} items-center justify-center gap-1 font-display font-black leading-none tracking-[0.06em] shrink-0 ${ingotClass}`}
        >
          <KabzdaBoltIcon variant="ingot" className={boltSizeClass} />
          <span>UA</span>
        </span>
      </div>

      {showCountryBadge && (
        <span
          className={`magnat-edition-badge hidden sm:inline-flex items-center gap-1.5 ${badgeHeightClass} font-extrabold uppercase tracking-[0.14em] rounded-full text-slate-700 dark:text-amber-200/95 shrink-0 whitespace-nowrap select-none`}
        >
          <span
            aria-hidden="true"
            className="w-1.5 h-3 rounded-full overflow-hidden flex flex-col shrink-0 ring-1 ring-black/15 dark:ring-white/25"
          >
            <span className="w-full h-1/2 bg-[#0057B8]" />
            <span className="w-full h-1/2 bg-[#FFD700]" />
          </span>
          <span>Бізнес-Битва</span>
        </span>
      )}
    </div>
  );
};

export const TokenEmblemSvg: React.FC<{
  token: TokenId;
  className?: string;
}> = ({ token, className = 'w-[72%] h-[72%]' }) => {
  return (
    <>
      {/* 1. Золотий Тризуб — Noble Champagne-Ivory Heraldic Trident */}
      {token === 'tryzub' && (
        <svg
          viewBox="0 0 64 64"
          className={`${className} drop-shadow-[0_1px_1.5px_rgba(2,6,23,0.72)]`}
          fill="none"
        >
          <path
            d="M32 6L37 19.5V42L45 34.5V13.5L52.5 9V39.5C52.5 47.2 46.6 51 39.5 51H35.8L32 58L28.2 51H24.5C17.4 51 11.5 47.2 11.5 39.5V9L19 13.5V34.5L27 42V19.5L32 6Z"
            fill="#FEF3C7"
            stroke="#FDE68A"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M32 14V47M22 44.5H42"
            stroke="#FFFBEB"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* 2. Крила Свободи — Sculpted Champagne-Ivory Mriya Silhouette */}
      {token === 'mriya' && (
        <svg
          viewBox="0 0 64 64"
          className={`${className} drop-shadow-[0_1px_1.5px_rgba(2,6,23,0.72)]`}
          fill="none"
        >
          <path
            d="M32 7L36 15.5V25L57 35V40.5L36 34.8V46.5L45 51.5V56L32 52.2L19 56V51.5L28 46.5V34.8L7 40.5V35L28 25V15.5L32 7Z"
            fill="#FEF3C7"
            stroke="#FFFBEB"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <circle cx="15" cy="36.5" r="2" fill="#F59E0B" />
          <circle cx="21.5" cy="34.5" r="2" fill="#F59E0B" />
          <circle cx="42.5" cy="34.5" r="2" fill="#F59E0B" />
          <circle cx="49" cy="36.5" r="2" fill="#F59E0B" />
        </svg>
      )}

      {/* 3. Галицький Лев — Regal Heraldic Crowned Lion Crest (No Cartoon Smiley) */}
      {token === 'patron' && (
        <svg
          viewBox="0 0 64 64"
          className={`${className} drop-shadow-[0_1px_1.5px_rgba(2,6,23,0.72)]`}
          fill="none"
        >
          {/* Royal Three-Point Coronet */}
          <path
            d="M19.5 18L22.5 9.5L28.5 14.5L32 8L35.5 14.5L41.5 9.5L44.5 18H19.5Z"
            fill="#FFFBEB"
            stroke="#FDE68A"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Heraldic Escutcheon Shield Frame */}
          <path
            d="M15 21.5H49V35.5C49 46.2 41.4 53.6 32 57C22.6 53.6 15 46.2 15 35.5V21.5Z"
            fill="#FEF3C7"
            fillOpacity="0.22"
            stroke="#FEF3C7"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          {/* Noble Heraldic Lion Profile Silhouette */}
          <path
            d="M24 48.5C23.5 43.5 25 39.5 23 35.5C21.5 32.5 23.2 27.5 28.5 26C33.5 24.5 39.2 26.8 41.5 31L43.5 33.2L40.8 35.4L42 38.2L38.2 39.5C37.8 43.2 39.2 46.2 40.5 48.5H24Z"
            fill="#FFFBEB"
          />
        </svg>
      )}

      {/* 4. Козацька Шабля — Crossed Sabres & Heraldic Buckler */}
      {token === 'kozak' && (
        <svg
          viewBox="0 0 64 64"
          className={`${className} drop-shadow-[0_1px_1.5px_rgba(2,6,23,0.72)]`}
          fill="none"
        >
          <path
            d="M13 49C22 39 36 24 49 11C51.8 8.5 55 10 53.5 13.5C46 26 31 41 18 52"
            stroke="#FFFBEB"
            strokeWidth="4.6"
            strokeLinecap="round"
          />
          <path
            d="M51 49C42 39 28 24 15 11C12.2 8.5 9 10 10.5 13.5C18 26 33 41 46 52"
            stroke="#FDE68A"
            strokeWidth="4.6"
            strokeLinecap="round"
          />
          <circle
            cx="32"
            cy="33"
            r="7"
            fill="#FEF3C7"
            stroke="#92400E"
            strokeWidth="1.8"
          />
          <circle cx="32" cy="33" r="2.4" fill="#92400E" />
        </svg>
      )}

      {/* 5. Київський Каштан — Sculpted 5-Leaf Chestnut Relief */}
      {token === 'kashtan' && (
        <svg
          viewBox="0 0 64 64"
          className={`${className} drop-shadow-[0_1px_1.5px_rgba(2,6,23,0.72)]`}
          fill="none"
        >
          <path
            d="M32 7C36.5 14 37.5 23 32 33C26.5 23 27.5 14 32 7Z"
            fill="#FFFBEB"
          />
          <path
            d="M13 16C21 17.5 27.5 23.5 31 33.5C21.5 30.5 15.5 24 13 16Z"
            fill="#FEF3C7"
          />
          <path
            d="M51 16C43 17.5 36.5 23.5 33 33.5C42.5 30.5 48.5 24 51 16Z"
            fill="#FEF3C7"
          />
          <path
            d="M10 36C17.5 33.5 24.5 34.5 31 38C24 43.5 16.5 42.5 10 36Z"
            fill="#FDE68A"
          />
          <path
            d="M54 36C46.5 33.5 39.5 34.5 33 38C40 43.5 47.5 42.5 54 36Z"
            fill="#FDE68A"
          />
          <path
            d="M32 34V55"
            stroke="#FFFBEB"
            strokeWidth="3.6"
            strokeLinecap="round"
          />
          <circle
            cx="32"
            cy="35"
            r="3.8"
            fill="#F59E0B"
            stroke="#FFFBEB"
            strokeWidth="1.4"
          />
        </svg>
      )}

      {/* 6. Гетьманська Булава — Ceremonial Mace Relief */}
      {token === 'bulava' && (
        <svg
          viewBox="0 0 64 64"
          className={`${className} drop-shadow-[0_1px_1.5px_rgba(2,6,23,0.72)]`}
          fill="none"
        >
          <path
            d="M14 50L37 27"
            stroke="#FFFBEB"
            strokeWidth="5.4"
            strokeLinecap="round"
          />
          <circle cx="13" cy="51" r="3.8" fill="#FDE68A" />
          <circle
            cx="42"
            cy="22"
            r="11"
            fill="#FEF3C7"
            stroke="#FDE68A"
            strokeWidth="1.8"
          />
          <path
            d="M42 6.8V10.5M57.2 22H53.5M52.8 11.2L50 14M31.2 11.2L34 14M52.8 32.8L50 30"
            stroke="#FFFBEB"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="39" cy="19" r="2.8" fill="#FFFFFF" fillOpacity="0.7" />
        </svg>
      )}

      {/* 7. Котик — Cute Sculpted Cat Head Relief */}
      {token === 'kotyk' && (
        <svg
          viewBox="0 0 64 64"
          className={`${className} drop-shadow-[0_1px_1.5px_rgba(2,6,23,0.72)]`}
          fill="none"
        >
          <path
            d="M14 28L11 11L25 20C27.2 19.3 29.5 19 32 19C34.5 19 36.8 19.3 39 20L53 11L50 28C51.9 31 53 34.6 53 38.5C53 48.2 43.6 55 32 55C20.4 55 11 48.2 11 38.5C11 34.6 12.1 31 14 28Z"
            fill="#FFFBEB"
            stroke="#FDE68A"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="24" cy="36" r="3" fill="#0F172A" />
          <circle cx="40" cy="36" r="3" fill="#0F172A" />
          <path
            d="M29.2 42.5H34.8L32 45.8L29.2 42.5Z"
            fill="#F43F5E"
          />
          <path
            d="M27.5 47.5C29 49 30.8 49.2 32 47.8C33.2 49.2 35 49 36.5 47.5"
            stroke="#78350F"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* 8. Ведмедик Паддінгтон — Bear in Iconic Bush Hat Relief */}
      {token === 'paddington' && (
        <svg
          viewBox="0 0 64 64"
          className={`${className} drop-shadow-[0_1px_1.5px_rgba(2,6,23,0.72)]`}
          fill="none"
        >
          <circle cx="16" cy="30" r="6" fill="#FDE68A" />
          <circle cx="48" cy="30" r="6" fill="#FDE68A" />
          <circle
            cx="32"
            cy="39"
            r="16"
            fill="#FFFBEB"
            stroke="#FDE68A"
            strokeWidth="1.6"
          />
          {/* Iconic Wide-Brimmed Bush Hat */}
          <path
            d="M8 26C16 22 48 22 56 26C49 28.5 15 28.5 8 26Z"
            fill="#EF4444"
            stroke="#FFFBEB"
            strokeWidth="1.4"
          />
          <path
            d="M17 24.5L21 11.5C24.5 9.5 39.5 9.5 43 11.5L47 24.5H17Z"
            fill="#EF4444"
            stroke="#FFFBEB"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="25.5" cy="37" r="2.5" fill="#0F172A" />
          <circle cx="38.5" cy="37" r="2.5" fill="#0F172A" />
          <ellipse cx="32" cy="44.5" rx="6.5" ry="5" fill="#FDE68A" />
          <ellipse cx="32" cy="43" rx="2.8" ry="2" fill="#0F172A" />
        </svg>
      )}

      {/* 9. Гаррі Поттер — Iconic Round Glasses & Lightning Bolt Scar Relief */}
      {token === 'potter' && (
        <svg
          viewBox="0 0 64 64"
          className={`${className} drop-shadow-[0_1px_1.5px_rgba(2,6,23,0.72)]`}
          fill="none"
        >
          {/* Golden Lightning Scar */}
          <path
            d="M34.5 8L27.5 18.5H33.5L29.5 28.5L39 16.5H32.8L34.5 8Z"
            fill="#FDE047"
            stroke="#FFFBEB"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          {/* Round Wizard Eyeglasses */}
          <circle
            cx="20"
            cy="41"
            r="11"
            stroke="#FFFBEB"
            strokeWidth="4.2"
            fill="#0F172A"
            fillOpacity="0.28"
          />
          <circle
            cx="44"
            cy="41"
            r="11"
            stroke="#FFFBEB"
            strokeWidth="4.2"
            fill="#0F172A"
            fillOpacity="0.28"
          />
          <path
            d="M31 40C31.7 38.6 32.3 38.6 33 40"
            stroke="#FFFBEB"
            strokeWidth="3.8"
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* 10. Міккі Маус — Classic 3-Circle Mouse Ears Silhouette Relief */}
      {token === 'mickey' && (
        <svg
          viewBox="0 0 64 64"
          className={`${className} drop-shadow-[0_1px_1.5px_rgba(2,6,23,0.72)]`}
          fill="none"
        >
          <circle
            cx="15.5"
            cy="18.5"
            r="10.5"
            fill="#FFFBEB"
            stroke="#FDE68A"
            strokeWidth="1.6"
          />
          <circle
            cx="48.5"
            cy="18.5"
            r="10.5"
            fill="#FFFBEB"
            stroke="#FDE68A"
            strokeWidth="1.6"
          />
          <circle
            cx="32"
            cy="38.5"
            r="15.5"
            fill="#FFFBEB"
            stroke="#FDE68A"
            strokeWidth="1.8"
          />
        </svg>
      )}
    </>
  );
};

export const TOKEN_SCULPT_VERSION = 'v=sculpt4';

export const TOKEN_3D_IMAGE_MAP: Record<TokenId, string> = {
  tryzub: `/images/tokens/token-tryzub.png?${TOKEN_SCULPT_VERSION}`,
  patron: `/images/tokens/token-patron.png?${TOKEN_SCULPT_VERSION}`,
  mriya: `/images/tokens/token-mriya.png?${TOKEN_SCULPT_VERSION}`,
  kozak: `/images/tokens/token-kozak.png?${TOKEN_SCULPT_VERSION}`,
  kashtan: `/images/tokens/token-kashtan.png?${TOKEN_SCULPT_VERSION}`,
  bulava: `/images/tokens/token-bulava.png?${TOKEN_SCULPT_VERSION}`,
  kotyk: `/images/tokens/token-kotyk.png?${TOKEN_SCULPT_VERSION}`,
  paddington: `/images/tokens/token-paddington.png?${TOKEN_SCULPT_VERSION}`,
  potter: `/images/tokens/token-potter.png?${TOKEN_SCULPT_VERSION}`,
  mickey: `/images/tokens/token-mickey.png?${TOKEN_SCULPT_VERSION}`,
};

// Pin all 6 Retina 384x384 3D token sculptures in GPU memory so board movement has zero decode flicker
if (typeof window !== 'undefined') {
  for (const url of Object.values(TOKEN_3D_IMAGE_MAP)) {
    const img = new Image();
    img.decoding = 'sync';
    img.src = url;
  }
}

export const TokenAvatar: React.FC<{
  token: TokenId;
  color: string;
  size?: number;
  className?: string;
}> = ({ token, color, size = 34, className = '' }) => {
  const sculptSrc = TOKEN_3D_IMAGE_MAP[token];

  return (
    <div
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 50% 36%, ${color}4d 0%, #0d1527 64%, #050811 100%)`,
        borderColor: `color-mix(in srgb, ${color} 64%, rgba(253, 224, 71, 0.42))`,
        boxShadow: `0 5px 14px -3px rgba(2, 6, 23, 0.8), inset 0 1px 2px rgba(255, 255, 255, 0.26), 0 0 0 1px rgba(2, 6, 23, 0.75)`,
      }}
      className={`relative rounded-full overflow-hidden flex items-center justify-center border select-none shrink-0 ${className}`}
    >
      {sculptSrc ? (
        <div className="relative w-[92%] h-[92%] flex items-center justify-center pointer-events-none">
          <img
            src={sculptSrc}
            alt=""
            draggable={false}
            loading="eager"
            decoding="sync"
            className="w-full h-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.82)]"
          />
        </div>
      ) : (
        <TokenEmblemSvg token={token} className="w-[64%] h-[64%]" />
      )}
    </div>
  );
};

export function getBoardPawnLabel(
  playerName: string,
  isMe: boolean,
  compact: boolean
): string {
  if (isMe) return 'ВИ';
  const cleaned = playerName
    .replace(/\s*\(AI\)\s*/gi, '')
    .replace(/^(Пан|Пані)\s+/i, '')
    .trim();
  const firstWord = cleaned.split(/\s+/)[0] || 'Гравець';
  if (compact) {
    return firstWord.length > 5 ? `${firstWord.slice(0, 4)}.` : firstWord;
  }
  return firstWord.length > 6 ? `${firstWord.slice(0, 5)}.` : firstWord;
}

/**
 * Collector's-Edition 3D Sculpted Ukrainian Monopoly Figurine for the 40-Cell Board:
 * Bespoke 24K brushed-gold & jewel-enamel 3D sculpture (Tryzub, Crowned Lion, Mriya Jet,
 * Cossack Sabers, Emerald Chestnut, Hetman Bulava) standing on its own circular gold-and-enamel
 * Monopoly pedestal with a soft radial tabletop contact shadow and compact dot-free micro-plaque.
 */
export const BoardPawnToken: React.FC<{
  token: TokenId;
  color: string;
  label: string;
  fullName: string;
  isMe: boolean;
  isActiveTurn: boolean;
  isMoving?: boolean;
  headSize: number;
  showLabel?: boolean;
}> = ({
  token,
  color,
  label,
  fullName,
  isMe,
  isActiveTurn,
  isMoving = false,
  headSize,
  showLabel = true,
}) => {
  const figSize = Math.round(headSize * 1.25);
  const sculptSrc = TOKEN_3D_IMAGE_MAP[token];
  // Tuck micro-plaque flush onto the bottom gold rim while keeping 100% of the jewel-enamel pedestal band visible
  const plaqueOverlap = Math.max(3, Math.round(figSize * 0.085));

  return (
    <div
      title={isMe ? `${fullName} (Ваша фішка)` : fullName}
      style={{
        backfaceVisibility: 'hidden',
      }}
      className={`relative flex flex-col items-center select-none ${
        isActiveTurn && !isMoving ? '-translate-y-0.5' : ''
      }`}
    >
      {/* Crafted 3D-Shaded 24K Gold Turn Beacon Above Active Figurine */}
      {isActiveTurn && (
        <span
          style={{
            filter: 'drop-shadow(0 1.5px 2.5px rgba(2,6,23,0.95))',
          }}
          className={`-mb-1 ${isMoving ? '' : 'animate-bounce'} z-30 pointer-events-none`}
        >
          <svg
            viewBox="0 0 14 10"
            className="w-2.5 h-2"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7 9.2L1.4 1.6H12.6L7 9.2Z"
              fill="#FDE68A"
              stroke="#78350F"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
            <path d="M7 8.4L7 1.8H11.9L7 8.4Z" fill="#F59E0B" opacity="0.65" />
          </svg>
        </span>
      )}

      {/* Soft Radial Tabletop Contact Shadow & Signature "My Pawn" / Active Turn Aura (Zero Blur Cost) */}
      <span
        style={{
          width: Math.round(figSize * (isMe ? 0.8 : 0.72)),
          height: Math.max(6, Math.round(figSize * (isMe ? 0.25 : 0.22))),
          bottom: showLabel ? Math.max(6, Math.round(figSize * 0.14)) : 1,
          background: isActiveTurn
            ? `radial-gradient(ellipse at center, rgba(2, 6, 23, 0.94) 0%, ${color}cc 44%, rgba(251, 191, 36, 0.52) 72%, transparent 100%)`
            : isMe
              ? 'radial-gradient(ellipse at center, rgba(2, 6, 23, 0.92) 0%, rgba(16, 185, 129, 0.58) 52%, rgba(255, 255, 255, 0.26) 76%, transparent 100%)'
              : 'radial-gradient(ellipse at center, rgba(2, 6, 23, 0.92) 0%, rgba(2, 6, 23, 0.62) 52%, transparent 100%)',
        }}
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full z-[5]"
      />

      {/* Bespoke 3D Sculpted Ukrainian Figurine (Pinned 384x384 Retina Texture, Locked 120 FPS) */}
      <div
        style={{
          width: figSize,
          height: figSize,
          filter: isActiveTurn
            ? 'drop-shadow(0 1.5px 2px rgba(2, 6, 23, 0.96)) drop-shadow(0 4px 7px rgba(2, 6, 23, 0.85)) drop-shadow(0 0 6px rgba(251, 191, 36, 0.45))'
            : isMe
              ? 'drop-shadow(0 1.5px 2px rgba(2, 6, 23, 0.96)) drop-shadow(0 3.5px 6px rgba(2, 6, 23, 0.82)) drop-shadow(0 0 5px rgba(52, 211, 153, 0.42))'
              : 'drop-shadow(0 1.5px 2px rgba(2, 6, 23, 0.96)) drop-shadow(0 3.5px 6px rgba(2, 6, 23, 0.82))',
          backfaceVisibility: 'hidden',
        }}
        className="relative z-10 shrink-0 pointer-events-none"
      >
        {sculptSrc && (
          <img
            src={sculptSrc}
            alt={fullName}
            draggable={false}
            loading="eager"
            decoding="sync"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
            }}
            className="w-full h-full object-contain block"
          />
        )}
      </div>

      {/* Unmistakable Collector's Micro-Nameplate: Bright White + Emerald Ring for "ВИ", Vivid Solid Player-Color for Rivals */}
      {showLabel ? (
        <div
          style={
            isMe
              ? {
                  marginTop: -plaqueOverlap,
                  background:
                    'linear-gradient(180deg, #FFFFFF 0%, #E2E8F0 100%)',
                  borderColor: '#10B981',
                  boxShadow:
                    '0 0 0 1px rgba(2, 6, 23, 0.94), 0 0 8px rgba(16, 185, 129, 0.55), 0 2.5px 6px rgba(2, 6, 23, 0.92)',
                }
              : {
                  marginTop: -plaqueOverlap,
                  background: `linear-gradient(135deg, color-mix(in srgb, ${color} 88%, #020617) 0%, color-mix(in srgb, ${color} 64%, #020617) 100%)`,
                  borderColor: 'rgba(255, 255, 255, 0.56)',
                  boxShadow:
                    '0 0 0 1px rgba(2, 6, 23, 0.95), 0 2.5px 6px rgba(2, 6, 23, 0.92)',
                }
          }
          className="relative z-20 px-[5.5px] py-[1.5px] rounded-[5px] border-[1.25px] flex items-center justify-center gap-[2.5px] leading-none whitespace-nowrap"
        >
          {isMe && (
            <span
              style={{ backgroundColor: color }}
              className="w-[5.5px] h-[5.5px] rounded-full shrink-0 ring-[0.75px] ring-slate-950/65"
            />
          )}
          <span
            style={
              isMe
                ? undefined
                : { textShadow: '0 1px 1.5px rgba(2, 6, 23, 0.92)' }
            }
            className={`text-[7.5px] sm:text-[8.2px] font-black tracking-tight ${
              isMe ? 'text-slate-950' : 'text-white'
            }`}
          >
            {label}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export const CARD_ART_VERSION = 'v=velvet2';

export function withCardArtVersion(path: string): string {
  return path.includes('?')
    ? `${path}&${CARD_ART_VERSION}`
    : `${path}?${CARD_ART_VERSION}`;
}

/**
 * Balanced, eye-resting studio tone calibration so 3D card illustrations
 * remain crisp, warm, and clearly recognizable without harsh glare or neon contrast jumps.
 */
export function getImageExposureClass(imageSrc: string): string {
  if (imageSrc.includes('/cell-') || imageSrc.includes('card-karpaty')) {
    return 'brightness-[0.98] dark:brightness-[0.89] contrast-[0.98] dark:contrast-[0.96] saturate-[0.94] dark:saturate-[0.90]';
  }
  if (
    imageSrc.includes('sector-telecom-5g') ||
    imageSrc.includes('sector-global-tech') ||
    imageSrc.includes('sector-power-drones') ||
    imageSrc.includes('sector-delivery-post') ||
    imageSrc.includes('sector-transport-hub') ||
    imageSrc.includes('card-smart-contract') ||
    imageSrc.includes('card-zsu-shield') ||
    imageSrc.includes('card-auction') ||
    imageSrc.includes('sector-aviation-port')
  ) {
    return 'brightness-[1.06] dark:brightness-[1.10] contrast-[0.98] saturate-[0.90]';
  }
  if (
    imageSrc.includes('ukraine-metropolis') ||
    imageSrc.includes('hero-lion-daylight') ||
    imageSrc.includes('showcase-auction-day')
  ) {
    return 'brightness-[0.97] dark:brightness-[0.90] contrast-[0.98] saturate-[0.92]';
  }
  return 'brightness-[1.02] dark:brightness-[1.04] contrast-[0.98] saturate-[0.90]';
}

export function getImageZoomClass(imageSrc: string): string {
  if (imageSrc.includes('/cell-')) {
    return 'scale-[1.03] group-hover:scale-[1.10]';
  }
  if (
    imageSrc.includes('ukraine-metropolis') ||
    imageSrc.includes('card-karpaty') ||
    imageSrc.includes('hero-lion-magnate')
  ) {
    return 'scale-[1.06] group-hover:scale-[1.13]';
  }
  // Zoom slightly into isometric 3D diorama islands so colorful buildings fill 100% of the card without dark studio margins!
  return 'scale-[1.18] group-hover:scale-[1.25]';
}

/**
 * Maps every sector ID to its dedicated 3D studio illustration
 */
export function getSectorVisualImage(sectorId: SectorId): string {
  const raw = (() => {
    switch (sectorId) {
      case 'fintech':
        return '/images/card-fintech-towers.jpg';
      case 'tech':
        return '/images/sector-global-tech.jpg';
      case 'telecom':
        return '/images/sector-telecom-5g.jpg';
      case 'ecommerce':
        return '/images/sector-ecommerce-mall.jpg';
      case 'fuel':
        return '/images/sector-fuel-energy.jpg';
      case 'delivery':
        return '/images/sector-delivery-post.jpg';
      case 'retail':
        return '/images/sector-retail-market.jpg';
      case 'coffee':
        return '/images/sector-coffee-bakery.jpg';
      case 'transport':
        return '/images/sector-transport-hub.jpg';
      case 'utility':
        return '/images/sector-power-drones.jpg';
      default:
        return '/images/card-fintech-towers.jpg';
    }
  })();
  return withCardArtVersion(raw);
}

/**
 * Maps EVERY SINGLE unique card (`brandKey`) on the 40-cell board 1-to-1 to its
 * own dedicated high-resolution 3D studio illustration directly depicting the
 * exact theme and Ukrainian name of that card!
 */
export function getCellVisualArtwork(cell: BoardCell): {
  imageSrc: string;
  objectPosition: string;
} {
  const mapped = ((): { imageSrc: string; objectPosition: string } => {
    switch (cell.brandKey) {
    // === FINTECH ===
    case 'neobank_lev':
      return {
        imageSrc: '/images/hero-lion-magnate.jpg',
        objectPosition: '50% 18%',
      };
    case 'narodnyi_bank':
      return {
        imageSrc: '/images/card-fintech-towers.jpg',
        objectPosition: '50% 38%',
      };

    // === COFFEE & BAKERY ===
    case 'bakery':
      return {
        imageSrc: '/images/sector-coffee-bakery.jpg',
        objectPosition: '52% 48%',
      };
    case 'podil_kava':
      return {
        imageSrc: '/images/cell-podil-kava.jpg',
        objectPosition: '52% 62%',
      };

    // === MODERN RETAIL ===
    case 'market24':
      return {
        imageSrc: '/images/sector-retail-market.jpg',
        objectPosition: '48% 50%',
      };
    case 'syaivo':
      return {
        imageSrc: '/images/cell-syaivo-market.jpg',
        objectPosition: '52% 45%',
      };
    case 'lavka_smaku':
      return {
        imageSrc: '/images/cell-lavka-smaku.jpg',
        objectPosition: '48% 58%',
      };

    // === EXPRESS DELIVERY & POST ===
    case 'kozak_post':
      return {
        imageSrc: '/images/cell-kozak-post.jpg',
        objectPosition: '50% 58%',
      };
    case 'mist_express':
      return {
        imageSrc: '/images/cell-mist-express.jpg',
        objectPosition: '50% 52%',
      };
    case 'blyskavka':
      return {
        imageSrc: '/images/sector-delivery-post.jpg',
        objectPosition: '52% 45%',
      };

    // === HIGHWAY FUEL & EV ===
    case 'nafta_karpat':
      return {
        imageSrc: '/images/cell-nafta-karpat.jpg',
        objectPosition: '50% 54%',
      };
    case 'mustang_oil':
      return {
        imageSrc: '/images/cell-mustang-oil.jpg',
        objectPosition: '46% 48%',
      };
    case 'puls_azk':
      return {
        imageSrc: '/images/sector-fuel-energy.jpg',
        objectPosition: '52% 48%',
      };

    // === E-COMMERCE & HYPERMARKETS ===
    case 'yarmarok':
      return {
        imageSrc: '/images/sector-ecommerce-mall.jpg',
        objectPosition: '48% 45%',
      };
    case 'megabud':
      return {
        imageSrc: '/images/cell-megabud.jpg',
        objectPosition: '50% 46%',
      };
    case 'koshyk':
      return {
        imageSrc: '/images/cell-koshyk-ua.jpg',
        objectPosition: '50% 48%',
      };

    // === TELECOM & 5G ===
    case 'khvylia':
      return {
        imageSrc: '/images/cell-khvylia-mobile.jpg',
        objectPosition: '50% 48%',
      };
    case 'lifepuls':
      return {
        imageSrc: '/images/cell-lifepuls.jpg',
        objectPosition: '50% 44%',
      };
    case 'zirka_telecom':
      return {
        imageSrc: '/images/sector-telecom-5g.jpg',
        objectPosition: '52% 42%',
      };

    // === GLOBAL TECH & AI ===
    case 'cyberlapa':
      return {
        imageSrc: '/images/sector-global-tech.jpg',
        objectPosition: '48% 44%',
      };
    case 'slovo_ai':
      return {
        imageSrc: '/images/cell-slovo-ai.jpg',
        objectPosition: '52% 48%',
      };
    case 'oberig':
      return {
        imageSrc: '/images/cell-oberig-systems.jpg',
        objectPosition: '54% 52%',
      };

    // === STRATEGIC TRANSPORT ===
    case 'rail_express':
      return {
        imageSrc: '/images/sector-transport-hub.jpg',
        objectPosition: '50% 42%',
      };
    case 'strila_taxi':
      return {
        imageSrc: '/images/cell-strila-taxi.jpg',
        objectPosition: '50% 56%',
      };
    case 'sea_port':
      return {
        imageSrc: '/images/cell-sea-port.jpg',
        objectPosition: '48% 52%',
      };
    case 'kryla_cargo':
      return {
        imageSrc: '/images/cell-kryla-cargo.jpg',
        objectPosition: '50% 44%',
      };

    // === CRITICAL INFRASTRUCTURE & SPECIALS ===
    case 'gov_cloud':
      return {
        imageSrc: '/images/cell-gov-cloud.jpg',
        objectPosition: '50% 44%',
      };
    case 'energo_grid':
      return {
        imageSrc: '/images/sector-power-drones.jpg',
        objectPosition: '52% 58%',
      };
    case 'megazbir':
      return {
        imageSrc: '/images/cell-megazbir.jpg',
        objectPosition: '50% 46%',
      };
    case 'defense_fund':
      return {
        imageSrc: '/images/cell-defense-fund.jpg',
        objectPosition: '42% 48%',
      };
    case 'gov_push':
      return {
        imageSrc: '/images/card-smart-contract.jpg',
        objectPosition: '48% 46%',
      };
    case 'unity_fund':
      return {
        imageSrc: '/images/card-zsu-shield.jpg',
        objectPosition: '50% 42%',
      };
    case 'start':
      return {
        imageSrc: '/images/cell-start-gate.jpg',
        objectPosition: '50% 48%',
      };
    case 'karpaty':
      return {
        imageSrc: '/images/card-karpaty.jpg',
        objectPosition: '50% 44%',
      };
    case 'jail':
      return {
        imageSrc: '/images/cell-jail-isolator.jpg',
        objectPosition: '50% 48%',
      };
    case 'raid':
      return {
        imageSrc: '/images/cell-spec-raid.jpg',
        objectPosition: '50% 60%',
      };
    default:
      return {
        imageSrc: '/images/card-fintech-towers.jpg',
        objectPosition: '50% 40%',
      };
  }
  })();

  return {
    imageSrc: withCardArtVersion(mapped.imageSrc),
    objectPosition: mapped.objectPosition,
  };
}

/**
 * Glossy 3D Squircle App-Icon Shell for all 35 Original Ukrainian Brand Logos
 */
const GlossyIconShell: React.FC<{
  dimClass: string;
  bgStyle: string;
  children: React.ReactNode;
}> = ({ dimClass, bgStyle, children }) => (
  <div
    style={{
      background: bgStyle,
      boxShadow:
        '0 5px 12px -2px rgba(0,0,0,0.55), inset 0 1.5px 1px rgba(255,255,255,0.45), inset 0 -2px 3px rgba(0,0,0,0.35)',
    }}
    className={`${dimClass} relative flex items-center justify-center shrink-0 select-none overflow-hidden ring-1 ring-white/30`}
  >
    {/* Top Specular Glass Sheen */}
    <div className="absolute inset-x-0 top-0 h-[46%] bg-gradient-to-b from-white/28 to-transparent pointer-events-none" />
    <div className="relative z-10 w-full h-full flex items-center justify-center drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.45)]">
      {children}
    </div>
  </div>
);

/**
 * 100% Original Glossy 3D Geometric Ukrainian Brand Emblems (Zero Trademark Conflicts)
 */
export const BrandEmblem: React.FC<{
  brandKey: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}> = ({ brandKey, size = 'sm' }) => {
  const dim =
    size === 'xl'
      ? 'w-14 h-14 rounded-2xl'
      : size === 'lg'
        ? 'w-11 h-11 rounded-2xl'
        : size === 'md'
          ? 'w-8 h-8 rounded-[11px]'
          : size === 'xs'
            ? 'w-5.5 h-5.5 rounded-[7px]'
            : 'w-6.5 h-6.5 rounded-[9px]';

  switch (brandKey) {
    case 'start':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(135deg, #0057B8 0%, #2563EB 52%, #FACC15 100%)"
        >
          <TryzubLogo className="w-[68%] h-[68%] text-white" />
        </GlossyIconShell>
      );

    case 'neobank_lev':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #1E293B 0%, #090D16 65%, #312E81 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[80%] h-[80%]" fill="none">
            <path
              d="M6.5 11.5L11 7L16 11.2L21 7L25.5 11.5L23.2 22.5H8.8L6.5 11.5Z"
              fill="#FBBF24"
            />
            <path d="M10 13.5L16 10L22 13.5L20.5 21H11.5L10 13.5Z" fill="#FEF3C7" />
            <circle cx="13.2" cy="16.5" r="1.4" fill="#0F172A" />
            <circle cx="18.8" cy="16.5" r="1.4" fill="#0F172A" />
            <path
              d="M9.5 25.5H22.5"
              stroke="#38BDF8"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'narodnyi_bank':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #10B981 0%, #047857 60%, #064E3B 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <path d="M5 12L16 5.2L27 12H5Z" fill="#FDE047" />
            <path
              d="M8.5 14.5V22.5M13.5 14.5V22.5M18.5 14.5V22.5M23.5 14.5V22.5M5.5 24.8H26.5"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'blyskavka':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #FB7185 0%, #E11D48 55%, #9F1239 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[80%] h-[80%]" fill="none">
            <path
              d="M18.8 4.5L8 17.5H15.5L13.2 27.5L24 14.5H16.5L18.8 4.5Z"
              fill="#FEF08A"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'kozak_post':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #FBBF24 0%, #D97706 60%, #92400E 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <rect x="5" y="8" width="22" height="16" rx="3.5" fill="#0F172A" />
            <path
              d="M6.8 9.8L16 17.2L25.2 9.8"
              stroke="#FDE047"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'mist_express':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #38BDF8 0%, #2563EB 55%, #1E3A8A 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[80%] h-[80%]" fill="none">
            <path
              d="M4.5 21C8.5 12.5 23.5 12.5 27.5 21"
              stroke="#FFFFFF"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <path
              d="M10 16.5V24M16 14.5V24M22 16.5V24M4 24.2H28"
              stroke="#FDE047"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'gov_cloud':
    case 'gov_push':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #0EA5E9 0%, #1E293B 55%, #0F172A 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <path
              d="M16 4.5L19.4 12.6L27.5 16L19.4 19.4L16 27.5L12.6 19.4L4.5 16L12.6 12.6L16 4.5Z"
              fill="#7DD3FC"
            />
            <circle cx="16" cy="16" r="3.2" fill="#FEF08A" />
          </svg>
        </GlossyIconShell>
      );

    case 'unity_fund':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #2563EB 0%, #0284C7 45%, #FACC15 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[76%] h-[76%]" fill="none">
            <path
              d="M16 26.5C16 26.5 5.8 20 5.8 12.3C5.8 9 8.5 6.6 11.6 6.6C13.7 6.6 15.2 7.7 16 9.1C16.8 7.7 18.3 6.6 20.4 6.6C23.5 6.6 26.2 9 26.2 12.3C26.2 20 16 26.5 16 26.5Z"
              fill="#FFFFFF"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'rail_express':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #3B82F6 0%, #1D4ED8 58%, #172554 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[82%] h-[82%]" fill="none">
            <path
              d="M5 10.5H20.5C24.5 10.5 27.5 13.5 27.5 17.5V20.5H8.5L5 10.5Z"
              fill="#FFFFFF"
            />
            <path
              d="M10.5 14H22.5"
              stroke="#1D4ED8"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M4 24H28"
              stroke="#FACC15"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'strila_taxi':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #FEF08A 0%, #FACC15 55%, #CA8A04 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[76%] h-[76%]" fill="none">
            <path d="M6.5 15L25.5 6.8L17.2 25.5L14.4 17.6L6.5 15Z" fill="#090D16" />
          </svg>
        </GlossyIconShell>
      );

    case 'sea_port':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #0EA5E9 0%, #0369A1 58%, #082F49 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[76%] h-[76%]" fill="none">
            <circle cx="16" cy="8.8" r="2.8" stroke="#FDE047" strokeWidth="2.5" />
            <path
              d="M16 11.8V25M10.8 15H21.2M7.8 20C7.8 24.2 12 26.2 16 26.2C20 26.2 24.2 24.2 24.2 20"
              stroke="#FFFFFF"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'kryla_cargo':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #60A5FA 0%, #2563EB 55%, #1E3A8A 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[80%] h-[80%]" fill="none">
            <path
              d="M16 4.5L18.2 11V15.8L28 20.8V23.5L18.2 20.5V25.8L22.2 27.8V29.5L16 28L9.8 29.5V27.8L13.8 25.8V20.5L4 23.5V20.8L13.8 15.8V11L16 4.5Z"
              fill="#FFFFFF"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'lavka_smaku':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #FB923C 0%, #EA580C 58%, #9A3412 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <path d="M7.5 13H24.5L22.2 24.5H9.8L7.5 13Z" fill="#FFFFFF" />
            <path
              d="M12 13V10C12 7.8 13.8 6 16 6C18.2 6 20 7.8 20 10V13"
              stroke="#FDE047"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <circle cx="16" cy="18.5" r="2.6" fill="#EA580C" />
          </svg>
        </GlossyIconShell>
      );

    case 'market24':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #38BDF8 0%, #0284C7 58%, #075985 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[80%] h-[80%]" fill="none">
            <path
              d="M6.5 8.5H9.8L12.2 19.5H22.8L25.5 11.5H11"
              stroke="#FFFFFF"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="13.5" cy="24" r="2.3" fill="#FDE047" />
            <circle cx="21.2" cy="24" r="2.3" fill="#FDE047" />
          </svg>
        </GlossyIconShell>
      );

    case 'syaivo':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #FEF08A 0%, #EAB308 58%, #A16207 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <circle cx="16" cy="16" r="5.2" fill="#0F172A" />
            <path
              d="M16 4.8V8.5M16 23.5V27.2M4.8 16H8.5M23.5 16H27.2M8.3 8.3L11 11M21 21L23.7 23.7M23.7 8.3L21 11M11 21L8.3 23.7"
              stroke="#0F172A"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'bakery':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #D97706 0%, #92400E 58%, #451A03 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[80%] h-[80%]" fill="none">
            <path
              d="M5.5 21.5C5.5 13.5 10.8 8.8 16 8.8C21.2 8.8 26.5 13.5 26.5 21.5C23.2 21.5 21.5 18.2 19.5 17.2C17.5 16.2 14.5 16.2 12.5 17.2C10.5 18.2 8.8 21.5 5.5 21.5Z"
              fill="#FDE047"
            />
            <path
              d="M12.5 9.8V17.2M19.5 9.8V17.2"
              stroke="#78350F"
              strokeWidth="2"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'podil_kava':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #F97316 0%, #C2410C 58%, #7C2D12 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <path d="M8.5 13H21.2L19.6 25H10.2L8.5 13Z" fill="#FFFFFF" />
            <path
              d="M21.2 15H23.6C25 15 25.8 16 25.8 17.3C25.8 18.6 24.8 19.6 23.2 19.6H20.5"
              stroke="#FFFFFF"
              strokeWidth="2.3"
            />
            <path
              d="M12.8 9.5C12.8 7.8 14.8 7.5 14.8 5.8M17.5 9.5C17.5 7.8 19.5 7.5 19.5 5.8"
              stroke="#FDE047"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'puls_azk':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #FB923C 0%, #EA580C 55%, #9A3412 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[80%] h-[80%]" fill="none">
            <path
              d="M4.5 16H10.2L13.5 8.5L18.2 23.5L21.8 16H27.5"
              stroke="#FEF08A"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'mustang_oil':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #22C55E 0%, #15803D 58%, #14532D 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <rect
              x="8.5"
              y="7"
              width="10.5"
              height="18"
              rx="2"
              stroke="#FFFFFF"
              strokeWidth="2.4"
            />
            <rect x="11.2" y="10.5" width="5.2" height="4.5" rx="1" fill="#FDE047" />
            <path
              d="M19 12L23.8 15V21.5C23.8 22.8 22.8 23.5 21.8 23.5"
              stroke="#FDE047"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'nafta_karpat':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #38BDF8 0%, #0369A1 58%, #0C4A6E 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[76%] h-[76%]" fill="none">
            <path
              d="M16 4.8C16 4.8 8.2 13.5 8.2 19.2C8.2 23.5 11.7 26.8 16 26.8C20.3 26.8 23.8 23.5 23.8 19.2C23.8 13.5 16 4.8 16 4.8Z"
              fill="#FFFFFF"
            />
            <circle cx="16" cy="20" r="3.8" fill="#F97316" />
          </svg>
        </GlossyIconShell>
      );

    case 'koshyk':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #F87171 0%, #DC2626 58%, #991B1B 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <rect
              x="7"
              y="11"
              width="18"
              height="14.5"
              rx="3.2"
              fill="#FFFFFF"
            />
            <path
              d="M12 11V8.8C12 6.6 13.8 5 16 5C18.2 5 20 6.6 20 8.8V11"
              stroke="#FDE047"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <circle cx="16" cy="18.2" r="3" fill="#DC2626" />
          </svg>
        </GlossyIconShell>
      );

    case 'megabud':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #60A5FA 0%, #1D4ED8 58%, #1E3A8A 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <path
              d="M5.5 15L16 6.5L26.5 15V25.5H20V18.5H12V25.5H5.5V15Z"
              fill="#FFFFFF"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'yarmarok':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #A78BFA 0%, #7C3AED 58%, #4C1D95 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[76%] h-[76%]" fill="none">
            <path d="M7.5 8.5H18L25.5 16L16 25.5L7.5 17V8.5Z" fill="#FFFFFF" />
            <circle cx="12.5" cy="13.5" r="2.2" fill="#7C3AED" />
          </svg>
        </GlossyIconShell>
      );

    case 'zirka_telecom':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #38BDF8 0%, #0284C7 55%, #1E3A8A 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[80%] h-[80%]" fill="none">
            <path
              d="M16 4.5L18.8 13.2L27.5 16L18.8 18.8L16 27.5L13.2 18.8L4.5 16L13.2 13.2L16 4.5Z"
              fill="#FDE047"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'lifepuls':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #FEF08A 0%, #FACC15 55%, #CA8A04 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <circle
              cx="16"
              cy="16"
              r="9.2"
              stroke="#090D16"
              strokeWidth="2.8"
            />
            <circle cx="16" cy="16" r="3.8" fill="#090D16" />
          </svg>
        </GlossyIconShell>
      );

    case 'khvylia':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #818CF8 0%, #4F46E5 58%, #312E81 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <path
              d="M5.5 19.5C8.8 14 12.8 14 16 19.5C19.2 25 23.2 25 26.5 19.5M5.5 13C8.8 7.5 12.8 7.5 16 13C19.2 18.5 23.2 18.5 26.5 13"
              stroke="#FFFFFF"
              strokeWidth="2.7"
              strokeLinecap="round"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'energo_grid':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #2DD4BF 0%, #0D9488 58%, #134E4A 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <path
              d="M18.2 4L7.8 17.5H15.5L13.2 28L24.2 14.5H16.5L18.2 4Z"
              fill="#FEF08A"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'cyberlapa':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #1E293B 0%, #0F172A 60%, #064E3B 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <rect
              x="9"
              y="9"
              width="14"
              height="14"
              rx="3"
              stroke="#34D399"
              strokeWidth="2.5"
            />
            <rect x="13" y="13" width="6" height="6" rx="1.2" fill="#FDE047" />
            <path
              d="M13 4.8V9M19 4.8V9M13 23V27.2M19 23V27.2M4.8 13H9M4.8 19H9M23 13H27.2M23 19H27.2"
              stroke="#34D399"
              strokeWidth="2.1"
              strokeLinecap="round"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'slovo_ai':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #34D399 0%, #10B981 55%, #047857 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <path
              d="M6.8 9.5C6.8 8 8 6.8 9.5 6.8H22.5C24 6.8 25.2 8 25.2 9.5V18.5C25.2 20 24 21.2 22.5 21.2H13L7.8 25.8V21.2H9.5C8 21.2 6.8 20 6.8 18.5V9.5Z"
              fill="#FFFFFF"
            />
            <path
              d="M11.8 13.8H20.2M11.8 17.2H17"
              stroke="#047857"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'oberig':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #0E7490 0%, #0F172A 60%, #022C22 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <path
              d="M16 4.8L25.2 8.8V16.5C25.2 22 21.2 26 16 27.8C10.8 26 6.8 22 6.8 16.5V8.8L16 4.8Z"
              stroke="#FFFFFF"
              strokeWidth="2.5"
            />
            <circle cx="16" cy="16" r="4.2" stroke="#38BDF8" strokeWidth="2.5" />
          </svg>
        </GlossyIconShell>
      );

    case 'defense_fund':
    case 'megazbir':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #4D7C0F 0%, #365314 58%, #1A2E05 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[80%] h-[80%]" fill="none">
            <path
              d="M13 4.8H19L17.8 13.2L27.2 12V18L17.8 16.8L19 27.2H13L14.2 16.8L4.8 18V12L14.2 13.2L13 4.8Z"
              fill="#FACC15"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'jail':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #64748B 0%, #334155 58%, #0F172A 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[76%] h-[76%]" fill="none">
            <rect
              x="6"
              y="6"
              width="20"
              height="20"
              rx="3"
              stroke="#FFFFFF"
              strokeWidth="2.4"
            />
            <path
              d="M12.5 6V26M19.5 6V26"
              stroke="#FBBF24"
              strokeWidth="2.5"
            />
          </svg>
        </GlossyIconShell>
      );

    case 'karpaty':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #34D399 0%, #059669 58%, #064E3B 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[80%] h-[80%]" fill="none">
            <path d="M4 25L13 9.8L19 19L22.5 13.8L28 25H4Z" fill="#FFFFFF" />
            <circle cx="23.2" cy="8.8" r="2.8" fill="#FDE047" />
          </svg>
        </GlossyIconShell>
      );

    case 'raid':
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #F87171 0%, #DC2626 55%, #7F1D1D 100%)"
        >
          <svg viewBox="0 0 32 32" className="w-[78%] h-[78%]" fill="none">
            <path
              d="M16 4.5L25.5 8.5V16C25.5 21.8 21.5 26 16 28C10.5 26 6.5 21.8 6.5 16V8.5L16 4.5Z"
              fill="#FFFFFF"
            />
            <circle cx="16" cy="15.5" r="4.2" fill="#DC2626" />
          </svg>
        </GlossyIconShell>
      );

    default:
      return (
        <GlossyIconShell
          dimClass={dim}
          bgStyle="linear-gradient(145deg, #334155 0%, #0F172A 100%)"
        >
          <span className="text-white font-black text-[10px]">UA</span>
        </GlossyIconShell>
      );
  }
};

/**
 * Rich 3D Illustrated Header Banner for EVERY sector, card, purchase, and event!
 */
export const CardVisualBanner: React.FC<{
  cell: BoardCell;
  heightClass?: string;
}> = ({ cell, heightClass = 'h-36' }) => {
  const { imageSrc, objectPosition } = getCellVisualArtwork(cell);
  const exposureClass = getImageExposureClass(imageSrc);
  const accent = cell.color || '#2563EB';
  const formattedPrice = cell.price
    ? `${cell.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₴`
    : cell.taxAmount
      ? `-${cell.taxAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₴`
      : cell.subtitle || null;

  return (
    <div
      className={`w-full ${heightClass} rounded-2xl relative overflow-hidden border border-slate-300/70 dark:border-slate-700/75 shadow-md select-none`}
      style={{
        background: `radial-gradient(circle at 82% 20%, ${accent}33, transparent 62%), linear-gradient(135deg, #0d1424 0%, #151f33 100%)`,
      }}
    >
      <img
        src={imageSrc}
        alt={cell.name}
        decoding="async"
        style={{ objectPosition }}
        className={`w-full h-full object-cover opacity-100 ${exposureClass} transition-transform duration-500 hover:scale-105`}
      />

      {/* Subtle Bottom Text Scrim Inside Large Inspector/Modal Banner Only */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950/84 via-slate-950/38 to-transparent" />

      {/* Top-Right Price / Event Badge */}
      {formattedPrice && (
        <div className="absolute top-2 right-2 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl bg-slate-950/82 backdrop-blur-md border border-white/20 text-[10.5px] sm:text-[11px] font-display font-extrabold text-amber-300 tabular-nums whitespace-nowrap shadow">
          {formattedPrice}
        </div>
      )}

      {/* Sector Accent Pill Top-Left */}
      {cell.sectorName && (
        <div className="absolute top-2 left-2 px-2 py-0.5 sm:px-2.5 rounded-full bg-slate-950/78 backdrop-blur-md border border-white/15 flex items-center gap-1.5 max-w-[54%]">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: accent }}
          />
          <span className="text-[9px] sm:text-[9.5px] font-extrabold uppercase tracking-wider text-slate-100 truncate">
            {cell.sectorName}
          </span>
        </div>
      )}

      <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BrandEmblem brandKey={cell.brandKey} size="md" />
          <div className="min-w-0 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.98),0_2px_8px_rgba(0,0,0,0.95),0_0_4px_rgba(0,0,0,0.9)]">
            <div className="font-display font-extrabold text-xs sm:text-sm 2xl:text-[15px] leading-tight truncate">
              {cell.name}
            </div>
            {cell.rent && cell.type === 'company' && (
              <div className="text-[10px] 2xl:text-[10.5px] font-bold text-slate-100 tabular-nums truncate mt-0.5">
                Оренда: {cell.rent[0]} ₴ • Філія: {cell.branchCost} ₴
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
