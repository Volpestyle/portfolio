'use client';

import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/Markdown';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  showPreview: boolean;
}

export function MarkdownEditor({ value, onChange, showPreview }: MarkdownEditorProps) {
  if (showPreview) {
    return (
      <div className="min-h-[500px] rounded-md border border-border bg-background p-4">
        <Markdown content={value} />
      </div>
    );
  }

  return (
    <div className="relative">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write your post content in Markdown..."
        className="min-h-[500px] font-mono text-sm"
        spellCheck={false}
      />
      
      {/* Markdown Toolbar */}
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => {
            const textarea = document.querySelector('textarea');
            if (!textarea) return;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selected = value.substring(start, end);
            const newValue = value.substring(0, start) + `**${selected}**` + value.substring(end);
            onChange(newValue);
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(start + 2, end + 2);
            }, 0);
          }}
          className="px-2 py-1 rounded hover:bg-muted transition-colors"
        >
          **Bold**
        </button>
        <button
          type="button"
          onClick={() => {
            const textarea = document.querySelector('textarea');
            if (!textarea) return;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selected = value.substring(start, end);
            const newValue = value.substring(0, start) + `*${selected}*` + value.substring(end);
            onChange(newValue);
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(start + 1, end + 1);
            }, 0);
          }}
          className="px-2 py-1 rounded hover:bg-muted transition-colors"
        >
          *Italic*
        </button>
        <button
          type="button"
          onClick={() => {
            const textarea = document.querySelector('textarea');
            if (!textarea) return;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selected = value.substring(start, end);
            const newValue = value.substring(0, start) + `\`${selected}\`` + value.substring(end);
            onChange(newValue);
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(start + 1, end + 1);
            }, 0);
          }}
          className="px-2 py-1 rounded hover:bg-muted transition-colors"
        >
          `Code`
        </button>
        <button
          type="button"
          onClick={() => {
            const textarea = document.querySelector('textarea');
            if (!textarea) return;
            const start = textarea.selectionStart;
            const newValue = value.substring(0, start) + '\n```\n\n```\n' + value.substring(start);
            onChange(newValue);
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(start + 5, start + 5);
            }, 0);
          }}
          className="px-2 py-1 rounded hover:bg-muted transition-colors"
        >
          ```Code Block```
        </button>
        <button
          type="button"
          onClick={() => {
            const textarea = document.querySelector('textarea');
            if (!textarea) return;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selected = value.substring(start, end);
            const newValue = value.substring(0, start) + `[${selected}](url)` + value.substring(end);
            onChange(newValue);
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(start + selected.length + 3, start + selected.length + 6);
            }, 0);
          }}
          className="px-2 py-1 rounded hover:bg-muted transition-colors"
        >
          [Link](url)
        </button>
        <button
          type="button"
          onClick={() => {
            const textarea = document.querySelector('textarea');
            if (!textarea) return;
            const start = textarea.selectionStart;
            const newValue = value.substring(0, start) + '\n![Alt text](image-url)\n' + value.substring(start);
            onChange(newValue);
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(start + 14, start + 23);
            }, 0);
          }}
          className="px-2 py-1 rounded hover:bg-muted transition-colors"
        >
          ![Image](url)
        </button>
        <button
          type="button"
          onClick={() => {
            const textarea = document.querySelector('textarea');
            if (!textarea) return;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selected = value.substring(start, end);
            const newValue = value.substring(0, start) + `## ${selected}` + value.substring(end);
            onChange(newValue);
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(start + 3, end + 3);
            }, 0);
          }}
          className="px-2 py-1 rounded hover:bg-muted transition-colors"
        >
          ## Heading
        </button>
        <button
          type="button"
          onClick={() => {
            const textarea = document.querySelector('textarea');
            if (!textarea) return;
            const start = textarea.selectionStart;
            const newValue = value.substring(0, start) + '\n- Item 1\n- Item 2\n- Item 3\n' + value.substring(start);
            onChange(newValue);
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(start + 3, start + 9);
            }, 0);
          }}
          className="px-2 py-1 rounded hover:bg-muted transition-colors"
        >
          - List
        </button>
      </div>
    </div>
  );
}

