'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, TrendingUp } from 'lucide-react';
import type { AdminSettings, CostState, CostStateResponse } from './types';

type SettingsClientProps = {
  initialSettings?: AdminSettings | null;
  initialCostState?: CostStateResponse | null;
};

export function SettingsClient({ initialSettings = null, initialCostState = null }: SettingsClientProps) {
  const [settings, setSettings] = useState<AdminSettings | null>(initialSettings);
  const [loading, setLoading] = useState(!initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Local state for form
  const [monthlyCostLimit, setMonthlyCostLimit] = useState(initialSettings?.monthlyCostLimitUsd ?? 10);
  const [chatEnabled, setChatEnabled] = useState(initialSettings?.chatEnabled ?? true);

  // Cost state (read-only)
  const [costState, setCostState] = useState<CostState | null>(initialCostState?.available ? initialCostState.state : null);
  const [costAvailable, setCostAvailable] = useState<boolean | null>(initialCostState ? initialCostState.available : null);
  const [costError, setCostError] = useState<string | null>(!initialCostState?.available ? initialCostState?.error ?? null : null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/settings', { cache: 'no-store' });
      const data = (await response.json()) as { settings?: AdminSettings; error?: string };
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load settings.');
      }
      if (data.settings) {
        setSettings(data.settings);
        setMonthlyCostLimit(data.settings.monthlyCostLimitUsd);
        setChatEnabled(data.settings.chatEnabled);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCostState = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/cost-state', { cache: 'no-store' });
      const data = (await response.json()) as CostStateResponse;
      if (data.available) {
        setCostState(data.state);
        setCostAvailable(true);
        setCostError(null);
      } else {
        setCostState(null);
        setCostAvailable(false);
        setCostError(data.error ?? null);
      }
    } catch {
      setCostState(null);
      setCostAvailable(false);
      setCostError('Failed to fetch cost state');
    }
  }, []);

  useEffect(() => {
    const needsSettings = !initialSettings;
    const needsCostState = !initialCostState;

    if (!needsSettings) {
      setLoading(false);
    } else {
      fetchSettings();
    }

    if (needsCostState) {
      fetchCostState();
    }
  }, [fetchSettings, fetchCostState, initialCostState, initialSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    // Optimistic update
    const previousSettings = settings;
    setSettings((prev) =>
      prev ? { ...prev, monthlyCostLimitUsd: monthlyCostLimit, chatEnabled } : null
    );

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyCostLimitUsd: monthlyCostLimit, chatEnabled }),
      });
      const data = (await response.json()) as { settings?: AdminSettings; error?: string };
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save settings.');
      }
      if (data.settings) {
        setSettings(data.settings);
      }
      setSuccess('Settings saved successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      // Rollback optimistic update
      setSettings(previousSettings);
      setError(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    settings && (monthlyCostLimit !== settings.monthlyCostLimitUsd || chatEnabled !== settings.chatEnabled);

  if (loading) {
    return (
      <div className="rounded-md border border-dashed border-white/20 px-4 py-6 text-sm text-white/50">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          {success}
        </div>
      )}

      {/* Current Spend Badge (read-only) */}
      {costAvailable === true && costState && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-white/60" />
            <span className="text-sm font-medium text-white">Current Month Spend</span>
          </div>
          <div className={`rounded-lg border p-4 ${
            costState.level === 'ok' ? 'border-green-500/30 bg-green-500/5' :
            costState.level === 'warning' ? 'border-yellow-500/30 bg-yellow-500/5' :
            costState.level === 'critical' ? 'border-orange-500/30 bg-orange-500/5' :
            'border-red-500/30 bg-red-500/5'
          }`}>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">${costState.spendUsd.toFixed(2)}</span>
                  <span className="text-sm text-white/50">/ ${costState.budgetUsd.toFixed(0)} budget</span>
                </div>
                <div className="text-xs text-white/50">
                  {costState.turnCount} turns this month ({costState.monthKey})
                </div>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                  costState.level === 'ok' ? 'bg-green-500/20 text-green-400' :
                  costState.level === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                  costState.level === 'critical' ? 'bg-orange-500/20 text-orange-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {costState.level === 'ok' ? 'OK' :
                   costState.level === 'warning' ? 'Warning' :
                   costState.level === 'critical' ? 'Critical' : 'Exceeded'}
                </span>
                {costState.estimatedTurnsRemaining > 0 && (
                  <div className="mt-1 text-xs text-white/50">
                    ~{costState.estimatedTurnsRemaining} turns remaining
                  </div>
                )}
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full transition-all ${
                    costState.level === 'ok' ? 'bg-green-500' :
                    costState.level === 'warning' ? 'bg-yellow-500' :
                    costState.level === 'critical' ? 'bg-orange-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(100, costState.percentUsed)}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-white/40">
                <span>{costState.percentUsed.toFixed(1)}% used</span>
                <span>${costState.remainingUsd.toFixed(2)} remaining</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cost tracking unavailable warning */}
      {costAvailable === false && (
        <div className="flex items-start gap-2 rounded-md border border-white/10 bg-white/5 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-white/40" />
          <div>
            <p className="text-sm text-white/60">Cost tracking unavailable</p>
            <p className="text-xs text-white/40">
              {costError || 'Using configured budget only. Runtime spend data will appear when cost tracking is enabled.'}
            </p>
          </div>
        </div>
      )}

      {/* Chat Enabled Toggle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <label htmlFor="chat-enabled" className="text-sm font-medium text-white">
              Chatbot Enabled
            </label>
            <p className="text-xs text-white/50">Kill switch for the chatbot. When disabled, returns 503.</p>
          </div>
          <button
            id="chat-enabled"
            type="button"
            role="switch"
            aria-checked={chatEnabled}
            onClick={() => setChatEnabled(!chatEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              chatEnabled ? 'bg-green-500' : 'bg-white/20'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                chatEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <div
          className={`text-sm font-medium ${chatEnabled ? 'text-green-400' : 'text-red-400'}`}
        >
          {chatEnabled ? 'Chat is enabled' : 'Chat is disabled'}
        </div>
      </div>

      {/* Monthly Cost Limit Slider */}
      <div className="space-y-2">
        <div>
          <label htmlFor="cost-threshold" className="text-sm font-medium text-white">
            Monthly Cost Limit
          </label>
          <p className="text-xs text-white/50">Maximum monthly spend before chatbot is throttled.</p>
        </div>
        <div className="flex items-center gap-4">
          <input
            id="cost-threshold"
            type="range"
            min={0}
            max={200}
            step={1}
            value={monthlyCostLimit}
            onChange={(e) => setMonthlyCostLimit(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-white/20 accent-blue-500"
          />
          <div className="w-20 text-right">
            <span className="text-lg font-semibold text-white">${monthlyCostLimit.toFixed(0)}</span>
            <span className="text-xs text-white/50"> / month</span>
          </div>
        </div>
        <div className="flex justify-between text-xs text-white/40">
          <span>$0</span>
          <span>$50</span>
          <span>$100</span>
          <span>$150</span>
          <span>$200</span>
        </div>
      </div>

      {/* Last Updated */}
      {settings?.updatedAt && (
        <div className="text-xs text-white/40">
          Last updated: {new Date(settings.updatedAt).toLocaleString()}
        </div>
      )}

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} variant="onBlack" disabled={saving || !hasChanges}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
        {hasChanges && <span className="text-xs text-yellow-400">You have unsaved changes</span>}
      </div>
    </div>
  );
}
