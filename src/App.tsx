import {
  Eye,
  Handshake,
  LogOut,
  MessageSquare,
  RefreshCw,
  ScrollText,
  Smartphone,
  UserX,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { HomeLobby } from './components/HomeLobby';
import {
  DiiaTradeBuilderModal,
  IncomingTradeModal,
  RulesModal,
  VictoryModal,
} from './components/Modals';
import { MonopolyBoard } from './components/MonopolyBoard';
import {
  ChatFeedContent,
  CompanyInspectorContent,
  LeftPlayersPanel,
  MobileBottomNav,
  MobileInspectorNavHeader,
  MobileLandscapeCockpit,
  MobileMatchHeader,
  MobileMatchTab,
  MobilePlayerStrip,
  MobileSelectedCellBar,
  NationalFundsWidget,
  PlayersCardsList,
  RightInspectorAndChat,
  SectorsControlGrid,
} from './components/SidePanels';
import { BOARD_CELLS, parseRoomCodeInput, TEAM_META } from './shared/boardData';
import {
  ChatMessage,
  GameMode,
  GameState,
  RoomSettings,
  RoomSummary,
  SectorId,
  TeamId,
  ToastTransfer,
  TokenId,
} from './shared/types';
import { HybridGameClient, TransportMode } from './utils/gameClient';
import {
  releaseNativeMobileLandscape,
  requestNativeMobileLandscape,
  useMobileViewportAndOrientation,
} from './utils/mobileOrientation';
import { sound } from './utils/sound';

function getOrCreatePlayerId(): string {
  try {
    const sessionExisting = window.sessionStorage.getItem(
      'magnat_session_player_id'
    );
    if (sessionExisting) {
      window.localStorage.setItem('magnat_persistent_player_id', sessionExisting);
      return sessionExisting;
    }

    const persistentExisting = window.localStorage.getItem(
      'magnat_persistent_player_id'
    );
    if (persistentExisting) {
      window.sessionStorage.setItem(
        'magnat_session_player_id',
        persistentExisting
      );
      return persistentExisting;
    }

    const created = `ua_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    window.sessionStorage.setItem('magnat_session_player_id', created);
    window.localStorage.setItem('magnat_persistent_player_id', created);
    return created;
  } catch {
    return `ua_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  }
}

function useIsDesktopXl(): boolean {
  const [isXl, setIsXl] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsXl(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isXl;
}

export const App: React.FC = () => {
  const [playerId] = useState<string>(() => getOrCreatePlayerId());
  const [playerName, setPlayerName] = useState<string>(
    () =>
      window.sessionStorage.getItem('magnat_session_player_name') ||
      window.localStorage.getItem('magnat_player_name') ||
      window.localStorage.getItem('monoua_player_name') ||
      'Магнат України'
  );
  const [lanIp, setLanIp] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenId>(
    () =>
      (window.localStorage.getItem('magnat_token') as TokenId) || 'tryzub'
  );
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = window.localStorage.getItem('magnat_ua_theme');
    return saved ? saved === 'dark' : true;
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => sound.enabled);

  const [connected, setConnected] = useState(false);
  const [transportMode, setTransportMode] =
    useState<TransportMode>('connecting');
  const [roomBusy, setRoomBusy] = useState(false);
  const [publicRooms, setPublicRooms] = useState<RoomSummary[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedCellIndex, setSelectedCellIndex] = useState<number>(39);
  const [hoveredSector, setHoveredSector] = useState<SectorId | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradePartnerId, setTradePartnerId] = useState<string | null>(null);
  const [recentReactions, setRecentReactions] = useState<
    Record<string, ChatMessage>
  >({});
  const [presentedToast, setPresentedToast] = useState<ToastTransfer | null>(
    null
  );

  // Mobile & Tablet (<1280px) Navigation State
  const isDesktopXl = useIsDesktopXl();
  const [mobileTab, setMobileTab] = useState<MobileMatchTab>('board');
  const [mobileChatSubTab, setMobileChatSubTab] = useState<'chat' | 'logs'>(
    'chat'
  );
  const [mobileSeenChatCount, setMobileSeenChatCount] = useState<number>(0);

  const clientRef = useRef<HybridGameClient | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const lastWatchdogSyncAtRef = useRef<number>(0);
  const prevRollId = useRef<number>(0);
  const prevToastId = useRef<number>(0);
  const prevTurnPlayerId = useRef<string | null>(null);
  const prevChatId = useRef<string | null>(null);
  const prevStatus = useRef<string | null>(null);
  const delayedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  gameStateRef.current = gameState;

  useEffect(() => {
    return () => {
      if (delayedToastTimerRef.current) {
        clearTimeout(delayedToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem('magnat_session_player_name', playerName);
    window.localStorage.setItem('magnat_player_name', playerName);
  }, [playerName]);

  useEffect(() => {
    window.localStorage.setItem('magnat_token', selectedToken);
  }, [selectedToken]);

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      darkMode ? 'dark' : 'light'
    );
    window.localStorage.setItem(
      'magnat_ua_theme',
      darkMode ? 'dark' : 'light'
    );
  }, [darkMode]);

  useEffect(() => {
    if (gameState && (isDesktopXl || mobileTab === 'chat')) {
      setMobileSeenChatCount(gameState.chat.length);
    }
  }, [gameState?.chat.length, isDesktopXl, mobileTab, gameState]);

  const showError = (msg?: string) => {
    if (!msg) return;
    setErrorMsg(msg);
    setTimeout(() => {
      setErrorMsg((curr) => (curr === msg ? null : curr));
    }, 3600);
  };

  const normalizeClientStateClock = (st: GameState): GameState => {
    if (typeof st.serverTime !== 'number') return st;
    const skewMs = Date.now() - st.serverTime;
    if (Math.abs(skewMs) <= 1000) return st;
    return {
      ...st,
      serverTime: Date.now(),
      turnEndsAt:
        typeof st.turnEndsAt === 'number' ? st.turnEndsAt + skewMs : st.turnEndsAt,
      auction: st.auction
        ? { ...st.auction, endsAt: st.auction.endsAt + skewMs }
        : null,
      pendingTrade: st.pendingTrade
        ? {
            ...st.pendingTrade,
            createdAt: st.pendingTrade.createdAt + skewMs,
            expiresAt: st.pendingTrade.expiresAt + skewMs,
          }
        : null,
    };
  };

  const syncJoinedRoomState = (rawState: GameState, updateUrlQuery: boolean) => {
    const st = normalizeClientStateClock(rawState);
    gameStateRef.current = st;
    setGameState(st);
    const me = st.players.find((p) => p.id === playerId);
    if (me) {
      setPlayerName(me.name);
      setSelectedToken(me.token);
    }
    try {
      window.sessionStorage.setItem('magnat_active_room', st.roomCode);
      window.localStorage.setItem('magnat_active_room', st.roomCode);
    } catch {
      // Ignore storage quota
    }
    if (updateUrlQuery || st.roomCode) {
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}?room=${st.roomCode}`
      );
    }
  };

  const rebindActiveRoomSession = (onRebound?: (ok: boolean) => void) => {
    const liveState = gameStateRef.current;
    const params = new URLSearchParams(window.location.search);
    const urlRoom = parseRoomCodeInput(params.get('room') || '');
    const savedRoom = parseRoomCodeInput(
      window.sessionStorage.getItem('magnat_active_room') ||
        window.localStorage.getItem('magnat_active_room') ||
        ''
    );
    const targetRoom =
      urlRoom ||
      savedRoom ||
      parseRoomCodeInput(liveState?.roomCode || '');

    if (!targetRoom || !clientRef.current) {
      onRebound?.(false);
      return;
    }

    clientRef.current.emit(
      'room:join',
      {
        roomCode: targetRoom,
        playerId,
        playerName:
          window.sessionStorage.getItem('magnat_session_player_name') ||
          window.localStorage.getItem('magnat_player_name') ||
          'Магнат України',
        token:
          (window.localStorage.getItem('magnat_token') as TokenId) ||
          'tryzub',
        fallbackState:
          liveState && parseRoomCodeInput(liveState.roomCode) === targetRoom
            ? liveState
            : undefined,
      },
      (res) => {
        if (res?.ok && res.state) {
          const st = res.state as GameState;
          syncJoinedRoomState(st, Boolean(urlRoom));
          onRebound?.(true);
        } else {
          onRebound?.(false);
        }
      }
    );
  };

  // Hybrid Transport: Node Socket.IO Server, Netlify Cloud Database, OR Serverless WebRTC P2P
  useEffect(() => {
    const client = new HybridGameClient({
      playerId,
      onConnect: (mode, detectedLanIp) => {
        setConnected(true);
        setTransportMode(mode);
        if (detectedLanIp) {
          setLanIp(detectedLanIp);
        }
        client.emit('lobby:list');

        // Check URL ?room=UA-XXXX, saved active room, or live in-memory match state
        const liveState = gameStateRef.current;
        const params = new URLSearchParams(window.location.search);
        const urlRoom = parseRoomCodeInput(params.get('room') || '');
        const savedRoom = parseRoomCodeInput(
          window.sessionStorage.getItem('magnat_active_room') ||
            window.localStorage.getItem('magnat_active_room') ||
            ''
        );
        const targetRoom =
          urlRoom ||
          savedRoom ||
          parseRoomCodeInput(liveState?.roomCode || '');

        if (
          targetRoom &&
          parseRoomCodeInput(liveState?.roomCode || '') !== targetRoom
        ) {
          const attemptInitialJoin = (isRetryAttempt: boolean) => {
            setRoomBusy(true);
            client.emit(
              'room:join',
              {
                roomCode: targetRoom,
                playerId,
                playerName:
                  window.sessionStorage.getItem('magnat_session_player_name') ||
                  window.localStorage.getItem('magnat_player_name') ||
                  'Магнат України',
                token:
                  (window.localStorage.getItem('magnat_token') as TokenId) ||
                  'tryzub',
                fallbackState:
                  liveState &&
                  parseRoomCodeInput(liveState.roomCode) === targetRoom
                    ? liveState
                    : undefined,
              },
              (res) => {
                setRoomBusy(false);
                if (res?.ok && res.state) {
                  const st = res.state as GameState;
                  syncJoinedRoomState(st, true);
                  return;
                }

                const errText =
                  typeof res?.error === 'string' ? res.error : '';
                const isTransientNetworkError =
                  /мереж|підключ|відповідає|перервано|синхронізується|відновлюється/i.test(
                    errText
                  );

                if (isTransientNetworkError && !isRetryAttempt) {
                  setTimeout(() => {
                    if (!gameStateRef.current) {
                      attemptInitialJoin(true);
                    }
                  }, 2200);
                  return;
                }

                if (!isTransientNetworkError) {
                  window.sessionStorage.removeItem('magnat_active_room');
                  window.localStorage.removeItem('magnat_active_room');
                }
                if (gameStateRef.current) {
                  gameStateRef.current = null;
                  setGameState(null);
                  setMobileTab('board');
                  showError(errText || 'Сесію кімнати завершено');
                } else if (urlRoom && errText) {
                  showError(errText);
                }
              }
            );
          };

          attemptInitialJoin(false);
        }
      },
      onDisconnect: () => {
        setConnected(false);
      },
      onRooms: (rooms) => {
        setPublicRooms(rooms);
      },
      onState: (nextState) => {
        const normalized = normalizeClientStateClock(nextState);
        gameStateRef.current = normalized;
        setGameState(normalized);
      },
      onRoomExit: (reason) => {
        gameStateRef.current = null;
        setGameState(null);
        setMobileTab('board');
        setRoomBusy(false);
        window.sessionStorage.removeItem('magnat_active_room');
        window.localStorage.removeItem('magnat_active_room');
        window.history.replaceState({}, '', window.location.pathname);
        showError(reason);
      },
    });

    clientRef.current = client;

    return () => {
      client.destroy();
    };
  }, [playerId]);

  // Client Overdue-Timer Watchdog: auto-resyncs room state if countdown ever stalls past 0s
  useEffect(() => {
    if (!gameState || gameState.status !== 'playing') return;

    const interval = setInterval(() => {
      const st = gameStateRef.current;
      if (!st || st.status !== 'playing') return;
      const now = Date.now();
      const turnOverdue =
        st.phase !== 'AUCTION' &&
        typeof st.turnEndsAt === 'number' &&
        now > st.turnEndsAt + 3200;
      const auctionOverdue =
        st.phase === 'AUCTION' &&
        Boolean(st.auction) &&
        now > (st.auction?.endsAt ?? now) + 3200;

      if (
        (turnOverdue || auctionOverdue) &&
        transportMode !== 'cloud' &&
        now - lastWatchdogSyncAtRef.current > 4000
      ) {
        lastWatchdogSyncAtRef.current = now;
        rebindActiveRoomSession();
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [gameState?.status, gameState?.roomCode, playerId]);

  // Sound & Visual Side-Effects on GameState Transitions
  useEffect(() => {
    if (!gameState) return;

    // 1. Dice rolled — synchronize inspector focus & landing toasts with full dice + token walk arrival
    const diceJustRolled = gameState.diceRollId > prevRollId.current;
    const active = gameState.players[gameState.turnIndex];
    const rollStepsCount =
      diceJustRolled && active && gameState.lastMove?.playerId === active.id
        ? gameState.lastMove.steps.length
        : 0;
    const rollStepIntervalMs =
      rollStepsCount <= 12
        ? 215
        : Math.max(95, Math.round(2300 / rollStepsCount));
    const rollDiceSum = gameState.lastDice
      ? gameState.lastDice[0] + gameState.lastDice[1]
      : 0;
    const hasMidRollCardPause = Boolean(
      diceJustRolled &&
        active &&
        gameState.latestEventCard?.playerId === active.id &&
        rollDiceSum > 0 &&
        rollStepsCount > rollDiceSum
    );
    const rollArrivalDelayMs = diceJustRolled
      ? rollStepsCount > 0
        ? 1020 +
          rollStepsCount * rollStepIntervalMs +
          (hasMidRollCardPause ? 1750 : 0)
        : 1150
      : 0;

    if (diceJustRolled) {
      if (prevRollId.current > 0 || gameState.lastDice) {
        sound.playDiceRoll();
      }
      prevRollId.current = gameState.diceRollId;
      if (active) {
        const targetPos = active.position;
        setTimeout(() => {
          setSelectedCellIndex(targetPos);
        }, rollArrivalDelayMs);
      }
    }

    // 2. Toast display & sound (delayed until token lands when triggered by a dice roll)
    if (gameState.lastToast && gameState.lastToast.id > prevToastId.current) {
      prevToastId.current = gameState.lastToast.id;
      const incomingToast = gameState.lastToast;
      const triggerToast = () => {
        setPresentedToast(incomingToast);
        if (incomingToast.variant === 'income') {
          sound.playIncome();
        } else if (
          incomingToast.variant === 'expense' ||
          incomingToast.variant === 'zsu'
        ) {
          sound.playExpense();
        } else {
          sound.playPurchase();
        }
      };

      if (delayedToastTimerRef.current) {
        clearTimeout(delayedToastTimerRef.current);
        delayedToastTimerRef.current = null;
      }

      if (rollArrivalDelayMs > 0) {
        delayedToastTimerRef.current = setTimeout(() => {
          delayedToastTimerRef.current = null;
          triggerToast();
        }, rollArrivalDelayMs);
      } else {
        triggerToast();
      }
    }

    // 3. Turn notification chime
    const activeId = gameState.players[gameState.turnIndex]?.id ?? null;
    if (
      gameState.status === 'playing' &&
      activeId &&
      activeId !== prevTurnPlayerId.current
    ) {
      prevTurnPlayerId.current = activeId;
      if (activeId === playerId) {
        sound.playYourTurn();
      }
    }

    // 4. Chat bubble & sound
    const lastChat = gameState.chat[gameState.chat.length - 1];
    if (lastChat && lastChat.id !== prevChatId.current) {
      prevChatId.current = lastChat.id;
      sound.playChat();
      setRecentReactions((prev) => ({
        ...prev,
        [lastChat.playerId]: lastChat,
      }));
      setTimeout(() => {
        setRecentReactions((prev) => {
          if (prev[lastChat.playerId]?.id !== lastChat.id) return prev;
          const copy = { ...prev };
          delete copy[lastChat.playerId];
          return copy;
        });
      }, 4500);
    }

    // 5. Victory fanfare
    if (
      gameState.status === 'finished' &&
      prevStatus.current !== 'finished'
    ) {
      sound.playVictory();
    }
    prevStatus.current = gameState.status;
  }, [gameState, playerId]);

  // === ACTIONS ===
  const emitWithAck = (
    event: string,
    payload: unknown = {},
    onSuccess?: (res: Record<string, unknown>) => void,
    onDone?: () => void,
    _isRetry = false
  ) => {
    let finished = false;
    const guardTimer = setTimeout(() => {
      if (finished) return;
      finished = true;
      onDone?.();
      showError('Час очікування відповіді вичерпано. Спробуйте ще раз.');
    }, 12000);

    clientRef.current?.emit(
      event,
      payload,
      (
        res?: { ok?: boolean; code?: string; error?: string } & Record<
          string,
          unknown
        >
      ) => {
        if (finished) return;
        finished = true;
        clearTimeout(guardTimer);

        if (
          res &&
          res.ok === false &&
          res.code === 'NO_SESSION' &&
          !_isRetry &&
          gameStateRef.current
        ) {
          rebindActiveRoomSession((reboundOk) => {
            if (reboundOk) {
              emitWithAck(event, payload, onSuccess, onDone, true);
            } else {
              onDone?.();
              showError(res.error);
            }
          });
          return;
        }

        onDone?.();
        if (res && res.ok === false) {
          showError(res.error);
        } else if (res && onSuccess) {
          onSuccess(res);
        }
      }
    );
  };

  const handleQuickBots = (
    botCount: number,
    gameMode: GameMode = 'classic'
  ) => {
    if (roomBusy) return;
    sound.playClick();
    requestNativeMobileLandscape();
    setMobileTab('board');
    setRoomBusy(true);
    emitWithAck(
      'room:quick_bots',
      {
        playerId,
        playerName: playerName.trim() || 'Магнат України',
        token: selectedToken,
        botCount,
        gameMode,
      },
      (res) => {
        const st = res.state as GameState;
        if (st) {
          syncJoinedRoomState(st, false);
        }
      },
      () => setRoomBusy(false)
    );
  };

  const handleCreateRoom = (settings: Partial<RoomSettings>) => {
    if (roomBusy) return;
    sound.playClick();
    setMobileTab('board');
    setRoomBusy(true);
    emitWithAck(
      'room:create',
      {
        playerId,
        playerName: playerName.trim() || 'Магнат України',
        token: selectedToken,
        settings,
      },
      (res) => {
        const st = res.state as GameState;
        if (st) {
          syncJoinedRoomState(st, true);
        }
      },
      () => setRoomBusy(false)
    );
  };

  const handleJoinRoom = (rawRoomInput: string) => {
    if (roomBusy) return;
    const parsedCode = parseRoomCodeInput(rawRoomInput);
    if (!parsedCode) {
      showError('Введіть код кімнати (напр. UA-4821) або вставте посилання');
      return;
    }
    sound.playClick();
    setMobileTab('board');
    setRoomBusy(true);
    emitWithAck(
      'room:join',
      {
        roomCode: parsedCode,
        playerId,
        playerName: playerName.trim() || 'Магнат України',
        token: selectedToken,
      },
      (res) => {
        const st = res.state as GameState;
        if (st) {
          syncJoinedRoomState(st, true);
        }
      },
      () => setRoomBusy(false)
    );
  };

  const handleLeaveRoom = () => {
    sound.playClick();
    releaseNativeMobileLandscape();
    let cleared = false;
    const clearLocalRoom = () => {
      if (cleared) return;
      cleared = true;
      gameStateRef.current = null;
      setGameState(null);
      setMobileTab('board');
      window.sessionStorage.removeItem('magnat_active_room');
      window.localStorage.removeItem('magnat_active_room');
      window.history.replaceState({}, '', window.location.pathname);
    };
    const safetyTimer = setTimeout(clearLocalRoom, 500);
    clientRef.current?.emit('room:leave', {}, () => {
      clearTimeout(safetyTimer);
      clearLocalRoom();
    });
  };

  const handleUpdateLobbyName = (nextName: string) => {
    setPlayerName(nextName);
    const trimmed = nextName.trim();
    if (trimmed) {
      clientRef.current?.emit('game:update_name', { name: trimmed });
    }
  };

  const shareOrigin = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    const { protocol, hostname, port } = window.location;
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && lanIp) {
      return `${protocol}//${lanIp}${port ? `:${port}` : ''}`;
    }
    return window.location.origin;
  }, [lanIp]);

  const handleToggleSound = () => {
    setSoundEnabled(sound.toggle());
  };

  const isInBoardMatch =
    gameState &&
    (gameState.status === 'playing' || gameState.status === 'finished');

  const mobileOrient = useMobileViewportAndOrientation(Boolean(isInBoardMatch));

  const activePlayer = gameState?.players[gameState.turnIndex];
  const isMyTurn = activePlayer?.id === playerId;
  const mePlayer = gameState?.players.find((p) => p.id === playerId);
  const myEliminatedRecord = gameState?.eliminatedPlayers?.find(
    (e) => e.id === playerId
  );
  const isEliminatedFromMatch = Boolean(
    gameState && !mePlayer && myEliminatedRecord
  );
  const myTeamId: TeamId | undefined =
    mePlayer?.teamId ?? myEliminatedRecord?.teamId;
  const mySurvivingTeammate =
    gameState &&
    gameState.settings.gameMode === 'team2v2' &&
    myTeamId
      ? gameState.players.find(
          (p) => p.id !== playerId && !p.isBankrupt && p.teamId === myTeamId
        )
      : undefined;
  const canTradeNow = Boolean(
    isMyTurn &&
      gameState &&
      (gameState.phase === 'PRE_ROLL' ||
        gameState.phase === 'POST_ROLL' ||
        gameState.phase === 'DEBT_RESOLUTION')
  );
  const unreadMobileChat = gameState
    ? Math.max(0, gameState.chat.length - mobileSeenChatCount)
    : 0;
  const selectedCellDef = BOARD_CELLS[selectedCellIndex] ?? BOARD_CELLS[0];

  // Desktop Ergonomics: Keyboard shortcuts (Space = Roll / End Turn, E = End Turn, Esc = Close Modal)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.key === 'Escape') {
        if (rulesOpen) {
          setRulesOpen(false);
          return;
        }
        if (tradeModalOpen) {
          setTradeModalOpen(false);
          return;
        }
      }

      if (!gameState || gameState.status !== 'playing') return;
      if (rulesOpen || tradeModalOpen || gameState.pendingTrade) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (!isMyTurn) return;

      const canRoll =
        (gameState.phase === 'PRE_ROLL' && !activePlayer?.inJail) ||
        (gameState.phase === 'POST_ROLL' &&
          (activePlayer?.doublesCount ?? 0) > 0 &&
          !activePlayer?.inJail);

      const canEnd =
        gameState.phase === 'POST_ROLL' &&
        ((activePlayer?.doublesCount ?? 0) === 0 || Boolean(activePlayer?.inJail));

      if (e.code === 'Space') {
        if (canRoll) {
          e.preventDefault();
          emitWithAck('game:roll');
        } else if (canEnd) {
          e.preventDefault();
          emitWithAck('game:end_turn');
        }
      } else if (e.code === 'KeyE') {
        if (canEnd) {
          e.preventDefault();
          emitWithAck('game:end_turn');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, isMyTurn, activePlayer, rulesOpen, tradeModalOpen]);

  const handleBuildBranch = (cellIndex: number) => {
    sound.playPurchase();
    emitWithAck('game:build_branch', { cellIndex });
  };
  const handleSellBranch = (cellIndex: number) =>
    emitWithAck('game:sell_branch', { cellIndex });
  const handleMortgage = (cellIndex: number) =>
    emitWithAck('game:mortgage', { cellIndex });
  const handleUnmortgage = (cellIndex: number) =>
    emitWithAck('game:unmortgage', { cellIndex });
  const handleSendChat = (text: string, isQuickReaction?: boolean) =>
    clientRef.current?.emit('game:chat', { text, isQuickReaction });

  const renderBoardElement = (
    gs: GameState,
    boardSizePx?: { width: number; height: number } | null
  ) => (
    <MonopolyBoard
      gameState={gs}
      myPlayerId={playerId}
      selectedCellIndex={selectedCellIndex}
      hoveredSector={hoveredSector}
      activeToast={presentedToast}
      boardSizePx={boardSizePx}
      onSelectCell={(idx) => setSelectedCellIndex(idx)}
      onHoverSector={setHoveredSector}
      onRollDice={() => emitWithAck('game:roll')}
      onPayBail={() => emitWithAck('game:pay_bail')}
      onUseAmnesty={() => emitWithAck('game:use_amnesty')}
      onBuyProperty={() => emitWithAck('game:buy')}
      onStartAuction={() => emitWithAck('game:start_auction')}
      onBidAuction={(increment) => {
        sound.playAuctionBid();
        emitWithAck('game:bid', { increment });
      }}
      onPassAuction={() => emitWithAck('game:pass_auction')}
      onPayDebt={() => emitWithAck('game:pay_debt')}
      onAutoLiquidate={() => emitWithAck('game:auto_liquidate')}
      onBankrupt={() => emitWithAck('game:bankrupt')}
      onEndTurn={() => emitWithAck('game:end_turn')}
      onOpenTradeModal={() => {
        setTradePartnerId(null);
        setTradeModalOpen(true);
      }}
    />
  );

  const matchStageStyle: React.CSSProperties | undefined =
    mobileOrient.isCssRotatedLandscape
      ? {
          position: 'fixed',
          top: `${mobileOrient.vvTop + mobileOrient.vh / 2}px`,
          left: `${mobileOrient.vvLeft + mobileOrient.vw / 2}px`,
          width: `${mobileOrient.stageWidth}px`,
          height: `${mobileOrient.stageHeight}px`,
          transform:
            mobileOrient.rotationDir === 'cw'
              ? 'translate(-50%, -50%) rotate(90deg)'
              : 'translate(-50%, -50%) rotate(-90deg)',
          transformOrigin: 'center center',
          zIndex: 40,
        }
      : mobileOrient.isEffectiveMobileLandscape
        ? {
            position: 'fixed',
            top: `${mobileOrient.vvTop}px`,
            left: `${mobileOrient.vvLeft}px`,
            width: `${mobileOrient.stageWidth}px`,
            height: `${mobileOrient.stageHeight}px`,
            zIndex: 40,
          }
        : undefined;

  return (
    <>
      {!isInBoardMatch ? (
        <>
          <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
          <HomeLobby
            connected={connected}
            transportMode={transportMode}
            roomBusy={roomBusy}
            shareOrigin={shareOrigin}
            playerId={playerId}
            playerName={playerName}
            setPlayerName={setPlayerName}
            selectedToken={selectedToken}
            setSelectedToken={setSelectedToken}
            publicRooms={publicRooms}
            gameState={gameState}
            errorMsg={errorMsg}
            soundEnabled={soundEnabled}
            onToggleSound={handleToggleSound}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((d) => !d)}
            onOpenRules={() => setRulesOpen(true)}
            onQuickBots={handleQuickBots}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onLeaveRoom={handleLeaveRoom}
            onSelectLobbyToken={(token) =>
              clientRef.current?.emit('game:select_token', { token })
            }
            onUpdateLobbyName={handleUpdateLobbyName}
            onAddBot={(teamId?: TeamId) =>
              emitWithAck('game:add_bot', teamId ? { teamId } : {})
            }
            onSetGameMode={(gameMode: GameMode) =>
              emitWithAck('game:set_mode', { gameMode })
            }
            onSwitchTeam={(targetId?: string, teamId?: TeamId) =>
              emitWithAck('game:switch_team', { targetId, teamId })
            }
            onRemovePlayer={(targetId) =>
              clientRef.current?.emit('game:remove_player', { targetId })
            }
            onStartGame={() => {
              requestNativeMobileLandscape();
              emitWithAck('game:start');
            }}
            onSendChat={handleSendChat}
          />
        </>
      ) : (
        <div
          style={matchStageStyle}
          className={
            mobileOrient.isEffectiveMobileLandscape
              ? 'overflow-hidden diia-mesh-bg vyshyvanka-pattern flex items-stretch justify-center select-none'
              : 'min-h-dvh lg:h-dvh lg:overflow-hidden diia-mesh-bg vyshyvanka-pattern flex items-stretch justify-center p-1.5 sm:p-2 2xl:p-3'
          }
        >
          {/* Rules Modal rendered INSIDE the match stage so it appears horizontally in landscape */}
          <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />

          {/* Brief Auto-Landscape Orientation Pill with 180° Flip Control */}
          {mobileOrient.isCssRotatedLandscape && mobileOrient.showRotateHint && (
            <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/90 text-white border border-sky-400/45 shadow-xl backdrop-blur-md text-[11px] font-extrabold whitespace-nowrap">
              <Smartphone className="w-3.5 h-3.5 text-sky-400 rotate-90 shrink-0" />
              <span>Горизонтальний режим гри</span>
              <button
                type="button"
                onClick={() => {
                  mobileOrient.flipRotationDir();
                  mobileOrient.dismissRotateHint();
                }}
                className="px-2 py-0.5 rounded-full bg-sky-500/25 hover:bg-sky-500/40 text-sky-200 border border-sky-400/40 inline-flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                180°
              </button>
            </div>
          )}

          {/* Error Banner in Match */}
          {errorMsg && (
            <div className="fixed bottom-18 xl:bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-rose-600 text-white text-xs font-extrabold shadow-xl max-w-[calc(100%-24px)] text-center">
              {errorMsg}
            </div>
          )}

          {/* AFK Inactivity Elimination Notification Banner */}
          {isEliminatedFromMatch && gameState.status === 'playing' && (
            <div className="fixed top-3 left-1/2 -translate-x-1/2 z-45 px-4 py-2.5 rounded-2xl bg-slate-950/92 text-white border border-rose-500/60 shadow-[0_18px_40px_-10px_rgba(225,29,72,0.55)] backdrop-blur-md flex flex-wrap items-center justify-center gap-3 max-w-[calc(100%-24px)]">
              <div className="flex items-center gap-2.5 text-left">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0 text-rose-400">
                  <UserX className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-black text-rose-300 leading-tight">
                    Ви вибули з гри через бездіяльність (3 ходи без дій)
                  </div>
                  <div className="text-[10.5px] font-semibold text-slate-300 leading-tight mt-0.5">
                    {mySurvivingTeammate && myTeamId
                      ? `Ваш напарник ${mySurvivingTeammate.name} продовжує боротьбу за «${TEAM_META[myTeamId].name}»!`
                      : 'Ваша фішка зникла з поля, куплені компанії стали нічиїми, а кошти анульовано.'}
                  </div>
                </div>
              </div>
              <button
                onClick={handleLeaveRoom}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-sm"
              >
                <LogOut className="w-3.5 h-3.5" />
                Вийти в головне меню
              </button>
            </div>
          )}

          {/* Bankrupt Spectator / 2v2 Surviving Teammate Banner */}
          {mePlayer?.isBankrupt && gameState.status === 'playing' && (
            <div
              className={`fixed top-3 left-1/2 -translate-x-1/2 z-45 px-4 py-2 rounded-2xl bg-slate-950/92 text-white border ${
                mySurvivingTeammate
                  ? 'border-sky-400/55 shadow-[0_16px_36px_-10px_rgba(56,189,248,0.45)]'
                  : 'border-white/20 shadow-xl'
              } backdrop-blur-md flex flex-wrap items-center justify-center gap-3 max-w-[calc(100%-24px)]`}
            >
              <div className="flex items-center gap-2.5 text-left">
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                    mySurvivingTeammate
                      ? 'bg-sky-500/20 border border-sky-400/45 text-sky-300'
                      : 'bg-white/10 border border-white/20 text-slate-300'
                  }`}
                >
                  {mySurvivingTeammate ? (
                    <Handshake className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </div>
                <div>
                  {mySurvivingTeammate && myTeamId ? (
                    <>
                      <div className="text-xs font-black text-sky-300 leading-tight">
                        Ви вибули, але напарник {mySurvivingTeammate.name} продовжує гру за «{TEAM_META[myTeamId].name}»!
                      </div>
                      <div className="text-[10.5px] font-semibold text-slate-300 leading-tight mt-0.5">
                        Перемога напарника принесе спільний тріумф вашій команді 🤝
                      </div>
                    </>
                  ) : (
                    <div className="text-xs font-extrabold text-slate-200 leading-tight">
                      Ви вибули з гри • Режим спостереження за матчем
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={handleLeaveRoom}
                className="px-3 py-1.5 rounded-xl bg-white/12 hover:bg-rose-600 text-white text-[11px] font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                Вийти в меню
              </button>
            </div>
          )}

          {mobileOrient.isEffectiveMobileLandscape ? (
            /* ================================================================
               DEDICATED MOBILE HORIZONTAL (LANDSCAPE) PRO COCKPIT
               Automatically active on iPhone/Android (native or CSS-rotated)
               ================================================================ */
            <MobileLandscapeCockpit
              gameState={gameState}
              myPlayerId={playerId}
              selectedCellIndex={selectedCellIndex}
              stageWidth={mobileOrient.stageWidth}
              stageHeight={mobileOrient.stageHeight}
              isCssRotatedLandscape={mobileOrient.isCssRotatedLandscape}
              isPhysicalPortrait={mobileOrient.isPhysicalPortrait}
              soundEnabled={soundEnabled}
              darkMode={darkMode}
              shareOrigin={shareOrigin}
              canTradeNow={canTradeNow}
              unreadChatCount={unreadMobileChat}
              recentReactions={recentReactions}
              renderBoard={(boardSizePx) =>
                renderBoardElement(gameState, boardSizePx)
              }
              onSelectCell={(idx) => setSelectedCellIndex(idx)}
              onHoverSector={setHoveredSector}
              onBuildBranch={handleBuildBranch}
              onSellBranch={handleSellBranch}
              onMortgage={handleMortgage}
              onUnmortgage={handleUnmortgage}
              onSendChat={handleSendChat}
              onOpenTradeWith={(targetId) => {
                setTradePartnerId(targetId);
                setTradeModalOpen(true);
              }}
              onToggleSound={handleToggleSound}
              onToggleDarkMode={() => setDarkMode((d) => !d)}
              onOpenRules={() => setRulesOpen(true)}
              onFlipRotationDir={mobileOrient.flipRotationDir}
              onSwitchToPortrait={() =>
                mobileOrient.setMobileLandscapeEnabled(false)
              }
              onRequestFullscreen={requestNativeMobileLandscape}
              onMarkChatSeen={() =>
                setMobileSeenChatCount(gameState.chat.length)
              }
              onLeaveGame={handleLeaveRoom}
            />
          ) : isDesktopXl ? (
            /* ================================================================
               DESKTOP COMMAND DECK (1280px+ Compact Laptops, 1080p, 2K & 4K)
               ================================================================ */
            <div className="w-full max-w-[2140px] h-full flex flex-row items-stretch justify-center gap-2 2xl:gap-3.5">
              <LeftPlayersPanel
                gameState={gameState}
                myPlayerId={playerId}
                selectedCellIndex={selectedCellIndex}
                hoveredSector={hoveredSector}
                soundEnabled={soundEnabled}
                darkMode={darkMode}
                shareOrigin={shareOrigin}
                recentReactions={recentReactions}
                onToggleSound={handleToggleSound}
                onToggleDarkMode={() => setDarkMode((d) => !d)}
                onOpenRules={() => setRulesOpen(true)}
                onSelectCell={(idx) => setSelectedCellIndex(idx)}
                onHoverSector={setHoveredSector}
                onOpenTradeWith={(targetId) => {
                  setTradePartnerId(targetId);
                  setTradeModalOpen(true);
                }}
                onLeaveGame={handleLeaveRoom}
              />

              <main className="flex-1 min-w-0 h-full flex items-center justify-center">
                {renderBoardElement(gameState)}
              </main>

              <RightInspectorAndChat
                gameState={gameState}
                myPlayerId={playerId}
                selectedCellIndex={selectedCellIndex}
                onBuildBranch={handleBuildBranch}
                onSellBranch={handleSellBranch}
                onMortgage={handleMortgage}
                onUnmortgage={handleUnmortgage}
                onSendChat={handleSendChat}
              />
            </div>
          ) : (
            /* ================================================================
               PORTRAIT TABLET & OPTIONAL PORTRAIT PHONE SHELL (< 1280px)
               ================================================================ */
            <div className="w-full max-w-3xl min-h-[calc(100dvh-12px)] flex flex-col justify-between gap-2 pb-10 sm:pb-0">
              <MobileMatchHeader
                gameState={gameState}
                soundEnabled={soundEnabled}
                darkMode={darkMode}
                shareOrigin={shareOrigin}
                canTradeNow={canTradeNow}
                onToggleSound={handleToggleSound}
                onToggleDarkMode={() => setDarkMode((d) => !d)}
                onOpenRules={() => setRulesOpen(true)}
                onOpenTradeModal={() => {
                  setTradePartnerId(null);
                  setTradeModalOpen(true);
                }}
                onSwitchToLandscape={
                  mobileOrient.isMobilePhone
                    ? () => {
                        requestNativeMobileLandscape();
                        mobileOrient.setMobileLandscapeEnabled(true);
                      }
                    : undefined
                }
                onLeaveGame={handleLeaveRoom}
              />

              {/* Active Mobile / Tablet Tab View */}
              <main className="flex-1 min-h-0 flex flex-col gap-2">
                {mobileTab === 'board' && (
                  <>
                    <MobilePlayerStrip
                      gameState={gameState}
                      myPlayerId={playerId}
                      recentReactions={recentReactions}
                      onSelectPlayerCell={(pos) => setSelectedCellIndex(pos)}
                      onSwitchToPlayersTab={() => setMobileTab('players')}
                    />

                    <div className="flex-1 flex items-center justify-center w-full max-w-[min(100%,680px)] mx-auto">
                      {renderBoardElement(gameState)}
                    </div>

                    <MobileSelectedCellBar
                      gameState={gameState}
                      myPlayerId={playerId}
                      selectedCellIndex={selectedCellIndex}
                      onOpenFullInspector={() => setMobileTab('inspector')}
                      onBuildBranch={handleBuildBranch}
                    />
                  </>
                )}

                {mobileTab === 'inspector' && (
                  <div className="flex-1 glass-panel rounded-2xl p-3 sm:p-4 space-y-2.5 overflow-y-auto">
                    <MobileInspectorNavHeader
                      selectedCellIndex={selectedCellIndex}
                      onSelectCell={(idx) => setSelectedCellIndex(idx)}
                      onBackToBoard={() => setMobileTab('board')}
                    />
                    <CompanyInspectorContent
                      gameState={gameState}
                      myPlayerId={playerId}
                      selectedCellIndex={selectedCellIndex}
                      onBuildBranch={handleBuildBranch}
                      onSellBranch={handleSellBranch}
                      onMortgage={handleMortgage}
                      onUnmortgage={handleUnmortgage}
                    />
                  </div>
                )}

                {mobileTab === 'players' && (
                  <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto pb-1">
                    <PlayersCardsList
                      gameState={gameState}
                      myPlayerId={playerId}
                      selectedCellIndex={selectedCellIndex}
                      recentReactions={recentReactions}
                      onSelectCell={(idx) => {
                        setSelectedCellIndex(idx);
                        setMobileTab('inspector');
                      }}
                      onOpenTradeWith={(targetId) => {
                        setTradePartnerId(targetId);
                        setTradeModalOpen(true);
                      }}
                    />

                    <div className="glass-panel rounded-2xl p-3">
                      <SectorsControlGrid
                        gameState={gameState}
                        myPlayerId={playerId}
                        selectedCellIndex={selectedCellIndex}
                        onSelectCell={(idx) => {
                          setSelectedCellIndex(idx);
                          setMobileTab('inspector');
                        }}
                      />
                    </div>

                    <NationalFundsWidget
                      gameState={gameState}
                      onSelectCell={(idx) => {
                        setSelectedCellIndex(idx);
                        setMobileTab('board');
                      }}
                    />
                  </div>
                )}

                {mobileTab === 'chat' && (
                  <div className="flex-1 min-h-[360px] glass-panel rounded-2xl p-3 sm:p-4 flex flex-col overflow-hidden">
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] mb-2.5 shrink-0">
                      <button
                        onClick={() => setMobileChatSubTab('chat')}
                        className={`py-1.5 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          mobileChatSubTab === 'chat'
                            ? 'bg-[var(--surface-solid)] shadow-xs'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Чат ({gameState.chat.length})
                      </button>
                      <button
                        onClick={() => setMobileChatSubTab('logs')}
                        className={`py-1.5 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          mobileChatSubTab === 'logs'
                            ? 'bg-[var(--surface-solid)] shadow-xs'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        <ScrollText className="w-3.5 h-3.5" />
                        Хід гри ({gameState.logs.length})
                      </button>
                    </div>

                    {mobileChatSubTab === 'chat' ? (
                      <ChatFeedContent
                        gameState={gameState}
                        onSendChat={handleSendChat}
                      />
                    ) : (
                      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 text-[11px]">
                        {gameState.logs.map((entry) => (
                          <div
                            key={entry.id}
                            className="px-2.5 py-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] leading-snug font-semibold"
                          >
                            {entry.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </main>

              {/* Sticky Thumb-Friendly Bottom Navigation Dock */}
              <div className="sticky bottom-1.5 z-30">
                <MobileBottomNav
                  activeTab={mobileTab}
                  onSelectTab={(tab) => {
                    setMobileTab(tab);
                    if (tab === 'chat') {
                      setMobileSeenChatCount(gameState.chat.length);
                    }
                  }}
                  isMyTurn={Boolean(isMyTurn)}
                  playersCount={gameState.players.length}
                  unreadChatCount={unreadMobileChat}
                  selectedCellColor={selectedCellDef.color}
                />
              </div>
            </div>
          )}

          {/* Modals */}
          <DiiaTradeBuilderModal
            open={tradeModalOpen}
            gameState={gameState}
            myPlayerId={playerId}
            initialPartnerId={tradePartnerId}
            onClose={() => setTradeModalOpen(false)}
            onSubmitTrade={(payload) =>
              emitWithAck('game:propose_trade', payload)
            }
          />

          <IncomingTradeModal
            gameState={gameState}
            myPlayerId={playerId}
            onRespond={(accept) =>
              emitWithAck('game:respond_trade', { accept })
            }
          />

          <VictoryModal
            gameState={gameState}
            myPlayerId={playerId}
            onRematchLobby={() => emitWithAck('game:restart_lobby')}
            onExitHome={handleLeaveRoom}
          />
        </div>
      )}
    </>
  );
};

export default App;
