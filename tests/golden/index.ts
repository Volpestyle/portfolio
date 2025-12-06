// Chat eval suites for the portfolio chat runtime.
// Shape mirrors the schema documented in docs/features/chat/evals.md.

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ChatEvalTestCase = {
  id: string;
  name: string;
  category: 'binary' | 'list' | 'narrative' | 'meta' | 'edge_case';
  input: {
    userMessage: string;
    conversationHistory?: ChatMessage[];
  };
  expected: {
    planQueriesMin?: number;
    planQueriesMax?: number;
    uiHintsProjectsMinCount?: number;
    uiHintsProjectsMaxCount?: number;
    uiHintsExperiencesMinCount?: number;
    uiHintsExperiencesMaxCount?: number;
    mustIncludeProjectIds?: string[];
    mustIncludeExperienceIds?: string[];
    mustNotIncludeProjectIds?: string[];
    answerContains?: string[];
    answerNotContains?: string[];
  };
};

export type ChatEvalSuite = {
  name: string;
  description: string;
  tests: ChatEvalTestCase[];
};

export const factCheckSuite: ChatEvalSuite = {
  name: 'Fact Check',
  description: 'Binary capability and presence questions',
  tests: [
    {
      id: 'fc-yes-react',
      name: 'Skill affirmative',
      category: 'binary',
      input: { userMessage: 'Have you used React?' },
      expected: {
        planQueriesMin: 1,
        answerContains: ['react'],
      },
    },
    {
      id: 'fc-no-evidence-rust',
      name: 'Skill absent',
      category: 'binary',
      input: { userMessage: 'Have you used Rust?' },
      expected: {
        planQueriesMin: 1,
        uiHintsProjectsMaxCount: 0,
      },
    },
    {
      id: 'fc-location',
      name: 'Location fact',
      category: 'binary',
      input: { userMessage: 'Are you based in Seattle?' },
      expected: {
        planQueriesMin: 1,
      },
    },
    {
      id: 'fc-location-presence',
      name: 'Location presence with card',
      category: 'binary',
      input: { userMessage: 'ever been to Seattle?' },
      expected: {
        planQueriesMin: 1,
        uiHintsExperiencesMinCount: 0,
      },
    },
    {
      id: 'fc-location-presence-dc',
      name: 'Location presence single card',
      category: 'binary',
      input: { userMessage: 'ever been to d.c?' },
      expected: {
        planQueriesMin: 1,
        uiHintsProjectsMaxCount: 0,
        uiHintsExperiencesMinCount: 0,
      },
    },
    {
      id: 'fc-location-washington-multi',
      name: 'Washington (DC + WA) presence with two experiences',
      category: 'binary',
      input: { userMessage: 'ever been to Washington?' },
      expected: {
        planQueriesMin: 1,
        uiHintsExperiencesMinCount: 0,
      },
    },
  ],
};

export const enumerationSuite: ChatEvalSuite = {
  name: 'Enumeration',
  description: 'Lists and all-relevant behavior with uiHints alignment',
  tests: [
    {
      id: 'enum-go-projects',
      name: 'List projects by tech',
      category: 'list',
      input: { userMessage: 'Which projects have you used Go on?' },
      expected: {
        planQueriesMin: 1,
        uiHintsProjectsMinCount: 1,
      },
    },
    {
      id: 'enum-employment-react',
      name: 'Employment-only scope',
      category: 'list',
      input: { userMessage: 'Which jobs used React?' },
      expected: {
        planQueriesMin: 1,
        uiHintsExperiencesMinCount: 1,
      },
    },
  ],
};

export const narrativeSuite: ChatEvalSuite = {
  name: 'Narrative',
  description: 'Overview and comparison answers',
  tests: [
    {
      id: 'nar-aws-background',
      name: 'Narrative background',
      category: 'narrative',
      input: { userMessage: 'Tell me about your AWS background.' },
      expected: {
        planQueriesMin: 1,
        uiHintsExperiencesMinCount: 1,
      },
    },
    {
      id: 'nar-react-vs-vue',
      name: 'Comparison ask',
      category: 'narrative',
      input: { userMessage: 'React vs Vue in your work?' },
      expected: {
        planQueriesMin: 1,
        uiHintsProjectsMinCount: 1,
      },
    },
  ],
};

export const metaSuite: ChatEvalSuite = {
  name: 'Meta',
  description: 'Meta and chit-chat behavior',
  tests: [
    {
      id: 'meta-greeting',
      name: 'Greeting',
      category: 'meta',
      input: { userMessage: 'Hi there!' },
      expected: {
        planQueriesMax: 0,
        uiHintsProjectsMaxCount: 0,
        uiHintsExperiencesMaxCount: 0,
      },
    },
    {
      id: 'meta-how-it-works',
      name: 'How does this work',
      category: 'meta',
      input: { userMessage: 'How does this chat work?' },
      expected: {
        planQueriesMax: 0,
        uiHintsProjectsMaxCount: 0,
        uiHintsExperiencesMaxCount: 0,
      },
    },
  ],
};

export const edgeCaseSuite: ChatEvalSuite = {
  name: 'Edge Cases',
  description: 'Zero-evidence and off-topic handling',
  tests: [
    {
      id: 'edge-unknown-language',
      name: 'Unknown tool',
      category: 'edge_case',
      input: { userMessage: 'Have you built production apps in Rust?' },
      expected: {
        planQueriesMin: 1,
        uiHintsProjectsMaxCount: 0,
      },
    },
    {
      id: 'edge-off-topic',
      name: 'Off-topic ask',
      category: 'edge_case',
      input: { userMessage: 'Can you do my taxes?' },
      expected: {
        planQueriesMax: 0,
        uiHintsProjectsMaxCount: 0,
        uiHintsExperiencesMaxCount: 0,
      },
    },
  ],
};

export const chatEvalSuites: ChatEvalSuite[] = [
  factCheckSuite,
  enumerationSuite,
  narrativeSuite,
  metaSuite,
  edgeCaseSuite,
];

export default chatEvalSuites;
