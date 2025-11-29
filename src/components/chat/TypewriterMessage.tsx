'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/Markdown';
import { isTypewriterDebugEnabled, typewriterDebug } from '@portfolio/chat-next-ui';

const graphemeSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

type TypewriterMessageProps = {
  text: string;
  speed?: number;
  backspaceSpeed?: number;
  streaming?: boolean;
  className?: string;
  showCursor?: boolean;
  markdown?: boolean;
  messageId?: string;
  itemId?: string;
  onDone?: () => void;
};

export function TypewriterMessage({
  text,
  speed = 16,
  backspaceSpeed = 25,
  streaming,
  className,
  showCursor = false,
  markdown = false,
  messageId,
  itemId,
  onDone,
}: TypewriterMessageProps) {
  const [display, setDisplay] = useState('');
  const [completedFor, setCompletedFor] = useState<string | null>(null);
  const isStreaming = streaming ?? false;
  const queueRef = useRef<string[]>([]);
  const rafRef = useRef<number | null>(null);
  const streamingTargetRef = useRef<string>('');
  const lastDisplayRef = useRef<string>('');
  const lastFrameTimeRef = useRef<number | null>(null);
  const streamingFlagRef = useRef<boolean>(isStreaming);
  const streamRateRef = useRef<number>(48); // characters per second, tuned against SSE pace
  const lastStreamMetaRef = useRef<{ length: number; timestamp: number }>({
    length: 0,
    timestamp: Date.now(),
  });
  const debugContext = itemId ?? messageId ?? 'typewriter';
  const logEvent = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      typewriterDebug(event, { messageId, itemId, context: debugContext, ...payload });
    },
    [debugContext, itemId, messageId]
  );

  useEffect(() => {
    streamingFlagRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming || queueRef.current.length) {
      return;
    }

    if (display === text) {
      return;
    }

    const common = commonPrefixLength(display, text);
    const isDeleting = graphemeLength(display) > common;

    const timeout = setTimeout(
      () => {
        setDisplay((current) =>
          isDeleting ? sliceGraphemes(current, graphemeLength(current) - 1) : sliceGraphemes(text, common + 1)
        );
      },
      isDeleting ? backspaceSpeed : speed
    );

    return () => clearTimeout(timeout);
  }, [display, text, speed, backspaceSpeed, isStreaming]);

  useEffect(() => {
    if (!isStreaming) {
      return;
    }

    const debugEnabled = isTypewriterDebugEnabled();
    const target = text;
    const previousTarget = streamingTargetRef.current;
    const targetPoints = splitIntoGraphemes(target);
    const previousTargetPoints = splitIntoGraphemes(previousTarget);
    const now = Date.now();
    const enqueueDelta = (delta: string) => {
      if (!delta) return;
      queueRef.current.push(...splitIntoGraphemes(delta));
    };

    const meta = lastStreamMetaRef.current;
    const deltaSinceLastTick = targetPoints.length - meta.length;
    const elapsedMs = Math.max(16, meta.timestamp ? now - meta.timestamp : 16);
    let incomingRate: number | null = null;
    if (deltaSinceLastTick > 0) {
      incomingRate = (deltaSinceLastTick / elapsedMs) * 1000;
      const smoothed = streamRateRef.current * 0.6 + incomingRate * 0.4;
      streamRateRef.current = clamp(smoothed, 12, 480);
    }
    lastStreamMetaRef.current = { length: targetPoints.length, timestamp: now };

    if (debugEnabled) {
      logEvent('typewriter_target_update', {
        streaming: isStreaming,
        previousLength: previousTargetPoints.length,
        nextLength: targetPoints.length,
        deltaSinceLastTick,
        incomingRate,
        streamRate: streamRateRef.current,
        queueLength: queueRef.current.length,
        displayLength: graphemeLength(lastDisplayRef.current),
      });
    }

    const common = commonPrefixLengthFromArrays(previousTargetPoints, targetPoints);

    // Update target and queue based on incoming text
    if (common < previousTargetPoints.length) {
      // Stream rewound or rewrote same-length text; reset to the common prefix and rebuild backlog.
      queueRef.current = [];
      streamingTargetRef.current = target;
      lastFrameTimeRef.current = null;
      const base = targetPoints.slice(0, common).join('');
      lastDisplayRef.current = base;
      setDisplay(base);
      enqueueDelta(targetPoints.slice(common).join(''));
      if (debugEnabled) {
        logEvent('typewriter_stream_rewind', {
          previousLength: previousTargetPoints.length,
          nextLength: targetPoints.length,
          commonPrefix: common,
          basePreview: previewGraphemes(base),
          queueLength: queueRef.current.length,
        });
      }
    } else if (targetPoints.length > previousTargetPoints.length) {
      // Normal append
      const delta = targetPoints.slice(previousTargetPoints.length).join('');
      enqueueDelta(delta);
      streamingTargetRef.current = target;
      if (debugEnabled) {
        logEvent('typewriter_stream_append', {
          deltaLength: splitIntoGraphemes(delta).length,
          deltaPreview: previewGraphemes(delta),
          queueLength: queueRef.current.length,
          streamRate: streamRateRef.current,
          targetLength: targetPoints.length,
        });
      }
    }

    const step = (timestamp: number) => {
      if (!queueRef.current.length) {
        if (debugEnabled) {
          logEvent('typewriter_queue_empty', {
            streaming: streamingFlagRef.current,
            displayLength: graphemeLength(lastDisplayRef.current),
            targetLength: graphemeLength(streamingTargetRef.current),
          });
        }
        rafRef.current = null;
        lastFrameTimeRef.current = null;
        // Once the queue is drained and streaming is over, make sure we end aligned to target text
        if (!streamingFlagRef.current && lastDisplayRef.current !== streamingTargetRef.current) {
          lastDisplayRef.current = streamingTargetRef.current;
          setDisplay(streamingTargetRef.current);
          if (debugEnabled) {
            logEvent('typewriter_snap_to_target', {
              targetLength: graphemeLength(streamingTargetRef.current),
              queueLength: queueRef.current.length,
            });
          }
        }
        return;
      }

      // Compute frame timing and chunk size OUTSIDE setDisplay to avoid
      // double-execution issues in React 18 Strict Mode
      const lastFrame = lastFrameTimeRef.current ?? timestamp - 16;
      const frameDelta = Math.max(8, timestamp - lastFrame);
      lastFrameTimeRef.current = timestamp;

      const backlog = queueRef.current.length;
      const effectiveStreamRate = clamp(streamRateRef.current, 12, 480);
      // Aim to drain backlog over a visible window (min 480ms, max 1.6s) to keep a noticeable typewriter effect.
      const targetDurationMs = clamp((backlog / effectiveStreamRate) * 1000, 480, 1600);
      const charsThisFrame = Math.max(1, Math.floor((backlog * frameDelta) / targetDurationMs));

      // Mutate queue OUTSIDE setDisplay - splice is a side effect that would
      // execute twice in Strict Mode if inside the updater
      const nextChunk = queueRef.current.splice(0, charsThisFrame).join('');

      setDisplay((prev) => {
        const next = prev + nextChunk;
        lastDisplayRef.current = next;
        return next;
      });

      if (debugEnabled) {
        logEvent('typewriter_drain_frame', {
          frameDelta,
          charsThisFrame,
          chunkLength: splitIntoGraphemes(nextChunk).length,
          chunkPreview: previewGraphemes(nextChunk),
          backlogBefore: backlog,
          backlogRemaining: queueRef.current.length,
          streamRate: effectiveStreamRate,
          displayLength: graphemeLength(lastDisplayRef.current),
          targetLength: graphemeLength(streamingTargetRef.current),
        });
      }

      rafRef.current = requestAnimationFrame(step);
    };

    // Ensure the RAF loop is running when there's backlog, even if streaming just ended
    if (!rafRef.current && queueRef.current.length) {
      rafRef.current = requestAnimationFrame(step);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        lastFrameTimeRef.current = null;
      }
    };
  }, [isStreaming, logEvent, text]);

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Reset completion tracking when a new text value arrives
    setCompletedFor(null);
    if (isTypewriterDebugEnabled()) {
      logEvent('typewriter_text_reset', {
        nextLength: graphemeLength(text),
        streaming: streamingFlagRef.current,
      });
    }
  }, [logEvent, text]);

  useEffect(() => {
    if (display === text && text.length && completedFor !== text && queueRef.current.length === 0) {
      setCompletedFor(text);
      if (isTypewriterDebugEnabled()) {
        logEvent('typewriter_complete', {
          textLength: graphemeLength(text),
          displayLength: graphemeLength(display),
          queueLength: queueRef.current.length,
          streaming: streamingFlagRef.current,
        });
      }
      onDone?.();
    }
  }, [completedFor, display, logEvent, onDone, text]);

  // Continue draining the queue after streaming ends
  useEffect(() => {
    if (isStreaming || queueRef.current.length === 0) {
      return;
    }

    // Streaming just ended but there's still queue to drain - restart the RAF loop
    const step = (timestamp: number) => {
      if (!queueRef.current.length) {
        rafRef.current = null;
        lastFrameTimeRef.current = null;
        // Snap to final text if needed
        if (lastDisplayRef.current !== text) {
          lastDisplayRef.current = text;
          setDisplay(text);
        }
        return;
      }

      // Compute frame timing and chunk size OUTSIDE setDisplay to avoid
      // double-execution issues in React 18 Strict Mode
      const lastFrame = lastFrameTimeRef.current ?? timestamp - 16;
      const frameDelta = Math.max(8, timestamp - lastFrame);
      lastFrameTimeRef.current = timestamp;

      const backlog = queueRef.current.length;
      const effectiveStreamRate = clamp(streamRateRef.current, 12, 480);
      const targetDurationMs = clamp((backlog / effectiveStreamRate) * 1000, 480, 1600);
      const charsThisFrame = Math.max(1, Math.floor((backlog * frameDelta) / targetDurationMs));

      // Mutate queue OUTSIDE setDisplay - splice is a side effect that would
      // execute twice in Strict Mode if inside the updater
      const nextChunk = queueRef.current.splice(0, charsThisFrame).join('');

      setDisplay((prev) => {
        const next = prev + nextChunk;
        lastDisplayRef.current = next;
        return next;
      });

      rafRef.current = requestAnimationFrame(step);
    };

    if (!rafRef.current) {
      if (isTypewriterDebugEnabled()) {
        logEvent('typewriter_post_stream_drain_start', {
          queueLength: queueRef.current.length,
          displayLength: graphemeLength(lastDisplayRef.current),
          targetLength: graphemeLength(text),
        });
      }
      rafRef.current = requestAnimationFrame(step);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isStreaming, logEvent, text]);

  // Safety net: if streaming is over and queue is empty but display doesn't match, snap to final text.
  useEffect(() => {
    if (!isStreaming && queueRef.current.length === 0 && display !== text && text.length) {
      if (isTypewriterDebugEnabled()) {
        logEvent('typewriter_safety_snap', {
          targetLength: graphemeLength(text),
          previousDisplayLength: graphemeLength(display),
        });
      }
      setDisplay(text);
      lastDisplayRef.current = text;
    }
  }, [display, isStreaming, logEvent, text]);

  const baseClass = markdown ? 'text-sm leading-relaxed text-white' : 'font-mono text-sm leading-6 text-gray-100';

  return (
    <div className={cn(baseClass, className)}>
      {markdown ? <Markdown content={display} variant="compact" showCursor={showCursor} /> : display}
    </div>
  );
}

function commonPrefixLength(a: string, b: string) {
  const aPoints = splitIntoGraphemes(a);
  const bPoints = splitIntoGraphemes(b);
  return commonPrefixLengthFromArrays(aPoints, bPoints);
}

function commonPrefixLengthFromArrays(a: string[], b: string[]) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i += 1;
  }
  return i;
}

function graphemeLength(value: string) {
  return splitIntoGraphemes(value).length;
}

function sliceGraphemes(value: string, length: number) {
  if (length <= 0) return '';
  return splitIntoGraphemes(value).slice(0, length).join('');
}

function previewGraphemes(value: string, max = 64) {
  const clusters = splitIntoGraphemes(value);
  const preview = clusters.slice(0, max).join('');
  return clusters.length > max ? `${preview}...` : preview;
}

function splitIntoGraphemes(value: string) {
  if (!value) return [];
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(value), (segment) => segment.segment);
  }
  return Array.from(value); // fallback to code points when Segmenter is unavailable
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
