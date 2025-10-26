'use client';

import type { ChatAttachment, ChatMessage } from '@/types/chat';
import { cn } from '@/lib/utils';
import { ProjectCardList } from './attachments/ProjectCardList';
import { ProjectInlineDetails } from './attachments/ProjectInlineDetails';
import { DocumentInlinePanel } from './attachments/DocumentInlinePanel';
import { SocialLinkList } from './attachments/SocialLinkList';
import { TypewriterMessage } from './TypewriterMessage';
import Link from 'next/link';

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  const wrapperClass = isUser
    ? 'w-full max-w-[85%] rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white shadow-xl'
    : 'w-full max-w-[85%] space-y-3 text-sm text-white';

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div className={wrapperClass}>
        {message.parts.map((part, index) => {
          if (part.kind === 'text') {
            if (isUser) {
              return (
                <p key={`${message.id}-text-${index}`} className="text-sm leading-relaxed">
                  {part.text}
                </p>
              );
            }

            return (
              <TypewriterMessage
                key={`${message.id}-text-${index}`}
                text={part.text}
                className="text-sm leading-relaxed"
              />
            );
          }

          if (part.kind === 'attachment') {
            return (
              <div key={`${message.id}-attachment-${index}`}>
                {renderAttachment(part.attachment)}
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

function renderAttachment(attachment: ChatAttachment) {
  switch (attachment.type) {
    case 'project-cards':
      return <ProjectCardList repos={attachment.repos} />;
    case 'project-details':
      return (
        <ProjectInlineDetails
          repo={attachment.repo}
          readme={attachment.readme}
          breadcrumbsOverride={attachment.breadcrumbsOverride}
        />
      );
    case 'doc':
      return (
        <DocumentInlinePanel
          repo={attachment.repoName}
          title={attachment.title}
          path={attachment.path}
          content={attachment.content}
          breadcrumbsOverride={attachment.breadcrumbsOverride}
        />
      );
    case 'social-links':
      return (
        <div className="mt-3">
          <SocialLinkList links={attachment.links} />
        </div>
      );
    case 'link':
      return <ChatLinkAttachment url={attachment.url} label={attachment.label} />;
    default:
      return null;
  }
}

function ChatLinkAttachment({ url, label }: { url: string; label?: string }) {
  const text = label || url;
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs uppercase tracking-wide text-white/60">Navigate</p>
      <Link href={url} className="text-blue-300 underline underline-offset-4">
        {text}
      </Link>
    </div>
  );
}
