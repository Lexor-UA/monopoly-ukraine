import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Award,
  Building2,
  Check,
  Crown,
  Eye,
  FileSignature,
  Gavel,
  Handshake,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  BOARD_CELLS,
  SECTOR_COLORS,
  TEAM_META,
  areTeammates,
  calculatePlayerNetWorth,
  formatMoney,
  getSectorCells,
  hasFullSectorMonopoly,
} from '../shared/boardData';
import {
  GameState,
  SectorId,
  ToastTransfer,
  UserProfile,
} from '../shared/types';
import { sound } from '../utils/sound';
import {
  BrandEmblem,
  MagnatBrandIcon,
  MagnatWordmark,
  TokenAvatar,
  withCardArtVersion,
} from './UkrainianArtwork';

// === 1. FINTECH PUSH TOAST ===
export const MonobankToast: React.FC<{ toast: ToastTransfer | null }> = ({
  toast,
}) => {
  const [visibleToast, setVisibleToast] = useState<ToastTransfer | null>(null);

  useEffect(() => {
    if (!toast) return;
    setVisibleToast(toast);
    const t = setTimeout(() => {
      setVisibleToast((curr) => (curr?.id === toast.id ? null : curr));
    }, 4400);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <AnimatePresence>
      {visibleToast && (
        <motion.div
          key={visibleToast.id}
          initial={{ opacity: 0, y: -28, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.94 }}
          className="fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-max max-w-[calc(100%-20px)]"
        >
          <div className="bg-white/96 dark:bg-slate-950/92 backdrop-blur-xl px-3.5 sm:px-4 py-2.5 rounded-2xl flex items-center gap-3 shadow-2xl sm:min-w-[280px] border border-slate-200/90 dark:border-white/15">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                visibleToast.variant === 'income'
                  ? 'bg-emerald-500 text-slate-950'
                  : visibleToast.variant === 'zsu'
                    ? 'bg-amber-400 text-slate-950'
                    : visibleToast.variant === 'expense'
                      ? 'bg-rose-500 text-white'
                      : 'bg-blue-600 text-white'
              }`}
            >
              {visibleToast.variant === 'zsu' ? '🇺🇦' : '₴'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                {visibleToast.title}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-300 truncate">
                {visibleToast.subtitle}
              </div>
            </div>
            <div
              className={`font-display font-extrabold text-xs tabular-nums shrink-0 ${
                visibleToast.variant === 'income'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : visibleToast.variant === 'zsu'
                    ? 'text-amber-600 dark:text-amber-300'
                    : visibleToast.variant === 'expense'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-blue-600 dark:text-blue-300'
              }`}
            >
              {visibleToast.amountText}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// === 2. SMART CONTRACT TRADE BUILDER MODAL ===
export const DiiaTradeBuilderModal: React.FC<{
  open: boolean;
  gameState: GameState;
  myPlayerId: string;
  initialPartnerId: string | null;
  onClose: () => void;
  onSubmitTrade: (payload: {
    toPlayerId: string;
    offerProperties: number[];
    requestProperties: number[];
    offerMoney: number;
    requestMoney: number;
  }) => void;
}> = ({
  open,
  gameState,
  myPlayerId,
  initialPartnerId,
  onClose,
  onSubmitTrade,
}) => {
  const me = gameState.players.find((p) => p.id === myPlayerId);
  const opponents = gameState.players
    .filter((p) => p.id !== myPlayerId && !p.isBankrupt)
    .sort((a, b) => {
      const aAlly = areTeammates(gameState.settings.gameMode, me, a) ? 1 : 0;
      const bAlly = areTeammates(gameState.settings.gameMode, me, b) ? 1 : 0;
      return bAlly - aAlly;
    });
  const [partnerId, setPartnerId] = useState<string>('');
  const [offerProps, setOfferProps] = useState<number[]>([]);
  const [requestProps, setRequestProps] = useState<number[]>([]);
  const [offerMoney, setOfferMoney] = useState<number>(0);
  const [requestMoney, setRequestMoney] = useState<number>(0);

  useEffect(() => {
    if (open) {
      const allyOpponent = opponents.find((o) =>
        areTeammates(gameState.settings.gameMode, me, o)
      );
      const target =
        initialPartnerId && opponents.some((o) => o.id === initialPartnerId)
          ? initialPartnerId
          : allyOpponent?.id ?? opponents[0]?.id ?? '';
      setPartnerId(target);
      setOfferProps([]);
      setRequestProps([]);
      setOfferMoney(0);
      setRequestMoney(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPartnerId]);

  if (!open) return null;

  const partner = gameState.players.find((p) => p.id === partnerId);
  const isPartnerAlly = Boolean(
    partner && areTeammates(gameState.settings.gameMode, me, partner)
  );

  const isTradable = (cellIndex: number) => {
    const cell = BOARD_CELLS[cellIndex];
    if (!cell?.sector) return true;
    return !getSectorCells(cell.sector).some(
      (c) => (gameState.properties[c.index]?.branches ?? 0) > 0
    );
  };

  const myTradableCells = BOARD_CELLS.filter(
    (c) =>
      gameState.properties[c.index]?.ownerId === myPlayerId &&
      isTradable(c.index)
  );
  const partnerTradableCells = BOARD_CELLS.filter(
    (c) =>
      partner &&
      gameState.properties[c.index]?.ownerId === partner.id &&
      isTradable(c.index)
  );

  const toggleArr = (
    arr: number[],
    val: number,
    setFn: (v: number[]) => void
  ) => {
    setFn(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  };

  const offerTotalValue =
    offerMoney +
    offerProps.reduce((sum, idx) => sum + (BOARD_CELLS[idx]?.price ?? 0), 0);
  const requestTotalValue =
    requestMoney +
    requestProps.reduce((sum, idx) => sum + (BOARD_CELLS[idx]?.price ?? 0), 0);

  return (
    <div
      onClick={onClose}
      className="@container fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl glass-panel !bg-[var(--surface-solid)] rounded-2xl sm:rounded-3xl p-3.5 @[520px]:p-4 sm:p-6 shadow-2xl space-y-3 sm:space-y-4 max-h-full overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <img
              src="/images/cell-gov-cloud.jpg"
              alt="Смарт-Угода"
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl object-cover border border-[var(--border-strong)] shadow shrink-0"
            />
            <div className="min-w-0">
              <h3 className="font-display font-extrabold text-sm @[520px]:text-base sm:text-lg truncate">
                Смарт-Угода • Обмін активами
              </h3>
              <p className="text-[11px] sm:text-xs font-medium text-[var(--text-secondary)] truncate">
                Оберіть компанії без побудованих філій та суму доплати
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl hover:bg-slate-500/15 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Select Partner */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold text-[var(--text-secondary)]">
            Контрагент:
          </span>
          {opponents.map((opp) => {
            const isOppAlly = areTeammates(
              gameState.settings.gameMode,
              me,
              opp
            );
            return (
              <button
                key={opp.id}
                type="button"
                onClick={() => {
                  setPartnerId(opp.id);
                  setRequestProps([]);
                  setRequestMoney(0);
                }}
                className={`px-3 py-1.5 rounded-xl border-2 text-xs font-extrabold flex items-center gap-2 transition cursor-pointer ${
                  partnerId === opp.id
                    ? isOppAlly
                      ? 'border-sky-400 bg-sky-500/15'
                      : 'border-blue-500 bg-blue-500/15'
                    : 'border-[var(--border-glass)] bg-[var(--surface-subtle)]'
                }`}
              >
                <TokenAvatar token={opp.token} color={opp.color} size={22} />
                <span>{opp.name}</span>
                {isOppAlly && (
                  <span className="px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-400/35 text-[10px] font-black">
                    🤝 Напарник
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {isPartnerAlly && (
          <div className="px-3.5 py-2.5 rounded-xl bg-sky-500/10 border border-sky-400/30 text-[11px] font-semibold text-sky-800 dark:text-sky-200 flex items-center gap-2">
            <span className="text-sm shrink-0">🤝</span>
            <span>
              <strong>Угода всередині Альянсу:</strong> ви можете безоплатно (за{' '}
              <strong>0 ₴</strong>) передати компанії одному з напарників для
              збору монополії або підтримати партнера готівкою.
            </span>
          </div>
        )}

        {/* Two Columns */}
        <div className="grid grid-cols-1 @[520px]:grid-cols-2 gap-3 sm:gap-4">
          {/* Left: My Offer */}
          <div className="p-3 sm:p-4 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] space-y-2.5 sm:space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase text-[var(--text-secondary)]">
                Ви віддаєте
              </span>
              <span className="text-xs font-extrabold text-blue-600 dark:text-sky-400 tabular-nums">
                Оцінка: {formatMoney(offerTotalValue)}
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-[var(--text-secondary)] mb-1">
                Сума грошима (макс. {formatMoney(me?.money ?? 0)})
              </label>
              <input
                type="number"
                min={0}
                max={me?.money ?? 0}
                step={100}
                value={offerMoney}
                onChange={(e) =>
                  setOfferMoney(
                    Math.min(
                      me?.money ?? 0,
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  )
                }
                className="w-full px-3 py-2 rounded-xl premium-input text-xs font-extrabold tabular-nums outline-none"
              />
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {myTradableCells.length === 0 ? (
                <p className="text-xs font-semibold text-[var(--text-muted)] py-3 text-center">
                  У вас немає вільних від філій компаній
                </p>
              ) : (
                myTradableCells.map((c) => {
                  const checked = offerProps.includes(c.index);
                  return (
                    <button
                      key={c.index}
                      type="button"
                      onClick={() =>
                        toggleArr(offerProps, c.index, setOfferProps)
                      }
                      className={`w-full p-2 rounded-xl border-2 text-left flex items-center justify-between text-xs font-extrabold transition cursor-pointer ${
                        checked
                          ? 'border-blue-500 bg-blue-500/15'
                          : 'border-[var(--border-glass)] bg-[var(--surface-solid)]'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <BrandEmblem brandKey={c.brandKey} size="sm" />
                        <span className="truncate">{c.shortName}</span>
                      </span>
                      <span className="tabular-nums text-[var(--text-secondary)]">
                        {formatMoney(c.price ?? 0)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Partner Request */}
          <div className="p-3 sm:p-4 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] space-y-2.5 sm:space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase text-[var(--text-secondary)]">
                Ви отримуєте
              </span>
              <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                Оцінка: {formatMoney(requestTotalValue)}
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-[var(--text-secondary)] mb-1">
                Сума від {partner?.name} (макс.{' '}
                {formatMoney(partner?.money ?? 0)})
              </label>
              <input
                type="number"
                min={0}
                max={partner?.money ?? 0}
                step={100}
                value={requestMoney}
                onChange={(e) =>
                  setRequestMoney(
                    Math.min(
                      partner?.money ?? 0,
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  )
                }
                className="w-full px-3 py-2 rounded-xl premium-input text-xs font-extrabold tabular-nums outline-none"
              />
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {partnerTradableCells.length === 0 ? (
                <p className="text-xs font-semibold text-[var(--text-muted)] py-3 text-center">
                  У контрагента немає доступних для обміну компаній
                </p>
              ) : (
                partnerTradableCells.map((c) => {
                  const checked = requestProps.includes(c.index);
                  return (
                    <button
                      key={c.index}
                      type="button"
                      onClick={() =>
                        toggleArr(requestProps, c.index, setRequestProps)
                      }
                      className={`w-full p-2 rounded-xl border-2 text-left flex items-center justify-between text-xs font-extrabold transition cursor-pointer ${
                        checked
                          ? 'border-emerald-500 bg-emerald-500/15'
                          : 'border-[var(--border-glass)] bg-[var(--surface-solid)]'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <BrandEmblem brandKey={c.brandKey} size="sm" />
                        <span className="truncate">{c.shortName}</span>
                      </span>
                      <span className="tabular-nums text-[var(--text-secondary)]">
                        {formatMoney(c.price ?? 0)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse @[520px]:flex-row gap-2 sm:gap-2.5 pt-1 sm:pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 sm:py-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-strong)] text-xs font-extrabold cursor-pointer"
          >
            Скасувати
          </button>
          <button
            type="button"
            disabled={
              !partnerId ||
              (offerProps.length === 0 &&
                requestProps.length === 0 &&
                offerMoney === 0 &&
                requestMoney === 0)
            }
            onClick={() => {
              onSubmitTrade({
                toPlayerId: partnerId,
                offerProperties: offerProps,
                requestProperties: requestProps,
                offerMoney,
                requestMoney,
              });
              onClose();
            }}
            className="flex-1 py-2.5 sm:py-3 rounded-xl mono-cta-btn disabled:opacity-35 font-display font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <FileSignature className="w-4 h-4" />
            Надіслати на Цифровий Підпис
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// === 3. INCOMING / ACTIVE TRADE REVIEW MODAL ===
export const IncomingTradeModal: React.FC<{
  gameState: GameState;
  myPlayerId: string;
  onRespond: (accept: boolean) => void;
}> = ({ gameState, myPlayerId, onRespond }) => {
  const trade = gameState.pendingTrade;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!trade) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [trade]);

  if (!trade) return null;

  const isRecipient = trade.toPlayerId === myPlayerId;
  const isSender = trade.fromPlayerId === myPlayerId;
  if (!isRecipient && !isSender) return null;

  const from = gameState.players.find((p) => p.id === trade.fromPlayerId);
  const to = gameState.players.find((p) => p.id === trade.toPlayerId);
  const areTradeAllies = areTeammates(gameState.settings.gameMode, from, to);
  const remainingSec = Math.max(0, Math.ceil((trade.expiresAt - now) / 1000));

  return (
    <div className="@container fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg glass-panel !bg-[var(--surface-solid)] rounded-2xl sm:rounded-3xl p-3.5 @[520px]:p-4 sm:p-6 shadow-2xl space-y-3 sm:space-y-4 max-h-full overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/images/cell-gov-cloud.jpg"
              alt="Смарт-Угода"
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl object-cover border border-[var(--border-strong)] shrink-0"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="font-display font-extrabold text-sm sm:text-base">
                  {isRecipient
                    ? `Вхідна Смарт-Угода від ${from?.name}`
                    : `Очікуємо Цифровий Підпис від ${to?.name}...`}
                </h3>
                {areTradeAllies && (
                  <span className="px-2 py-0.5 rounded-full bg-sky-500/18 text-sky-600 dark:text-sky-300 border border-sky-400/35 text-[10px] font-black">
                    🤝 Напарник
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                {areTradeAllies
                  ? 'Командна Смарт-Угода всередині вашого альянсу 2×2'
                  : 'Електронний смарт-контракт обміну активами'}
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-amber-400/18 text-amber-700 dark:text-amber-300 border border-amber-400/35 text-xs font-extrabold tabular-nums shrink-0">
            ⏱ {remainingSec}с
          </span>
        </div>

        <div className="grid grid-cols-1 @[480px]:grid-cols-2 gap-2.5 sm:gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] space-y-1.5">
            <div className="font-extrabold text-[var(--text-secondary)]">
              {from?.name} передає:
            </div>
            {trade.offerMoney > 0 && (
              <div className="font-extrabold text-emerald-500 tabular-nums">
                + {formatMoney(trade.offerMoney)}
              </div>
            )}
            {trade.offerProperties.map((idx) => (
              <div key={idx} className="flex items-center gap-1.5 font-extrabold">
                <BrandEmblem
                  brandKey={BOARD_CELLS[idx]?.brandKey ?? 'ua'}
                  size="sm"
                />
                <span>{BOARD_CELLS[idx]?.shortName}</span>
              </div>
            ))}
            {trade.offerMoney === 0 && trade.offerProperties.length === 0 && (
              <div className="text-[var(--text-muted)] font-semibold">Нічого</div>
            )}
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] space-y-1.5">
            <div className="font-extrabold text-[var(--text-secondary)]">
              {to?.name} передає:
            </div>
            {trade.requestMoney > 0 && (
              <div className="font-extrabold text-rose-500 tabular-nums">
                + {formatMoney(trade.requestMoney)}
              </div>
            )}
            {trade.requestProperties.map((idx) => (
              <div key={idx} className="flex items-center gap-1.5 font-extrabold">
                <BrandEmblem
                  brandKey={BOARD_CELLS[idx]?.brandKey ?? 'ua'}
                  size="sm"
                />
                <span>{BOARD_CELLS[idx]?.shortName}</span>
              </div>
            ))}
            {trade.requestMoney === 0 &&
              trade.requestProperties.length === 0 && (
                <div className="text-[var(--text-muted)] font-semibold">Нічого</div>
              )}
          </div>
        </div>

        {isRecipient ? (
          <div className="flex gap-2.5 pt-2">
            <button
              onClick={() => onRespond(false)}
              className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer"
            >
              Відхилити
            </button>
            <button
              onClick={() => onRespond(true)}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Завірити Підписом
            </button>
          </div>
        ) : (
          <button
            onClick={() => onRespond(false)}
            className="w-full py-2.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-strong)] text-xs font-extrabold cursor-pointer"
          >
            Скасувати пропозицію
          </button>
        )}
      </motion.div>
    </div>
  );
};

// === 4. VICTORY CELEBRATION MODAL ===
const VICTORY_SECTOR_LABELS: Record<SectorId, string> = {
  fintech: 'Банки та Фінанси',
  tech: 'ІТ та Технології',
  telecom: 'Зв’язок та Інтернет',
  ecommerce: 'Торгівля та Гіпермаркети',
  fuel: 'Пальне та Заправки',
  delivery: 'Пошта та Доставка',
  retail: 'Магазини та Супермаркети',
  coffee: 'Кав’ярні та Пекарні',
  transport: 'Транспортна Мережа',
  utility: 'Інфраструктура',
};

const VICTORY_COMPANY_SECTORS: SectorId[] = [
  'fintech',
  'tech',
  'telecom',
  'ecommerce',
  'fuel',
  'delivery',
  'retail',
  'coffee',
];

export const VictoryModal: React.FC<{
  gameState: GameState;
  myPlayerId: string;
  userProfile?: UserProfile | null;
  onOpenProfile?: () => void;
  onRematchLobby: () => void;
  onExitHome: () => void;
}> = ({
  gameState,
  myPlayerId,
  userProfile,
  onOpenProfile,
  onRematchLobby,
  onExitHome,
}) => {
  const [minimized, setMinimized] = useState(false);
  const isFinished =
    gameState.status === 'finished' || gameState.phase === 'GAME_OVER';

  useEffect(() => {
    if (!isFinished) {
      setMinimized(false);
      return;
    }
    sound.playVictory();
    confetti({
      particleCount: 110,
      spread: 85,
      origin: { y: 0.55 },
      colors: ['#0057B8', '#FFD700', '#38BDF8', '#10B981'],
    });
    const t1 = setTimeout(() => {
      confetti({
        particleCount: 65,
        angle: 60,
        spread: 60,
        origin: { x: 0.12, y: 0.65 },
        colors: ['#FFD700', '#F59E0B', '#38BDF8'],
      });
      confetti({
        particleCount: 65,
        angle: 120,
        spread: 60,
        origin: { x: 0.88, y: 0.65 },
        colors: ['#0057B8', '#FFD700', '#34D399'],
      });
    }, 650);
    return () => clearTimeout(t1);
  }, [isFinished]);

  if (!isFinished) return null;

  const isTeamVictory =
    gameState.settings.gameMode === 'team2v2' &&
    Boolean(gameState.winningTeamId);
  const winningTeamId = gameState.winningTeamId ?? null;
  const winTeamMeta = winningTeamId ? TEAM_META[winningTeamId] : null;

  const mePlayer = gameState.players.find((p) => p.id === myPlayerId);
  const eliminatedMe = gameState.eliminatedPlayers?.find(
    (p) => p.id === myPlayerId
  );
  const myTeamId = mePlayer?.teamId ?? eliminatedMe?.teamId;
  const didMyTeamWin = Boolean(
    isTeamVictory && winningTeamId && myTeamId === winningTeamId
  );

  const winningTeamMembers =
    isTeamVictory && winningTeamId
      ? [
          ...gameState.players
            .filter((p) => p.teamId === winningTeamId)
            .map((p) => ({
              id: p.id,
              name: p.name,
              token: p.token,
              color: p.color,
              isAlive: !p.isBankrupt,
              netWorth: p.isBankrupt
                ? 0
                : calculatePlayerNetWorth(p.id, p.money, gameState.properties),
            })),
          ...(gameState.eliminatedPlayers ?? [])
            .filter(
              (ep) =>
                ep.teamId === winningTeamId &&
                !gameState.players.some((p) => p.id === ep.id)
            )
            .map((ep) => ({
              id: ep.id,
              name: ep.name,
              token: ep.token,
              color: ep.color,
              isAlive: false,
              netWorth: 0,
            })),
        ].sort((a, b) => b.netWorth - a.netWorth)
      : [];

  const teamCombinedWorth = winningTeamMembers.reduce(
    (sum, m) => sum + m.netWorth,
    0
  );

  const winner =
    gameState.players.find((p) => p.id === gameState.winnerId) ??
    gameState.players.find((p) => !p.isBankrupt);

  const winnerNetWorth = winner
    ? calculatePlayerNetWorth(winner.id, winner.money, gameState.properties)
    : 0;

  const isMeWinner = isTeamVictory
    ? didMyTeamWin
    : Boolean(winner && winner.id === myPlayerId);

  // Compute Empire Statistics for the Winner (or Winning Alliance)
  const winnerOwnerIds = new Set<string>(
    isTeamVictory && winningTeamId
      ? winningTeamMembers.map((m) => m.id)
      : winner
        ? [winner.id]
        : []
  );

  let winnerOwnedCount = 0;
  let winnerBranches = 0;
  let winnerHoldings = 0;
  Object.values(gameState.properties).forEach((prop) => {
    if (prop.ownerId && winnerOwnerIds.has(prop.ownerId)) {
      winnerOwnedCount += 1;
      if (prop.branches >= 5) {
        winnerHoldings += 1;
      } else if (prop.branches > 0) {
        winnerBranches += prop.branches;
      }
    }
  });

  const winnerMonopolies: SectorId[] = VICTORY_COMPANY_SECTORS.filter((sec) =>
    Array.from(winnerOwnerIds).some((oid) =>
      hasFullSectorMonopoly(oid, sec, gameState.properties, false)
    )
  );

  const totalNetWorthDisplay = isTeamVictory
    ? teamCombinedWorth
    : winnerNetWorth;
  const winnerCashDisplay = isTeamVictory
    ? gameState.players
        .filter((p) => p.teamId === winningTeamId && !p.isBankrupt)
        .reduce((sum, p) => sum + p.money, 0)
    : (winner?.money ?? 0);
  const winnerAssetsValue = Math.max(
    0,
    totalNetWorthDisplay - winnerCashDisplay
  );
  const marketSharePct = Math.round((winnerOwnedCount / 28) * 100);

  const honoraryTitle =
    winnerHoldings >= 2
      ? '👑 Імператор Українських Холдингів'
      : winnerMonopolies.length >= 3
        ? '🏛️ Абсолютний Монополіст Держави'
        : totalNetWorthDisplay >= 38000
          ? '💎 Фінансовий Титан України'
          : gameState.zsuTotalDonated >= 8000
            ? '🛡️ Меценат Незламної Економіки'
            : '⚡ Стратегічний Магнат КАБЗДА.UA';

  // Build sorted final match standings (1st..4th place)
  const allStandings = [
    ...gameState.players.map((p) => {
      const worth = p.isBankrupt
        ? 0
        : calculatePlayerNetWorth(p.id, p.money, gameState.properties);
      const isChamp = isTeamVictory
        ? p.teamId === winningTeamId
        : p.id === winner?.id;
      return {
        id: p.id,
        name: p.name,
        token: p.token,
        color: p.color,
        isBankrupt: p.isBankrupt,
        isChamp,
        netWorth: worth,
      };
    }),
    ...(gameState.eliminatedPlayers ?? [])
      .filter((ep) => !gameState.players.some((p) => p.id === ep.id))
      .map((ep) => ({
        id: ep.id,
        name: ep.name,
        token: ep.token,
        color: ep.color,
        isBankrupt: true,
        isChamp: Boolean(isTeamVictory && ep.teamId === winningTeamId),
        netWorth: 0,
      })),
  ].sort((a, b) => {
    if (a.isChamp !== b.isChamp) return a.isChamp ? -1 : 1;
    if (a.isBankrupt !== b.isBankrupt) return a.isBankrupt ? 1 : -1;
    return b.netWorth - a.netWorth;
  });

  if (minimized) {
    return (
      <div className="fixed bottom-16 sm:bottom-4 left-1/2 -translate-x-1/2 z-50 w-max max-w-[calc(100%-16px)]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-3.5 py-2 rounded-2xl bg-slate-950/95 border-2 border-amber-400/75 shadow-[0_16px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl flex items-center gap-2.5 text-white"
        >
          <Trophy className="w-4 h-4 text-amber-300 shrink-0" />
          <span className="text-xs font-extrabold truncate max-w-[170px] sm:max-w-[260px]">
            {isTeamVictory && winTeamMeta
              ? `${winTeamMeta.name} (${formatMoney(teamCombinedWorth)})`
              : `${winner?.name ?? 'Переможець'} (${formatMoney(winnerNetWorth)})`}
          </span>
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setMinimized(false);
            }}
            className="px-3 py-1 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-extrabold text-[11px] cursor-pointer shrink-0 transition"
          >
            Підсумки 🏆
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="@container fixed inset-0 z-50 bg-slate-950/82 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-[460px] mono-graphite-card rounded-[24px] sm:rounded-[30px] overflow-hidden text-center shadow-[0_28px_80px_-12px_rgba(0,0,0,0.92)] border-2 border-amber-400/50 max-h-[calc(100dvh-16px)] flex flex-col"
      >
        {/* === 1. CINEMATIC CHAMPIONSHIP HERO BANNER WITH WINNER PEDESTAL === */}
        <div className="relative h-[98px] sm:h-[122px] w-full shrink-0 overflow-hidden bg-slate-950">
          <img
            src={withCardArtVersion('/images/card-fintech-towers.jpg')}
            alt="Імперія Переможця КАБЗДА.UA"
            className="absolute inset-0 w-full h-full object-cover object-center brightness-[0.88] scale-[1.03]"
          />
          <div
            style={{
              background:
                'radial-gradient(circle at 50% 25%, rgba(251, 191, 36, 0.35), transparent 62%), linear-gradient(180deg, rgba(2, 6, 23, 0.42) 0%, rgba(11, 17, 32, 0.96) 100%)',
            }}
            className="pointer-events-none absolute inset-0"
          />

          {/* Top Bar Over Hero: Brand Identity + "Inspect Final Board" Toggle */}
          <div className="relative z-10 px-3.5 pt-2 flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl bg-slate-950/75 border border-white/15">
              <MagnatBrandIcon size="xs" />
              <span className="font-display font-black text-[10px] tracking-wider text-amber-300">
                КАБЗДА.UA
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setMinimized(true);
              }}
              className="px-2.5 py-1 rounded-xl bg-slate-950/78 hover:bg-slate-900 border border-white/20 text-[10.5px] font-extrabold text-slate-200 inline-flex items-center gap-1 cursor-pointer transition"
            >
              <Eye className="w-3.5 h-3.5 text-sky-300" />
              <span>Поле</span>
            </button>
          </div>

          {/* Winner Token Avatar on Golden Championship Pedestal */}
          <div className="relative z-10 -mt-1 flex flex-col items-center">
            <div className="relative inline-flex items-center justify-center">
              <div className="pointer-events-none absolute -inset-2 rounded-full bg-amber-400/30 blur-md animate-pulse" />
              <div className="p-1 rounded-full bg-gradient-to-b from-amber-300 via-amber-500 to-yellow-600 shadow-[0_0_32px_rgba(251,191,36,0.65)]">
                {winner ? (
                  <TokenAvatar
                    token={winner.token}
                    color={winner.color}
                    size={52}
                  />
                ) : (
                  <div className="w-[52px] h-[52px] rounded-full bg-slate-900 flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-amber-300" />
                  </div>
                )}
              </div>
              <span className="absolute -top-1 -right-1 w-5.5 h-5.5 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 border-2 border-slate-950 shadow-lg flex items-center justify-center">
                <Trophy className="w-3 h-3 stroke-[2.5]" />
              </span>
            </div>
          </div>
        </div>

        {/* === 2. SCROLLABLE CHAMPIONSHIP REPORT BODY === */}
        <div className="px-3.5 sm:px-5 py-2 sm:py-3 space-y-2 sm:space-y-2.5 overflow-y-auto no-scrollbar flex-1 min-h-0">
          {/* Headline & Honorary Magnate Title */}
          <div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                isMeWinner
                  ? 'bg-amber-400/18 border-amber-300/45 text-amber-200'
                  : 'bg-sky-500/15 border-sky-400/35 text-sky-200'
              }`}
            >
              {isTeamVictory
                ? didMyTeamWin
                  ? '🏆 Ваш Альянс переміг • Слава Україні! 🇺🇦'
                  : 'Командний матч 2×2 завершено • Слава Україні! 🇺🇦'
                : isMeWinner
                  ? '🏆 Вітаємо з перемогою • Слава Україні! 🇺🇦'
                  : 'Матч завершено • Слава Україні! 🇺🇦'}
            </span>

            <h2 className="font-display font-extrabold text-lg sm:text-2xl text-white mt-1 leading-tight">
              {isTeamVictory && winTeamMeta
                ? `${winTeamMeta.name} — Переможці!`
                : winner
                  ? `${winner.name} — Головний Магнат!`
                  : 'Гра завершена!'}
            </h2>

            <div className="text-[10.5px] font-bold text-amber-300/95 mt-0.5">
              {honoraryTitle}
            </div>
          </div>

          {/* 4-Card Empire Metrics Grid (2×2) */}
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-left">
            {/* 1. Total Net Worth */}
            <div className="p-2 rounded-2xl bg-gradient-to-br from-amber-500/16 via-amber-500/8 to-transparent border border-amber-400/35">
              <div className="flex items-center justify-between text-[9.5px] font-extrabold uppercase tracking-wider text-amber-200/90">
                <span>Капітал імперії</span>
                <TrendingUp className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              </div>
              <div className="font-display font-extrabold text-sm sm:text-lg text-amber-300 tabular-nums mt-0.5 leading-tight">
                {formatMoney(totalNetWorthDisplay)}
              </div>
              <div className="text-[9px] font-semibold text-slate-300 mt-0.5 leading-tight">
                💵 {formatMoney(winnerCashDisplay)} • 🏢{' '}
                {formatMoney(winnerAssetsValue)}
              </div>
            </div>

            {/* 2. Market Control (Companies Owned) */}
            <div className="p-2 rounded-2xl bg-white/[0.06] border border-white/15">
              <div className="flex items-center justify-between text-[9.5px] font-extrabold uppercase tracking-wider text-sky-200/90">
                <span>Контроль ринку</span>
                <Building2 className="w-3.5 h-3.5 text-sky-300 shrink-0" />
              </div>
              <div className="font-display font-extrabold text-sm sm:text-lg text-white tabular-nums mt-0.5 leading-tight">
                {winnerOwnedCount} з 28{' '}
                <span className="text-[11px] font-bold text-sky-300">
                  ({marketSharePct}%)
                </span>
              </div>
              <div className="text-[9px] font-semibold text-slate-300 mt-0.5 leading-tight">
                Компаній України у портфелі
              </div>
            </div>

            {/* 3. Monopolies, Holdings & Branches */}
            <div className="p-2 rounded-2xl bg-white/[0.06] border border-white/15">
              <div className="flex items-center justify-between text-[9.5px] font-extrabold uppercase tracking-wider text-purple-200/90">
                <span>Монополії та мережа</span>
                <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              </div>
              <div className="font-display font-extrabold text-sm sm:text-lg text-white tabular-nums mt-0.5 leading-tight">
                {winnerMonopolies.length}{' '}
                <span className="text-[11px] font-bold text-slate-300">
                  {winnerMonopolies.length === 1
                    ? 'монополія'
                    : winnerMonopolies.length >= 2 &&
                        winnerMonopolies.length <= 4
                      ? 'монополії'
                      : 'монополій'}
                </span>
              </div>
              <div className="text-[9px] font-semibold text-slate-300 mt-0.5 leading-tight">
                {winnerHoldings}{' '}
                {winnerHoldings === 1
                  ? 'холдинг'
                  : winnerHoldings >= 2 && winnerHoldings <= 4
                    ? 'холдинги'
                    : 'холдингів'}{' '}
                👑 • {winnerBranches}{' '}
                {winnerBranches === 1
                  ? 'філія'
                  : winnerBranches >= 2 && winnerBranches <= 4
                    ? 'філії'
                    : 'філій'}{' '}
                ★
              </div>
            </div>

            {/* 4. Defense Fund Contribution */}
            <div className="p-2 rounded-2xl bg-emerald-500/12 border border-emerald-400/30">
              <div className="flex items-center justify-between text-[9.5px] font-extrabold uppercase tracking-wider text-emerald-200/90">
                <span>Фонд Оборони</span>
                <Shield className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              </div>
              <div className="font-display font-extrabold text-sm sm:text-lg text-amber-300 tabular-nums mt-0.5 leading-tight">
                {formatMoney(gameState.zsuTotalDonated)}
              </div>
              <div className="text-[9px] font-semibold text-emerald-200/90 mt-0.5 leading-tight">
                Разом передано за матч 🇺🇦
              </div>
            </div>
          </div>

          {/* Collected Sector Monopolies Showcase */}
          {winnerMonopolies.length > 0 && (
            <div className="p-2 rounded-2xl bg-white/[0.05] border border-white/12 text-left">
              <div className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                Зібрані галузеві монополії переможця:
              </div>
              <div className="flex flex-wrap gap-1">
                {winnerMonopolies.map((sec) => (
                  <span
                    key={sec}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-950/75 border border-white/15 text-[9.5px] font-extrabold text-white"
                  >
                    <span
                      style={{ backgroundColor: SECTOR_COLORS[sec] }}
                      className="w-2 h-2 rounded-full shrink-0"
                    />
                    <span>{VICTORY_SECTOR_LABELS[sec]}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Final Match Standings Leaderboard (1st..4th Place) */}
          <div className="rounded-2xl bg-white/[0.05] border border-white/12 overflow-hidden text-left">
            <div className="px-3 py-1 border-b border-white/10 flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
              <span>Підсумковий рейтинг матчу</span>
              <span>Статус / Капітал</span>
            </div>
            <div className="divide-y divide-white/8">
              {allStandings.map((pl, idx) => (
                <div
                  key={pl.id}
                  className={`px-2.5 py-1.5 flex items-center justify-between gap-2 ${
                    pl.isChamp ? 'bg-amber-400/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-4.5 h-4.5 rounded-full text-[9.5px] font-black flex items-center justify-center shrink-0 ${
                        idx === 0
                          ? 'bg-amber-400 text-slate-950 shadow-sm'
                          : idx === 1
                            ? 'bg-slate-300 text-slate-950'
                            : idx === 2
                              ? 'bg-amber-700/80 text-amber-100'
                              : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <TokenAvatar token={pl.token} color={pl.color} size={24} />
                    <div className="min-w-0">
                      <div className="font-extrabold text-[11.5px] text-white truncate flex items-center gap-1 leading-tight">
                        <span className="truncate">{pl.name}</span>
                        {pl.id === myPlayerId && (
                          <span className="px-1 py-0.2 rounded bg-sky-500 text-slate-950 text-[8px] font-black shrink-0">
                            ВИ
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] font-semibold text-slate-400 leading-tight">
                        {pl.isChamp
                          ? '🏆 Переможець КАБЗДА.UA'
                          : 'Банкрут • Вибув з гонки'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {pl.isBankrupt && !pl.isChamp ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-400/30 text-rose-300 text-[9.5px] font-extrabold">
                        0 ₴
                      </span>
                    ) : (
                      <span className="font-display font-extrabold text-xs text-amber-300 tabular-nums">
                        {formatMoney(pl.netWorth)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cloud Profile Sync Status or 1-Click Registration CTA */}
          {onOpenProfile && (
            <div className="pt-0.5">
              {userProfile ? (
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    onOpenProfile();
                  }}
                  className="w-full px-3 py-2 rounded-2xl bg-emerald-500/14 hover:bg-emerald-500/22 border border-emerald-400/35 text-emerald-200 text-[10.5px] font-extrabold flex items-center justify-between gap-2 transition cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">
                      Статистику збережено у профіль @{userProfile.username} (🏆{' '}
                      {userProfile.stats.wins})
                    </span>
                  </span>
                  <span className="text-amber-300 shrink-0">Кабінет →</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    onOpenProfile();
                  }}
                  className="w-full px-3 py-2 rounded-2xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 text-sky-200 text-[10.5px] font-extrabold flex items-center justify-between gap-2 transition cursor-pointer"
                >
                  <span className="truncate">
                    💾 Збережіть цю гру та звання у власний онлайн-профіль!
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-amber-400 text-slate-950 font-black text-[9.5px] shrink-0">
                    Реєстрація →
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* === 3. PINNED BOTTOM ACTION BAR (ALWAYS VISIBLE) === */}
        <div className="shrink-0 px-3.5 sm:px-5 py-2.5 sm:py-3.5 border-t border-white/10 bg-slate-950/65 flex gap-2">
          {(gameState.players.some((p) => p.id === myPlayerId && !p.isBot) ||
            gameState.eliminatedPlayers?.some(
              (p) => p.id === myPlayerId
            )) && (
            <button
              onClick={onRematchLobby}
              className="flex-1 py-2.5 sm:py-3 rounded-2xl mono-cta-btn font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
            >
              <RotateCcw className="w-4 h-4" />
              Реванш у кімнаті
            </button>
          )}
          <button
            onClick={onExitHome}
            className="flex-1 py-2.5 sm:py-3 rounded-2xl bg-white/12 hover:bg-white/20 border border-white/15 text-white font-display font-bold text-xs cursor-pointer transition"
          >
            На головну
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// === 5. INTERACTIVE RULES & IP DISCLAIMER MODAL ===
export const RulesModal: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="@container fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl glass-panel !bg-[var(--surface-solid)] rounded-2xl sm:rounded-3xl p-3.5 @[520px]:p-5 sm:p-7 shadow-2xl space-y-3.5 sm:space-y-4 max-h-full overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-glass)] pb-2.5 sm:pb-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <MagnatBrandIcon size="sm" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <MagnatWordmark size="sm" showCountryBadge />
              </div>
              <p className="text-[11px] sm:text-xs font-semibold text-[var(--text-secondary)] mt-0.5 truncate">
                Офіційні правила та механіка гри (2–4 учасники • Класика та 2×2)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl hover:bg-slate-500/15 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 @[520px]:grid-cols-2 gap-3 sm:gap-3.5 text-xs leading-relaxed">
          <div className="p-4 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] space-y-1.5">
            <div className="font-extrabold text-sm flex items-center gap-1.5 text-blue-600 dark:text-sky-400">
              <Sparkles className="w-4 h-4" /> 1. Компанії та Галузеві Холдинги
            </div>
            <p className="text-[var(--text-secondary)] font-medium">
              Кожен учасник стартує з <strong>15 000 ₴</strong> та отримує{' '}
              <strong>+2 000 ₴</strong> за кожне коло через Старт. Об’єднайте
              усі компанії одного кольорового сектору, щоб подвоїти базову
              оренду та відкрити будівництво <strong>1–4 Філій ★</strong> і{' '}
              <strong>👑 Головного Холдингу</strong>!
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] space-y-1.5">
            <div className="font-extrabold text-sm flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <Gavel className="w-4 h-4" /> 2. Живі Аукціони
            </div>
            <p className="text-[var(--text-secondary)] font-medium">
              Якщо гравець відмовляється купувати вільну компанію за номіналом,
              вона миттєво виставляється на <strong>відкритий аукціон</strong>{' '}
              зі стартовою ціною 25% — змагатися можуть усі магнати за столом!
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] space-y-1.5">
            <div className="font-extrabold text-sm flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <Handshake className="w-4 h-4" /> 3. Смарт-Угоди та Застава
            </div>
            <p className="text-[var(--text-secondary)] font-medium">
              У свій хід ви можете укладати <strong>Смарт-Угоди</strong> із
              Цифровим Підписом (обмін компаніями та гривнями) як із друзями,
              так і з AI-ботами. За потреби активи можна передати в заставу за
              50% вартості.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] space-y-1.5">
            <div className="font-extrabold text-sm flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
              <Award className="w-4 h-4" /> 4. Цифровий Пуш, Оборона та Санкції
            </div>
            <p className="text-[var(--text-secondary)] font-medium">
              Картки <strong>Цифровий Пуш</strong> та{' '}
              <strong>Фонд Єдності</strong> приносять гранти «Власна Справа»,
              Національний кешбек або відправляють у{' '}
              <strong>Санкційний Ізолятор</strong>. Вийти можна за дубль,
              заставу 500 ₴ або картку <strong>Імунітет Бізнесу</strong>.
            </p>
          </div>

          <div className="@[520px]:col-span-2 p-3.5 sm:p-4 rounded-2xl bg-sky-500/8 border border-sky-400/30 space-y-1.5">
            <div className="font-extrabold text-sm flex items-center gap-1.5 text-sky-600 dark:text-sky-300">
              <Users className="w-4 h-4" /> 5. Командний режим «2 на 2» (Альянси)
            </div>
            <p className="text-[var(--text-secondary)] font-medium">
              У режимі <strong>2 на 2</strong> за столом змагаються рівно{' '}
              <strong>4 учасники</strong>: <strong>Синій Альянс (А)</strong>{' '}
              проти <strong>Золотого Альянсу (Б)</strong>. На клітинках
              напарника оренда становить <strong>0 ₴</strong>. Гаманці та
              монополії окремі — передавайте компанії одному з партнерів через{' '}
              <strong>Смарт-Угоди (навіть за 0 ₴)</strong>, щоб будувати філії.
              Альянс програє лише тоді, коли збанкрутують{' '}
              <strong>обидва напарники</strong>!
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] flex items-start gap-2.5 text-[11px] text-[var(--text-muted)]">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Правова інформація:</strong> КАБЗДА.UA — незалежна авторська
            онлайн-гра. Усі бренди, персонажі та події у грі є вигаданими
            художніми образами й не мають стосунку до реальних банків, державних
            сервісів чи зареєстрованих торговельних марок.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl mono-cta-btn font-display font-bold text-xs cursor-pointer"
        >
          Все зрозуміло — до гри!
        </button>
      </motion.div>
    </div>
  );
};
