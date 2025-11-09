import { draftMode } from 'next/headers';

export async function GET() {
  (await draftMode()).enable();
  return new Response('Draft mode enabled');
}

export async function DELETE() {
  (await draftMode()).disable();
  return new Response('Draft mode disabled');
}
