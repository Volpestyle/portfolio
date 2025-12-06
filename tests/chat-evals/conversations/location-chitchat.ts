// Location chitchat test - casual conversation with Seattle/D.C. follow-ups

import type { ChatEvalTestCase } from '../framework/types';

export const locationChitchat: ChatEvalTestCase = {
  id: 'conv-location-chitchat',
  name: 'Location chitchat with Seattle and D.C. clarification',
  description: 'Tests casual conversation about locations, then specific questions about Seattle/D.C. experience',
  turns: [
    {
      userMessage: 'where u from?',
      goldenResponse:
        "i'm james. born in chicago, now somewhere between a render instance and a browser tab — currently living in charlotte, nc. where you from?",
      judgeHints: 'Should mention Chicago origin and Charlotte current location. Casual tone.',
    },
    {
      userMessage: 'nice, im from canada!',
      goldenResponse:
        "ahhh nice — canada's got the best poutine and polite chaos. been a few times, love it. any particular province you're reppin' or just keeping it maple-syrupy nationwide?",
      judgeHints: 'Should acknowledge Canada warmly. Casual, friendly tone. May ask follow-up.',
    },
    {
      userMessage: 'ever been to Seattle?',
      goldenResponse:
        'yep — spent a couple years in seattle while I was at AWS (worked on the IAM Console there). loved the coffee, the rain rhythm, and pretending i was into hiking. you ever been?',
      judgeHints:
        'MUST mention AWS/Seattle work experience. Should reference IAM Console or similar AWS work. Casual tone.',
    },
    {
      userMessage: 'ever been to Washington?',
      goldenResponse:
        "yep — been to Washington state plenty. lived in the Puget Sound area for a bit while at AWS, so i know seattle vibes, the ferry commutes, and the rain cadence. you talking Washington state or D.C. (politicians are different ecosystems)?",
      judgeHints:
        'Should clarify ambiguity between Washington state and D.C. May mention AWS/Seattle again. Should ask for clarification.',
    },
    {
      userMessage: 'D.C.',
      goldenResponse:
        "yep — been to D.C. I interned at NPR in Washington, D.C. during the summer of 2019 where I built a full-stack audio engineering discrepancy logger (MEAN stack, dockerized for CI/CD). you been there recently or planning a trip?",
      judgeHints:
        'MUST mention NPR internship in D.C. Should include some project details. Casual tone with follow-up question.',
    },
  ],
};
