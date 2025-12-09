import { NextResponse } from 'next/server';
import { getRuntimeCostClients, getRuntimeCostState, type RuntimeCostState } from '@/server/chat/runtimeCost';

export const runtime = 'nodejs';

export type CostStateResponse =
  | { available: true; state: RuntimeCostState }
  | { available: false; error?: string };

export async function GET(): Promise<NextResponse<CostStateResponse>> {
  try {
    const clients = await getRuntimeCostClients();
    if (!clients) {
      return NextResponse.json({
        available: false,
        error: 'Cost tracking not configured',
      });
    }

    const state = await getRuntimeCostState(clients);
    return NextResponse.json({
      available: true,
      state,
    });
  } catch (err) {
    console.error('Failed to get cost state', err);
    return NextResponse.json({
      available: false,
      error: 'Failed to fetch cost state',
    });
  }
}
