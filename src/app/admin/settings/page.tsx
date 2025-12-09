import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getRuntimeCostClients, getRuntimeCostState } from '@/server/chat/runtimeCost';
import { getSettings } from '@/server/admin/settings-store';
import type { AdminSettings, CostStateResponse } from './types';
import { SettingsClient } from './SettingsClient';

export const metadata = {
  title: 'Settings',
};

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  let initialSettings: AdminSettings | null = null;
  let initialCostState: CostStateResponse | null = null;

  try {
    initialSettings = await getSettings();
  } catch (error) {
    console.error('[admin/settings] Failed to prefetch settings', error);
  }

  try {
    const clients = await getRuntimeCostClients();
    if (clients) {
      const state = await getRuntimeCostState(clients);
      initialCostState = { available: true, state };
    } else {
      initialCostState = { available: false, error: 'Cost tracking not configured' };
    }
  } catch (error) {
    console.error('[admin/settings] Failed to prefetch cost state', error);
    initialCostState = { available: false, error: 'Failed to fetch cost state' };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Settings</h1>
          <p className="mt-1 text-sm text-white/60">
            Configure runtime settings for the chatbot and other features.
          </p>
        </div>
        <Button variant="onBlack" asChild>
          <a href="/api/admin/settings" target="_blank" rel="noreferrer">
            API
          </a>
        </Button>
      </div>

      <Card className="border-white/20 bg-black/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Chatbot Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsClient initialSettings={initialSettings} initialCostState={initialCostState} />
        </CardContent>
      </Card>

      {/* Help / Info */}
      <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 space-y-2">
        <h3 className="text-sm font-medium text-white/80">About Admin Authentication</h3>
        <p className="text-xs text-white/50">
          Admin access supports both <strong className="text-white/70">Google</strong> and{' '}
          <strong className="text-white/70">GitHub</strong> sign-in. Cost limits are enforced via{' '}
          <code className="rounded bg-white/10 px-1">COST_TABLE_NAME</code> in DynamoDB, with optional SNS
          alerts when thresholds are exceeded.
        </p>
      </div>
    </div>
  );
}
