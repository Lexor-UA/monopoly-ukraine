import { AnimatePresence, motion, type Transition } from 'framer-motion';
import { RotateCcw, Shield, Sparkles, Zap } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { EventCardDisplay, Player } from '../shared/types';
import { sound } from '../utils/sound';
import { TokenAvatar, withCardArtVersion } from './UkrainianArtwork';

const HAND_ASSET_VERSION = 'v=cinema2';
export const MAGNATE_HAND_FULL_URL = `/images/magnate-hand-full.png?${HAND_ASSET_VERSION}`;
export const MAGNATE_HAND_THUMB_URL = `/images/magnate-hand-thumb.png?${HAND_ASSET_VERSION}`;

// Pre-decode & pin both 640x800 Retina 3D hand layers in GPU memory for locked 120 FPS first-draw playback
if (typeof window !== 'undefined') {
  for (const url of [MAGNATE_HAND_FULL_URL, MAGNATE_HAND_THUMB_URL]) {
    const img = new Image();
    img.decoding = 'sync';
    img.src = url;
  }
}

/**
 * Maps each of the 16 Ukrainian event cards to its bespoke 3D studio illustration
 */
export function getEventCardArtwork(card: EventCardDisplay): string {
  const b = card.badge.toLowerCase();
  const t = card.title.toLowerCase();

  const raw = (() => {
    if (b.includes('залізний експрес')) return '/images/sector-transport-hub.jpg';
    if (b.includes('фінтех саміт') || t.includes('необанк'))
      return '/images/card-fintech-towers.jpg';
    if (b.includes('фінмоніторинг') || t.includes('офшор'))
      return '/images/cell-jail-isolator.jpg';
    if (b.includes('енергонезалежність') || t.includes('живлення'))
      return '/images/sector-power-drones.jpg';
    if (
      b.includes('імунітет') ||
      b.includes('грант') ||
      b.includes('кешбек')
    )
      return '/images/card-smart-contract.jpg';
    if (b.includes('облігації')) return '/images/cell-gov-cloud.jpg';

    if (b.includes('волонтерський') || t.includes('захист неба'))
      return '/images/card-zsu-shield.jpg';
    if (b.includes('відновлення') || t.includes('карпат'))
      return '/images/card-karpaty.jpg';
    if (b.includes('експрес-логістика') || t.includes('сортувального'))
      return '/images/sector-delivery-post.jpg';
    if (b.includes('майдан свободи') || t.includes('фінансовий рік'))
      return '/images/cell-start-gate.jpg';
    if (b.includes('експортний') || t.includes('морський коридор'))
      return '/images/cell-sea-port.jpg';
    if (b.includes('ринковий регулятор') || t.includes('штраф'))
      return '/images/cell-spec-raid.jpg';
    if (b.includes('діаспора') || t.includes('венчурні'))
      return '/images/sector-global-tech.jpg';

    return card.deck === 'diia'
      ? '/images/card-smart-contract.jpg'
      : '/images/card-zsu-shield.jpg';
  })();

  return withCardArtVersion(raw);
}

/**
 * Layer 1 (UNDER the card, z-10):
 * Photorealistic 3D studio-rendered Magnate / VIP Croupier full forearm & hand
 * (bespoke midnight-navy Italian wool suit sleeve with gold buttons, crisp woven white French cuff
 * with 24K gold & sapphire cufflink, 18K rose-gold Swiss chronograph watch, realistic human skin,
 * and curled index finger bracing the back edge of the card) + volumetric stage rim spotlight.
 *
 * Coordinate system (320x400 CSS px / 640x800 Retina):
 * Card left border = x:160 (50%), card bottom border = y:150 (37.5%), saddle pinch pivot = (50%, 34%).
 */
const MagnateHandUnderLayer: React.FC<{
  mirrored?: boolean;
  accentGold?: boolean;
  className?: string;
}> = ({ mirrored = false, accentGold = false, className = '' }) => (
  <div
    style={{ transform: mirrored ? 'scaleX(-1)' : undefined }}
    className={`pointer-events-none select-none relative ${className}`}
  >
    {/* Warm / Sapphire Volumetric Stage Backlight Illuminating Sleeve, Chronograph & Hand Silhouette */}
    <div
      style={{
        left: '6%',
        top: '12%',
        width: '84%',
        height: '72%',
        background: accentGold
          ? 'radial-gradient(circle at 52% 44%, rgba(251, 191, 36, 0.34) 0%, rgba(245, 158, 11, 0.14) 48%, rgba(2, 6, 23, 0) 76%)'
          : 'radial-gradient(circle at 52% 44%, rgba(56, 189, 248, 0.34) 0%, rgba(14, 165, 233, 0.14) 48%, rgba(2, 6, 23, 0) 76%)',
      }}
      className="absolute rounded-full"
    />

    {/* Grounded Soft Tabletop Cast Shadow Beneath Forearm & Wrist */}
    <div
      style={{
        left: '6%',
        top: '34%',
        width: '58%',
        height: '46%',
        transform: 'rotate(-54deg)',
        background:
          'radial-gradient(ellipse at center, rgba(2, 6, 23, 0.72) 0%, rgba(2, 6, 23, 0.36) 52%, transparent 78%)',
      }}
      className="absolute rounded-full"
    />

    {/* Full Photorealistic 640x800 Retina 3D Magnate Hand & Suit Sleeve */}
    <img
      src={MAGNATE_HAND_FULL_URL}
      alt=""
      draggable={false}
      loading="eager"
      decoding="sync"
      style={{
        filter:
          'drop-shadow(0 16px 26px rgba(2, 6, 23, 0.82)) drop-shadow(0 4px 10px rgba(2, 6, 23, 0.65))',
        backfaceVisibility: 'hidden',
      }}
      className="relative w-full h-full object-contain block"
    />
  </div>
);

/**
 * Layer 3 (OVER the card face, z-30 — isolated outside 3D preserve-3d so NEVER depth-clipped!):
 * Pixel-locked foreground 3D Thumb pressing naturally across the card's lower corner,
 * seamlessly aligned 1:1 with MagnateHandUnderLayer beneath the card.
 */
const MagnateHandThumbOverLayer: React.FC<{
  mirrored?: boolean;
  className?: string;
}> = ({ mirrored = false, className = '' }) => (
  <div
    style={{ transform: mirrored ? 'scaleX(-1)' : undefined }}
    className={`pointer-events-none select-none relative ${className}`}
  >
    <img
      src={MAGNATE_HAND_THUMB_URL}
      alt=""
      draggable={false}
      loading="eager"
      decoding="sync"
      style={{
        filter: 'drop-shadow(2px 4px 5px rgba(2, 6, 23, 0.45))',
        backfaceVisibility: 'hidden',
      }}
      className="w-full h-full object-contain block"
    />
  </div>
);

/**
 * Physical 3D Stacked Side Deck on the Left («Цифровий Пуш») or Right («Фонд Єдності») of the Center Arena
 */
export const SideCardDeckStack: React.FC<{
  deck: 'diia' | 'unity';
  isDealing: boolean;
  isTopCardLifted: boolean;
  deckRef?: React.RefObject<HTMLDivElement | null>;
  onClick: () => void;
}> = ({ deck, isDealing, isTopCardLifted, deckRef, onClick }) => {
  const isDiia = deck === 'diia';
  const coverImg = withCardArtVersion(
    isDiia
      ? '/images/card-smart-contract.jpg'
      : '/images/card-zsu-shield.jpg'
  );

  return (
    <div
      ref={deckRef}
      onClick={onClick}
      title={
        isDiia
          ? 'Колода карток «Цифровий Пуш» (16 карток реформ)'
          : 'Колода карток «Фонд Єдності» (16 карток шансу та подій)'
      }
      className={`w-[122px] 2xl:w-[142px] h-[164px] 2xl:h-[188px] absolute ${
        isDiia ? 'left-3.5 2xl:left-6' : 'right-3.5 2xl:right-6'
      } top-1/2 -translate-y-1/2 z-10 cursor-pointer select-none group transition-transform duration-300 ${
        isDealing
          ? isDiia
            ? '-rotate-3 scale-[1.04]'
            : 'rotate-3 scale-[1.04]'
          : isDiia
            ? '-rotate-6 hover:-rotate-1 hover:scale-105'
            : 'rotate-6 hover:rotate-1 hover:scale-105'
      }`}
    >
      {/* Active Deal Spotlight Halo */}
      {isDealing && (
        <div
          className={`pointer-events-none absolute -inset-3.5 rounded-3xl blur-md animate-pulse ${
            isDiia ? 'bg-sky-400/40' : 'bg-amber-400/40'
          }`}
        />
      )}

      {/* Physical 3D Card Stack Thickness Layers (Bottom & Middle Cards of the 16-Card Deck) */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl border bg-slate-900 ${
          isDiia
            ? '-translate-x-[6px] translate-y-[8px] border-sky-300/35 shadow-[0_18px_32px_-8px_rgba(0,0,0,0.72)]'
            : 'translate-x-[6px] translate-y-[8px] border-amber-300/35 shadow-[0_18px_32px_-8px_rgba(0,0,0,0.72)]'
        }`}
      />
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl border bg-slate-800 ${
          isDiia
            ? '-translate-x-[3px] translate-y-[4px] border-sky-200/45'
            : 'translate-x-[3px] translate-y-[4px] border-amber-200/45'
        }`}
      />

      {/* Next Card Waiting Underneath in the Stack (Revealed When the Hand Lifts the Top Card!) */}
      <div
        className={`absolute inset-0 rounded-2xl p-2.5 border overflow-hidden flex flex-col justify-between bg-slate-900 ${
          isDiia ? 'border-sky-300/50' : 'border-amber-300/50'
        }`}
      >
        <img
          src={coverImg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover brightness-[0.82] scale-[1.03]"
        />
        <div className="relative z-10 flex items-center justify-between">
          <span
            className={`px-2 py-0.5 rounded-md bg-slate-950/80 border text-[8px] font-extrabold uppercase ${
              isDiia
                ? 'border-sky-300/40 text-sky-100'
                : 'border-amber-300/40 text-amber-100'
            }`}
          >
            15 карток
          </span>
        </div>
        <div className="relative z-10 text-left board-card-caption opacity-90">
          <div
            className={`text-[8px] font-extrabold uppercase tracking-wider ${
              isDiia ? 'text-sky-200' : 'text-amber-200'
            }`}
          >
            {isDiia ? 'Колода реформ' : 'Колода шансу'}
          </div>
          <div className="font-display font-extrabold text-xs text-white leading-tight mt-0.5">
            {isDiia ? 'Цифровий Пуш' : 'Фонд Єдності'}
          </div>
        </div>
      </div>

      {/* Detachable Top Card of the Deck */}
      <div
        className={`absolute inset-0 rounded-2xl p-2.5 border overflow-hidden flex flex-col justify-between bg-slate-900 transition-opacity duration-100 ${
          isTopCardLifted ? 'opacity-0 pointer-events-none' : 'opacity-100'
        } ${
          isDealing
            ? isDiia
              ? 'border-sky-200 ring-2 ring-sky-400/90 shadow-[0_0_28px_rgba(56,189,248,0.6)]'
              : 'border-amber-200 ring-2 ring-amber-300/90 shadow-[0_0_28px_rgba(251,191,36,0.6)]'
            : isDiia
              ? 'border-white/45 dark:border-sky-300/40'
              : 'border-white/45 dark:border-amber-300/40'
        }`}
      >
        <img
          src={coverImg}
          alt={isDiia ? 'Цифровий Пуш' : 'Фонд Єдності'}
          className="absolute inset-0 w-full h-full object-cover opacity-100 scale-[1.04] group-hover:scale-[1.1] transition-transform duration-500"
        />
        {/* Subtle Foil Inner Frame */}
        <div
          className={`pointer-events-none absolute inset-1.5 rounded-xl border ${
            isDiia ? 'border-sky-200/30' : 'border-amber-200/30'
          }`}
        />
        <div className="relative z-10 flex items-center justify-between">
          <span
            className={`px-2 py-0.5 rounded-md bg-slate-950/78 backdrop-blur-xs border text-[8.5px] font-extrabold uppercase shadow-xs ${
              isDiia
                ? 'border-sky-300/45 text-sky-100'
                : 'border-amber-300/45 text-amber-100'
            }`}
          >
            {isDealing ? 'Роздача ✦' : '16 карток'}
          </span>
          <span
            className={`w-5.5 h-5.5 rounded-lg bg-slate-950/72 backdrop-blur-xs border flex items-center justify-center shadow-xs ${
              isDiia ? 'border-sky-300/40' : 'border-amber-300/40'
            }`}
          >
            {isDiia ? (
              <Zap className="w-3 h-3 text-sky-300" />
            ) : (
              <Shield className="w-3 h-3 text-amber-300" />
            )}
          </span>
        </div>
        <div className="relative z-10 text-left board-card-caption">
          <div
            className={`text-[8.5px] font-extrabold uppercase tracking-wider ${
              isDiia ? 'text-sky-200' : 'text-amber-200'
            }`}
          >
            {isDiia ? 'Колода реформ' : 'Колода шансу'}
          </div>
          <div className="font-display font-extrabold text-xs text-white leading-tight mt-0.5">
            {isDiia ? 'Цифровий Пуш' : 'Фонд Єдності'}
          </div>
        </div>
      </div>
    </div>
  );
};

// Slower, ultra-luxury 5-act deal duration (3.25s deal + ~5.25s reading = 8.5s total)
const DEAL_DURATION_S = 3.25;

const SPARKLE_RAYS = [
  { angle: -162, dist: 168, delay: 2.68, size: 7.5 },
  { angle: -135, dist: 186, delay: 2.71, size: 6.5 },
  { angle: -108, dist: 174, delay: 2.66, size: 8.5 },
  { angle: -82, dist: 188, delay: 2.7, size: 7 },
  { angle: -54, dist: 178, delay: 2.73, size: 8 },
  { angle: -24, dist: 168, delay: 2.67, size: 7.5 },
  { angle: 8, dist: 176, delay: 2.74, size: 6.5 },
  { angle: 36, dist: 184, delay: 2.65, size: 8.5 },
  { angle: 64, dist: 170, delay: 2.72, size: 7 },
  { angle: 95, dist: 164, delay: 2.69, size: 6.5 },
  { angle: 128, dist: 182, delay: 2.71, size: 8 },
  { angle: 156, dist: 172, delay: 2.75, size: 6.5 },
];

/**
 * Full-Arena Cinematic "WOW" Card-Draw Theatre (Slow, Deliberate, Luxury 5-Act Choreography):
 * Act 1 (0.00s -> 0.79s): Sculpted Magnate Forearm & Hand glides smoothly from the table edge up to the deck.
 * Act 2 (0.79s -> 1.20s): Thumb visibly presses & pinches the top card, physically peeling it off the stack.
 * Act 3 (1.20s -> 2.33s): Hand carries the foil-lit card in a slow velvet arc across the table to center stage.
 * Act 4 (2.33s -> 3.15s): Hand gracefully flicks & withdraws downward while the card performs a 3D 180° flip reveal.
 * Act 5 (3.15s -> 8.45s): Illuminated Ukrainian card text & impact stay front-and-center for comfortable reading.
 */
export const EventCardWowOverlay: React.FC<{
  card: EventCardDisplay | null;
  drawerPlayer?: Player;
  isDrawnByMe: boolean;
  isPhoneBoard: boolean;
  arenaRef: React.RefObject<HTMLDivElement | null>;
  diiaDeckRef: React.RefObject<HTMLDivElement | null>;
  unityDeckRef: React.RefObject<HTMLDivElement | null>;
  onTopCardLiftChange: (deck: 'diia' | 'unity' | null) => void;
  onDismiss: () => void;
}> = ({
  card,
  drawerPlayer,
  isDrawnByMe,
  isPhoneBoard,
  arenaRef,
  diiaDeckRef,
  unityDeckRef,
  onTopCardLiftChange,
  onDismiss,
}) => {
  const [canBackdropClose, setCanBackdropClose] = useState(false);

  // Measure exact deck origin offset relative to the center of the arena
  const originMetrics = useMemo(() => {
    if (!card) {
      return { x: 0, y: 0, scale: 0.45, rotateZ: 0, stageScale: 1 };
    }
    const isDiia = card.deck === 'diia';
    const arenaEl = arenaRef.current;
    const deckEl = isDiia ? diiaDeckRef.current : unityDeckRef.current;
    const arenaH = arenaEl?.clientHeight ?? 0;
    const stageScale =
      arenaH > 0 && arenaH < 350
        ? Math.max(0.64, Math.min(1, (arenaH - 12) / 338))
        : 1;

    if (arenaEl && deckEl && deckEl.offsetWidth > 0) {
      const arenaCenterX = arenaEl.clientWidth / 2;
      const arenaCenterY = arenaEl.clientHeight / 2;
      const deckCenterX = deckEl.offsetLeft + deckEl.offsetWidth / 2;
      const deckCenterY = deckEl.offsetTop + deckEl.offsetHeight / 2;
      const targetCardWidth = isPhoneBoard ? 272 : 336;

      return {
        x: deckCenterX - arenaCenterX,
        y: deckCenterY - arenaCenterY,
        scale: Math.max(
          0.36,
          Math.min(0.56, deckEl.offsetWidth / targetCardWidth)
        ),
        rotateZ: isDiia ? -3 : 3,
        stageScale,
      };
    }

    return {
      x: isDiia ? -125 : 125,
      y: 0,
      scale: 0.46,
      rotateZ: isDiia ? -6 : 6,
      stageScale,
    };
  }, [card, arenaRef, diiaDeckRef, unityDeckRef, isPhoneBoard]);

  useEffect(() => {
    if (!card) {
      setCanBackdropClose(false);
      onTopCardLiftChange(null);
      return;
    }

    setCanBackdropClose(false);
    const isPositive =
      !card.impactText.startsWith('-') &&
      !card.badge.toLowerCase().includes('фінмоніторинг');

    // Act 2 (0.76s): Hand closes thumb onto top card & physically peels it off the 16-card deck
    const liftTimer = setTimeout(() => {
      onTopCardLiftChange(card.deck);
      sound.playCardDrawFromDeck();
    }, 760);

    // Act 4 (2.70s): 3D 180-degree flip passes 90° apex -> holographic reveal chime
    const revealTimer = setTimeout(() => {
      sound.playCardReveal(isPositive);
    }, 2700);

    // Replenish deck visual top card & allow backdrop tap-to-close once card is revealed
    const replenishTimer = setTimeout(() => {
      onTopCardLiftChange(null);
      setCanBackdropClose(true);
    }, 3120);

    // Auto-dock after 8.55s (3.25s luxury animation + 5.3s calm reading time)
    const autoDockTimer = setTimeout(() => {
      onDismiss();
    }, 8550);

    return () => {
      clearTimeout(liftTimer);
      clearTimeout(revealTimer);
      clearTimeout(replenishTimer);
      clearTimeout(autoDockTimer);
    };
  }, [card?.id]);

  const isDiia = card?.deck === 'diia';
  // Transform origin anchored right at the thumb-index saddle on the card edge (50%, 34%) so zero drift occurs across deck-to-center scaling!
  const handTransformOrigin = '50% 34%';
  const handBoxClass = isPhoneBoard
    ? 'w-[260px] h-[325px]'
    : 'w-[320px] h-[400px]';
  const handPosStyle: React.CSSProperties = isDiia
    ? {
        left: isPhoneBoard ? -130 : -160,
        bottom: isPhoneBoard ? -203 : -250,
        transformOrigin: handTransformOrigin,
      }
    : {
        right: isPhoneBoard ? -130 : -160,
        bottom: isPhoneBoard ? -203 : -250,
        transformOrigin: handTransformOrigin,
      };

  // Identical sub-pixel locked keyframes shared by z-10 Full Hand & z-30 Foreground Thumb Overlay
  const handInitial = {
    opacity: 0,
    x: isDiia ? -150 : 150,
    y: 185,
    scale: 1.92,
    rotate: isDiia ? -14 : 14,
  };
  const handAnimate = {
    opacity: [0, 1, 1, 1, 0.82, 0],
    x: [
      isDiia ? -150 : 150,
      0,
      0,
      0,
      isDiia ? -96 : 96,
      isDiia ? -155 : 155,
    ],
    y: [185, 0, 0, 0, 152, 238],
    scale: [1.92, 1.84, 1.66, 1.08, 1.03, 0.98],
    rotate: [
      isDiia ? -14 : 14,
      isDiia ? -1.5 : 1.5,
      0,
      0,
      isDiia ? -13 : 13,
      isDiia ? -19 : 19,
    ],
  };
  const handTransition: Transition = {
    duration: DEAL_DURATION_S,
    times: [0, 0.23, 0.35, 0.72, 0.88, 1],
    ease: [
      [0.22, 1, 0.36, 1],
      'easeInOut',
      'easeInOut',
      [0.36, 0, 0.2, 1],
      'easeOut',
    ],
  };

  return (
    <AnimatePresence>
      {card && (
        <motion.div
          key={`wow-theatre-${card.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.34 }}
          onClick={() => {
            if (canBackdropClose) {
              sound.playClick();
              onDismiss();
            }
          }}
          className="absolute inset-0 z-[38] flex items-center justify-center p-2.5 sm:p-4 overflow-hidden"
        >
          {/* Theatrical Center-Arena Dimming + Warm Volumetric Spotlight Illuminating Deck, Hand & Center Stage */}
          <div
            style={{
              background: isDiia
                ? 'radial-gradient(circle at 18% 54%, rgba(56, 189, 248, 0.30), transparent 52%), radial-gradient(circle at 50% 54%, rgba(56, 189, 248, 0.18), rgba(2, 6, 23, 0.80) 78%)'
                : 'radial-gradient(circle at 82% 54%, rgba(251, 191, 36, 0.30), transparent 52%), radial-gradient(circle at 50% 54%, rgba(245, 158, 11, 0.18), rgba(2, 6, 23, 0.80) 78%)',
            }}
            className="pointer-events-none absolute inset-0 backdrop-blur-[3.5px]"
          />

          {/* Stage Container (Proportionally scaled on compact mobile boards so Hand + 3D Card Flip fit 100% inside the arena without clipping) */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={
              originMetrics.stageScale < 1
                ? {
                    transform: `scale(${originMetrics.stageScale.toFixed(3)})`,
                    transformOrigin: 'center center',
                  }
                : undefined
            }
            className="relative flex items-center justify-center"
          >
            {/* Mid-Flip Dual Concentric Holographic Shockwave Rings & Starlight Burst (Fires at ~2.66s 90° Flip Apex!) */}
            <motion.div
              initial={{ scale: 0.32, opacity: 0 }}
              animate={{
                scale: [0.32, 1.36, 1.68],
                opacity: [0, 0.88, 0],
              }}
              transition={{
                duration: 1.08,
                delay: 2.64,
                ease: 'easeOut',
              }}
              className={`pointer-events-none absolute w-[274px] h-[274px] rounded-full border-2 blur-[0.8px] ${
                isDiia
                  ? 'border-sky-300 shadow-[0_0_58px_rgba(56,189,248,0.75)]'
                  : 'border-amber-300 shadow-[0_0_58px_rgba(251,191,36,0.75)]'
              }`}
            />
            <motion.div
              initial={{ scale: 0.25, opacity: 0 }}
              animate={{
                scale: [0.25, 1.05, 1.38],
                opacity: [0, 0.55, 0],
              }}
              transition={{
                duration: 0.92,
                delay: 2.72,
                ease: 'easeOut',
              }}
              className={`pointer-events-none absolute w-[240px] h-[240px] rounded-full border ${
                isDiia ? 'border-white/70' : 'border-amber-100/75'
              }`}
            />

            {SPARKLE_RAYS.map((sp, i) => {
              const rad = (sp.angle * Math.PI) / 180;
              const tx = Math.cos(rad) * sp.dist;
              const ty = Math.sin(rad) * sp.dist;
              return (
                <motion.span
                  key={i}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                  animate={{
                    x: [0, tx],
                    y: [0, ty],
                    scale: [0, 1.2, 0],
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 0.98,
                    delay: sp.delay,
                    ease: 'easeOut',
                  }}
                  style={{ width: sp.size, height: sp.size }}
                  className={`pointer-events-none absolute rounded-full ${
                    isDiia
                      ? 'bg-sky-200 shadow-[0_0_14px_#38BDF8]'
                      : 'bg-amber-200 shadow-[0_0_14px_#FBBF24]'
                  }`}
                />
              );
            })}

            {/*
              Card + Photorealistic 3D Gripping Hand Carrier (2D stacking plane so z-10 Full Hand, z-20 3D Card,
              and z-30 Pixel-Locked Foreground Thumb NEVER suffer 3D depth-buffer clipping!)
            */}
            <motion.div
              initial={{
                x: originMetrics.x,
                y: originMetrics.y,
                scale: originMetrics.scale,
                rotateZ: originMetrics.rotateZ,
              }}
              animate={{
                x: [
                  originMetrics.x,
                  originMetrics.x,
                  originMetrics.x * 0.88,
                  isDiia ? -10 : 10,
                  0,
                  0,
                ],
                y: [
                  originMetrics.y,
                  originMetrics.y + 1,
                  originMetrics.y - 22,
                  -15,
                  -8,
                  0,
                ],
                scale: [
                  originMetrics.scale,
                  originMetrics.scale * 0.99,
                  originMetrics.scale * 1.16,
                  0.95,
                  1.045,
                  1,
                ],
                rotateZ: [
                  originMetrics.rotateZ,
                  originMetrics.rotateZ,
                  isDiia ? -8 : 8,
                  isDiia ? -4.2 : 4.2,
                  isDiia ? 1.2 : -1.2,
                  0,
                ],
              }}
              exit={{
                opacity: 0,
                scale: 0.82,
                y: 24,
                transition: { duration: 0.28, ease: 'easeIn' },
              }}
              transition={{
                duration: DEAL_DURATION_S,
                times: [0, 0.23, 0.35, 0.72, 0.88, 1],
                ease: [
                  'easeOut',
                  [0.34, 1.24, 0.64, 1],
                  [0.25, 0.1, 0.25, 1],
                  [0.22, 1, 0.36, 1],
                  [0.22, 1, 0.36, 1],
                ],
              }}
              className={`relative ${
                isPhoneBoard ? 'w-[272px]' : 'w-[318px] sm:w-[336px]'
              }`}
            >
              {/* === LAYER 1 (z-10, UNDER THE CARD): Photorealistic 3D Magnate Hand, Chronograph, Cuff & Sleeve === */}
              <motion.div
                initial={handInitial}
                animate={handAnimate}
                transition={handTransition}
                style={handPosStyle}
                className="pointer-events-none absolute z-10"
              >
                <MagnateHandUnderLayer
                  mirrored={!isDiia}
                  accentGold={!isDiia}
                  className={handBoxClass}
                />
              </motion.div>

              {/* === LAYER 2 (z-20, ISOLATED 3D PERSPECTIVE STAGE FOR THE TWO-SIDED CARD) === */}
              <div className="relative z-20 w-full [perspective:1600px]">
                <motion.div
                  initial={{
                    rotateY: isDiia ? 180 : -180,
                    rotateX: 0,
                  }}
                  animate={{
                    rotateY: [
                      isDiia ? 180 : -180,
                      isDiia ? 180 : -180,
                      isDiia ? 174 : -174,
                      isDiia ? 169 : -169,
                      0,
                      0,
                    ],
                    rotateX: [0, 0, 9, 12, -2, 0],
                  }}
                  transition={{
                    duration: DEAL_DURATION_S,
                    times: [0, 0.23, 0.35, 0.72, 0.94, 1],
                    ease: [
                      'linear',
                      'easeOut',
                      'easeInOut',
                      [0.22, 1, 0.36, 1],
                      'easeOut',
                    ],
                  }}
                  style={{ transformStyle: 'preserve-3d' }}
                  className="relative w-full"
                >
                  {/* --- CARD BACK FACE (Visible on deck, during peel-off & throughout the 1.13s carry!) --- */}
                  <div
                    style={{
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                    }}
                    className={`absolute inset-0 rounded-[22px] p-4 border-2 overflow-hidden flex flex-col justify-between bg-slate-950 shadow-[0_30px_68px_-10px_rgba(0,0,0,0.88)] ${
                      isDiia ? 'border-sky-300/90' : 'border-amber-300/90'
                    }`}
                  >
                    <img
                      src={withCardArtVersion(
                        isDiia
                          ? '/images/card-smart-contract.jpg'
                          : '/images/card-zsu-shield.jpg'
                      )}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover brightness-[1.06] scale-[1.05]"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/55 via-slate-950/15 to-slate-950/78" />

                    {/* Overhead Table-Lamp Foil Glint Gliding Across Card Back During Carry */}
                    <motion.div
                      initial={{ x: '-140%' }}
                      animate={{ x: '230%' }}
                      transition={{
                        duration: 1.4,
                        delay: 0.88,
                        ease: 'easeInOut',
                      }}
                      className="pointer-events-none absolute inset-y-0 w-28 -skew-x-20 bg-gradient-to-r from-transparent via-white/30 to-transparent z-20"
                    />

                    {/* Tactile Thumb Ambient-Occlusion Contact Shadow & Holographic Foil Touch Ripple on Card Back!
                        (Note: card back has rotateY(180deg), so outer corner in world space corresponds to right-bottom when isDiia, left-bottom when !isDiia!) */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.65, 0.65, 0.65, 0, 0] }}
                      transition={{
                        duration: DEAL_DURATION_S,
                        times: [0, 0.23, 0.35, 0.72, 0.8, 1],
                      }}
                      style={{
                        bottom: -12,
                        ...(isDiia ? { right: -10 } : { left: -10 }),
                        width: 118,
                        height: 86,
                        transform: isDiia ? 'rotate(24deg)' : 'rotate(-24deg)',
                        background:
                          'radial-gradient(ellipse at center, rgba(2, 6, 23, 0.82) 0%, rgba(2, 6, 23, 0.45) 48%, transparent 76%)',
                      }}
                      className="pointer-events-none absolute rounded-full z-20"
                    />
                    <motion.span
                      initial={{ scale: 0.25, opacity: 0 }}
                      animate={{
                        scale: [0.25, 1.45, 2.0],
                        opacity: [0, 0.85, 0],
                      }}
                      transition={{
                        duration: 0.72,
                        delay: 0.73,
                        ease: 'easeOut',
                      }}
                      style={{
                        bottom: 24,
                        ...(isDiia ? { right: 34 } : { left: 34 }),
                      }}
                      className={`pointer-events-none absolute w-11 h-11 rounded-full border z-20 ${
                        isDiia
                          ? 'border-sky-200/90 shadow-[0_0_20px_rgba(56,189,248,0.8)]'
                          : 'border-amber-200/90 shadow-[0_0_20px_rgba(251,191,36,0.8)]'
                      }`}
                    />

                    <div
                      className={`pointer-events-none absolute inset-2.5 rounded-2xl border ${
                        isDiia ? 'border-sky-200/45' : 'border-amber-200/45'
                      }`}
                    />

                    <div className="relative z-10 flex items-center justify-between">
                      <span
                        className={`px-2.5 py-1 rounded-lg bg-slate-950/80 border text-[10px] font-black uppercase tracking-wider ${
                          isDiia
                            ? 'border-sky-300/50 text-sky-100'
                            : 'border-amber-300/50 text-amber-100'
                        }`}
                      >
                        КАБЗДА.UA
                      </span>
                      <span
                        className={`w-8 h-8 rounded-xl bg-slate-950/80 border flex items-center justify-center ${
                          isDiia
                            ? 'border-sky-300/50 text-sky-300'
                            : 'border-amber-300/50 text-amber-300'
                        }`}
                      >
                        {isDiia ? (
                          <Zap className="w-4 h-4" />
                        ) : (
                          <Shield className="w-4 h-4" />
                        )}
                      </span>
                    </div>

                    <div className="relative z-10 my-auto flex flex-col items-center text-center py-4">
                      <div
                        className={`w-16 h-16 rounded-2xl bg-slate-950/78 backdrop-blur-md border-2 flex items-center justify-center shadow-2xl ${
                          isDiia
                            ? 'border-sky-300/65 shadow-sky-500/30'
                            : 'border-amber-300/65 shadow-amber-500/30'
                        }`}
                      >
                        {isDiia ? (
                          <Zap className="w-8 h-8 text-sky-300" />
                        ) : (
                          <Shield className="w-8 h-8 text-amber-300" />
                        )}
                      </div>
                    </div>

                    <div className="relative z-10 text-center board-card-caption">
                      <div
                        className={`text-[10px] font-black uppercase tracking-[0.14em] ${
                          isDiia ? 'text-sky-200' : 'text-amber-200'
                        }`}
                      >
                        {isDiia ? 'Колода реформ' : 'Колода шансу'}
                      </div>
                      <div className="font-display font-extrabold text-lg text-white mt-0.5">
                        {isDiia ? 'Цифровий Пуш' : 'Фонд Єдності'}
                      </div>
                    </div>
                  </div>

                  {/* --- CARD FRONT FACE (Illuminated Revealed Message & Impact!) --- */}
                  <div
                    style={{
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                    }}
                    className={`relative rounded-[22px] overflow-hidden border-2 bg-gradient-to-b from-[#10192e] via-[#0b1222] to-[#070c17] text-white shadow-[0_28px_70px_-10px_rgba(0,0,0,0.88)] ${
                      isDiia
                        ? 'border-sky-300/80 shadow-[0_24px_65px_-12px_rgba(56,189,248,0.42)]'
                        : 'border-amber-300/85 shadow-[0_24px_65px_-12px_rgba(251,191,36,0.42)]'
                    }`}
                  >
                    {/* Diagonal Holographic Foil Shimmer Sweep on Reveal */}
                    <motion.div
                      initial={{ x: '-130%' }}
                      animate={{ x: '220%' }}
                      transition={{
                        duration: 1.1,
                        delay: 2.82,
                        ease: 'easeInOut',
                      }}
                      className="pointer-events-none absolute inset-y-0 w-24 -skew-x-20 bg-gradient-to-r from-transparent via-white/24 to-transparent z-30"
                    />

                    {/* Top Drawer Identity & Deck Crest Header */}
                    <div
                      className={`px-3.5 py-2 flex items-center justify-between gap-2 border-b ${
                        isDiia
                          ? 'bg-sky-500/14 border-sky-300/25'
                          : 'bg-amber-500/14 border-amber-300/25'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {drawerPlayer && (
                          <TokenAvatar
                            token={drawerPlayer.token}
                            color={drawerPlayer.color}
                            size={22}
                          />
                        )}
                        <span className="text-[10.5px] font-bold text-slate-200 truncate">
                          {isDrawnByMe
                            ? 'Ви витягуєте картку'
                            : `${drawerPlayer?.name ?? 'Гравець'}`}
                        </span>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0 border ${
                          isDiia
                            ? 'bg-sky-400/15 border-sky-300/40 text-sky-200'
                            : 'bg-amber-400/15 border-amber-300/40 text-amber-200'
                        }`}
                      >
                        {isDiia ? (
                          <Zap className="w-2.5 h-2.5" />
                        ) : (
                          <Shield className="w-2.5 h-2.5" />
                        )}
                        <span>
                          {isDiia ? 'Цифровий Пуш' : 'Фонд Єдності'}
                        </span>
                      </span>
                    </div>

                    {/* Framed 3D Card Illustration Window */}
                    <div className="px-3.5 pt-3">
                      <div
                        className={`relative ${
                          isPhoneBoard ? 'h-[96px]' : 'h-[122px]'
                        } w-full rounded-2xl overflow-hidden border ${
                          isDiia
                            ? 'border-sky-300/35'
                            : 'border-amber-300/35'
                        } shadow-inner`}
                      >
                        <img
                          src={getEventCardArtwork(card)}
                          alt={card.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090f1d]/85 via-transparent to-slate-950/25" />

                        {/* Illuminated Category Badge Inside Illustration */}
                        <span
                          className={`absolute bottom-2 left-2.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg backdrop-blur-md border text-[9.5px] font-black uppercase tracking-wider shadow ${
                            isDiia
                              ? 'bg-slate-950/82 border-sky-300/45 text-sky-200'
                              : 'bg-slate-950/82 border-amber-300/45 text-amber-200'
                          }`}
                        >
                          <Sparkles className="w-2.5 h-2.5 shrink-0" />
                          <span>{card.badge}</span>
                        </span>
                      </div>
                    </div>

                    {/* Illuminated Card Text Panel — What Is Written on the Card */}
                    <div
                      className={`px-3.5 ${
                        isPhoneBoard ? 'pt-2.5 pb-3' : 'pt-3 pb-3.5'
                      } text-left space-y-2`}
                    >
                      <div
                        className={`rounded-2xl p-3 border ${
                          isDiia
                            ? 'bg-sky-950/32 border-sky-400/25 shadow-[inset_0_0_24px_rgba(56,189,248,0.08)]'
                            : 'bg-amber-950/28 border-amber-400/25 shadow-[inset_0_0_24px_rgba(251,191,36,0.08)]'
                        }`}
                      >
                        <h3
                          className={`font-display font-extrabold ${
                            isPhoneBoard ? 'text-[13.5px]' : 'text-[15.5px]'
                          } text-white leading-snug`}
                        >
                          {card.title}
                        </h3>
                        <p
                          className={`mt-1.5 ${
                            isPhoneBoard ? 'text-[11px]' : 'text-[12.5px]'
                          } font-medium text-slate-200/95 leading-relaxed`}
                        >
                          {card.description}
                        </p>
                      </div>

                      {/* Bottom Outcome Badge + Quick Continue Button */}
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span
                          className={`px-3 py-1.5 rounded-xl text-xs font-display font-extrabold tabular-nums border shadow-sm ${
                            card.impactText.startsWith('-') ||
                            card.badge.toLowerCase().includes('фінмоніторинг')
                              ? 'bg-rose-500/18 border-rose-400/45 text-rose-200'
                              : card.impactText.startsWith('+')
                                ? 'bg-emerald-500/20 border-emerald-400/45 text-emerald-200'
                                : isDiia
                                  ? 'bg-sky-500/18 border-sky-300/45 text-sky-100'
                                  : 'bg-amber-500/18 border-amber-300/45 text-amber-100'
                          }`}
                        >
                          {card.impactText}
                        </span>

                        <button
                          onClick={() => {
                            sound.playClick();
                            onDismiss();
                          }}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap shadow-md ${
                            isDiia
                              ? 'bg-sky-400 hover:bg-sky-300 text-slate-950'
                              : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                          }`}
                        >
                          Прийнято ✦
                        </button>
                      </div>
                    </div>

                    {/* Subtle Auto-Continue Progress Strip Along Bottom Edge */}
                    <div className="h-[3px] w-full bg-white/10 overflow-hidden">
                      <motion.div
                        initial={{ width: '100%' }}
                        animate={{ width: '0%' }}
                        transition={{
                          duration: 5.25,
                          delay: DEAL_DURATION_S,
                          ease: 'linear',
                        }}
                        className={`h-full ${
                          isDiia ? 'bg-sky-300' : 'bg-amber-300'
                        }`}
                      />
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* === LAYER 3 (z-30, GUARANTEED IN FRONT OF THE 3D CARD): Pixel-Locked Photorealistic Foreground Thumb === */}
              <motion.div
                initial={handInitial}
                animate={handAnimate}
                transition={handTransition}
                style={handPosStyle}
                className="pointer-events-none absolute z-30"
              >
                <MagnateHandThumbOverLayer
                  mirrored={!isDiia}
                  className={handBoxClass}
                />
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * Docked Compact Event Card Summary Strip (Shown under the dice after the full WOW showcase docks, with 1-click replay!)
 */
export const DockedEventCardSummary: React.FC<{
  card: EventCardDisplay;
  isPhoneBoard: boolean;
  isUltraCompact: boolean;
  onReopenShowcase: () => void;
}> = ({ card, isPhoneBoard, isUltraCompact, onReopenShowcase }) => (
  <motion.button
    type="button"
    key={`docked-${card.id}`}
    initial={{ opacity: 0, y: -8, scale: 0.96 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    onClick={() => {
      sound.playClick();
      onReopenShowcase();
    }}
    title="Натисніть, щоб знову відкрити картку крупним планом"
    className={`w-full rounded-xl sm:rounded-2xl overflow-hidden bg-white/96 dark:bg-[#0b1120]/94 backdrop-blur-xl border shadow-xl text-left text-slate-900 dark:text-white transition hover:brightness-105 cursor-pointer ${
      card.deck === 'diia'
        ? 'border-sky-400/55 dark:border-sky-400/45'
        : 'border-amber-400/60 dark:border-amber-300/45'
    }`}
  >
    <div
      className={`px-3 py-1.5 flex items-center justify-between gap-2 border-b ${
        card.deck === 'diia'
          ? 'bg-sky-500/12 dark:bg-sky-400/12 border-sky-400/25'
          : 'bg-amber-500/12 dark:bg-amber-400/12 border-amber-400/25'
      }`}
    >
      <span
        className={`inline-flex items-center gap-1.5 text-[9.5px] font-black uppercase tracking-wider truncate ${
          card.deck === 'diia'
            ? 'text-sky-700 dark:text-sky-300'
            : 'text-amber-800 dark:text-amber-300'
        }`}
      >
        {card.deck === 'diia' ? (
          <Zap className="w-3 h-3 shrink-0" />
        ) : (
          <Shield className="w-3 h-3 shrink-0" />
        )}
        <span>{card.badge}</span>
      </span>

      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-black tabular-nums whitespace-nowrap ${
            card.impactText.startsWith('-')
              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-400/30'
              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30'
          }`}
        >
          {card.impactText}
        </span>
        <RotateCcw className="w-3 h-3 opacity-60" />
      </div>
    </div>

    <div
      className={`flex items-start ${isPhoneBoard ? 'p-2 gap-2' : 'p-2.5 gap-2.5'}`}
    >
      {!isUltraCompact && (
        <img
          src={getEventCardArtwork(card)}
          alt=""
          className={`${
            isPhoneBoard ? 'w-9 h-9 rounded-lg' : 'w-11 h-11 rounded-xl'
          } object-cover border border-slate-200 dark:border-white/15 shadow-sm shrink-0`}
        />
      )}
      <div className="flex-1 min-w-0">
        <div
          className={`font-display font-extrabold ${
            isPhoneBoard ? 'text-[11px]' : 'text-xs'
          } leading-tight`}
        >
          {card.title}
        </div>
        <p
          className={`${
            isPhoneBoard ? 'text-[9.5px]' : 'text-[10.5px]'
          } line-clamp-2 font-medium text-slate-600 dark:text-slate-300 mt-0.5 leading-snug`}
        >
          {card.description}
        </p>
      </div>
    </div>
  </motion.button>
);
