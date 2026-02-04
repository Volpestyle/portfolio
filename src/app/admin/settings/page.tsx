import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getRuntimeCostClients, getRuntimeCostState } from '@/server/chat/runtimeCost';
import { getSettings } from '@/server/admin/settings-store';
import { MANAGED_APPS } from '@/config/apps';
import type { AdminSettings, CostStateResponse } from './types';
import { SettingsClient } from './SettingsClient';

export const metadata = {
  title: 'Settings',
};

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const initialSettings: Record<string, AdminSettings | null> = {};
  const initialCostState: Record<string, CostStateResponse | null> = {};

  for (const app of MANAGED_APPS) {
    try {
      initialSettings[app.id] = await getSettings(app.id);
    } catch (error) {
      console.error(`[admin/settings] Failed to prefetch settings for ${app.id}`, error);
      initialSettings[app.id] = null;
    }
  }

  try {
    const clients = await getRuntimeCostClients();
    if (clients) {
      for (const app of MANAGED_APPS) {
        const budgetUsd = initialSettings[app.id]?.monthlyCostLimitUsd;
        const state = await getRuntimeCostState(clients, { appId: app.id, budgetUsd });
        initialCostState[app.id] = { available: true, state, appId: app.id };
      }
    } else {
      for (const app of MANAGED_APPS) {
        initialCostState[app.id] = { available: false, error: 'Cost tracking not configured', appId: app.id };
      }
    }
  } catch (error) {
    console.error('[admin/settings] Failed to prefetch cost state', error);
    for (const app of MANAGED_APPS) {
      initialCostState[app.id] = { available: false, error: 'Failed to fetch cost state', appId: app.id };
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Settings</h1>
          <p className="mt-1 text-sm text-white/60">
            Configure runtime settings for jcvolpe.me apps.
          </p>
        </div>
      </div>

      {MANAGED_APPS.map((app) => (
        <Card key={app.id} className="border-white/20 bg-black/40 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-white">{app.label}</CardTitle>
              <p className="mt-1 text-xs text-white/50">
                {app.domain}
                {app.description ? ` • ${app.description}` : ''}
              </p>
            </div>
            <Button variant="onBlack" asChild>
              <a href={`/api/admin/settings?app=${app.id}`} target="_blank" rel="noreferrer">
                API
              </a>
            </Button>
          </CardHeader>
          <CardContent>
            <SettingsClient
              appId={app.id}
              initialSettings={initialSettings[app.id]}
              initialCostState={initialCostState[app.id]}
            />
          </CardContent>
        </Card>
      ))}

      {/* Help / Info */}
      <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 space-y-2">
        <h3 className="text-sm font-medium text-white/80">About Admin Authentication</h3>
        <p className="text-xs text-white/50">
          Admin access supports both <strong className="text-white/70">Google</strong> and{' '}
          <strong className="text-white/70">GitHub</strong> sign-in. Cost limits are enforced via{' '}
          <code className="rounded bg-white/10 px-1">COST_TABLE_NAME</code> in DynamoDB (keyed per app/env), with
          optional SNS alerts when thresholds are exceeded.
        </p>
      </div>
    </div>
  );
}
