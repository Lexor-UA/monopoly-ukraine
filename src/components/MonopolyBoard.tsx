import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Crown,
  Gavel,
  Handshake,
  Lock,
  Navigation,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  BOARD_CELLS,
  SECTOR_BOARD_BADGE_LABELS,
  areTeammates,
  calculateMaxLiquidatableCash,
  calculateRent,
  formatMoney,
  getCellGridPosition,
  hasFullSectorMonopoly,
} from '../shared/boardData';
import { GameState, Player, SectorId, ToastTransfer } from '../shared/types';
import { sound } from '../utils/sound';
import { Dice3D } from './Dice3D';
import {
  DockedEventCardSummary,
  EventCardWowOverlay,
  SideCardDeckStack,
} from './EventCardDealTheatre';
import {
  BoardPawnToken,
  BrandEmblem,
  CardVisualBanner,
  MagnatBrandIcon,
  MagnatWordmark,
  TokenAvatar,
  TokenEmblemSvg,
  getBoardPawnLabel,
  getCellVisualArtwork,
  getImageExposureClass,
  getImageZoomClass,
  withCardArtVersion,
} from './UkrainianArtwork';

interface MonopolyBoardProps {
  gameState: GameState;
  myPlayerId: string;
  selectedCellIndex: number;
  hoveredSector?: SectorId | null;
  activeToast?: ToastTransfer | null;
  boardSizePx?: { width: number; height: number } | null;
  onSelectCell: (idx: number) => void;
  onHoverSector?: (sector: SectorId | null) => void;
  onRollDice: () => void;
  onPayBail: () => void;
  onUseAmnesty: () => void;
  onBuyProperty: () => void;
  onStartAuction: () => void;
  onBidAuction: (inc: number) => void;
  onPassAuction: () => void;
  onPayDebt: () => void;
  onAutoLiquidate: () => void;
  onBankrupt: () => void;
  onEndTurn: () => void;
  onOpenTradeModal: () => void;
}

interface CellBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function formatBoardPrice(
  amount: number,
  compact: boolean,
  ultraCompact: boolean
): string {
  if (!compact) return formatMoney(amount);
  if (amount >= 1000) {
    const k = (amount / 1000)
      .toFixed(amount % 1000 === 0 ? 0 : 1)
      .replace('.0', '');
    return ultraCompact ? `${k}к` : `${k}к ₴`;
  }
  return ultraCompact ? `${amount}` : `${amount} ₴`;
}

export const MonopolyBoard: React.FC<MonopolyBoardProps> = ({
  gameState,
  myPlayerId,
  selectedCellIndex,
  hoveredSector = null,
  activeToast,
  boardSizePx = null,
  onSelectCell,
  onHoverSector,
  onRollDice,
  onPayBail,
  onUseAmnesty,
  onBuyProperty,
  onStartAuction,
  onBidAuction,
  onPassAuction,
  onPayDebt,
  onAutoLiquidate,
  onBankrupt,
  onEndTurn,
  onOpenTradeModal,
}) => {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pawnHopRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const resizeRafRef = useRef<number | null>(null);
  const [confirmBankrupt, setConfirmBankrupt] = useState(false);
  const [boardWidth, setBoardWidth] = useState<number>(() =>
    typeof window !== 'undefined'
      ? window.innerWidth >= 1280
        ? Math.min(920, window.innerWidth - 580)
        : Math.min(720, window.innerWidth - 16)
      : 860
  );
  const boardWidthRef = useRef<number>(boardWidth);
  const [cellBoxes, setCellBoxes] = useState<CellBox[]>([]);
  const [isResizingSnap, setIsResizingSnap] = useState(false);

  const [visualPositions, setVisualPositions] = useState<
    Record<string, number>
  >(() => {
    const initial: Record<string, number> = {};
    for (const p of gameState.players) {
      initial[p.id] = p.position;
    }
    return initial;
  });
  const [isMoveAnimating, setIsMoveAnimating] = useState(false);
  const [movingPlayerId, setMovingPlayerId] = useState<string | null>(null);
  const [activeStepDurationMs, setActiveStepDurationMs] = useState<number>(200);
  const lastProcessedMoveId = useRef<number>(gameState.lastMove?.moveId ?? 0);
  const lastMoveDiceRollId = useRef<number>(gameState.diceRollId);
  const moveTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const animatingPlayerIdRef = useRef<string | null>(null);
  const centerArenaRef = useRef<HTMLDivElement | null>(null);
  const diiaDeckRef = useRef<HTMLDivElement | null>(null);
  const unityDeckRef = useRef<HTMLDivElement | null>(null);
  const dealtCardIdRef = useRef<string | null>(
    gameState.latestEventCard?.id ?? null
  );
  const [dealingDeck, setDealingDeck] = useState<'diia' | 'unity' | null>(null);
  const [liftedDeckTopCard, setLiftedDeckTopCard] = useState<
    'diia' | 'unity' | null
  >(null);
  const [showcaseCardId, setShowcaseCardId] = useState<string | null>(null);
  const [midMoveRevealedCardId, setMidMoveRevealedCardId] = useState<
    string | null
  >(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [visibleToast, setVisibleToast] = useState<ToastTransfer | null>(null);
  const [localHoveredSector, setLocalHoveredSector] = useState<SectorId | null>(
    null
  );

  useEffect(() => {
    if (!activeToast) return;
    setVisibleToast(activeToast);
    const t = setTimeout(() => {
      setVisibleToast((curr) => (curr?.id === activeToast.id ? null : curr));
    }, 3800);
    return () => clearTimeout(t);
  }, [activeToast]);

  useEffect(() => {
    return () => {
      moveTimersRef.current.forEach(clearTimeout);
      moveTimersRef.current = [];
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, []);

  const measureBoardGeometry = useCallback((fromResize: boolean) => {
    const el = boardRef.current;
    if (!el) return;
    // Use layout-local offsetWidth/clientWidth first so CSS rotate(90deg) mobile auto-landscape never swaps axes
    const w = Math.round(
      el.offsetWidth || el.clientWidth || el.getBoundingClientRect().width
    );
    if (w > 0) {
      boardWidthRef.current = w;
      setBoardWidth((prev) => (prev === w ? prev : w));
    }

    const nextBoxes: CellBox[] = [];
    for (let i = 0; i < 40; i++) {
      const cel = cellRefs.current[i];
      if (!cel) return;
      nextBoxes.push({
        left: cel.offsetLeft,
        top: cel.offsetTop,
        width: cel.offsetWidth,
        height: cel.offsetHeight,
      });
    }

    setCellBoxes((prev) => {
      if (
        prev.length === 40 &&
        prev.every(
          (b, idx) =>
            b.left === nextBoxes[idx].left &&
            b.top === nextBoxes[idx].top &&
            b.width === nextBoxes[idx].width &&
            b.height === nextBoxes[idx].height
        )
      ) {
        return prev;
      }
      return nextBoxes;
    });

    if (fromResize) {
      setIsResizingSnap(true);
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
      }
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;
        setIsResizingSnap(false);
      });
    }
  }, []);

  useLayoutEffect(() => {
    measureBoardGeometry(false);
  }, [measureBoardGeometry, boardSizePx?.width, boardSizePx?.height]);

  useEffect(() => {
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureBoardGeometry(true));
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureBoardGeometry]);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (gameState.phase !== 'DEBT_RESOLUTION') {
      setConfirmBankrupt(false);
    }
  }, [gameState.phase]);

  useEffect(() => {
    const clearActiveMoveTimers = () => {
      if (moveTimersRef.current.length > 0) {
        moveTimersRef.current.forEach(clearTimeout);
        moveTimersRef.current = [];
      }
    };

    const move = gameState.lastMove;
    const hasNewMove =
      Boolean(move) && move!.moveId !== lastProcessedMoveId.current;
    const diceJustRolled =
      gameState.diceRollId !== lastMoveDiceRollId.current;

    if (hasNewMove && move) {
      clearActiveMoveTimers();
      lastProcessedMoveId.current = move.moveId;
      lastMoveDiceRollId.current = gameState.diceRollId;

      const steps = move.steps;
      if (steps.length > 0) {
        animatingPlayerIdRef.current = move.playerId;
        setIsMoveAnimating(true);
        setMovingPlayerId(null);

        // Anchor moving player at departure cell while dice are tumbling in the tray
        setVisualPositions((prev) => {
          const next = { ...prev };
          for (const p of gameState.players) {
            next[p.id] = p.id === move.playerId ? move.from : p.position;
          }
          return next;
        });

        const isDirectTeleport =
          steps.length === 1 && (move.from + 1) % 40 !== steps[0];
        const initialDelayMs = diceJustRolled ? 1020 : 140;
        const stepIntervalMs = isDirectTeleport
          ? 340
          : steps.length <= 12
            ? 220
            : Math.max(105, Math.round(2350 / steps.length));
        const hopDurMs = isDirectTeleport
          ? 320
          : Math.round(stepIntervalMs * 0.88);
        setActiveStepDurationMs(hopDurMs);

        const diceSum = gameState.lastDice
          ? gameState.lastDice[0] + gameState.lastDice[1]
          : 0;
        const pendingCard = gameState.latestEventCard;
        const hasMidJourneyEventPause = Boolean(
          diceJustRolled &&
            diceSum > 0 &&
            steps.length > diceSum &&
            pendingCard &&
            pendingCard.id !== dealtCardIdRef.current &&
            (BOARD_CELLS[steps[diceSum - 1]]?.type === 'event_diia' ||
              BOARD_CELLS[steps[diceSum - 1]]?.type === 'event_unity')
        );
        const midPauseMs = hasMidJourneyEventPause ? 3450 : 0;

        const timers: ReturnType<typeof setTimeout>[] = [];
        if (hasMidJourneyEventPause && pendingCard) {
          const midCardTimer = setTimeout(() => {
            setMidMoveRevealedCardId(pendingCard.id);
          }, initialDelayMs + diceSum * stepIntervalMs + 35);
          timers.push(midCardTimer);
        }

        steps.forEach((stepIdx, idx) => {
          const stepDelay =
            initialDelayMs +
            idx * stepIntervalMs +
            (idx >= diceSum ? midPauseMs : 0);
          const t = setTimeout(() => {
            if (idx === 0) {
              setMovingPlayerId(move.playerId);
            }
            sound.playStepHop();
            setVisualPositions((prev) => ({
              ...prev,
              [move.playerId]: stepIdx,
            }));

            // Pure GPU Compositor-Thread Parabolic Hop Arc (Zero DOM Remount, Zero Flicker!)
            const hopEl = pawnHopRefs.current[move.playerId];
            if (hopEl && typeof hopEl.animate === 'function') {
              const liftPx = isDirectTeleport
                ? boardWidthRef.current < 540
                  ? -12
                  : -20
                : boardWidthRef.current < 540
                  ? -5
                  : -8.5;
              hopEl.animate(
                [
                  { transform: 'translate3d(0, 0px, 0) scale(1)' },
                  {
                    transform: `translate3d(0, ${liftPx}px, 0) scale(1.045)`,
                    offset: 0.44,
                  },
                  { transform: 'translate3d(0, 0px, 0) scale(1)' },
                ],
                {
                  duration: hopDurMs,
                  easing: 'cubic-bezier(0.25, 0.88, 0.35, 1)',
                }
              );
            }
          }, stepDelay);
          timers.push(t);
        });

        const doneTimer = setTimeout(() => {
          animatingPlayerIdRef.current = null;
          moveTimersRef.current = [];
          setMovingPlayerId(null);
          setVisualPositions((prev) => ({
            ...prev,
            [move.playerId]: move.to,
          }));
          setIsMoveAnimating(false);
        }, initialDelayMs + steps.length * stepIntervalMs + midPauseMs + 40);
        timers.push(doneTimer);

        moveTimersRef.current = timers;
        return;
      }
    } else if (diceJustRolled) {
      // Dice rolled without board movement (e.g. unsuccessful double attempt in Jail)
      clearActiveMoveTimers();
      lastMoveDiceRollId.current = gameState.diceRollId;
      animatingPlayerIdRef.current = null;
      setMovingPlayerId(null);
      setIsMoveAnimating(true);
      const doneTimer = setTimeout(() => {
        moveTimersRef.current = [];
        setIsMoveAnimating(false);
      }, 1150);
      moveTimersRef.current = [doneTimer];
    } else if (gameState.phase === 'PRE_ROLL' && moveTimersRef.current.length > 0) {
      // Safety reset if turn already handed off to next player's PRE_ROLL
      clearActiveMoveTimers();
      animatingPlayerIdRef.current = null;
      setMovingPlayerId(null);
      setIsMoveAnimating(false);
    }

    if (
      animatingPlayerIdRef.current &&
      !gameState.players.some((p) => p.id === animatingPlayerIdRef.current)
    ) {
      clearActiveMoveTimers();
      animatingPlayerIdRef.current = null;
      setMovingPlayerId(null);
      setIsMoveAnimating(false);
    }

    setVisualPositions((prev) => {
      let changed = false;
      const next = { ...prev };
      const activeIds = new Set(gameState.players.map((p) => p.id));
      for (const existingId of Object.keys(next)) {
        if (!activeIds.has(existingId)) {
          delete next[existingId];
          changed = true;
        }
      }
      for (const p of gameState.players) {
        if (p.id === animatingPlayerIdRef.current) continue;
        if (next[p.id] !== p.position) {
          next[p.id] = p.position;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [
    gameState.lastMove,
    gameState.diceRollId,
    gameState.players,
    gameState.phase,
  ]);

  // Responsive board container tiers
  const isUltraCompact = boardWidth < 450;
  const isPhoneBoard = boardWidth < 540;
  const isCompactBoard = boardWidth < 680;
  const isLaptopBoard = !isCompactBoard && boardWidth < 960;
  const isWideBoard = boardWidth >= 900;

  const activePlayer: Player | undefined =
    gameState.players[gameState.turnIndex];
  const isMyTurn = activePlayer?.id === myPlayerId;
  const me = gameState.players.find((p) => p.id === myPlayerId);

  const turnRemainingSec = gameState.turnEndsAt
    ? Math.max(0, Math.ceil((gameState.turnEndsAt - nowMs) / 1000))
    : null;

  const auctionRemainingSec = gameState.auction?.endsAt
    ? Math.max(0, Math.ceil((gameState.auction.endsAt - nowMs) / 1000))
    : null;

  const activeCell = activePlayer
    ? BOARD_CELLS[activePlayer.position]
    : BOARD_CELLS[0];

  const auctionCell = gameState.auction
    ? BOARD_CELLS[gameState.auction.cellIndex]
    : null;

  const auctionLeader = gameState.auction?.highestBidderId
    ? gameState.players.find(
        (p) => p.id === gameState.auction?.highestBidderId
      )
    : null;

  const holdLandingUi =
    isMoveAnimating &&
    gameState.phase !== 'PRE_ROLL' &&
    gameState.phase !== 'AUCTION';

  const canRevealEventCardNow = Boolean(
    gameState.latestEventCard &&
      (!holdLandingUi ||
        midMoveRevealedCardId === gameState.latestEventCard.id)
  );

  useEffect(() => {
    const card = gameState.latestEventCard;
    if (!card) {
      dealtCardIdRef.current = null;
      setShowcaseCardId(null);
      setMidMoveRevealedCardId(null);
      setDealingDeck(null);
      setLiftedDeckTopCard(null);
      return;
    }
    if (!canRevealEventCardNow) return;
    if (dealtCardIdRef.current !== card.id) {
      dealtCardIdRef.current = card.id;
      setShowcaseCardId(card.id);
      setDealingDeck(card.deck);
      const t = setTimeout(() => setDealingDeck(null), 3250);
      return () => clearTimeout(t);
    }
  }, [gameState.latestEventCard, canRevealEventCardNow]);

  const activeShowcaseCard =
    gameState.latestEventCard &&
    showcaseCardId === gameState.latestEventCard.id &&
    canRevealEventCardNow
      ? gameState.latestEventCard
      : null;

  const eventCardDrawerPlayer = gameState.latestEventCard
    ? gameState.players.find(
        (pl) => pl.id === gameState.latestEventCard?.playerId
      )
    : undefined;

  const canRollNow =
    !isMoveAnimating &&
    isMyTurn &&
    (gameState.phase === 'PRE_ROLL' ||
      (gameState.phase === 'POST_ROLL' &&
        (activePlayer?.doublesCount ?? 0) > 0 &&
        !activePlayer?.inJail));

  const hasBusyCenterCard =
    (!holdLandingUi &&
      (gameState.phase === 'BUY_DECISION' ||
        gameState.phase === 'DEBT_RESOLUTION' ||
        Boolean(gameState.latestEventCard))) ||
    gameState.phase === 'AUCTION' ||
    Boolean(isMyTurn && gameState.phase === 'PRE_ROLL' && activePlayer?.inJail);

  const hideDiceForPhoneDecision =
    isPhoneBoard &&
    !holdLandingUi &&
    (gameState.phase === 'BUY_DECISION' ||
      gameState.phase === 'AUCTION' ||
      gameState.phase === 'DEBT_RESOLUTION');

  const activeVisualPosition = activePlayer
    ? (visualPositions[activePlayer.id] ?? activePlayer.position)
    : -1;

  const diceSizeTier: 'sm' | 'md' | 'lg' | 'xl' =
    isPhoneBoard || (isCompactBoard && hasBusyCenterCard)
      ? 'sm'
      : boardWidth < 780 || (boardWidth < 940 && hasBusyCenterCard)
        ? 'md'
        : boardWidth >= 940 && !hasBusyCenterCard
          ? 'xl'
          : 'lg';

  const recentLogs = gameState.logs.slice(0, isCompactBoard ? 2 : 3);

  const gridGap = isUltraCompact ? '1.5px' : isCompactBoard ? '3.5px' : isLaptopBoard ? '4px' : '5px';
  const gridCols = isPhoneBoard
    ? '1.46fr repeat(9, 1fr) 1.46fr'
    : isCompactBoard || isLaptopBoard
      ? '1.45fr repeat(9, 1fr) 1.45fr'
      : '1.60fr repeat(9, 1fr) 1.60fr';
  const gridRows = isPhoneBoard
    ? '1.28fr repeat(9, 1fr) 1.28fr'
    : '1.36fr repeat(9, 1fr) 1.36fr';
  const selectedBoardSector = BOARD_CELLS[selectedCellIndex]?.sector ?? null;
  const activeHoverSector = hoveredSector ?? localHoveredSector;
  const highlightedBoardSector = activeHoverSector ?? selectedBoardSector;
  const mePlayer = gameState.players.find((p) => p.id === myPlayerId);
  const isActivePlayerAlly = Boolean(
    activePlayer &&
      areTeammates(gameState.settings.gameMode, mePlayer, activePlayer)
  );

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div
        ref={boardRef}
        className={`${
          boardSizePx
            ? 'shrink-0'
            : 'w-full max-w-[min(1340px,calc((100dvh-14px)*1.20))] lg:max-h-[calc(100dvh-14px)] aspect-square lg:aspect-[1.18/1] xl:aspect-[1.20/1]'
        } ${
          isPhoneBoard
            ? 'rounded-[16px] p-1'
            : isCompactBoard
              ? 'rounded-[22px] p-1.5'
              : isLaptopBoard
                ? 'rounded-[24px] p-2'
                : 'rounded-[28px] p-2.5 sm:p-3'
        } board-luxury-frame relative select-none`}
        style={{
          ...(boardSizePx
            ? {
                width: `${boardSizePx.width}px`,
                height: `${boardSizePx.height}px`,
              }
            : undefined),
          display: 'grid',
          gridTemplateColumns: gridCols,
          gridTemplateRows: gridRows,
          gap: gridGap,
        }}
      >
        {/* 40 BRIGHT, CRYSTAL-CLEAR 3D ILLUSTRATED PERIMETER CARDS */}
        {BOARD_CELLS.map((cell) => {
          const pos = getCellGridPosition(cell.index);
          const prop = gameState.properties[cell.index];
          const owner = prop?.ownerId
            ? gameState.players.find((p) => p.id === prop.ownerId)
            : null;
          const isSelected = selectedCellIndex === cell.index;
          const isActiveHere =
            movingPlayerId === null && activeVisualPosition === cell.index;
          const hasStationaryPlayersOnCell = gameState.players.some(
            (p) =>
              !p.isBankrupt &&
              p.id !== movingPlayerId &&
              (visualPositions[p.id] ?? p.position) === cell.index
          );

          // EXCLUSIVE MONOPOLY COLOR CHANNEL: Only the 8 true color monopolies have inner colored header bars & colored frames!
          const isCompanyMonopoly =
            cell.type === 'company' && Boolean(cell.color);
          const isSpecialNetwork =
            cell.type === 'transport' || cell.type === 'utility';
          const hasInnerSectorBand =
            isCompanyMonopoly && pos.side !== 'corner';
          const isHoveredSectorMatch = Boolean(
            activeHoverSector && cell.sector === activeHoverSector
          );
          const isSameMonopolyGroup = Boolean(
            (!isSelected || isHoveredSectorMatch) &&
              highlightedBoardSector &&
              cell.sector === highlightedBoardSector
          );
          const isCollectedMonopoly = Boolean(
            cell.type === 'company' &&
              cell.sector &&
              owner &&
              hasFullSectorMonopoly(
                owner.id,
                cell.sector,
                gameState.properties,
                false
              )
          );

          // Live count for owned Transport (1/4..4/4) & Infrastructure (1/2..2/2) special networks
          const specialNetworkTotal = cell.type === 'transport' ? 4 : 2;
          const specialNetworkOwnedByOwner =
            isSpecialNetwork && owner
              ? BOARD_CELLS.filter(
                  (c) =>
                    c.type === cell.type &&
                    gameState.properties[c.index]?.ownerId === owner.id
                ).length
              : 0;
          const isFullSpecialNetwork =
            isSpecialNetwork &&
            Boolean(owner) &&
            specialNetworkOwnedByOwner >= specialNetworkTotal;

          // Bold, Unmistakable Classic-Monopoly Inner Color Header Plate (14.5px / 16px on desktop)
          const ribbonThicknessH = isPhoneBoard
            ? 'h-[5.5px]'
            : isCompactBoard
              ? 'h-[11.5px]'
              : isWideBoard
                ? 'h-[16px]'
                : 'h-[14.5px]';
          const ribbonThicknessW = isPhoneBoard
            ? 'w-[5px]'
            : isCompactBoard
              ? 'w-[11.5px]'
              : isWideBoard
                ? 'w-[16px]'
                : 'w-[14.5px]';

          const ribbonPosClass =
            pos.side === 'top'
              ? `bottom-0 left-0 right-0 ${ribbonThicknessH} border-t border-[#050812]/95`
              : pos.side === 'bottom'
                ? `top-0 left-0 right-0 ${ribbonThicknessH} border-b border-[#050812]/95`
                : pos.side === 'left'
                  ? `top-0 bottom-0 right-0 ${ribbonThicknessW} border-l border-[#050812]/95`
                  : pos.side === 'right'
                    ? `top-0 bottom-0 left-0 ${ribbonThicknessW} border-r border-[#050812]/95`
                    : '';

          const isHorizontalSide =
            pos.side === 'left' || pos.side === 'right';
          const isLightSectorBar = cell.sector === 'telecom';
          const sectorHeaderLabel = cell.sector
            ? isCollectedMonopoly
              ? isCompactBoard
                ? '👑 ×2'
                : isHorizontalSide
                  ? '👑 Монополія'
                  : '👑 Монополія ×2'
              : SECTOR_BOARD_BADGE_LABELS[cell.sector]
            : '';

          const art = getCellVisualArtwork(cell);
          const exposureClass = getImageExposureClass(art.imageSrc);
          const zoomClass = getImageZoomClass(art.imageSrc);

          const priceDisplay = cell.price
            ? formatBoardPrice(cell.price, isCompactBoard, isUltraCompact)
            : cell.taxAmount
              ? `-${formatBoardPrice(cell.taxAmount, isCompactBoard, isUltraCompact)}`
              : null;

          const isOwnerMe = Boolean(owner && owner.id === myPlayerId);
          const isOwnerAlly = Boolean(
            owner && areTeammates(gameState.settings.gameMode, mePlayer, owner)
          );
          const hasTopCornerSibling = Boolean(
            (isSpecialNetwork && !isUltraCompact) ||
              (prop && prop.branches > 0)
          );
          const baseOwnerShort = owner
            ? getBoardPawnLabel(
                owner.name,
                false,
                !isHorizontalSide && hasTopCornerSibling
              )
            : '';
          const ownerTagLabel = owner
            ? isOwnerMe
              ? 'ВИ'
              : isOwnerAlly && !isCompactBoard && !hasTopCornerSibling
                ? `🤝 ${baseOwnerShort}`
                : baseOwnerShort
            : '';

          let ownedStatusDisplay: string | null = null;
          if (owner && prop) {
            if (prop.isMortgaged) {
              ownedStatusDisplay = isUltraCompact ? 'Заст.' : 'Застава';
            } else if (cell.type === 'utility') {
              const ownedUtils = BOARD_CELLS.filter(
                (c) =>
                  c.type === 'utility' &&
                  gameState.properties[c.index]?.ownerId === owner.id &&
                  !gameState.properties[c.index]?.isMortgaged
              ).length;
              const mult = ownedUtils >= 2 ? 100 : 40;
              ownedStatusDisplay = isCompactBoard
                ? `×${mult}`
                : `Ор. ×${mult}`;
            } else {
              const liveRent = calculateRent(
                cell.index,
                gameState.properties,
                7
              );
              const useCompactRent =
                isCompactBoard ||
                (isHorizontalSide && liveRent >= 1000) ||
                liveRent >= 10000;
              const rentValStr = formatBoardPrice(
                liveRent,
                useCompactRent,
                isUltraCompact
              );
              const monopolyPrefix =
                isCollectedMonopoly && !isCompactBoard && !isPhoneBoard
                  ? '👑 '
                  : '';
              ownedStatusDisplay =
                isCompactBoard || isPhoneBoard
                  ? rentValStr
                  : `${monopolyPrefix}Ор. ${rentValStr}`;
            }
          }

          // Owner-Colored Rent Pill:
          // - YOUR ASSET ("ВИ"): Rich Emerald-Gold VIP Pill
          // - RIVAL / ALLY ASSET: Vivid Owner-Color Gradient Pill so every player's properties are distinct at a glance!
          const ownedPillStyle: React.CSSProperties | undefined = owner
            ? prop?.isMortgaged
              ? {
                  backgroundColor: 'rgba(127, 29, 29, 0.95)',
                  borderColor: 'rgba(252, 165, 165, 0.65)',
                }
              : isOwnerMe
                ? {
                    background:
                      'linear-gradient(135deg, color-mix(in srgb, #10B981 82%, #020617) 0%, color-mix(in srgb, #059669 66%, #020617) 100%)',
                    borderColor: isCollectedMonopoly
                      ? 'rgba(253, 224, 71, 0.95)'
                      : 'rgba(167, 243, 208, 0.9)',
                    boxShadow:
                      '0 2px 6px rgba(2, 6, 23, 0.88), 0 0 8px rgba(16, 185, 129, 0.32)',
                  }
                : {
                    background: `linear-gradient(135deg, color-mix(in srgb, ${owner.color} 86%, #020617) 0%, color-mix(in srgb, ${owner.color} 62%, #020617) 100%)`,
                    borderColor: isCollectedMonopoly
                      ? 'rgba(253, 224, 71, 0.95)'
                      : `color-mix(in srgb, ${owner.color} 72%, #ffffff)`,
                    boxShadow: '0 2px 5px rgba(2, 6, 23, 0.88)',
                  }
            : undefined;

          // Non-overlapping clearance offsets around the Bold Inner Monopoly Header Plate
          const bottomRowBadgeTopClass = hasInnerSectorBand
            ? isPhoneBoard
              ? 'top-[8px]'
              : isCompactBoard
                ? 'top-[13px]'
                : isWideBoard
                  ? 'top-[17.5px]'
                  : 'top-[16px]'
            : isPhoneBoard
              ? 'top-1'
              : 'top-1.5';

          const topRowBadgeTopClass = isPhoneBoard ? 'top-0.5' : 'top-1';

          const leftColInnerRightBadgeClass = hasInnerSectorBand
            ? isPhoneBoard
              ? 'right-[8px]'
              : isCompactBoard
                ? 'right-[13px]'
                : isWideBoard
                  ? 'right-[17.5px]'
                  : 'right-[16px]'
            : isPhoneBoard
              ? 'right-1'
              : 'right-1.5';

          const rightColInnerLeftBadgeClass = hasInnerSectorBand
            ? isPhoneBoard
              ? 'left-[8px]'
              : isCompactBoard
                ? 'left-[13px]'
                : isWideBoard
                  ? 'left-[17.5px]'
                  : 'left-[16px]'
            : isPhoneBoard
              ? 'left-1'
              : 'left-1.5';

          // Card Perimeter Border & Glow Hierarchy:
          // - Bought cards light up with a crisp 2px border in the Owner's Color (or Emerald/White for "ВИ")
          // - Unbought cards keep a calm 1px frame while the inner Monopoly Sector Bar displays the sector color
          const cardBorderColor = isSelected
            ? '#38BDF8'
            : isSameMonopolyGroup && cell.color
              ? cell.color
              : isCollectedMonopoly
                ? '#FDE047'
                : isOwnerMe
                  ? '#34D399'
                  : owner
                    ? `color-mix(in srgb, ${owner.color} 88%, #ffffff)`
                    : isCompanyMonopoly && cell.color
                      ? `color-mix(in srgb, ${cell.color} 45%, rgba(255, 255, 255, 0.16))`
                      : undefined;

          const cardBoxShadow = isSelected
            ? isOwnerMe
              ? 'inset 0 0 0 1.5px rgba(255, 255, 255, 0.85)'
              : undefined
            : isHoveredSectorMatch && cell.color
              ? `0 0 0 2px ${cell.color}, 0 0 22px ${cell.color}aa, inset 0 0 0 1px rgba(255, 255, 255, 0.65)`
              : isSameMonopolyGroup && cell.color
                ? `0 0 0 1.5px ${cell.color}, 0 0 15px ${cell.color}80${
                    isOwnerMe
                      ? ', inset 0 0 0 1.5px rgba(255, 255, 255, 0.88)'
                      : ', inset 0 0 8px rgba(6, 10, 20, 0.25)'
                  }`
                : isCollectedMonopoly && cell.color
                  ? isOwnerMe
                    ? `0 0 0 1.5px #FDE047, 0 0 14px rgba(16, 185, 129, 0.5), inset 0 0 0 1.5px rgba(255, 255, 255, 0.9)`
                    : `0 0 0 1px #FBBF24, 0 0 12px ${owner?.color ?? cell.color}66, inset 0 0 0 1px rgba(253, 224, 71, 0.45)`
                  : isOwnerMe
                    ? '0 0 0 1px rgba(52, 211, 153, 0.72), 0 0 12px rgba(16, 185, 129, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.82)'
                    : owner
                      ? `0 0 10px ${owner.color}40, inset 0 0 0 0.75px ${owner.color}88`
                      : 'inset 0 0 8px rgba(6, 10, 20, 0.24), 0 2px 6px rgba(0, 0, 0, 0.30)';

          return (
            <div
              key={cell.index}
              ref={(el) => {
                cellRefs.current[cell.index] = el;
              }}
              onClick={() => {
                sound.playClick();
                onSelectCell(cell.index);
              }}
              onMouseEnter={() => {
                if (cell.sector) {
                  setLocalHoveredSector(cell.sector);
                  onHoverSector?.(cell.sector);
                }
              }}
              onMouseLeave={() => {
                if (cell.sector) {
                  setLocalHoveredSector(null);
                  onHoverSector?.(null);
                }
              }}
              style={{
                gridRow: pos.row,
                gridColumn: pos.col,
                backgroundColor: '#0e1627',
                borderColor: cardBorderColor,
                boxShadow: cardBoxShadow,
              }}
              className={`group relative ${
                isPhoneBoard ? 'rounded-[7px]' : 'rounded-[11px] sm:rounded-[12px]'
              } ${
                isSelected ||
                isSameMonopolyGroup ||
                isCollectedMonopoly ||
                Boolean(owner)
                  ? 'border-2'
                  : 'border border-slate-700/75 dark:border-slate-800/95'
              } overflow-hidden cursor-pointer transition-[transform,box-shadow,border-color] duration-200 hover:z-10 sm:hover:scale-[1.025] hover:shadow-xl text-slate-100 flex flex-col items-stretch justify-between text-center ${
                isSelected
                  ? 'ring-2 ring-sky-400/90 z-10 shadow-xl'
                  : isHoveredSectorMatch
                    ? 'z-[11] sm:scale-[1.02]'
                    : isSameMonopolyGroup
                      ? 'z-[9]'
                      : isActiveHere
                        ? 'ring-2 ring-amber-400/85 shadow-lg'
                        : ''
              }`}
            >
              {/* Full-Clarity Velvet-Graded 3D Illustration Backdrop */}
              <img
                src={art.imageSrc}
                alt=""
                loading="eager"
                decoding="async"
                style={{ objectPosition: art.objectPosition }}
                className={`absolute inset-0 w-full h-full object-cover ${
                  owner || !(isCompanyMonopoly || isSpecialNetwork)
                    ? 'opacity-100'
                    : 'opacity-[0.94]'
                } ${exposureClass} ${zoomClass} transition-transform duration-500 pointer-events-none`}
              />

              {/* Whisper-Soft Perimeter Rim Vignette */}
              <div
                style={{
                  boxShadow: 'inset 0 0 10px rgba(7, 11, 21, 0.28)',
                }}
                className="pointer-events-none absolute inset-0 z-[2]"
              />

              {/* BOLD INNER MONOPOLY SECTOR HEADER PLATE (Simple, Crisp Ukrainian Sector Names — Zero Cryptic Numbers or Anglicisms!) */}
              {hasInnerSectorBand && (
                <div
                  style={{
                    backgroundColor: isLightSectorBar
                      ? cell.color
                      : `color-mix(in srgb, ${cell.color} 90%, #020617)`,
                    backgroundImage: isHorizontalSide
                      ? `linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 45%, rgba(0,0,0,0.24) 100%)`
                      : `linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 45%, rgba(0,0,0,0.24) 100%)`,
                    boxShadow: isCollectedMonopoly
                      ? 'inset 0 0 0 1.5px rgba(254, 240, 138, 0.96), 0 1.5px 4px rgba(0, 0, 0, 0.72)'
                      : 'inset 0 0 0 0.75px rgba(255, 255, 255, 0.34), 0 1px 3px rgba(0, 0, 0, 0.6)',
                  }}
                  className={`absolute z-[6] pointer-events-none overflow-hidden flex items-center justify-center ${ribbonPosClass}`}
                >
                  {!isPhoneBoard && sectorHeaderLabel ? (
                    <span
                      style={{
                        ...(isHorizontalSide
                          ? {
                              position: 'absolute',
                              left: '50%',
                              top: '50%',
                              transform:
                                pos.side === 'left'
                                  ? 'translate(-50%, -50%) rotate(-90deg)'
                                  : 'translate(-50%, -50%) rotate(90deg)',
                            }
                          : undefined),
                        textShadow: isLightSectorBar
                          ? '0 0.5px 0 rgba(255, 255, 255, 0.55)'
                          : '0 1px 2px rgba(2, 6, 23, 0.96), 0 0 2.5px rgba(2, 6, 23, 0.85)',
                      }}
                      className={`whitespace-nowrap font-extrabold leading-none ${
                        isCompactBoard
                          ? 'text-[7px] tracking-[0.02em]'
                          : isWideBoard
                            ? 'text-[9.2px] tracking-[0.025em]'
                            : 'text-[8.2px] tracking-[0.02em]'
                      } ${
                        isLightSectorBar
                          ? 'text-slate-950'
                          : isCollectedMonopoly
                            ? 'text-amber-100'
                            : 'text-white'
                      }`}
                    >
                      {sectorHeaderLabel}
                    </span>
                  ) : (
                    <span
                      className={`rounded-full ${
                        isHorizontalSide
                          ? 'h-[58%] w-[1.5px]'
                          : 'w-[58%] h-[1.5px]'
                      } ${
                        isCollectedMonopoly
                          ? 'bg-amber-100/95'
                          : isLightSectorBar
                            ? 'bg-slate-950/35'
                            : 'bg-white/45'
                      }`}
                    />
                  )}
                </div>
              )}

              {/* Special Network Micro-Crest (Live 1/4..4/4 Transport & 1/2..2/2 Infrastructure when owned, ×4 / ×2 when free) */}
              {isSpecialNetwork && pos.side !== 'corner' && !isUltraCompact && (
                <div
                  title={
                    cell.type === 'transport'
                      ? 'Стратегічний Транспорт (мережа з 4 об’єктів)'
                      : 'Критична Інфраструктура (мережа з 2 об’єктів)'
                  }
                  className={`absolute ${
                    pos.side === 'right'
                      ? isPhoneBoard
                        ? 'top-0.5 right-1'
                        : 'top-1 right-1.5'
                      : pos.side === 'left'
                        ? isPhoneBoard
                          ? 'top-0.5 left-1'
                          : 'top-1 left-1.5'
                        : pos.side === 'bottom'
                          ? `${bottomRowBadgeTopClass} ${
                              isPhoneBoard ? 'left-0.5' : 'left-1'
                            }`
                          : `${topRowBadgeTopClass} ${
                              isPhoneBoard ? 'left-0.5' : 'left-1'
                            }`
                  } z-10 inline-flex items-center gap-0.5 ${
                    isPhoneBoard
                      ? 'px-0.5 py-0 text-[6px]'
                      : 'px-1 py-[1.5px] text-[7.5px]'
                  } rounded backdrop-blur-xs font-extrabold leading-tight shadow-md pointer-events-none ${
                    isFullSpecialNetwork
                      ? 'bg-amber-400 text-slate-950 border border-amber-100'
                      : cell.type === 'transport'
                        ? 'bg-slate-950/88 text-slate-100 border border-slate-200/55'
                        : 'bg-slate-950/88 text-amber-100 border border-amber-200/55'
                  }`}
                >
                  {!isPhoneBoard &&
                    (isFullSpecialNetwork ? (
                      <Crown className="w-2.5 h-2.5 fill-slate-950 text-slate-950 shrink-0" />
                    ) : cell.type === 'transport' ? (
                      <Navigation className="w-2 h-2 text-slate-200 shrink-0" />
                    ) : (
                      <Zap className="w-2 h-2 text-amber-300 shrink-0" />
                    ))}
                  <span>
                    {owner
                      ? `${specialNetworkOwnedByOwner}/${specialNetworkTotal}`
                      : `×${specialNetworkTotal}`}
                  </span>
                </div>
              )}

              {/* UNMISTAKABLE OWNER PLAQUE (Desktop/Tablet only — on mobile, ownership + token emblem live cleanly inside the bottom rent badge so the card name & 3D artwork are 100% uncovered!):
                  - YOUR ASSET ("ВИ"): Crisp Bright-White VIP Capsule + Emerald Glow Ring
                  - RIVAL ASSET ("Лев / Леся / Тарас"): Vivid Solid Rival-Color Capsule */}
              {owner && !isPhoneBoard && (
                <span
                  style={
                    isOwnerMe
                      ? {
                          background:
                            'linear-gradient(180deg, #FFFFFF 0%, #E2E8F0 100%)',
                          borderColor: isCollectedMonopoly
                            ? '#F59E0B'
                            : '#10B981',
                          boxShadow:
                            '0 0 0 1px rgba(2, 6, 23, 0.92), 0 0 10px rgba(16, 185, 129, 0.52), 0 3px 7px rgba(2, 6, 23, 0.9)',
                        }
                      : isOwnerAlly
                        ? {
                            background: `linear-gradient(135deg, color-mix(in srgb, ${owner.color} 86%, #082F49) 0%, color-mix(in srgb, ${owner.color} 58%, #082F49) 100%)`,
                            borderColor: isCollectedMonopoly
                              ? '#FDE047'
                              : '#38BDF8',
                            boxShadow:
                              '0 0 0 1px rgba(2, 6, 23, 0.95), 0 0 8px rgba(56, 189, 248, 0.42), 0 3px 7px rgba(2, 6, 23, 0.92)',
                          }
                        : {
                            background: `linear-gradient(135deg, color-mix(in srgb, ${owner.color} 90%, #020617) 0%, color-mix(in srgb, ${owner.color} 64%, #020617) 100%)`,
                            borderColor: isCollectedMonopoly
                              ? '#FDE047'
                              : 'rgba(255, 255, 255, 0.62)',
                            boxShadow:
                              '0 0 0 1px rgba(2, 6, 23, 0.95), 0 3px 7px rgba(2, 6, 23, 0.92)',
                          }
                  }
                  title={
                    isCollectedMonopoly
                      ? `МОНОПОЛІЯ (${cell.sectorName}) • Власник: ${owner.name}${
                          isOwnerAlly
                            ? ' (Ваш напарник — оренда для вас 0 ₴)'
                            : ''
                        }`
                      : `Власник активу: ${owner.name}${
                          isOwnerAlly
                            ? ' (Ваш напарник — оренда для вас 0 ₴)'
                            : ''
                        }`
                  }
                  className={`absolute ${
                    pos.side === 'left'
                      ? `top-1 ${leftColInnerRightBadgeClass}`
                      : pos.side === 'right'
                        ? `top-1 ${rightColInnerLeftBadgeClass}`
                        : pos.side === 'bottom'
                          ? `${bottomRowBadgeTopClass} right-1`
                          : `${topRowBadgeTopClass} right-1`
                  } ${
                    isCompactBoard && !isHorizontalSide && hasTopCornerSibling
                      ? 'p-[1.5px] rounded-full justify-center'
                      : 'pl-[2px] pr-1.5 py-[1px] rounded-full gap-1'
                  } border inline-flex items-center z-10 pointer-events-none leading-none`}
                >
                  <span
                    style={{
                      backgroundColor: owner.color,
                      boxShadow: isOwnerMe
                        ? 'inset 0 0.5px 1px rgba(255, 255, 255, 0.55), 0 0 0 1px rgba(2, 6, 23, 0.8)'
                        : 'inset 0 0.5px 1px rgba(255, 255, 255, 0.55), 0 0 0 0.75px rgba(2, 6, 23, 0.72)',
                    }}
                    className="w-[12.5px] h-[12.5px] rounded-full inline-flex items-center justify-center shrink-0"
                  >
                    {isCollectedMonopoly ? (
                      <Crown className="w-2.5 h-2.5 fill-amber-200 text-slate-950 shrink-0" />
                    ) : (
                      <TokenEmblemSvg
                        token={owner.token}
                        className="w-[78%] h-[78%]"
                      />
                    )}
                  </span>

                  {!(
                    isCompactBoard &&
                    !isHorizontalSide &&
                    hasTopCornerSibling
                  ) && (
                    <span
                      style={
                        isOwnerMe
                          ? undefined
                          : { textShadow: '0 1px 2px rgba(2, 6, 23, 0.92)' }
                      }
                      className={`text-[7.4px] 2xl:text-[8.2px] font-black tracking-tight truncate ${
                        !isHorizontalSide && hasTopCornerSibling
                          ? 'max-w-[28px]'
                          : 'max-w-[46px]'
                      } ${
                        isOwnerMe
                          ? 'text-slate-950'
                          : isCollectedMonopoly
                            ? 'text-amber-100'
                            : 'text-white'
                      }`}
                    >
                      {ownerTagLabel}
                    </span>
                  )}
                </span>
              )}

              {/* Branches / Holding Badge */}
              {prop && prop.branches > 0 && (
                <div
                  className={`absolute ${
                    pos.side === 'right'
                      ? isPhoneBoard
                        ? 'top-0.5 right-1'
                        : 'top-1 right-1.5'
                      : pos.side === 'left'
                        ? isPhoneBoard
                          ? 'top-0.5 left-1'
                          : 'top-1 left-1.5'
                        : pos.side === 'bottom'
                          ? `${bottomRowBadgeTopClass} ${
                              isPhoneBoard ? 'left-0.5' : 'left-1'
                            }`
                          : `${topRowBadgeTopClass} ${
                              isPhoneBoard ? 'left-0.5' : 'left-1'
                            }`
                  } z-10 flex items-center gap-0.5 ${
                    isPhoneBoard
                      ? 'px-1 py-0 text-[6.5px]'
                      : 'px-1.5 py-0.5 text-[8px]'
                  } rounded bg-amber-400 text-slate-950 font-black shadow-md leading-tight`}
                >
                  {prop.branches >= 5 ? (
                    <span>👑</span>
                  ) : (
                    <>
                      <Star
                        className={`${
                          isPhoneBoard ? 'w-2 h-2' : 'w-2.5 h-2.5'
                        } fill-slate-950`}
                      />
                      <span>{prop.branches}</span>
                    </>
                  )}
                </div>
              )}

              {/* Mortgaged Overlay */}
              {prop?.isMortgaged && (
                <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px] z-[8] flex items-center justify-center p-0.5">
                  <span
                    className={`px-1 py-0.5 rounded bg-rose-600 text-white ${
                      isPhoneBoard ? 'text-[6px]' : 'text-[7.5px]'
                    } font-black uppercase tracking-wider flex items-center gap-0.5 shadow`}
                  >
                    <Lock
                      className={isPhoneBoard ? 'w-2 h-2' : 'w-2.5 h-2.5'}
                    />
                    {!isUltraCompact && <span>Застава</span>}
                  </span>
                </div>
              )}

              {/* === CELL CONTENT (All 40 Cards Leave Center 3D Artwork Open & Never Overlap Bold Inner Monopoly Plate!) === */}
              {pos.side === 'corner' ? (
                <div
                  className={`relative z-[4] w-full h-full flex flex-col justify-between ${
                    isPhoneBoard
                      ? 'p-0.5'
                      : isCompactBoard || isLaptopBoard
                        ? 'p-1'
                        : 'p-1.5'
                  } text-white overflow-hidden`}
                >
                  <div className="flex items-start justify-start">
                    <BrandEmblem
                      brandKey={cell.brandKey}
                      size={isPhoneBoard || isCompactBoard || isLaptopBoard ? 'xs' : 'sm'}
                    />
                  </div>

                  <div className="flex flex-col items-center gap-0.5 pb-0.5 w-full min-w-0">
                    <div
                      className={`board-card-caption ${
                        isPhoneBoard
                          ? 'font-sans font-black tracking-tight'
                          : 'font-display font-extrabold'
                      } ${
                        isUltraCompact
                          ? 'text-[7px]'
                          : isPhoneBoard
                            ? 'text-[7.8px]'
                            : isCompactBoard
                              ? 'text-[8.4px] tracking-[-0.015em]'
                              : isLaptopBoard
                                ? 'text-[9.2px] tracking-[-0.015em]'
                                : 'text-[10.5px] 2xl:text-xs'
                      } leading-tight max-w-full truncate`}
                    >
                      {cell.shortName}
                    </div>
                    {cell.subtitle && !isPhoneBoard && !hasStationaryPlayersOnCell && (
                      <div
                        className={`${
                          isCompactBoard || isLaptopBoard
                            ? 'text-[6.8px] xl:text-[7.2px] px-1 py-[1px] tracking-[-0.02em]'
                            : 'text-[8px] 2xl:text-[9px] px-1.5 py-0.5'
                        } font-extrabold leading-tight rounded-full backdrop-blur-xs max-w-full truncate ${
                          cell.index === 0
                            ? 'bg-emerald-500/45 text-emerald-50 border border-emerald-300/60'
                            : cell.index === 20
                              ? 'bg-emerald-500/40 text-emerald-50 border border-emerald-300/50'
                              : cell.index === 30
                                ? 'bg-rose-500/45 text-rose-50 border border-rose-300/60'
                                : 'bg-slate-950/75 text-slate-100 border border-white/25'
                        }`}
                      >
                        {cell.subtitle}
                      </div>
                    )}
                  </div>
                </div>
              ) : isHorizontalSide ? (
                /* LEFT & RIGHT LANDSCAPE CARDS: Clean Uncluttered 3D Artwork Window + Dedicated Inner Monopoly Plate Clearance */
                <div
                  className={`relative z-[4] w-full h-full flex flex-col justify-end overflow-hidden ${
                    pos.side === 'left'
                      ? isPhoneBoard
                        ? `pl-[1.5px] ${hasInnerSectorBand ? 'pr-[5.5px]' : 'pr-0.5'} py-[1.5px]`
                        : `${isCompactBoard || isLaptopBoard ? 'pl-1' : 'pl-2'} ${
                            hasInnerSectorBand
                              ? isCompactBoard
                                ? 'pr-[12.5px]'
                                : isWideBoard
                                  ? 'pr-[17.5px]'
                                  : 'pr-[15px]'
                              : isCompactBoard || isLaptopBoard
                                ? 'pr-1'
                                : 'pr-2'
                          } pt-1 pb-1`
                      : isPhoneBoard
                        ? `pr-[1.5px] ${hasInnerSectorBand ? 'pl-[5.5px]' : 'pl-0.5'} py-[1.5px]`
                        : `${isCompactBoard || isLaptopBoard ? 'pr-1' : 'pr-2'} ${
                            hasInnerSectorBand
                              ? isCompactBoard
                                ? 'pl-[12.5px]'
                                : isWideBoard
                                  ? 'pl-[17.5px]'
                                  : 'pl-[15px]'
                              : isCompactBoard || isLaptopBoard
                                ? 'pl-1'
                                : 'pl-2'
                          } pt-1 pb-1`
                  }`}
                >
                  {/* Bottom Full-Width Crisp Caption Stacked Above Price / Owned Rent Pill — Guarantees Full Company Names on Every Screen! */}
                  <div
                    className={`flex flex-col gap-[1.5px] w-full min-w-0 ${
                      pos.side === 'right' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`w-full board-card-caption ${
                        pos.side === 'right' ? 'text-right' : 'text-left'
                      } ${
                        isUltraCompact
                          ? 'text-[6.1px] leading-[1.02] tracking-[-0.035em]'
                          : isPhoneBoard
                            ? 'text-[6.8px] leading-[1.04] tracking-[-0.025em]'
                            : isCompactBoard
                              ? 'text-[7.8px] leading-[1.05] tracking-[-0.02em]'
                              : isLaptopBoard
                                ? 'text-[8.4px] leading-[1.06] tracking-[-0.02em]'
                                : 'text-[9.6px] 2xl:text-[10.6px] leading-[1.08]'
                      } font-bold text-white truncate`}
                    >
                      {cell.shortName}
                    </div>

                    {ownedStatusDisplay ? (
                      <span
                        style={ownedPillStyle}
                        className={`shrink-0 inline-flex items-center gap-[2.5px] ${
                          isUltraCompact
                            ? 'text-[5.8px] px-0.5 py-[0.5px]'
                            : isPhoneBoard
                              ? 'text-[6.5px] px-1 py-[0.5px]'
                              : isCompactBoard || isLaptopBoard
                                ? 'text-[7.5px] px-1 py-[0.5px] tracking-[-0.015em]'
                                : 'text-[8px] 2xl:text-[8.5px] px-1.5 py-[0.5px]'
                        } font-extrabold tabular-nums whitespace-nowrap rounded border ${
                          prop?.isMortgaged
                            ? 'text-rose-100'
                            : isCollectedMonopoly
                              ? 'text-amber-100'
                              : 'text-white'
                        }`}
                      >
                        {owner && !prop?.isMortgaged && (
                          <span
                            className={`${
                              isPhoneBoard ? 'w-[7.5px] h-[7.5px]' : 'w-[9px] h-[9px]'
                            } inline-flex items-center justify-center shrink-0`}
                          >
                            {isCollectedMonopoly ? (
                              <Crown className="w-full h-full fill-amber-200 text-amber-200" />
                            ) : (
                              <TokenEmblemSvg
                                token={owner.token}
                                className="w-full h-full"
                              />
                            )}
                          </span>
                        )}
                        <span className="drop-shadow-[0_1px_1.5px_rgba(2,6,23,0.92)]">
                          {ownedStatusDisplay}
                        </span>
                      </span>
                    ) : priceDisplay ? (
                      <span
                        className={`shrink-0 ${
                          isUltraCompact
                            ? 'text-[5.8px] px-0.5'
                            : isPhoneBoard
                              ? 'text-[6.5px] px-1'
                              : isCompactBoard || isLaptopBoard
                                ? 'text-[7.6px] px-1 py-[0.5px] tracking-[-0.015em]'
                                : 'text-[8.5px] 2xl:text-[9px] px-1.5 py-[0.5px]'
                        } font-extrabold tabular-nums whitespace-nowrap rounded ${
                          cell.taxAmount
                            ? 'bg-rose-950/82 text-rose-200 border border-rose-400/35'
                            : 'bg-slate-950/84 text-amber-100 border border-white/18'
                        }`}
                      >
                        {priceDisplay}
                      </span>
                    ) : (
                      cell.subtitle &&
                      !isUltraCompact && (
                        <span
                          className={`shrink-0 ${
                            isPhoneBoard
                              ? 'text-[6.2px] px-0.5'
                              : isCompactBoard || isLaptopBoard
                                ? 'text-[7.2px] px-1 py-[0.5px] tracking-[-0.015em]'
                                : 'text-[7.8px] px-1.5 py-[0.5px]'
                          } font-bold text-slate-100 bg-slate-950/75 border border-white/15 rounded whitespace-nowrap`}
                        >
                          {cell.type === 'event_unity' && (isCompactBoard || isLaptopBoard)
                            ? 'Шанс'
                            : cell.subtitle}
                        </span>
                      )
                    )}
                  </div>
                </div>
              ) : (
                /* TOP & BOTTOM VERTICAL CARDS: Clean Uncluttered 3D Artwork Window + Dedicated Inner Monopoly Plate Clearance */
                <div
                  className={`relative z-[4] w-full h-full flex flex-col justify-end overflow-hidden ${
                    pos.side === 'bottom'
                      ? isPhoneBoard
                        ? 'pt-1.5 pb-1 px-[1px]'
                        : isCompactBoard || isLaptopBoard
                          ? 'pt-1.5 pb-1 px-[2px]'
                          : 'pt-2 pb-1.5 px-1'
                      : isPhoneBoard
                        ? `pt-0.5 ${hasInnerSectorBand ? 'pb-[8px]' : 'pb-1'} px-[1px]`
                        : `pt-1 ${
                            hasInnerSectorBand
                              ? isCompactBoard
                                ? 'pb-[12.5px]'
                                : isWideBoard
                                  ? 'pb-[17.5px]'
                                  : 'pb-[15.5px]'
                              : 'pb-1'
                          } ${isCompactBoard || isLaptopBoard ? 'px-[2px]' : 'px-1'}`
                  }`}
                >
                  {/* Bottom Crisp Title + Single-Line Price / Owned Rent Pill */}
                  <div className="flex flex-col items-center gap-0.5 min-w-0 w-full">
                    <div
                      className={`w-full board-card-caption ${
                        isUltraCompact
                          ? 'text-[5.7px] leading-[1.01] tracking-[-0.04em] line-clamp-2 overflow-hidden text-ellipsis'
                          : isPhoneBoard
                            ? 'text-[6.4px] leading-[1.02] tracking-[-0.03em] line-clamp-2 overflow-hidden text-ellipsis'
                            : isCompactBoard
                              ? 'text-[7.5px] leading-[1.04] tracking-[-0.02em] truncate'
                              : isLaptopBoard
                                ? 'text-[8.1px] leading-[1.05] tracking-[-0.02em] truncate'
                                : 'text-[9.4px] 2xl:text-[10px] leading-[1.08] truncate'
                      } font-bold text-white`}
                    >
                      {cell.shortName}
                    </div>
                    {ownedStatusDisplay ? (
                      <div
                        style={ownedPillStyle}
                        className={`inline-flex items-center justify-center gap-[2.5px] ${
                          isUltraCompact
                            ? 'text-[5.8px] px-0.5 py-[0.5px]'
                            : isPhoneBoard
                              ? 'text-[6.5px] px-1 py-[0.5px]'
                              : isCompactBoard || isLaptopBoard
                                ? 'text-[7.4px] px-1 py-[0.5px] tracking-[-0.02em]'
                                : 'text-[8px] 2xl:text-[8.5px] px-1.5 py-[0.5px]'
                        } font-extrabold tabular-nums whitespace-nowrap max-w-full truncate rounded border ${
                          prop?.isMortgaged
                            ? 'text-rose-100'
                            : isCollectedMonopoly
                              ? 'text-amber-100'
                              : 'text-white'
                        }`}
                      >
                        {owner && !prop?.isMortgaged && (
                          <span
                            className={`${
                              isPhoneBoard ? 'w-[7.5px] h-[7.5px]' : 'w-[9px] h-[9px]'
                            } inline-flex items-center justify-center shrink-0`}
                          >
                            {isCollectedMonopoly ? (
                              <Crown className="w-full h-full fill-amber-200 text-amber-200" />
                            ) : (
                              <TokenEmblemSvg
                                token={owner.token}
                                className="w-full h-full"
                              />
                            )}
                          </span>
                        )}
                        <span className="truncate drop-shadow-[0_1px_1.5px_rgba(2,6,23,0.92)]">
                          {ownedStatusDisplay}
                        </span>
                      </div>
                    ) : (
                      (priceDisplay || (!isUltraCompact && cell.subtitle)) && (
                        <div
                          className={`${
                            isUltraCompact
                              ? 'text-[5.8px] px-0.5'
                              : isPhoneBoard
                                ? 'text-[6.5px] px-1'
                                : isCompactBoard || isLaptopBoard
                                  ? 'text-[7.5px] px-[3.5px] py-[0.5px] tracking-[-0.02em]'
                                  : 'text-[8px] 2xl:text-[8.5px] px-1'
                          } font-extrabold tabular-nums whitespace-nowrap max-w-full truncate rounded ${
                            cell.taxAmount
                              ? 'bg-rose-950/82 text-rose-200 border border-rose-400/35'
                              : priceDisplay
                                ? 'bg-slate-950/84 text-amber-100 border border-white/18'
                                : 'bg-slate-950/75 text-slate-100 border border-white/15'
                          }`}
                        >
                          {priceDisplay ??
                            (cell.type === 'event_unity'
                              ? 'Шанс'
                              : cell.subtitle ?? '')}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* === PERSISTENT TOP-LEVEL 3D PAWN LAYER (ZERO UNMOUNT, ZERO OVERFLOW CLIPPING, LOCKED 120 FPS!) === */}
        {cellBoxes.length === 40 &&
          (() => {
            const livingPlayers = gameState.players.filter(
              (p) => !p.isBankrupt
            );
            const isLargeDesktopBoard = boardWidth >= 1000;
            const soloSideHeadSize = isUltraCompact
              ? 18
              : isPhoneBoard
                ? 22
                : isCompactBoard
                  ? 27
                  : isLargeDesktopBoard
                    ? 38
                    : 35;

            // Group ONLY stationary pawns per cell so bystanders never twitch/shrink when a moving pawn hops past!
            const stationaryGroups: Record<number, Player[]> = {};
            for (const pl of livingPlayers) {
              if (pl.id === movingPlayerId) continue;
              const cIdx = visualPositions[pl.id] ?? pl.position;
              if (!stationaryGroups[cIdx]) stationaryGroups[cIdx] = [];
              stationaryGroups[cIdx].push(pl);
            }

            for (const key of Object.keys(stationaryGroups)) {
              const group = stationaryGroups[Number(key)];
              const isTwoRow = group.length >= 3;
              group.sort((a, b) => {
                const prio = (pl: Player) =>
                  (pl.id === myPlayerId ? 2 : 0) +
                  (pl.id === activePlayer?.id ? 1 : 0);
                // In 2-row amphitheater, higher priority stands in Front Row (later indices); in 1-row, left-first
                return isTwoRow ? prio(a) - prio(b) : prio(b) - prio(a);
              });
            }

            return (
              <div className="pointer-events-none absolute inset-0 z-[25] overflow-visible">
                {livingPlayers.map((pl) => {
                  const cellIdx = Math.max(
                    0,
                    Math.min(39, visualPositions[pl.id] ?? pl.position)
                  );
                  const box = cellBoxes[cellIdx];
                  if (!box) return null;

                  const pos = getCellGridPosition(cellIdx);
                  const isPlMoving = pl.id === movingPlayerId;
                  const isPlTurn = pl.id === activePlayer?.id;
                  const isPlMe = pl.id === myPlayerId;

                  const baseCx =
                    box.left +
                    box.width *
                      (pos.side === 'corner'
                        ? 0.51
                        : pos.side === 'left'
                          ? 0.44
                          : pos.side === 'right'
                            ? 0.56
                            : 0.5);
                  const baseBy =
                    box.top +
                    box.height *
                      (pos.side === 'corner'
                        ? 0.75
                        : pos.side === 'top'
                          ? BOARD_CELLS[cellIdx]?.type === 'company'
                            ? 0.56
                            : 0.61
                          : pos.side === 'bottom'
                            ? 0.68
                            : 0.72);

                  let cx = baseCx;
                  let by = baseBy;
                  let headSize = soloSideHeadSize;
                  let rowLayer = 1;
                  let groupCount = 1;

                  if (!isPlMoving) {
                    const group = stationaryGroups[cellIdx] ?? [pl];
                    groupCount = group.length;
                    const slotIdx = Math.max(
                      0,
                      group.findIndex((item) => item.id === pl.id)
                    );

                    if (pos.side === 'corner') {
                      if (groupCount === 1) {
                        headSize = isUltraCompact
                          ? 20
                          : isPhoneBoard
                            ? 24
                            : isCompactBoard
                              ? 29
                              : isLaptopBoard
                                ? 33
                                : isLargeDesktopBoard
                                  ? 41
                                  : 37;
                      } else if (groupCount === 2) {
                        headSize = soloSideHeadSize;
                        const dx = Math.min(
                          box.width * 0.42,
                          headSize * 1.24
                        );
                        cx = baseCx + (slotIdx - 0.5) * dx;
                      } else {
                        // True Interleaved W / Chevron Amphitheater on Corner Cells (zero front-over-back plaque collision & leaves bottom title visible!)
                        headSize = isUltraCompact
                          ? 15
                          : isPhoneBoard
                            ? 18
                            : isCompactBoard
                              ? 21
                              : isLaptopBoard
                                ? 23
                                : isLargeDesktopBoard
                                  ? 30
                                  : 27;

                        const cornerBackY = isCompactBoard || isLaptopBoard ? 0.45 : 0.49;
                        const cornerFrontY = isCompactBoard || isLaptopBoard ? 0.72 : 0.79;

                        if (groupCount === 3) {
                          if (slotIdx === 0) {
                            rowLayer = 0;
                            cx = box.left + box.width * 0.52;
                            by = box.top + box.height * cornerBackY;
                          } else {
                            rowLayer = 2;
                            const fIdx = slotIdx - 1;
                            cx =
                              box.left +
                              box.width * (fIdx === 0 ? 0.23 : 0.8);
                            by = box.top + box.height * cornerFrontY;
                          }
                        } else if (groupCount === 4) {
                          // W-Formation: Back row inner (38%, 68%), Front row wide outer (21%, 81%)
                          if (slotIdx < 2) {
                            rowLayer = 0;
                            cx =
                              box.left +
                              box.width * (slotIdx === 0 ? 0.38 : 0.68);
                            by = box.top + box.height * cornerBackY;
                          } else {
                            rowLayer = 2;
                            const fIdx = slotIdx - 2;
                            cx =
                              box.left +
                              box.width * (fIdx === 0 ? 0.21 : 0.81);
                            by = box.top + box.height * cornerFrontY;
                          }
                        } else if (groupCount === 5) {
                          // Interleaved 2-back (36%, 67%) + 3-front (18%, 51%, 83%)
                          if (slotIdx < 2) {
                            rowLayer = 0;
                            cx =
                              box.left +
                              box.width * (slotIdx === 0 ? 0.36 : 0.67);
                            by = box.top + box.height * cornerBackY;
                          } else {
                            rowLayer = 2;
                            const fIdx = slotIdx - 2;
                            const frontXs = [0.18, 0.51, 0.83];
                            cx = box.left + box.width * (frontXs[fIdx] ?? 0.51);
                            by = box.top + box.height * cornerFrontY;
                          }
                        } else {
                          // 6 Players: Staggered 3-back (31%, 57%, 83%) + 3-front (18%, 44%, 70%)
                          if (slotIdx < 3) {
                            rowLayer = 0;
                            const backXs = [0.31, 0.57, 0.83];
                            cx = box.left + box.width * (backXs[slotIdx] ?? 0.57);
                            by = box.top + box.height * cornerBackY;
                          } else {
                            rowLayer = 2;
                            const fIdx = slotIdx - 3;
                            const frontXs = [0.18, 0.44, 0.7];
                            cx = box.left + box.width * (frontXs[fIdx] ?? 0.44);
                            by = box.top + box.height * cornerFrontY;
                          }
                        }
                      }
                    } else {
                      // Non-corner perimeter cells (top, bottom, left, right)
                      if (groupCount === 1) {
                        headSize = soloSideHeadSize;
                      } else if (groupCount === 2) {
                        headSize = Math.max(
                          15,
                          Math.round(soloSideHeadSize * 0.86)
                        );
                        const dx = Math.min(
                          box.width * 0.44,
                          headSize * 1.12
                        );
                        cx = baseCx + (slotIdx - 0.5) * dx;
                        by = baseBy + (slotIdx === 1 ? 2 : -1);
                      } else {
                        headSize = Math.max(
                          14,
                          Math.round(soloSideHeadSize * 0.75)
                        );
                        const backCount = Math.floor(groupCount / 2);
                        const frontCount = groupCount - backCount;
                        const staggerShift =
                          backCount === frontCount ? box.width * 0.08 : 0;
                        if (slotIdx < backCount) {
                          rowLayer = 0;
                          const spacing =
                            box.width * (backCount >= 3 ? 0.27 : 0.36);
                          cx =
                            baseCx +
                            staggerShift +
                            (slotIdx - (backCount - 1) / 2) * spacing;
                          by = baseBy - box.height * 0.21;
                        } else {
                          rowLayer = 2;
                          const fIdx = slotIdx - backCount;
                          const spacing =
                            box.width * (frontCount >= 3 ? 0.31 : 0.42);
                          cx =
                            baseCx -
                            staggerShift +
                            (fIdx - (frontCount - 1) / 2) * spacing;
                          by = baseBy + 3;
                        }
                      }
                    }
                  }

                  const useCompactLabel = isPlMoving
                    ? isPhoneBoard || isCompactBoard
                    : isPhoneBoard ||
                      isCompactBoard ||
                      (pos.side === 'corner'
                        ? groupCount >= 4
                        : groupCount >= 2);
                  const showPawnLabel = isPlMe
                    ? boardWidth >= 330 && groupCount <= 2
                    : !isPhoneBoard;

                  const zOrder = isPlMoving
                    ? 65
                    : 10 +
                      rowLayer * 10 +
                      (isPlTurn ? 5 : 0) +
                      (isPlMe ? 3 : 0);

                  return (
                    <div
                      key={pl.id}
                      style={{
                        left: 0,
                        top: 0,
                        zIndex: zOrder,
                        transform: `translate3d(${cx.toFixed(1)}px, ${by.toFixed(1)}px, 0)`,
                        transition: isResizingSnap
                          ? 'none'
                          : isPlMoving
                            ? `transform ${activeStepDurationMs}ms cubic-bezier(0.25, 0.9, 0.35, 1)`
                            : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                        willChange: 'transform',
                        backfaceVisibility: 'hidden',
                      }}
                      className="absolute pointer-events-none"
                    >
                      <div className="-translate-x-1/2 -translate-y-full">
                        <div
                          ref={(el) => {
                            pawnHopRefs.current[pl.id] = el;
                          }}
                          style={{
                            willChange: 'transform',
                            backfaceVisibility: 'hidden',
                          }}
                        >
                          <BoardPawnToken
                            token={pl.token}
                            color={pl.color}
                            label={getBoardPawnLabel(
                              pl.name,
                              isPlMe,
                              useCompactLabel
                            )}
                            fullName={pl.name}
                            isMe={isPlMe}
                            isActiveTurn={isPlTurn}
                            isMoving={isPlMoving}
                            headSize={headSize}
                            showLabel={showPawnLabel}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

        {/* === CENTER TABLETOP ARENA (ROWS 2..10, COLS 2..10) — CALM ATMOSPHERIC TABLETOP BACKDROP === */}
        <div
          ref={centerArenaRef}
          style={{ gridColumn: '2 / 11', gridRow: '2 / 11' }}
          className={`rounded-xl sm:rounded-2xl border-2 border-slate-300/90 dark:border-slate-800/95 shadow-[inset_0_2px_26px_rgba(15,23,42,0.08)] dark:shadow-[inset_0_2px_40px_rgba(0,0,0,0.65)] relative overflow-hidden flex flex-col items-center justify-between ${
            isPhoneBoard
              ? 'p-1.5'
              : isCompactBoard
                ? 'p-2.5'
                : 'p-3.5 2xl:p-5'
          } bg-[#dfe7f3] dark:bg-[#090e1a]`}
        >
          {/* Softly Toned Atmospheric 3D Metropolis Watermark (Never Competes with Cards or Dice) */}
          <img
            src={withCardArtVersion('/images/ukraine-metropolis.jpg')}
            alt="КАБЗДА.UA Мегаполіс"
            className="absolute inset-0 w-full h-full object-cover opacity-[0.26] dark:opacity-[0.22] brightness-[0.86] contrast-[0.98] saturate-[0.72] pointer-events-none select-none scale-[1.02]"
          />
          {/* Restful Theme-Adaptive Matte Veil Eliminating Sky Glare */}
          <div
            className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#e6eef8]/76 via-[#e2ebf6]/45 to-[#dae4f1]/82 dark:from-[#080d18]/82 dark:via-[#0a101f]/50 dark:to-[#070b14]/88"
          />

          {/* Living 3D Physical Stacked Card Decks — Hand Draws & Flips Top Card When Landed On (>=860px) */}
          {isWideBoard && (
            <>
              <SideCardDeckStack
                deck="diia"
                deckRef={diiaDeckRef}
                isDealing={dealingDeck === 'diia'}
                isTopCardLifted={liftedDeckTopCard === 'diia'}
                onClick={() => {
                  sound.playClick();
                  onSelectCell(2);
                  if (gameState.latestEventCard?.deck === 'diia') {
                    setShowcaseCardId(gameState.latestEventCard.id);
                    setDealingDeck('diia');
                    setTimeout(() => setDealingDeck(null), 3250);
                  }
                }}
              />
              <SideCardDeckStack
                deck="unity"
                deckRef={unityDeckRef}
                isDealing={dealingDeck === 'unity'}
                isTopCardLifted={liftedDeckTopCard === 'unity'}
                onClick={() => {
                  sound.playClick();
                  onSelectCell(7);
                  if (gameState.latestEventCard?.deck === 'unity') {
                    setShowcaseCardId(gameState.latestEventCard.id);
                    setDealingDeck('unity');
                    setTimeout(() => setDealingDeck(null), 3250);
                  }
                }}
              />
            </>
          )}

          {/* Full-Arena Cinematic "WOW" Hand-Draws-Card & 3D Flip Reveal Theatre */}
          <EventCardWowOverlay
            card={activeShowcaseCard}
            drawerPlayer={eventCardDrawerPlayer}
            isDrawnByMe={eventCardDrawerPlayer?.id === myPlayerId}
            isPhoneBoard={isPhoneBoard}
            arenaRef={centerArenaRef}
            diiaDeckRef={diiaDeckRef}
            unityDeckRef={unityDeckRef}
            onTopCardLiftChange={setLiftedDeckTopCard}
            onDismiss={() => setShowcaseCardId(null)}
          />

          {/* === TOP HUD BAR INSIDE CENTER ARENA (UNIFIED SYMMETRICAL ARCHITECTURAL HEIGHT) === */}
          <div className="relative z-20 w-full flex items-center justify-between gap-2 shrink-0">
            {/* 1. Active Player Spotlight Capsule */}
            <div
              style={
                activePlayer
                  ? {
                      borderColor: `color-mix(in srgb, ${activePlayer.color} 44%, rgba(255, 255, 255, 0.22))`,
                    }
                  : undefined
              }
              className={`flex items-center ${
                isPhoneBoard
                  ? 'gap-1.5 px-2 py-1 rounded-xl min-h-[34px]'
                  : isCompactBoard
                    ? 'gap-2 px-3 py-1.5 rounded-2xl min-h-[42px]'
                    : 'gap-2.5 2xl:gap-3 px-3.5 2xl:px-4 py-1.5 rounded-2xl min-h-[48px] 2xl:min-h-[54px]'
              } bg-white/94 dark:bg-slate-950/86 backdrop-blur-md border border-slate-200/90 dark:border-white/24 text-slate-900 dark:text-white shadow-[0_10px_28px_-8px_rgba(0,0,0,0.55)] min-w-0`}
            >
              {activePlayer && (
                <>
                  <TokenAvatar
                    token={activePlayer.token}
                    color={activePlayer.color}
                    size={isPhoneBoard ? 22 : isCompactBoard ? 28 : 36}
                  />
                  <div className="leading-tight min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        style={{
                          backgroundColor: isMyTurn
                            ? '#10B981'
                            : activePlayer.color,
                        }}
                        className="w-2 h-2 rounded-full animate-pulse shrink-0"
                      />
                      <span
                        className={`${
                          isPhoneBoard
                            ? 'text-[10px] max-w-[95px]'
                            : isCompactBoard
                              ? 'text-xs max-w-[130px]'
                              : 'text-[13px] 2xl:text-[14px] max-w-[155px] 2xl:max-w-[185px]'
                        } font-extrabold truncate`}
                      >
                        {isMyTurn
                          ? 'Ваш хід!'
                          : isActivePlayerAlly
                            ? `🤝 ${activePlayer.name}`
                            : activePlayer.name}
                      </span>
                    </div>
                    <div
                      className={`${
                        isPhoneBoard
                          ? 'text-[9px]'
                          : isCompactBoard
                            ? 'text-[10px]'
                            : 'text-[11px] 2xl:text-xs mt-0.5'
                      } font-extrabold text-blue-600 dark:text-amber-300 tabular-nums whitespace-nowrap`}
                    >
                      {isPhoneBoard
                        ? formatMoney(activePlayer.money)
                        : `Баланс: ${formatMoney(activePlayer.money)}`}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 2. Center Dynamic Island HUD: Transaction Capsule on Events (or Brand Crest on Wide Desktop >= 940px) */}
            {boardWidth >= 560 && (Boolean(visibleToast) || boardWidth >= 940) && (
              <div className="flex-1 min-w-0 flex items-center justify-center px-1">
                <AnimatePresence mode="wait" initial={false}>
                  {visibleToast ? (
                    <motion.div
                      key={`hud-toast-${visibleToast.id}`}
                      initial={{ opacity: 0, y: -5, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className={`max-w-[430px] 2xl:max-w-[500px] min-w-0 flex items-center ${
                        isCompactBoard || isLaptopBoard
                          ? 'gap-2 px-2.5 py-1 min-h-[40px]'
                          : 'gap-2.5 2xl:gap-3 px-3.5 2xl:px-4 py-1.5 min-h-[48px] 2xl:min-h-[54px]'
                      } rounded-2xl bg-white/95 dark:bg-slate-950/88 backdrop-blur-md border shadow-[0_10px_28px_-8px_rgba(0,0,0,0.55)] ${
                        visibleToast.variant === 'income'
                          ? 'border-emerald-500/45 dark:border-emerald-400/40'
                          : visibleToast.variant === 'zsu'
                            ? 'border-amber-500/50 dark:border-amber-400/45'
                            : visibleToast.variant === 'expense'
                              ? 'border-rose-500/45 dark:border-rose-400/40'
                              : 'border-blue-500/45 dark:border-sky-400/40'
                      }`}
                    >
                      <span
                        className={`${
                          isCompactBoard || isLaptopBoard
                            ? 'w-6 h-6 rounded-lg'
                            : 'w-8 h-8 2xl:w-9 2xl:h-9 rounded-xl'
                        } flex items-center justify-center shrink-0 border ${
                          visibleToast.variant === 'income'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/35'
                            : visibleToast.variant === 'zsu'
                              ? 'bg-amber-400/15 text-amber-600 dark:text-amber-300 border-amber-400/40'
                              : visibleToast.variant === 'expense'
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/35'
                                : 'bg-blue-500/15 text-blue-600 dark:text-sky-300 border-blue-400/35'
                        }`}
                      >
                        {visibleToast.variant === 'income' ? (
                          <TrendingUp className="w-3.5 h-3.5" />
                        ) : visibleToast.variant === 'zsu' ? (
                          <Shield className="w-3.5 h-3.5" />
                        ) : visibleToast.variant === 'expense' ? (
                          <Zap className="w-3.5 h-3.5" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                      </span>

                      <div className="min-w-0 leading-tight text-left">
                        <div
                          className={`${
                            isCompactBoard || isLaptopBoard
                              ? 'text-[11px]'
                              : 'text-xs 2xl:text-[13.5px]'
                          } font-extrabold text-slate-900 dark:text-white truncate`}
                        >
                          {visibleToast.title}
                        </div>
                        <div
                          className={`${
                            isCompactBoard || isLaptopBoard
                              ? 'text-[9.5px]'
                              : 'text-[10.5px] 2xl:text-[11.5px] mt-0.5'
                          } font-semibold text-slate-500 dark:text-slate-300/85 truncate`}
                        >
                          {visibleToast.subtitle}
                        </div>
                      </div>

                      <span
                        className={`shrink-0 ${
                          isCompactBoard || isLaptopBoard
                            ? 'px-2 py-0.5 rounded-lg text-[10.5px]'
                            : 'px-2.5 2xl:px-3 py-1 rounded-xl text-xs 2xl:text-[13px]'
                        } font-display font-extrabold tabular-nums whitespace-nowrap border ${
                          visibleToast.variant === 'income'
                            ? 'bg-emerald-500/14 text-emerald-700 dark:text-emerald-300 border-emerald-400/25'
                            : visibleToast.variant === 'zsu'
                              ? 'bg-amber-400/16 text-amber-700 dark:text-amber-300 border-amber-400/25'
                              : visibleToast.variant === 'expense'
                                ? 'bg-rose-500/14 text-rose-700 dark:text-rose-300 border-rose-400/25'
                                : 'bg-blue-500/16 text-blue-700 dark:text-sky-200 border-sky-400/25'
                        }`}
                      >
                        {visibleToast.amountText}
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="hud-brand-crest"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.18 }}
                      className="flex items-center gap-2.5 2xl:gap-3 px-4 2xl:px-5 py-1.5 min-h-[48px] 2xl:min-h-[54px] rounded-2xl bg-white/94 dark:bg-slate-950/86 backdrop-blur-md border border-slate-200/90 dark:border-amber-400/35 text-slate-900 dark:text-white shadow-[0_10px_28px_-8px_rgba(0,0,0,0.55)] shrink-0"
                    >
                      <MagnatBrandIcon size="sm" />
                      <MagnatWordmark size="sm" />
                      <span className="h-4 w-[1px] bg-slate-300 dark:bg-white/15 mx-0.5" />
                      <span
                        title="Зібрано на Оборону України"
                        className="text-[11.5px] 2xl:text-xs font-extrabold text-amber-600 dark:text-amber-300 flex items-center gap-1.5 tabular-nums whitespace-nowrap"
                      >
                        <Shield className="w-3.5 h-3.5 shrink-0" />
                        <span>{formatMoney(gameState.zsuTotalDonated)}</span>
                      </span>
                      {gameState.settings.karpatyBonusEnabled && (
                        <>
                          <span className="h-4 w-[1px] bg-slate-300 dark:bg-white/15 mx-0.5" />
                          <span
                            title="Регіональний бонусний банк у Карпатах"
                            className="text-[11.5px] 2xl:text-xs font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 tabular-nums whitespace-nowrap"
                          >
                            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                            <span>{formatMoney(gameState.karpatyFund)}</span>
                          </span>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* 3. Turn Chronometer Capsule (Symmetrical Height & Two-Line Balance with Left Capsule) */}
            {turnRemainingSec !== null && gameState.phase !== 'AUCTION' ? (
              (() => {
                const maxSec = gameState.turnDurationMs
                  ? Math.max(3, Math.ceil(gameState.turnDurationMs / 1000))
                  : Math.max(15, gameState.settings.turnTimeSeconds || 60);
                const frac = Math.max(0, Math.min(1, turnRemainingSec / maxSec));
                const circ = 59.69; // 2 * PI * 9.5
                const dashOffset = circ * (1 - frac);
                const ringColorClass =
                  turnRemainingSec <= 10
                    ? 'text-rose-500'
                    : turnRemainingSec <= 20
                      ? 'text-amber-500 dark:text-amber-400'
                      : 'text-blue-600 dark:text-amber-400';

                return (
                  <div
                    title="Час на завершення поточного ходу"
                    className={`flex items-center ${
                      isPhoneBoard
                        ? 'gap-1.5 px-2 py-1 rounded-xl text-[10px] min-h-[34px]'
                        : isCompactBoard
                          ? 'gap-2 px-3 py-1.5 rounded-2xl text-xs min-h-[42px]'
                          : 'gap-2.5 px-3.5 2xl:px-4 py-1.5 rounded-2xl min-h-[48px] 2xl:min-h-[54px]'
                    } font-extrabold tabular-nums whitespace-nowrap bg-white/94 dark:bg-slate-950/86 backdrop-blur-md border shadow-[0_10px_28px_-8px_rgba(0,0,0,0.55)] shrink-0 ${
                      turnRemainingSec <= 10
                        ? 'border-rose-500 text-rose-600 dark:text-rose-400 animate-pulse'
                        : 'border-slate-200/90 dark:border-white/24 text-slate-900 dark:text-white'
                    }`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className={`${
                        isPhoneBoard
                          ? 'w-4 h-4'
                          : isCompactBoard
                            ? 'w-5 h-5'
                            : 'w-7 h-7 2xl:w-8 2xl:h-8'
                      } -rotate-90 shrink-0`}
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="9.5"
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity="0.16"
                        strokeWidth="2.5"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="9.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray={circ}
                        strokeDashoffset={dashOffset}
                        className={`${ringColorClass} transition-all duration-500`}
                      />
                    </svg>

                    {isPhoneBoard ? (
                      <span>{turnRemainingSec}с</span>
                    ) : (
                      <div className="leading-tight text-left">
                        <div className="text-[8.5px] 2xl:text-[9px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Час ходу
                        </div>
                        <div className="font-display font-extrabold text-xs 2xl:text-[14px] leading-tight mt-0.5">
                          {turnRemainingSec} сек
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className={isPhoneBoard ? 'w-6' : 'w-20'} />
            )}
          </div>

          {/* Compact Inner-Arena Capsule for Narrow Mobile Boards (<560px) — Never Overlaps Perimeter Cards */}
          <AnimatePresence>
            {boardWidth < 560 && visibleToast && (
              <motion.div
                key={`mobile-hud-toast-${visibleToast.id}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="relative z-20 mt-1 max-w-full flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/95 dark:bg-slate-950/88 backdrop-blur-md border border-slate-200/90 dark:border-white/20 shadow-md shrink-0"
              >
                <span className="text-[9.5px] font-extrabold text-slate-900 dark:text-white truncate">
                  {visibleToast.title}
                </span>
                <span className="text-[9.5px] font-black text-blue-600 dark:text-amber-300 tabular-nums whitespace-nowrap">
                  {visibleToast.amountText}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* === MIDDLE STAGE: SAFE SCROLLABLE CENTERING === */}
          <div className="relative z-20 flex-1 min-h-0 w-full max-w-[440px] overflow-y-auto no-scrollbar flex flex-col px-1 sm:px-2">
            <div
              className={`my-auto w-full flex flex-col items-center ${
                isPhoneBoard ? 'gap-1.5 py-1' : 'gap-2.5 py-1.5'
              }`}
            >
              {!hideDiceForPhoneDecision && (
                <Dice3D
                  dice={gameState.lastDice}
                  rollId={gameState.diceRollId}
                  canRoll={canRollNow}
                  onQuickRoll={onRollDice}
                  sizeTier={diceSizeTier}
                />
              )}

              {/* Calm In-Flight / Token-Walking Indicator Pill */}
              {holdLandingUi && (
                <motion.div
                  key="move-in-progress-pill"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`${
                    isPhoneBoard
                      ? 'px-3 py-1.5 text-[10px]'
                      : 'px-4 py-2 text-xs'
                  } rounded-xl bg-white/92 dark:bg-slate-950/84 backdrop-blur-md border border-slate-200/90 dark:border-white/20 text-slate-900 dark:text-white font-extrabold shadow-lg flex items-center justify-center gap-2`}
                >
                  <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-amber-400 animate-pulse shrink-0" />
                  <span>
                    {isMyTurn
                      ? 'Фішка рухається по полю...'
                      : `${activePlayer?.name ?? 'Гравець'} виконує хід...`}
                  </span>
                </motion.div>
              )}

              {/* Docked Compact Event Card Summary (Visible once the full WOW Card Showcase docks, with 1-click replay!) */}
              <AnimatePresence mode="wait">
                {!holdLandingUi &&
                  !hideDiceForPhoneDecision &&
                  gameState.latestEventCard &&
                  !activeShowcaseCard && (
                    <DockedEventCardSummary
                      card={gameState.latestEventCard}
                      isPhoneBoard={isPhoneBoard}
                      isUltraCompact={isUltraCompact}
                      onReopenShowcase={() => {
                        if (!gameState.latestEventCard) return;
                        setShowcaseCardId(gameState.latestEventCard.id);
                        setDealingDeck(gameState.latestEventCard.deck);
                        setTimeout(() => setDealingDeck(null), 3250);
                      }}
                    />
                  )}
              </AnimatePresence>

              {/* 1. PRE_ROLL */}
              {gameState.phase === 'PRE_ROLL' && (
                <div className="w-full flex flex-col items-center gap-1.5">
                  {isMyTurn ? (
                    activePlayer?.inJail ? (
                      <div
                        className={`w-full bg-white/95 dark:bg-slate-950/88 backdrop-blur-xl border border-rose-500/45 rounded-xl sm:rounded-2xl ${
                          isPhoneBoard ? 'p-2 space-y-1.5' : 'p-3.5 space-y-2.5'
                        } text-center text-slate-900 dark:text-white shadow-xl`}
                      >
                        <div
                          className={`${
                            isPhoneBoard ? 'text-[10px]' : 'text-xs'
                          } font-extrabold text-rose-600 dark:text-rose-400`}
                        >
                          ⚖️ Санкційний Ізолятор (спроба{' '}
                          {activePlayer.jailTurns + 1}/3)
                        </div>
                        <div className="flex flex-wrap justify-center gap-1.5">
                          <button
                            onClick={onRollDice}
                            className={`${
                              isPhoneBoard
                                ? 'px-2.5 py-1.5 text-[10px]'
                                : 'px-4 py-2 text-xs'
                            } rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-950 font-extrabold cursor-pointer hover:bg-blue-700 dark:hover:bg-amber-300 transition`}
                          >
                            На дубль 🎲
                          </button>
                          <button
                            disabled={activePlayer.money < 500}
                            onClick={onPayBail}
                            className={`${
                              isPhoneBoard
                                ? 'px-2.5 py-1.5 text-[10px]'
                                : 'px-3.5 py-2 text-xs'
                            } rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-extrabold cursor-pointer transition`}
                          >
                            Застава 500 ₴
                          </button>
                          {activePlayer.amnestyCards > 0 && (
                            <button
                              onClick={onUseAmnesty}
                              className={`${
                                isPhoneBoard
                                  ? 'px-2.5 py-1.5 text-[10px]'
                                  : 'px-3.5 py-2 text-xs'
                              } rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center gap-1 cursor-pointer transition`}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" /> Імунітет
                            </button>
                          )}
                          <button
                            onClick={onOpenTradeModal}
                            className={`${
                              isPhoneBoard
                                ? 'px-2.5 py-1.5 text-[10px]'
                                : 'px-3.5 py-2 text-xs'
                            } rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 border border-slate-300/80 dark:border-white/20 text-slate-900 dark:text-white font-extrabold flex items-center gap-1 cursor-pointer transition`}
                          >
                            <Handshake className="w-3.5 h-3.5 text-blue-600 dark:text-amber-400" />
                            {isUltraCompact ? 'Угода' : 'Смарт-Угода'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          onClick={onRollDice}
                          title="Швидкий кидок кубиків (клавіша Пробіл)"
                          className={`${
                            isPhoneBoard
                              ? 'px-4 py-2 rounded-xl text-[11px]'
                              : isCompactBoard
                                ? 'px-6 py-2.5 rounded-2xl text-xs'
                                : 'px-8 py-3.5 rounded-2xl text-xs sm:text-sm'
                          } mono-cta-btn font-display font-bold transition hover:scale-[1.04] active:scale-95 flex items-center gap-1.5 cursor-pointer whitespace-nowrap`}
                        >
                          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          Кинути кубики
                        </button>
                        <button
                          onClick={onOpenTradeModal}
                          className={`${
                            isPhoneBoard
                              ? 'px-2.5 py-2 rounded-xl text-[10.5px]'
                              : isCompactBoard
                                ? 'px-3.5 py-2.5 rounded-2xl text-xs'
                                : 'px-4 py-3.5 rounded-2xl text-xs'
                          } bg-white/92 dark:bg-slate-950/82 backdrop-blur-md border border-slate-200/90 dark:border-white/25 hover:border-blue-500 dark:hover:border-amber-400 text-slate-900 dark:text-white font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-lg whitespace-nowrap`}
                        >
                          <Handshake className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-amber-400" />
                          {isUltraCompact ? 'Угода' : 'Смарт-Угода'}
                        </button>
                      </div>
                    )
                  ) : (
                    <div
                      className={`${
                        isPhoneBoard
                          ? 'px-2.5 py-1.5 text-[10px]'
                          : 'px-4 py-2.5 text-xs'
                      } rounded-xl bg-white/92 dark:bg-slate-950/82 backdrop-blur-md border border-slate-200/90 dark:border-white/20 text-slate-900 dark:text-white font-extrabold shadow-lg text-center`}
                    >
                      Хід гравця {activePlayer?.name}...
                    </div>
                  )}
                </div>
              )}

              {/* 2. BUY_DECISION WITH ILLUSTRATED BANNER */}
              {!holdLandingUi &&
                gameState.phase === 'BUY_DECISION' &&
                activeCell && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`w-full bg-white/95 dark:bg-slate-950/90 backdrop-blur-xl border border-slate-200/90 dark:border-white/25 rounded-xl sm:rounded-2xl ${
                    isPhoneBoard ? 'p-2 space-y-2' : 'p-3 sm:p-3.5 space-y-2.5'
                  } shadow-2xl text-slate-900 dark:text-white`}
                >
                  {isPhoneBoard ? (
                    <div className="flex items-center gap-2 text-left">
                      <img
                        src={getCellVisualArtwork(activeCell).imageSrc}
                        alt={activeCell.name}
                        className={`w-10 h-10 rounded-lg object-cover ${getImageExposureClass(
                          getCellVisualArtwork(activeCell).imageSrc
                        )} border border-slate-200 dark:border-white/25 shrink-0`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-display font-extrabold text-[11px] truncate">
                          {activeCell.name}
                        </div>
                        <div className="text-[9.5px] font-bold text-blue-600 dark:text-amber-300 tabular-nums">
                          Ціна: {formatMoney(activeCell.price ?? 0)}
                          {activeCell.rent?.[0]
                            ? ` • Оренда: ${formatMoney(activeCell.rent[0])}`
                            : ''}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <CardVisualBanner
                      cell={activeCell}
                      heightClass={isCompactBoard ? 'h-22' : 'h-28'}
                    />
                  )}

                  {isMyTurn ? (
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                      <button
                        disabled={(me?.money ?? 0) < (activeCell.price ?? 0)}
                        onClick={onBuyProperty}
                        className={`${
                          isPhoneBoard
                            ? 'py-1.5 px-2 text-[10px]'
                            : 'py-2.5 px-3 text-xs'
                        } rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-extrabold shadow transition cursor-pointer whitespace-nowrap truncate`}
                      >
                        Купити • {formatMoney(activeCell.price ?? 0)}
                      </button>
                      <button
                        onClick={onStartAuction}
                        className={`${
                          isPhoneBoard
                            ? 'py-1.5 px-2 text-[10px]'
                            : 'py-2.5 px-3 text-xs'
                        } rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold flex items-center justify-center gap-1 shadow transition cursor-pointer whitespace-nowrap`}
                      >
                        <Gavel className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                        Аукціон
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`${
                        isPhoneBoard ? 'text-[10px]' : 'text-xs'
                      } font-extrabold text-center text-slate-600 dark:text-slate-300`}
                    >
                      {activePlayer?.name} вирішує: придбати чи на аукціон...
                    </div>
                  )}
                </motion.div>
              )}

              {/* 3. LIVE AUCTION WITH ARTWORK */}
              {gameState.phase === 'AUCTION' &&
                gameState.auction &&
                auctionCell && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`w-full aurora-featured-card rounded-xl sm:rounded-2xl ${
                      isPhoneBoard ? 'p-2.5 space-y-2' : 'p-3.5 sm:p-4 space-y-3'
                    } shadow-2xl`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[9.5px] sm:text-[10px] font-black uppercase">
                        <Gavel className="w-3 h-3" /> Аукціон
                      </span>
                      <span className="text-[11px] sm:text-xs font-extrabold text-amber-600 dark:text-amber-300 tabular-nums whitespace-nowrap">
                        ⏱ {auctionRemainingSec ?? 0} сек
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {!isUltraCompact && (
                          <img
                            src={withCardArtVersion('/images/showcase-auction-day.jpg')}
                            alt="Аукціон"
                            className={`${
                              isPhoneBoard
                                ? 'w-9 h-9 rounded-lg'
                                : 'w-11 h-11 rounded-xl'
                            } object-cover border border-amber-400/45 shrink-0`}
                          />
                        )}
                        <div className="min-w-0 text-left">
                          <div
                            className={`font-display font-bold ${
                              isPhoneBoard ? 'text-xs' : 'text-sm'
                            } text-slate-900 dark:text-white truncate`}
                          >
                            {auctionCell.name}
                          </div>
                          <div className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-300 font-semibold truncate">
                            {auctionLeader
                              ? `Лідер: ${auctionLeader.name}`
                              : 'Очікуємо першу ставку'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">
                          Ставка
                        </div>
                        <div
                          className={`font-display font-extrabold ${
                            isPhoneBoard ? 'text-xs' : 'text-base'
                          } text-amber-600 dark:text-amber-400 tabular-nums whitespace-nowrap`}
                        >
                          {formatMoney(gameState.auction.currentBid)}
                        </div>
                      </div>
                    </div>

                    {me &&
                    !me.isBankrupt &&
                    gameState.auction.activeParticipantIds.includes(me.id) ? (
                      gameState.auction.highestBidderId === me.id ? (
                        <div className="py-1.5 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-center text-[10.5px] sm:text-xs text-emerald-700 dark:text-emerald-300 font-extrabold">
                          Ви лідируєте в торгах — очікуємо суперників...
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
                          {(gameState.auction.highestBidderId === null
                            ? [0, 250, 500]
                            : [100, 250, 500]
                          ).map((inc) => {
                            const needed = gameState.auction!.currentBid + inc;
                            return (
                              <button
                                key={inc}
                                disabled={me.money < needed}
                                onClick={() => onBidAuction(inc)}
                                className={`${
                                  isPhoneBoard
                                    ? 'py-1.5 text-[9.5px]'
                                    : 'py-2 text-[11px]'
                                } rounded-lg sm:rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-35 text-white font-extrabold tabular-nums whitespace-nowrap cursor-pointer`}
                              >
                                {inc === 0 ? 'Старт' : `+${inc}`}
                              </button>
                            );
                          })}
                          <button
                            disabled={gameState.auction.highestBidderId === me.id}
                            onClick={onPassAuction}
                            className={`${
                              isPhoneBoard
                                ? 'py-1.5 text-[9.5px]'
                                : 'py-2 text-[11px]'
                            } rounded-lg sm:rounded-xl bg-slate-200 hover:bg-rose-600 hover:text-white text-slate-800 dark:bg-white/12 dark:hover:bg-rose-600 disabled:opacity-30 dark:text-white font-extrabold cursor-pointer`}
                          >
                            Пас
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="text-center text-[10.5px] sm:text-xs text-slate-600 dark:text-slate-300 font-bold">
                        {!me || me.isBankrupt
                          ? 'Тривають торги між активними учасниками...'
                          : me.money <
                              (gameState.auction.highestBidderId === null
                                ? gameState.auction.currentBid
                                : gameState.auction.currentBid + 100)
                            ? 'Недостатньо коштів для ставки — очікуємо завершення торгів...'
                            : 'Ви пасували — очікуємо завершення торгів...'}
                      </div>
                    )}
                  </motion.div>
                )}

              {/* 4. DEBT_RESOLUTION */}
              {!holdLandingUi &&
                gameState.phase === 'DEBT_RESOLUTION' &&
                gameState.debt && (
                <div
                  className={`w-full bg-white/95 dark:bg-slate-950/90 backdrop-blur-xl border border-rose-500/60 rounded-xl sm:rounded-2xl ${
                    isPhoneBoard ? 'p-2.5 space-y-1.5' : 'p-4 space-y-2.5'
                  } text-slate-900 dark:text-white shadow-2xl`}
                >
                  <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-extrabold text-[11px] sm:text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="truncate">
                      Борг: {formatMoney(gameState.debt.amount)} (
                      {gameState.debt.reason})
                    </span>
                  </div>

                  {gameState.debt.debtorId === myPlayerId ? (
                    (() => {
                      const myCash = me?.money ?? 0;
                      const debtAmt = gameState.debt.amount;
                      const canPayNow = myCash >= debtAmt;
                      const maxCash = me
                        ? calculateMaxLiquidatableCash(
                            me.id,
                            me.money,
                            gameState.properties
                          )
                        : 0;
                      const canAutoLiquidate = !canPayNow && maxCash > myCash;
                      const survivingAllyWithCash =
                        !canPayNow &&
                        gameState.settings.gameMode === 'team2v2' &&
                        me?.teamId
                          ? gameState.players.find(
                              (p) =>
                                p.id !== me.id &&
                                !p.isBankrupt &&
                                p.teamId === me.teamId &&
                                p.money > 0
                            )
                          : undefined;

                      return (
                        <>
                          <p className="text-[10px] sm:text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-snug">
                            Баланс:{' '}
                            <strong className="text-slate-900 dark:text-white whitespace-nowrap">
                              {formatMoney(myCash)}
                            </strong>
                            {!canPayNow && maxCash > myCash && (
                              <>
                                {' '}
                                • Доступно з активами:{' '}
                                <strong className="text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                  {formatMoney(maxCash)}
                                </strong>
                              </>
                            )}
                          </p>

                          {survivingAllyWithCash && (
                            <div className="px-2.5 py-1.5 rounded-xl bg-sky-500/12 border border-sky-400/35 text-[10px] sm:text-[10.5px] font-bold text-sky-800 dark:text-sky-200 leading-snug">
                              🤝 Режим 2×2: ви можете попросити допомогу в напарника{' '}
                              <span className="font-extrabold">
                                {survivingAllyWithCash.name}
                              </span>{' '}
                              ({formatMoney(survivingAllyWithCash.money)}) через кнопку{' '}
                              <span className="underline">«Угода»</span>!
                            </div>
                          )}

                          <div className="flex flex-wrap gap-1.5 sm:gap-2">
                            <button
                              disabled={!canPayNow}
                              onClick={onPayDebt}
                              className={`flex-1 min-w-[115px] ${
                                isPhoneBoard
                                  ? 'py-1.5 text-[10.5px]'
                                  : 'py-2.5 text-xs'
                              } rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-35 text-white font-extrabold cursor-pointer`}
                            >
                              Сплатити борг
                            </button>

                            {canAutoLiquidate && (
                              <button
                                onClick={onAutoLiquidate}
                                title="Автоматично передати в заставу компанії без монополій або продати філії для покриття боргу"
                                className={`px-2.5 ${
                                  isPhoneBoard
                                    ? 'py-1.5 text-[10.5px]'
                                    : 'py-2.5 text-xs'
                                } rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap`}
                              >
                                <Zap className="w-3.5 h-3.5 shrink-0" />
                                Авто-застава
                              </button>
                            )}

                            <button
                              onClick={onOpenTradeModal}
                              className={`px-2.5 ${
                                isPhoneBoard
                                  ? 'py-1.5 text-[10.5px]'
                                  : 'py-2.5 text-xs'
                              } rounded-xl bg-blue-600/15 hover:bg-blue-600 hover:text-white text-blue-700 dark:text-sky-300 font-extrabold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap`}
                            >
                              <Handshake className="w-3.5 h-3.5 shrink-0" />
                              Угода
                            </button>

                            {!confirmBankrupt ? (
                              <button
                                onClick={() => {
                                  if (maxCash > myCash || canPayNow) {
                                    setConfirmBankrupt(true);
                                  } else {
                                    onBankrupt();
                                  }
                                }}
                                className={`px-2.5 ${
                                  isPhoneBoard
                                    ? 'py-1.5 text-[10.5px]'
                                    : 'py-2.5 text-xs'
                                } rounded-xl bg-rose-600/18 hover:bg-rose-600 text-rose-700 hover:text-white dark:bg-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-600 dark:hover:text-white font-extrabold cursor-pointer`}
                              >
                                Банкрут
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setConfirmBankrupt(false);
                                  onBankrupt();
                                }}
                                className={`px-2.5 ${
                                  isPhoneBoard
                                    ? 'py-1.5 text-[10.5px]'
                                    : 'py-2.5 text-xs'
                                } rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold cursor-pointer whitespace-nowrap`}
                              >
                                Підтвердити вибуття?
                              </button>
                            )}
                          </div>
                        </>
                      );
                    })()
                  ) : (
                    <p className="text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {activePlayer?.name} збирає кошти для погашення боргу...
                    </p>
                  )}
                </div>
              )}

              {/* 5. POST_ROLL */}
              {!holdLandingUi && gameState.phase === 'POST_ROLL' && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {isMyTurn ? (
                    <>
                      {(activePlayer?.doublesCount ?? 0) > 0 &&
                      !activePlayer?.inJail ? (
                        <button
                          onClick={onRollDice}
                          title="Бонусний кидок на дублі (клавіша Пробіл)"
                          className={`${
                            isPhoneBoard
                              ? 'px-4 py-2 rounded-xl text-[11px]'
                              : isCompactBoard
                                ? 'px-5 py-2.5 rounded-2xl text-xs'
                                : 'px-7 py-3.5 rounded-2xl text-xs sm:text-sm'
                          } mono-cta-btn font-display font-bold hover:scale-[1.03] transition cursor-pointer whitespace-nowrap`}
                        >
                          Кинути ще раз (Дубль!) 🎲
                        </button>
                      ) : (
                        <button
                          onClick={onEndTurn}
                          title="Завершити хід (клавіша Пробіл або E)"
                          className={`${
                            isPhoneBoard
                              ? 'px-4 py-2 rounded-xl text-[11px]'
                              : isCompactBoard
                                ? 'px-5 py-2.5 rounded-2xl text-xs'
                                : 'px-7 py-3.5 rounded-2xl text-xs sm:text-sm'
                          } bg-blue-600 hover:bg-blue-700 text-white dark:bg-white dark:hover:bg-amber-300 dark:text-slate-950 font-display font-bold shadow-xl flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap`}
                        >
                          <span>Завершити хід</span>
                          <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      )}

                      <button
                        onClick={onOpenTradeModal}
                        className={`${
                          isPhoneBoard
                            ? 'px-2.5 py-2 rounded-xl text-[10.5px]'
                            : isCompactBoard
                              ? 'px-3.5 py-2.5 rounded-2xl text-xs'
                              : 'px-4 py-3.5 rounded-2xl text-xs'
                        } bg-white/92 dark:bg-slate-950/82 backdrop-blur-md border border-slate-200/90 dark:border-white/25 hover:border-blue-500 dark:hover:border-amber-400 text-slate-900 dark:text-white font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-lg whitespace-nowrap`}
                      >
                        <Handshake className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-amber-400" />
                        {isUltraCompact ? 'Угода' : 'Смарт-Угода'}
                      </button>
                    </>
                  ) : (
                    <div
                      className={`${
                        isPhoneBoard
                          ? 'px-2.5 py-1.5 text-[10px]'
                          : 'px-4 py-2.5 text-xs'
                      } rounded-xl bg-white/92 dark:bg-slate-950/82 backdrop-blur-md border border-slate-200/90 dark:border-white/20 text-slate-900 dark:text-white font-extrabold shadow-lg`}
                    >
                      {activePlayer?.name} завершує хід...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* === BOTTOM LIVE MATCH FEED DOCK === */}
          {!(isPhoneBoard && hasBusyCenterCard) && (
            <div
              className={`relative z-20 w-full rounded-xl sm:rounded-2xl bg-white/92 dark:bg-slate-950/82 backdrop-blur-md border border-slate-200/90 dark:border-white/20 ${
                isPhoneBoard ? 'px-2.5 py-1.5' : 'px-3.5 py-2'
              } text-slate-900 dark:text-white shadow-lg space-y-0.5 shrink-0`}
            >
              {recentLogs.length > 0 ? (
                recentLogs.map((log, i) => (
                  <div
                    key={log.id}
                    className={`flex items-center gap-1.5 ${
                      isPhoneBoard ? 'text-[9.5px]' : 'text-[11px]'
                    } truncate ${
                      i === 0
                        ? 'font-extrabold text-slate-900 dark:text-white'
                        : 'font-medium text-slate-500 dark:text-slate-300 hidden sm:flex'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        i === 0
                          ? 'bg-blue-600 dark:bg-amber-400'
                          : 'bg-slate-400 dark:bg-slate-500'
                      }`}
                    />
                    <span className="truncate">{log.text}</span>
                  </div>
                ))
              ) : (
                <div
                  className={`${
                    isPhoneBoard ? 'text-[9.5px]' : 'text-[11px]'
                  } font-bold text-slate-600 dark:text-slate-300 text-center truncate`}
                >
                  Оберіть будь-яку українську компанію на полі для деталей
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
