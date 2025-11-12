import ChatDock from '@/components/chat/ChatDock';
import { HeroTitle } from '@/components/HeroTitle';
import { ChatDevTools } from '@/components/chat/ChatDevTools';

export default function Home() {
  return (
    <>
      <div className="mx-auto flex max-w-3xl flex-col items-stretch px-4 py-10">
        <HeroTitle />
        <ChatDock />
      </div>
      <ChatDevTools />
    </>
  );
}
