import { NextRequest, NextResponse } from 'next/server';
import { getSettings, updateSettings } from '@/server/admin/settings-store';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    console.error('Failed to get settings', err);
    return NextResponse.json({ error: 'Failed to fetch settings.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let body: { monthlyCostLimitUsd?: number; costThresholdUsd?: number; chatEnabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const requestedMonthlyLimit = body.monthlyCostLimitUsd ?? body.costThresholdUsd;

  // Validate monthlyCostLimitUsd (legacy: costThresholdUsd)
  if (requestedMonthlyLimit !== undefined) {
    if (typeof requestedMonthlyLimit !== 'number' || !Number.isFinite(requestedMonthlyLimit)) {
      return NextResponse.json({ error: 'monthlyCostLimitUsd must be a number' }, { status: 400 });
    }
    if (requestedMonthlyLimit < 0 || requestedMonthlyLimit > 10000) {
      return NextResponse.json({ error: 'monthlyCostLimitUsd must be between 0 and 10000' }, { status: 400 });
    }
  }

  // Validate chatEnabled
  if (body.chatEnabled !== undefined && typeof body.chatEnabled !== 'boolean') {
    return NextResponse.json({ error: 'chatEnabled must be a boolean' }, { status: 400 });
  }

  try {
    const settings = await updateSettings({
      monthlyCostLimitUsd: requestedMonthlyLimit,
      chatEnabled: body.chatEnabled,
    });
    return NextResponse.json({ settings });
  } catch (err) {
    console.error('Failed to update settings', err);
    return NextResponse.json({ error: 'Failed to update settings.' }, { status: 500 });
  }
}
