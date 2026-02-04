import { NextRequest, NextResponse } from 'next/server';
import { resolveManagedAppId } from '@/config/apps';
import { getSettings } from '@/server/admin/settings-store';
import { getRuntimeCostClients, getRuntimeCostState, type RuntimeCostState } from '@/server/chat/runtimeCost';

export const runtime = 'nodejs';

export type CostStateResponse =
  | { available: true; state: RuntimeCostState; appId?: string }
  | { available: false; error?: string; appId?: string };

export async function GET(request: NextRequest): Promise<NextResponse<CostStateResponse>> {
  const appId = resolveManagedAppId(request.nextUrl.searchParams.get('app'));
  try {
    const clients = await getRuntimeCostClients();
    if (!clients) {
      return NextResponse.json({
        available: false,
        error: 'Cost tracking not configured',
      });
    }

    let budgetUsd: number | undefined;
    try {
      const settings = await getSettings(appId);
      budgetUsd = settings.monthlyCostLimitUsd;
    } catch {
      budgetUsd = undefined;
    }

    const state = await getRuntimeCostState(clients, { appId, budgetUsd });
    return NextResponse.json({
      available: true,
      state,
      appId,
    });
  } catch (err) {
    console.error('Failed to get cost state', err);
    return NextResponse.json({
      available: false,
      error: 'Failed to fetch cost state',
    });
  }
}
