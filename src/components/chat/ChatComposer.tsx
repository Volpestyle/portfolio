'use client';

import { FormEvent, useCallback, useState, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnimatedSendButton } from '@/components/ui/AnimatedSendButton';

interface ChatComposerProps {
  isBusy: boolean;
  hasMessages: boolean;
  onSend: (text: string) => Promise<void>;
}

export function ChatComposer({ isBusy, hasMessages, onSend }: ChatComposerProps) {
  const [value, setValue] = useState('');
  const [textareaHeight, setTextareaHeight] = useState(40);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <form className={cn(hasMessages ? 'mt-12' : '')} onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="ask me anything..."
          className="max-h-[200px] min-h-[40px] flex-1 overflow-y-auto rounded-lg border-gray-700 bg-black/50 text-white backdrop-blur-sm transition-all duration-200 placeholder:text-gray-500 hover:border-gray-600 focus:outline-none disabled:opacity-50"
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
    </form>
  );
}
