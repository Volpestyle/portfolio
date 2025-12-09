'use client';

import { AnimatePresence, motion, useAnimationFrame, useIsPresent, useMotionValue, useSpring } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Link, { type LinkProps } from 'next/link';
import { FrozenRouter } from './FrozenRouter';
import { Spinner } from '@/components/ui/spinner';

const EXIT_DURATION_MS = 400;
const BASELINE_DELAY_MS = 200;
const SAFETY_TIMEOUT_MS = 5000;
const SPINNER_OFFSET_FROM_HEADER_PX = 140;

interface PageTransitionContextValue {
  isTransitioning: boolean;
  isExiting: boolean;
  /** Call with `false` to signal async work starting, `true` when ready */
  markReady: (ready: boolean) => void;
  /** Triggers exit animation, returns promise that resolves when animation completes */
  startExit: () => Promise<void>;
  /** Ref callback to attach to the header for spinner positioning */
  headerRef: (element: HTMLElement | null) => void;
}

const PageTransitionContext = createContext<PageTransitionContextValue>({
  isTransitioning: false,
  isExiting: false,
  markReady: () => {},
  startExit: () => Promise.resolve(),
  headerRef: () => {},
});

export function usePageTransition() {
  return useContext(PageTransitionContext);
}

interface PageTransitionProps {
  children: ReactNode;
}

/** Provider that manages transition state - wrap around both Header and content */
export function PageTransitionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [timerDone, setTimerDone] = useState(true);
  const [contentReady, setContentReady] = useState(true);

  // Use MotionValues for high-performance updates without re-renders
  const spinnerTop = useMotionValue(0);
  // Higher stiffness + lighter mass keeps the spinner closely in sync with header movement
  const spinnerTopSmooth = useSpring(spinnerTop, { stiffness: 420, damping: 32, mass: 0.7 });
  const [hasMeasuredHeader, setHasMeasuredHeader] = useState(false);

  const prevPathname = useRef(pathname);
  const exitResolveRef = useRef<(() => void) | null>(null);
  const headerElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Route change: start transition, reset both conditions
  useLayoutEffect(() => {
    if (pathname !== prevPathname.current) {
      // Route changed - exit animation complete, now entering
      setIsExiting(false);
      setIsTransitioning(true);
      setTimerDone(false);
      setContentReady(true); // Default ready; pages opt-in to delay
      prevPathname.current = pathname;
    }
  }, [pathname]);

  // Baseline 500ms timer
  useEffect(() => {
    if (isTransitioning && !timerDone) {
      const timer = setTimeout(() => setTimerDone(true), BASELINE_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [isTransitioning, timerDone]);

  // Safety timeout: force reveal after 5s to prevent infinite spinners
  useEffect(() => {
    if (isTransitioning) {
      const safety = setTimeout(() => {
        setTimerDone(true);
        setContentReady(true);
      }, SAFETY_TIMEOUT_MS);
      return () => clearTimeout(safety);
    }
  }, [isTransitioning]);

  // Reveal when both baseline timer done AND content ready
  useEffect(() => {
    if (isTransitioning && timerDone && contentReady) {
      setIsTransitioning(false);
    }
  }, [isTransitioning, timerDone, contentReady]);

  const markReady = useCallback((ready: boolean) => {
    setContentReady(ready);
  }, []);

  const startExit = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      setIsExiting(true);
      exitResolveRef.current = resolve;
      // Resolve after exit animation duration
      setTimeout(() => {
        exitResolveRef.current?.();
        exitResolveRef.current = null;
      }, EXIT_DURATION_MS);
    });
  }, []);

  const headerRef = useCallback(
    (element: HTMLElement | null) => {
      headerElementRef.current = element;

      if (element) {
        // Initial sync
        const rect = element.getBoundingClientRect();
        spinnerTop.set(rect.bottom + SPINNER_OFFSET_FROM_HEADER_PX);
        setHasMeasuredHeader(true);
      }
    },
    [spinnerTop]
  );

  // Continuously update spinner position while transitioning to track any layout animations (like FLIP)
  // useAnimationFrame syncs with Framer Motion's internal loop, ensuring we read/write
  // in the same phase as the Header's own layout animations.
  useAnimationFrame(() => {
    if (!isTransitioning && !isExiting) return;

    if (headerElementRef.current) {
      const rect = headerElementRef.current.getBoundingClientRect();
      spinnerTop.set(rect.bottom + SPINNER_OFFSET_FROM_HEADER_PX);
      if (!hasMeasuredHeader) {
        setHasMeasuredHeader(true);
      }
    }
  });

  // Listen to resize always to keep position fresh
  useEffect(() => {
    const handleResize = () => {
      if (headerElementRef.current) {
        const rect = headerElementRef.current.getBoundingClientRect();
        spinnerTop.set(rect.bottom + SPINNER_OFFSET_FROM_HEADER_PX);
        if (!hasMeasuredHeader) {
          setHasMeasuredHeader(true);
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [hasMeasuredHeader, spinnerTop]);

  const contextValue: PageTransitionContextValue = {
    isTransitioning,
    isExiting,
    markReady,
    startExit,
    headerRef,
  };

  return (
    <PageTransitionContext.Provider value={contextValue}>
      {children}
      {/* Spinner overlay - portaled to body, completely outside framer-motion */}
      {mounted &&
        createPortal(
          <div
            className={`pointer-events-none fixed inset-0 z-50 transition-opacity duration-200 ${
              isTransitioning || isExiting ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <motion.div
              className="absolute left-1/2"
              initial={false}
              style={{
                top: hasMeasuredHeader ? spinnerTopSmooth : '50%',
                x: '-50%',
                y: '-50%', // Always center vertically on the point
              }}
            >
              <Spinner variant="ring" size="lg" />
            </motion.div>
          </div>,
          document.body
        )}
    </PageTransitionContext.Provider>
  );
}

/** Content wrapper that handles the actual fade animations */
export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const { isTransitioning, isExiting } = usePageTransition();

  return (
    <div className="relative flex w-full flex-1 flex-col">
      <AnimatePresence mode="popLayout">
        <TransitionPane pathname={pathname} isTransitioning={isTransitioning} isExiting={isExiting}>
          {children}
        </TransitionPane>
      </AnimatePresence>
    </div>
  );
}

function TransitionPane({
  children,
  pathname,
  isTransitioning,
  isExiting,
}: {
  children: ReactNode;
  pathname: string | null;
  isTransitioning: boolean;
  isExiting: boolean;
}) {
  const isPresent = useIsPresent();
  // Hide content during exit OR during enter transition
  const shouldHide = isExiting || (isTransitioning && isPresent);

  return (
    <motion.div
      key={pathname ?? 'root'}
      initial={{ opacity: 0, y: 10 }}
      animate={{
        opacity: shouldHide ? 0 : 1,
        y: shouldHide ? (isExiting ? -10 : 10) : 0,
      }}
      exit={{ opacity: 0, y: -10 }}
      transition={{
        duration: 0.4,
        ease: [0.2, 0, 0.2, 1],
      }}
      className="w-full"
      aria-hidden={!isPresent}
      style={!isPresent ? { pointerEvents: 'none' } : undefined}
    >
      <FrozenRouter>{children}</FrozenRouter>
    </motion.div>
  );
}

interface TransitionLinkProps extends LinkProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function TransitionLink({
  href,
  children,
  className,
  style,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ...props
}: TransitionLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { startExit, isExiting } = usePageTransition();

  const handleClick = async (e: MouseEvent<HTMLAnchorElement>) => {
    const targetPath = typeof href === 'string' ? href : href.pathname;

    // Skip transition for same page or external links
    if (targetPath === pathname || !targetPath?.startsWith('/')) {
      return;
    }

    e.preventDefault();

    // Don't start another exit if already exiting
    if (isExiting) return;

    await startExit();
    router.push(targetPath);
  };

  return (
    <Link
      href={href}
      className={className}
      style={style}
      onClick={handleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      {...props}
    >
      {children}
    </Link>
  );
}
