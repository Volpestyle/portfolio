// React experience test - questions about React projects and work history

import type { ChatEvalTestCase } from '../framework/types';

export const reactExperience: ChatEvalTestCase = {
  id: 'conv-react-experience',
  name: 'React experience and projects',
  description: 'Tests questions about React work history, projects, and technical experience',
  turns: [
    {
      userMessage: 'what react stuff have u done?',
      goldenResponse:
        "short version: react stuff i've shipped — built my full Next.js/React portfolio (AI chat, admin CMS, SSE chat streaming), a Rubik's-Cube visualizer in React + Tailwind with tests, an AWS IAM Console React UX mock, and real React work at Lowe's and AWS (production console and returns apps). want a repo link or to deep-dive any one of these?",
      judgeHints:
        'MUST mention multiple React projects (portfolio, Rubiks cube, AWS IAM). MUST mention professional React work at Lowe\'s and/or AWS. Should offer to provide more details. Casual tone.',
    },
  ],
};
