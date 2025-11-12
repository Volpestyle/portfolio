import type { ChatAttachmentPart, ChatMessage, ChatMessagePart, ChatTextPart } from '@/types/chat';

function isTextPart(part: ChatMessagePart): part is ChatTextPart {
  return part.kind === 'text';
}

function isAttachmentPart(part: ChatMessagePart): part is ChatAttachmentPart {
  return part.kind === 'attachment';
}

function formatRole(role: ChatMessage['role']) {
  return role === 'assistant' ? 'Assistant' : 'User';
}

function safeTextBlock(text: string) {
  if (!text) {
    return '_(empty text)_';
  }
  return ['```', text, '```'].join('\n');
}

export function formatChatMessagesAsMarkdown(messages: ChatMessage[]): string {
  const lines: string[] = [
    '# Chat Debug Export',
    '',
    `Exported: ${new Date().toISOString()}`,
    `Total messages: ${messages.length}`,
    '',
  ];

  messages.forEach((message, index) => {
    lines.push('---', '');
    lines.push(`## ${index + 1}. ${formatRole(message.role)} message`);
    lines.push(`- id: ${message.id}`);
    lines.push(`- created: ${message.createdAt ?? 'unknown'}`);
    lines.push(`- parts: ${message.parts.length}`);
    lines.push('');

    const textParts = message.parts.filter(isTextPart);
    if (textParts.length) {
      lines.push('### Text');
      textParts.forEach((part, partIndex) => {
        const partLabel = part.itemId ? `Text ${partIndex + 1} (${part.itemId})` : `Text ${partIndex + 1}`;
        lines.push(`**${partLabel}**`);
        lines.push('');
        lines.push(safeTextBlock(part.text));
        lines.push('');
      });
    } else {
      lines.push('_No text content_');
      lines.push('');
    }

    const attachmentParts = message.parts.filter(isAttachmentPart);
    if (attachmentParts.length) {
      lines.push('### Attachments');
      attachmentParts.forEach((part, partIndex) => {
        const partLabel = part.itemId
          ? `Attachment ${partIndex + 1}: ${part.attachment.type} (${part.itemId})`
          : `Attachment ${partIndex + 1}: ${part.attachment.type}`;
        lines.push(partLabel);
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(part.attachment, null, 2));
        lines.push('```');
        lines.push('');
      });
    }
  });

  if (messages.length === 0) {
    lines.push('_(no messages to export)_');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
