// Chat eval test suites - main entry point
// Re-exports types and assembles all suites

import type { ChatEvalSuite } from './framework/types';
import { locationChitchat, reactExperience } from './conversations';

// Re-export types and framework for external use
export * from './framework';
export * from './conversations';

// Assemble all suites
export const conversationSuite: ChatEvalSuite = {
  name: 'Multi-Turn Conversations',
  description: 'Full conversation flows evaluated with semantic similarity and LLM-as-a-judge',
  tests: [locationChitchat, reactExperience],
};

// All suites to run
export const chatEvalSuites: ChatEvalSuite[] = [conversationSuite];

export default chatEvalSuites;
