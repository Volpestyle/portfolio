import { NextResponse } from 'next/server';
import { getChatDataProviders } from '@/server/chat/dataProviders';

export const runtime = 'nodejs';

export async function GET() {
  const { experienceRepository } = getChatDataProviders();
  const entries = await experienceRepository.listExperiences();
  return NextResponse.json({ entries });
}
