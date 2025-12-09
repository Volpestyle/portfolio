export type AdminSettings = {
  monthlyCostLimitUsd: number;
  chatEnabled: boolean;
  updatedAt: string;
};

export type CostLevel = 'ok' | 'warning' | 'critical' | 'exceeded';

export type CostState = {
  monthKey: string;
  spendUsd: number;
  turnCount: number;
  budgetUsd: number;
  percentUsed: number;
  remainingUsd: number;
  level: CostLevel;
  estimatedTurnsRemaining: number;
  updatedAt: string;
};

export type CostStateResponse =
  | { available: true; state: CostState }
  | { available: false; error?: string };
