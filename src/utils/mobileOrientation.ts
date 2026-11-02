import { useCallback, useEffect, useRef, useState } from 'react';

export type LandscapeRotationDir = 'cw' | 'ccw';

export function isLikelyMobilePhoneViewport(vw: number, vh: number): boolean {
  const shortest = Math.min(vw, vh);
  const longest = Math.max(vw, vh);
  return shortest < 640 && longest < 1100;
}

/**
 * Must be invoked synchronously inside a user-gesture handler (e.g. "Почати гру").
 * On Android Chrome / Edge / PWA this enters fullscreen & locks hardware landscape;
 * on iOS Safari / in-app WebViews where orientation.lock is unsupported, it silently
 * no-ops while our automatic CSS horizontal stage takes over seamlessly.
 */
export function requestNativeMobileLandscape(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!isLikelyMobilePhoneViewport(window.innerWidth, window.innerHeight)) {
    return;
  }

  try {
    const docEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (!document.fullscreenElement && docEl.requestFullscreen) {
      docEl
        .requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions)
        .then(() => {
          const orient = window.screen?.orientation as
            | (ScreenOrientation & {
                lock?: (mode: string) => Promise<void>;
              })
            | undefined;
          orient?.lock?.('landscape')?.catch?.(() => {});
        })
        .catch(() => {});
    }
  } catch {
    // Ignore on browsers without Fullscreen API (iOS iPhone Safari / WebViews)
  }

  try {
    const orient = window.screen?.orientation as
      | (ScreenOrientation & {
          lock?: (mode: string) => Promise<void>;
        })
      | undefined;
    orient?.lock?.('landscape')?.catch?.(() => {});
  } catch {
    // Ignore when unsupported
  }
}

export function releaseNativeMobileLandscape(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  try {
    const orient = window.screen?.orientation as
      | (ScreenOrientation & {
          unlock?: () => void;
        })
      | undefined;
    orient?.unlock?.();
  } catch {
    // Ignore
  }

  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  } catch {
    // Ignore
  }
}

interface ViewportMetrics {
  vw: number;
  vh: number;
  vvTop: number;
  vvLeft: number;
  isPhysicalPortrait: boolean;
}

function readViewportMetrics(prev?: ViewportMetrics): ViewportMetrics {
  if (typeof window === 'undefined') {
    return {
      vw: 1280,
      vh: 800,
      vvTop: 0,
      vvLeft: 0,
      isPhysicalPortrait: false,
    };
  }

  const vv = window.visualViewport;
  const rawVw = Math.max(
    280,
    Math.round(window.innerWidth || vv?.width || 1280)
  );
  const rawVh = Math.max(
    260,
    Math.round(window.innerHeight || vv?.height || 800)
  );
  const vvTop = Math.round(vv?.offsetTop || 0);
  const vvLeft = Math.round(vv?.offsetLeft || 0);

  // Guard against virtual keyboard opening on mobile (height shrinks while width stays fixed and an input is focused)
  if (prev && typeof document !== 'undefined') {
    const activeTag = document.activeElement?.tagName;
    const inputFocused =
      activeTag === 'INPUT' ||
      activeTag === 'TEXTAREA' ||
      activeTag === 'SELECT';
    if (
      inputFocused &&
      Math.abs(rawVw - prev.vw) < 28 &&
      prev.vh - rawVh > 110
    ) {
      return {
        vw: rawVw,
        vh: prev.vh,
        vvTop: 0,
        vvLeft: 0,
        isPhysicalPortrait: prev.isPhysicalPortrait,
      };
    }
  }

  return {
    vw: rawVw,
    vh: rawVh,
    vvTop,
    vvLeft,
    isPhysicalPortrait: rawVw < rawVh,
  };
}

export function useMobileViewportAndOrientation(isInBoardMatch: boolean) {
  const [metrics, setMetrics] = useState<ViewportMetrics>(() =>
    readViewportMetrics()
  );
  const [mobileLandscapeEnabled, setMobileLandscapeEnabled] =
    useState<boolean>(true);
  const [rotationDir, setRotationDir] = useState<LandscapeRotationDir>(() => {
    if (typeof window === 'undefined') return 'cw';
    return window.localStorage.getItem('magnat_landscape_dir') === 'ccw'
      ? 'ccw'
      : 'cw';
  });
  const [showRotateHint, setShowRotateHint] = useState<boolean>(false);
  const prevInMatchRef = useRef<boolean>(false);

  useEffect(() => {
    let rafId: number | null = null;
    const sync = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setMetrics((prev) => {
          const next = readViewportMetrics(prev);
          if (
            prev.vw === next.vw &&
            prev.vh === next.vh &&
            prev.vvTop === next.vvTop &&
            prev.vvLeft === next.vvLeft &&
            prev.isPhysicalPortrait === next.isPhysicalPortrait
          ) {
            return prev;
          }
          return next;
        });
      });
    };

    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.visualViewport?.addEventListener('resize', sync);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.visualViewport?.removeEventListener('resize', sync);
    };
  }, []);

  // Automatically enable horizontal mode every time the player enters an active match
  useEffect(() => {
    if (isInBoardMatch && !prevInMatchRef.current) {
      setMobileLandscapeEnabled(true);
      if (isLikelyMobilePhoneViewport(window.innerWidth, window.innerHeight)) {
        setShowRotateHint(true);
      }
    } else if (!isInBoardMatch && prevInMatchRef.current) {
      setShowRotateHint(false);
      releaseNativeMobileLandscape();
    }
    prevInMatchRef.current = isInBoardMatch;
  }, [isInBoardMatch]);

  useEffect(() => {
    if (!showRotateHint) return;
    const t = setTimeout(() => setShowRotateHint(false), 3200);
    return () => clearTimeout(t);
  }, [showRotateHint]);

  const flipRotationDir = useCallback(() => {
    setRotationDir((prev) => {
      const next: LandscapeRotationDir = prev === 'cw' ? 'ccw' : 'cw';
      window.localStorage.setItem('magnat_landscape_dir', next);
      return next;
    });
  }, []);

  const isMobilePhone = isLikelyMobilePhoneViewport(metrics.vw, metrics.vh);
  const isCompactLandscapeTablet =
    !metrics.isPhysicalPortrait && metrics.vh < 560 && metrics.vw < 1280;

  const isCssRotatedLandscape = Boolean(
    isInBoardMatch &&
      isMobilePhone &&
      mobileLandscapeEnabled &&
      metrics.isPhysicalPortrait
  );

  const isNativeMobileLandscape = Boolean(
    isInBoardMatch &&
      !metrics.isPhysicalPortrait &&
      (isMobilePhone || isCompactLandscapeTablet)
  );

  const isEffectiveMobileLandscape =
    isCssRotatedLandscape || isNativeMobileLandscape;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    if (isEffectiveMobileLandscape) {
      html.classList.add('mobile-match-lock');
      body.classList.add('mobile-match-lock');
    } else {
      html.classList.remove('mobile-match-lock');
      body.classList.remove('mobile-match-lock');
    }
    return () => {
      html.classList.remove('mobile-match-lock');
      body.classList.remove('mobile-match-lock');
    };
  }, [isEffectiveMobileLandscape]);

  const stageWidth = isCssRotatedLandscape ? metrics.vh : metrics.vw;
  const stageHeight = isCssRotatedLandscape ? metrics.vw : metrics.vh;

  return {
    vw: metrics.vw,
    vh: metrics.vh,
    vvTop: metrics.vvTop,
    vvLeft: metrics.vvLeft,
    isMobilePhone,
    isPhysicalPortrait: metrics.isPhysicalPortrait,
    mobileLandscapeEnabled,
    setMobileLandscapeEnabled,
    rotationDir,
    flipRotationDir,
    isCssRotatedLandscape,
    isNativeMobileLandscape,
    isEffectiveMobileLandscape,
    stageWidth,
    stageHeight,
    showRotateHint,
    dismissRotateHint: () => setShowRotateHint(false),
  };
}

