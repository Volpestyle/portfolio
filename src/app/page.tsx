'use client';

import ChatDock from '@/components/chat/ChatDock';
import { HeroTitle } from '@/components/HeroTitle';

export default function Home() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-stretch px-4 py-10">
      <HeroTitle />
      <ChatDock />
    </div>
  );
}
