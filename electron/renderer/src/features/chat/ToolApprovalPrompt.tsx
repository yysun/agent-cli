/**
 * Tool Approval Prompt Feature
 *
 * Purpose:
 * - Render runtime tool-approval requests inside the Electron chat flow when tool permission is `ask`.
 *
 * Key features:
 * - Shows the requested tool name plus a bounded argument summary.
 * - Returns an explicit approve or deny decision to the main process.
 *
 * Recent changes:
 * - 2026-07-27: Added the in-chat approval prompt for `ask` tool permission.
 */
import { useState } from 'react';
import { Button } from '../../design-system';
import type {
  AgentCliDesktopToolApprovalAnswer,
  AgentCliDesktopToolApprovalRequest,
} from '../../types/desktop-api';

export interface ToolApprovalPromptProps {
  request: AgentCliDesktopToolApprovalRequest;
  onSubmitAnswer: (answer: AgentCliDesktopToolApprovalAnswer) => Promise<void>;
}

export default function ToolApprovalPrompt({ request, onSubmitAnswer }: ToolApprovalPromptProps) {
  const [submitting, setSubmitting] = useState(false);

  async function submitDecision(approved: boolean): Promise<void> {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmitAnswer({
        requestId: request.requestId,
        approved,
        ...(approved ? {} : { reason: `Tool execution denied by user: ${request.toolName}.` }),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="aw-tool-approval" aria-label="Tool approval request">
      <div className="aw-tool-approval-header">
        <div>
          <span>{request.toolName}</span>
          <h3>Approval requested</h3>
        </div>
      </div>

      <p className="aw-tool-approval-question">
        Allow the agent to run <strong>{request.toolName}</strong>?
      </p>

      {request.argumentsSummary ? (
        <pre className="aw-tool-approval-arguments">{request.argumentsSummary}</pre>
      ) : null}

      <div className="aw-tool-approval-actions">
        <Button variant="ghost" size="sm" disabled={submitting} onClick={() => void submitDecision(false)}>Deny</Button>
        <Button size="sm" disabled={submitting} onClick={() => void submitDecision(true)}>
          {submitting ? 'Submitting' : 'Approve'}
        </Button>
      </div>
    </section>
  );
}
