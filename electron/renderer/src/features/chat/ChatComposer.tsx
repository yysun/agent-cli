/**
 * Chat Composer Feature
 *
 * Purpose:
 * - Render message input and per-turn runtime options.
 *
 * Recent changes:
 * - 2026-05-31: Preserved the existing composer send and resend button glyphs.
 * - 2026-05-31: Added React composer feature for send and edit/resend flows.
 */
import { useEffect, useState } from 'react';
import { REASONING_EFFORT_OPTIONS, TOOL_PERMISSION_OPTIONS } from '../../constants/runtime-options';
import { Button, Select, Textarea } from '../../design-system';

export interface ChatComposerProps {
  busy: boolean;
  editingContent: string;
  editingIndex: number | null;
  reasoningEffort: string;
  toolPermission: string;
  onCancelEdit: () => void;
  onReasoningEffortChange: (value: string) => void;
  onSubmitMessage: (content: string) => Promise<void>;
  onToolPermissionChange: (value: string) => void;
}

export default function ChatComposer({
  busy,
  editingContent,
  editingIndex,
  reasoningEffort,
  toolPermission,
  onCancelEdit,
  onReasoningEffortChange,
  onSubmitMessage,
  onToolPermissionChange,
}: ChatComposerProps) {
  const [content, setContent] = useState('');

  useEffect(() => {
    if (editingIndex !== null) {
      setContent(editingContent);
    }
  }, [editingContent, editingIndex]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedContent = content.trim();
    if (!submittedContent || busy) {
      return;
    }
    await onSubmitMessage(submittedContent);
    setContent('');
  }

  return (
    <form id="message-form" className="aw-composer" aria-label="Message composer" onSubmit={submit}>
      <Textarea id="message-input" rows={2} aria-label="Message input" placeholder="Ask the agent..." value={content} onChange={(event) => setContent(event.target.value)} />
      <div className="aw-composer-toolbar">
        <div className="aw-composer-actions">
          <Select id="tool-permission-select" aria-label="Tool permission" value={toolPermission} onChange={(event) => onToolPermissionChange(event.target.value)}>
            {TOOL_PERMISSION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          <Select id="reasoning-effort-select" aria-label="Reasoning effort" value={reasoningEffort} onChange={(event) => onReasoningEffortChange(event.target.value)}>
            {REASONING_EFFORT_OPTIONS.map((option) => <option key={option.value || 'default'} value={option.value}>{option.label}</option>)}
          </Select>
        </div>
        <div className="aw-composer-submit">
          {editingIndex !== null ? <Button id="cancel-edit-button" className="aw-cancel-edit-button" variant="ghost" size="sm" onClick={() => { onCancelEdit(); setContent(''); }}>Cancel edit</Button> : null}
          <Button id="send-button" className="aw-send-button" type="submit" aria-label="Send message" title="Send message" disabled={busy}>{editingIndex === null ? '↑' : '↻'}</Button>
        </div>
      </div>
    </form>
  );
}