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
import { shortId } from '../utils/format';

export default function RendererWorkspace() {
  const workspace = useDesktopWorkspace();
  const editingContent = workspace.editingIndex === null
    ? ''
    : String(workspace.messages[workspace.editingIndex]?.content || '');

  return (
    <AppFrameLayout
      sidebarCollapsed={workspace.sidebarCollapsed}
      panelOpen={workspace.panelOpen}
      sidebar={(
        <WorkspaceSidebar
          chats={workspace.chats}
          currentChatId={workspace.currentChatId}
          messageCount={workspace.messages.length}
          status={workspace.status}
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
                <h2 id="chat-title">Agent CLI</h2>
                <button id="active-chat-button" className="aw-session-copy" type="button" aria-label="Active chat id">
                  {workspace.currentChatId ? shortId(workspace.currentChatId) : 'No active chat'}
                </button>
              </div>
            </div>

            <div className="aw-agent-strip" aria-label="Runtime status">
              <button className="aw-agent-badge aw-main-agent" type="button" title="Agent CLI runtime">CLI<span>MAIN</span></button>
              <button className="aw-agent-badge aw-agent-active" type="button" title={workspace.bridgeAvailable ? 'Runtime ready' : 'Bridge unavailable'}>RT</button>
            </div>

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