/**
 * Desktop Renderer Workspace
 *
 * Purpose:
 * - Own top-level renderer composition while hooks and feature modules own behavior.
 *
 * Key features:
 * - Composes sidebar, chat transcript, composer, and settings panel.
 * - Delegates Electron IPC state to `useDesktopWorkspace`.
 * - Uses design-system patterns for the outer app frame.
 *
 * Recent changes:
 * - 2026-05-31: Used the workspace folder name as the main header title and hid header agents without `world.json` agents.
 * - 2026-05-31: Rendered `world.json` agent labels in the header agent strip.
 * - 2026-05-31: Passed optional workspace world summary metadata into the sidebar.
 * - 2026-05-31: Preserved the existing header agent list markup and chat-view glyph.
 * - 2026-05-31: Added layered React workspace shell for the Electron renderer.
 */
import AppFrameLayout from './AppFrameLayout';
import { Icon, IconButton } from '../design-system';
import ChatComposer from '../features/chat/ChatComposer';
import ChatTranscript from '../features/chat/ChatTranscript';
import SettingsPanel from '../features/settings/SettingsPanel';
import WorkspaceSidebar from '../features/workspace/WorkspaceSidebar';
import { useDesktopWorkspace } from '../hooks/useDesktopWorkspace';
import { shortId, workspaceFolderName } from '../utils/format';

function formatAgentBadgeLabel(agent: string): string {
  const normalizedAgent = agent.trim();
  if (!normalizedAgent) {
    return '?';
  }

  const parts = normalizedAgent.split(/[\s_-]+/).filter(Boolean);
  if (parts.length > 1) {
    return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  return normalizedAgent.slice(0, 2).toUpperCase();
}

export default function RendererWorkspace() {
  const workspace = useDesktopWorkspace();
  const editingContent = workspace.editingIndex === null
    ? ''
    : String(workspace.messages[workspace.editingIndex]?.content || '');
  const worldAgents = workspace.worldSummary?.agents ?? [];
  const visibleWorldAgents = worldAgents.slice(0, 5);
  const workspaceTitle = workspaceFolderName(workspace.workspaceRoot);

  return (
    <AppFrameLayout
      sidebarCollapsed={workspace.sidebarCollapsed}
      panelOpen={workspace.panelOpen}
      sidebar={(
        <WorkspaceSidebar
          chats={workspace.chats}
          currentChatId={workspace.currentChatId}
          messageCount={workspace.messages.length}
          runtimeSummary={workspace.runtimeSummary}
          status={workspace.status}
          worldSummary={workspace.worldSummary}
          worldSummaryWarning={workspace.worldSummaryWarning}
          workspaceRoot={workspace.workspaceRoot}
          onCreateChat={() => void workspace.actions.createChat()}
          onSelectChat={(chatId) => void workspace.actions.selectChat(chatId)}
          onSelectWorkspace={() => void workspace.actions.selectWorkspace()}
          onCollapseSidebar={() => workspace.actions.setSidebarCollapsed(true)}
        />
      )}
      mainContent={(
        <section className="aw-workspace" aria-labelledby="chat-title">
          <header className="aw-header">
            <div className="aw-header-context">
              <IconButton
                id="sidebar-restore-button"
                className="aw-icon-button aw-sidebar-toggle aw-sidebar-restore"
                label="Show sidebar"
                hidden={!workspace.sidebarCollapsed}
                onClick={() => workspace.actions.setSidebarCollapsed(false)}
              >
                <Icon name="sidebar-right" />
              </IconButton>
              <div className="aw-header-title-block">
                <h2 id="chat-title">{workspaceTitle}</h2>
                <button id="active-chat-button" className="aw-session-copy" type="button" aria-label="Active chat id">
                  {workspace.currentChatId ? shortId(workspace.currentChatId) : 'No active chat'}
                </button>
              </div>
            </div>

            {worldAgents.length ? (
              <div className="aw-agent-strip" aria-label="World agents">
                {visibleWorldAgents.map((agent, index) => (
                  <button
                    className={`aw-agent-badge aw-world-agent-badge${index === 0 ? ' aw-main-agent' : ''}`}
                    type="button"
                    title={agent}
                    key={`${agent}-${index}`}
                  >
                    {formatAgentBadgeLabel(agent)}
                    {index === 0 ? <span>WORLD</span> : null}
                  </button>
                ))}
                {worldAgents.length > visibleWorldAgents.length ? (
                  <button className="aw-agent-badge" type="button" title={`${worldAgents.length - visibleWorldAgents.length} more world agents`}>
                    +{worldAgents.length - visibleWorldAgents.length}
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="aw-header-actions" aria-label="Workspace view controls">
              <button className="aw-view-button is-active" type="button" aria-label="Chat view" title="Chat view">☰</button>
              <IconButton
                id="settings-panel-button"
                className={`aw-view-button${workspace.panelOpen ? ' is-panel-active' : ''}`}
                label="Settings"
                aria-controls="right-panel"
                aria-expanded={workspace.panelOpen}
                onClick={() => workspace.actions.setPanelOpen(!workspace.panelOpen)}
              >
                <Icon name="settings" />
              </IconButton>
            </div>
          </header>

          <div className="aw-main-content">
            <section className="aw-chat-column" aria-label="Chat transcript">
              <ChatTranscript
                messages={workspace.messages}
                showToolMessages={workspace.showToolMessages}
                onStartEdit={workspace.actions.startEdit}
              />
              <ChatComposer
                busy={workspace.busy}
                currentChatId={workspace.currentChatId}
                editingContent={editingContent}
                editingIndex={workspace.editingIndex}
                reasoningEffort={workspace.reasoningEffort}
                toolPermission={workspace.toolPermission}
                onCancelEdit={workspace.actions.clearEdit}
                onReasoningEffortChange={workspace.actions.setReasoningEffort}
                onSubmitMessage={workspace.actions.submitMessage}
                onToolPermissionChange={workspace.actions.setToolPermission}
              />
              <div id="working-status" className="aw-working-status" role="status" hidden={!workspace.busy}>
                <span className="aw-pulse" aria-hidden="true" />
                <span>{workspace.busyLabel || 'Agent is working'}</span>
              </div>
            </section>

            <SettingsPanel
              globalSkillsEnabled={workspace.globalSkillsEnabled}
              logs={workspace.logs}
              open={workspace.panelOpen}
              projectSkillsEnabled={workspace.projectSkillsEnabled}
              showToolMessages={workspace.showToolMessages}
              themePreference={workspace.themePreference}
              onGlobalSkillsEnabledChange={workspace.actions.setGlobalSkillsEnabled}
              onProjectSkillsEnabledChange={workspace.actions.setProjectSkillsEnabled}
              onShowToolMessagesChange={workspace.actions.setShowToolMessages}
              onThemePreferenceChange={workspace.actions.setThemePreference}
            />
          </div>
        </section>
      )}
    />
  );
}