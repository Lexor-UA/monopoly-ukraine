import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Award,
  Check,
  FileSignature,
  Gavel,
  Handshake,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  BOARD_CELLS,
  TEAM_META,
  areTeammates,
  calculatePlayerNetWorth,
  formatMoney,
  getSectorCells,
} from '../shared/boardData';
import { GameState, ToastTransfer } from '../shared/types';
import {
  BrandEmblem,
  MagnatBrandIcon,
  MagnatWordmark,
  TokenAvatar,
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
export const VictoryModal: React.FC<{
  gameState: GameState;
  myPlayerId: string;
  onRematchLobby: () => void;
  onExitHome: () => void;
}> = ({ gameState, myPlayerId, onRematchLobby, onExitHome }) => {
  const isFinished =
    gameState.status === 'finished' || gameState.phase === 'GAME_OVER';

  useEffect(() => {
    if (!isFinished) return;
    confetti({
      particleCount: 120,
      spread: 85,
      origin: { y: 0.6 },
      colors: ['#0057B8', '#FFD700', '#38BDF8', '#10B981'],
    });
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

  return (
    <div className="@container fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md mono-graphite-card rounded-[24px] sm:rounded-[32px] p-4 @[520px]:p-5 sm:p-7 text-center space-y-3 sm:space-y-5 shadow-2xl border border-amber-400/35 max-h-full overflow-y-auto"
      >
        <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-3xl overflow-hidden border-2 border-amber-400 shadow-xl relative">
          <img
            src="/images/hero-lion-magnate.jpg"
            alt="Перемога"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-slate-950/35 flex items-center justify-center">
            <Trophy className="w-9 h-9 text-amber-300 drop-shadow" />
          </div>
        </div>

        <div>
          <span className="px-3 py-1 rounded-full bg-amber-400/15 text-amber-300 text-xs font-extrabold">
            {isTeamVictory
              ? didMyTeamWin
                ? '🏆 Ваш Альянс переміг • Слава Україні! 🇺🇦'
                : 'Командний матч 2×2 завершено • Слава Україні! 🇺🇦'
              : 'Матч завершено • Слава Україні! 🇺🇦'}
          </span>
          <h2 className="font-display font-extrabold text-2xl text-white mt-3">
            {isTeamVictory && winTeamMeta
              ? `${winTeamMeta.name} — Переможці!`
              : winner
                ? `${winner.name} — Головний Магнат!`
                : 'Гра завершена!'}
          </h2>
        </div>

        {isTeamVictory && winningTeamMembers.length > 0 ? (
          <div className="space-y-2.5">
            {winningTeamMembers.map((member) => (
              <div
                key={member.id}
                className="p-3.5 rounded-2xl bg-white/8 border border-white/15 flex items-center justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TokenAvatar
                    token={member.token}
                    color={member.color}
                    size={42}
                  />
                  <div className="text-left min-w-0">
                    <div className="font-extrabold text-sm text-white truncate flex items-center gap-1.5">
                      <span className="truncate">{member.name}</span>
                      {member.id === myPlayerId && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 text-[9px] font-black shrink-0">
                          ВИ
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-300">
                      {member.isAlive
                        ? `Лідер • ${winTeamMeta?.shortName}`
                        : `Учасник • ${winTeamMeta?.shortName}`}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">
                    Капітал
                  </div>
                  <div className="font-display font-extrabold text-amber-400 text-sm tabular-nums">
                    {formatMoney(member.netWorth)}
                  </div>
                </div>
              </div>
            ))}
            <div
              style={{
                borderColor:
                  winningTeamId === 'A'
                    ? 'rgba(56, 189, 248, 0.38)'
                    : 'rgba(251, 191, 36, 0.38)',
                backgroundColor:
                  winningTeamId === 'A'
                    ? 'rgba(56, 189, 248, 0.12)'
                    : 'rgba(251, 191, 36, 0.12)',
              }}
              className="px-4 py-2.5 rounded-xl border flex items-center justify-between text-xs"
            >
              <span className="font-extrabold text-slate-200">
                🤝 Сумарний капітал альянсу:
              </span>
              <span className="font-display font-extrabold text-amber-300 tabular-nums">
                {formatMoney(teamCombinedWorth)}
              </span>
            </div>
          </div>
        ) : (
          winner && (
            <div className="p-4 rounded-2xl bg-white/8 border border-white/15 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TokenAvatar
                  token={winner.token}
                  color={winner.color}
                  size={46}
                />
                <div className="text-left">
                  <div className="font-extrabold text-sm text-white">
                    {winner.name}
                  </div>
                  <div className="text-xs text-slate-300">
                    Переможець КАБЗДА.UA
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase font-bold">
                  Капітал
                </div>
                <div className="font-display font-extrabold text-amber-400 text-sm tabular-nums">
                  {formatMoney(winnerNetWorth)}
                </div>
              </div>
            </div>
          )
        )}

        <div className="p-3.5 rounded-2xl bg-emerald-500/12 border border-emerald-400/25 flex items-center justify-between text-xs">
          <span className="text-emerald-200 font-bold flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-amber-300" />
            Разом передано на Оборону за гру:
          </span>
          <span className="font-display font-extrabold text-amber-300 tabular-nums">
            {formatMoney(gameState.zsuTotalDonated)}
          </span>
        </div>

        <div className="flex gap-2.5 pt-2">
          {(gameState.players.some((p) => p.id === myPlayerId && !p.isBot) ||
            gameState.eliminatedPlayers?.some((p) => p.id === myPlayerId)) && (
            <button
              onClick={onRematchLobby}
              className="flex-1 py-3.5 rounded-2xl mono-cta-btn font-display font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Реванш у кімнаті
            </button>
          )}
          <button
            onClick={onExitHome}
            className="flex-1 py-3.5 rounded-2xl bg-white/12 hover:bg-white/20 text-white font-display font-bold text-xs cursor-pointer"
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
