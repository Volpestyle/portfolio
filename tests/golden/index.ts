// Chat eval suites for the portfolio chat runtime.
// Shape mirrors the schema documented in docs/features/chat/evals-and-goldens.md.

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
    questionType: 'binary' | 'list' | 'narrative' | 'meta';
    enumeration?: 'sample' | 'all_relevant';
    scope?: 'employment_only' | 'any_experience';
    verdict?: 'yes' | 'no' | 'partial' | 'unknown' | 'n/a';
    answerContains?: string[];
    answerNotContains?: string[];
    uiHintsProjectsMinCount?: number;
    uiHintsProjectsMaxCount?: number;
    uiHintsExperiencesMinCount?: number;
    uiHintsExperiencesMaxCount?: number;
    mustIncludeProjectIds?: string[];
    mustIncludeExperienceIds?: string[];
    mustNotIncludeProjectIds?: string[];
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
        questionType: 'binary',
        enumeration: 'sample',
        verdict: 'yes',
        uiHintsProjectsMinCount: 1,
      },
    },
    {
      id: 'fc-unknown-rust',
      name: 'Skill absent',
      category: 'binary',
      input: { userMessage: 'Have you used Rust?' },
      expected: {
        questionType: 'binary',
        enumeration: 'sample',
        verdict: 'unknown',
        uiHintsProjectsMaxCount: 0,
      },
    },
    {
      id: 'fc-location',
      name: 'Location fact',
      category: 'binary',
      input: { userMessage: 'Are you based in Seattle?' },
      expected: {
        questionType: 'binary',
        enumeration: 'sample',
        verdict: 'yes',
        scope: 'any_experience',
      },
    },
    {
      id: 'fc-location-presence',
      name: 'Location presence with evidence card',
      category: 'binary',
      input: { userMessage: 'ever been to Seattle?' },
      expected: {
        questionType: 'binary',
        enumeration: 'sample',
        verdict: 'yes',
        scope: 'any_experience',
        uiHintsExperiencesMinCount: 1,
        mustIncludeExperienceIds: ['aws-front-end-engineer'],
      },
    },
    {
      id: 'fc-location-presence-dc',
      name: 'Location presence with singular evidence',
      category: 'binary',
      input: { userMessage: 'ever been to d.c?' },
      expected: {
        questionType: 'binary',
        enumeration: 'sample',
        verdict: 'yes',
        scope: 'any_experience',
        uiHintsExperiencesMinCount: 1,
        uiHintsExperiencesMaxCount: 1,
        uiHintsProjectsMaxCount: 0,
        mustIncludeExperienceIds: ['npr-web-software-developer-intern'],
        answerContains: ['NPR', 'Washington', 'Chicago'],
        answerNotContains: ['related experience'],
      },
    },
    {
      id: 'fc-location-washington-multi',
      name: 'Washington (DC + WA) presence with two experiences',
      category: 'binary',
      input: { userMessage: 'ever been to Washington?' },
      expected: {
        questionType: 'binary',
        enumeration: 'sample',
        verdict: 'yes',
        scope: 'any_experience',
        uiHintsExperiencesMinCount: 2,
        uiHintsExperiencesMaxCount: 2,
        mustIncludeExperienceIds: ['npr-web-software-developer-intern', 'aws-front-end-engineer'],
        answerContains: ['Washington', 'Seattle', 'NPR', 'AWS'],
        answerNotContains: ['related experience', 'various', 'multiple'],
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
        questionType: 'list',
        enumeration: 'all_relevant',
        verdict: 'yes',
        uiHintsProjectsMinCount: 1,
      },
    },
    {
      id: 'enum-employment-react',
      name: 'Employment-only scope',
      category: 'list',
      input: { userMessage: 'Which jobs used React?' },
      expected: {
        questionType: 'list',
        enumeration: 'all_relevant',
        scope: 'employment_only',
        verdict: 'yes',
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
        questionType: 'narrative',
        enumeration: 'sample',
        scope: 'employment_only',
        verdict: 'yes',
        uiHintsExperiencesMinCount: 1,
      },
    },
    {
      id: 'nar-react-vs-vue',
      name: 'Comparison ask',
      category: 'narrative',
      input: { userMessage: 'React vs Vue in your work?' },
      expected: {
        questionType: 'narrative',
        enumeration: 'sample',
        verdict: 'yes',
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
        questionType: 'meta',
        verdict: 'n/a',
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
        questionType: 'meta',
        verdict: 'n/a',
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
        questionType: 'binary',
        enumeration: 'sample',
        verdict: 'unknown',
        uiHintsProjectsMaxCount: 0,
      },
    },
    {
      id: 'edge-off-topic',
      name: 'Off-topic ask',
      category: 'edge_case',
      input: { userMessage: 'Can you do my taxes?' },
      expected: {
        questionType: 'meta',
        verdict: 'n/a',
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
