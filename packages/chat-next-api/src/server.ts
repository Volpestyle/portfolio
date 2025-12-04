import { recordOpenAICostFromUsage } from './costMetrics';
import {
  CHAT_DEBUG_LEVEL,
  getChatDebugLogs,
  logChatDebug,
  resetChatDebugLogs,
  runWithChatLogContext,
  type ChatDebugLogEntry,
} from './debugLogBuffer';

export type ChatServerLogger = (event: string, payload: Record<string, unknown>) => void;

export function createChatServerLogger(onEvent?: ChatServerLogger): ChatServerLogger {
  return (event, payload) => {
    logChatDebug(event, payload);
    if (event === 'chat.pipeline.tokens') {
      void recordOpenAICostFromUsage(payload);
    }
    onEvent?.(event, payload);
  };
}

export {
  logChatDebug,
  getChatDebugLogs,
  resetChatDebugLogs,
  runWithChatLogContext,
  CHAT_DEBUG_LEVEL,
  type ChatDebugLogEntry,
};
