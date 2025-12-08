'use client';

import { FormEvent, useCallback, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, LayoutGroup } from 'framer-motion';
import { Code } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnimatedSendButton } from '@/components/ui/AnimatedSendButton';
import { usePageTransition } from '@/components/PageTransition';
import { useIsAdmin } from '@/hooks/useIsAdmin';

interface ChatComposerProps {
  isBusy: boolean;
  hasMessages: boolean;
  onSend: (text: string) => Promise<void>;
}

export function ChatComposer({ isBusy, hasMessages, onSend }: ChatComposerProps) {
  const [value, setValue] = useState('');
  const [textareaHeight, setTextareaHeight] = useState(40);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const { isTransitioning } = usePageTransition();

  // Check if we're on mobile (below sm breakpoint)
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = textarea.scrollHeight;
      textarea.style.height = `${newHeight}px`;
      setTextareaHeight(newHeight);
    }
  }, [value]);

  const handleSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const trimmed = value.trim();
      if (!trimmed || isBusy) return;
      await onSend(trimmed);
      setValue('');
    },
    [isBusy, onSend, value]
  );

  const isSendDisabled = isBusy || !value.trim();

  const isFixedMode = hasMessages && isMobile;
  const isAdmin = useIsAdmin();
  const isDev = process.env.NODE_ENV === 'development';
  const showDevTools = isDev || isAdmin;

  // Dev mode toggle state (synced with localStorage)
  const [devModeEnabled, setDevModeEnabled] = useState(false);
  useEffect(() => {
    if (!showDevTools) return;
    const stored = window.localStorage.getItem('chat:reasoningDevMode');
    setDevModeEnabled(stored === '1');

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'chat:reasoningDevMode') {
        setDevModeEnabled(e.newValue === '1');
      }
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<{ enabled?: boolean }>).detail;
      if (detail && typeof detail.enabled === 'boolean') {
        setDevModeEnabled(detail.enabled);
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('chat:reasoningDevModeChanged', onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('chat:reasoningDevModeChanged', onCustom);
    };
  }, [showDevTools]);

  const toggleDevMode = useCallback(() => {
    const next = !devModeEnabled;
    setDevModeEnabled(next);
    if (next) {
      window.localStorage.setItem('chat:reasoningDevMode', '1');
    } else {
      window.localStorage.removeItem('chat:reasoningDevMode');
    }
    window.dispatchEvent(new CustomEvent('chat:reasoningDevModeChanged', { detail: { enabled: next } }));
  }, [devModeEnabled]);

  const formContent = (
    <motion.form
      layoutId="chat-composer"
      className={cn(
        isFixedMode
          ? 'fixed bottom-0 left-0 right-0 z-50 bg-black px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2'
          : hasMessages
            ? 'mt-2'
            : ''
      )}
      onSubmit={handleSubmit}
      initial={isFixedMode ? { opacity: 0, y: 10 } : false}
      animate={{
        opacity: isTransitioning && isFixedMode ? 0 : 1,
        y: isTransitioning && isFixedMode ? 10 : 0,
      }}
      transition={{ type: 'tween', duration: 0.4, ease: [0.2, 0, 0.2, 1] }}
    >
      {/* Dev mode toggle button - visible in dev mode or to admins in fixed mobile mode */}
      {isFixedMode && showDevTools && (
        <div className="mx-auto mb-2 flex max-w-3xl justify-end">
          <button
            type="button"
            onClick={toggleDevMode}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
              devModeEnabled
                ? 'bg-purple-500/20 text-purple-300'
                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
            )}
          >
            <Code className="h-3 w-3" />
            <span>Dev</span>
          </button>
        </div>
      )}
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-end">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="ask me anything..."
          className="max-h-[200px] min-h-[40px] flex-1 overflow-y-auto rounded-lg border-gray-700 bg-black/50 text-white text-base backdrop-blur-sm transition-all duration-200 placeholder:text-gray-500 hover:border-gray-600 focus:outline-none disabled:opacity-50"
          disabled={isBusy}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          style={{ resize: 'none' }}
        />
        <AnimatedSendButton disabled={isSendDisabled} height={textareaHeight} />
      </div>
    </motion.form>
  );

  // Use portal to escape the transform context on mobile when there are messages
  if (isFixedMode && typeof document !== 'undefined') {
    return createPortal(
      <LayoutGroup>{formContent}</LayoutGroup>,
      document.body
    );
  }

  return <LayoutGroup>{formContent}</LayoutGroup>;
}
