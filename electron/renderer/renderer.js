/*
Agent World Electron Renderer Script

Purpose:
- Connect the static Electron renderer to the preload IPC bridge.

Key features:
- Selects a workspace and lists flat Agent CLI chats.
- Loads selected chat messages and sends turns through the main-process runtime.
- Supports editing a user message and resending from that point.
- Sends tool permission and reasoning effort with every runtime turn.

Recent changes:
- 2026-05-31: Added local right-panel, theme, tool-message, and UI-only skills settings behavior.
- 2026-05-31: Added reference-aligned left sidebar collapse and restore behavior that works before IPC hydration.
- 2026-05-26: Added workspace/chat/message IPC-backed renderer behavior.
- 2026-05-24: Preserved metadata hydration for the ported desktop layout.
- 2026-05-24: Added initial renderer metadata hydration.
*/
(() => {
  const desktopApi = window.agentCliDesktop;
  const THEME_STORAGE_KEY = 'agent-world-theme-preference';

  function getStoredThemePreference() {
    const stored = window.localStorage?.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  }

  const state = {
    workspaceRoot: '',
    chats: [],
    currentChatId: '',
    messages: [],
    editingIndex: null,
    sidebarCollapsed: false,
    panelOpen: true,
    themePreference: getStoredThemePreference(),
    showToolMessages: true,
    globalSkillsEnabled: true,
    projectSkillsEnabled: true,
    busy: false,
  };

  const elements = {
    appShell: document.getElementById('app-shell'),
    status: document.getElementById('runtime-status'),
    appName: document.getElementById('app-name'),
    appVersion: document.getElementById('app-version'),
    appPlatform: document.getElementById('app-platform'),
    rendererMode: document.getElementById('renderer-mode'),
    workspaceButton: document.getElementById('workspace-button'),
    workspaceLabel: document.getElementById('workspace-label'),
    workspacePath: document.getElementById('workspace-path'),
    chatCount: document.getElementById('chat-count'),
    messageCount: document.getElementById('message-count'),
    chatList: document.getElementById('chat-list'),
    chatFilter: document.getElementById('chat-filter'),
    newChatButton: document.getElementById('new-chat-button'),
    openWorkspaceButton: document.getElementById('open-workspace-button'),
    sidebarCollapseButton: document.getElementById('sidebar-collapse-button'),
    sidebarRestoreButton: document.getElementById('sidebar-restore-button'),
    settingsPanelButton: document.getElementById('settings-panel-button'),
    rightPanel: document.getElementById('right-panel'),
    rightPanelCloseButton: document.getElementById('right-panel-close-button'),
    themeButtons: Array.from(document.querySelectorAll('[data-theme-choice]')),
    showToolMessagesToggle: document.getElementById('show-tool-messages-toggle'),
    enableGlobalSkillsToggle: document.getElementById('enable-global-skills-toggle'),
    enableProjectSkillsToggle: document.getElementById('enable-project-skills-toggle'),
    activeChatButton: document.getElementById('active-chat-button'),
    activeChatLabel: document.getElementById('active-chat-label'),
    messageList: document.getElementById('message-list'),
    messageForm: document.getElementById('message-form'),
    messageInput: document.getElementById('message-input'),
    sendButton: document.getElementById('send-button'),
    cancelEditButton: document.getElementById('cancel-edit-button'),
    editModeLabel: document.getElementById('edit-mode-label'),
    workingStatus: document.getElementById('working-status'),
    toolPermission: document.getElementById('tool-permission-select'),
    reasoningEffort: document.getElementById('reasoning-effort-select'),
    logList: document.getElementById('log-list'),
  };

  function normalizeThemePreference(preference) {
    return preference === 'light' || preference === 'dark' || preference === 'system' ? preference : 'system';
  }

  function applyThemePreference(preference) {
    const normalizedPreference = normalizeThemePreference(preference);
    if (normalizedPreference === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', normalizedPreference);
    }
    window.localStorage?.setItem(THEME_STORAGE_KEY, normalizedPreference);
  }

  function setText(element, text) {
    if (element) {
      element.textContent = text;
    }
  }

  function setBusy(busy, label = 'Agent is working') {
    state.busy = busy;
    if (elements.workingStatus) {
      elements.workingStatus.hidden = !busy;
      const statusText = elements.workingStatus.querySelector('span:last-child');
      setText(statusText, label);
    }
    if (elements.sendButton) {
      elements.sendButton.disabled = busy;
    }
  }

  function log(level, message) {
    if (!elements.logList) {
      return;
    }

    const entry = document.createElement('div');
    entry.className = 'aw-log-entry';
    const levelNode = document.createElement('span');
    levelNode.textContent = level;
    const messageNode = document.createElement('p');
    messageNode.textContent = message;
    entry.append(levelNode, messageNode);
    elements.logList.prepend(entry);

    while (elements.logList.children.length > 8) {
      elements.logList.lastElementChild?.remove();
    }
  }

  function formatTime(value) {
    const timestamp = Date.parse(String(value || ''));
    if (!Number.isFinite(timestamp)) {
      return '';
    }

    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  function shortId(chatId) {
    return String(chatId || '').slice(0, 18) || 'new chat';
  }

  function buildAgentConfig() {
    const config = {};
    const permission = String(elements.toolPermission?.value || '').trim();
    const reasoning = String(elements.reasoningEffort?.value || '').trim();

    if (permission) {
      config.toolPermission = permission;
    }

    if (reasoning) {
      config.reasoningEffort = reasoning;
    }

    return config;
  }

  function updateWorkspaceView() {
    const label = state.workspaceRoot ? state.workspaceRoot.split('/').filter(Boolean).at(-1) : 'Open workspace folder';
    setText(elements.workspaceLabel, label || state.workspaceRoot || 'Open workspace folder');
    setText(elements.workspacePath, state.workspaceRoot || 'No workspace loaded');
    setText(elements.chatCount, String(state.chats.length));
    setText(elements.messageCount, String(state.messages.length));
    setText(elements.activeChatButton, state.currentChatId ? shortId(state.currentChatId) : 'No active chat');
    setText(elements.activeChatLabel, state.currentChatId ? state.currentChatId : 'No active chat');
  }

  function renderSettings() {
    elements.appShell?.classList.toggle('is-right-panel-collapsed', !state.panelOpen);
    if (elements.rightPanel) {
      elements.rightPanel.setAttribute('aria-hidden', String(!state.panelOpen));
      elements.rightPanel.inert = !state.panelOpen;
    }
    if (elements.settingsPanelButton) {
      elements.settingsPanelButton.classList.toggle('is-panel-active', state.panelOpen);
      elements.settingsPanelButton.setAttribute('aria-expanded', String(state.panelOpen));
    }
    for (const button of elements.themeButtons) {
      const isActive = button.dataset.themeChoice === state.themePreference;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    }
    if (elements.showToolMessagesToggle) {
      elements.showToolMessagesToggle.checked = state.showToolMessages;
    }
    if (elements.enableGlobalSkillsToggle) {
      elements.enableGlobalSkillsToggle.checked = state.globalSkillsEnabled;
    }
    if (elements.enableProjectSkillsToggle) {
      elements.enableProjectSkillsToggle.checked = state.projectSkillsEnabled;
    }
  }

  function setRightPanelOpen(open) {
    state.panelOpen = open;
    renderSettings();
  }

  function setThemePreference(preference) {
    state.themePreference = normalizeThemePreference(preference);
    applyThemePreference(state.themePreference);
    renderSettings();
  }

  function setSidebarCollapsed(collapsed) {
    state.sidebarCollapsed = collapsed;
    elements.appShell?.classList.toggle('is-sidebar-collapsed', collapsed);
    if (elements.sidebarCollapseButton) {
      elements.sidebarCollapseButton.hidden = collapsed;
      elements.sidebarCollapseButton.setAttribute('aria-expanded', String(!collapsed));
    }
    if (elements.sidebarRestoreButton) {
      elements.sidebarRestoreButton.hidden = !collapsed;
      elements.sidebarRestoreButton.setAttribute('aria-expanded', String(!collapsed));
    }
  }

  function renderChats() {
    if (!elements.chatList) {
      return;
    }

    const filterText = String(elements.chatFilter?.value || '').trim().toLowerCase();
    const chats = state.chats.filter((chat) => {
      if (!filterText) {
        return true;
      }
      return String(chat.id || '').toLowerCase().includes(filterText);
    });

    elements.chatList.replaceChildren();

    if (chats.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'aw-empty-state';
      empty.textContent = 'No chats yet';
      elements.chatList.append(empty);
      return;
    }

    for (const chat of chats) {
      const button = document.createElement('button');
      button.className = `aw-session-item${chat.id === state.currentChatId ? ' is-active' : ''}`;
      button.type = 'button';
      button.setAttribute('role', 'listitem');
      button.addEventListener('click', () => {
        void selectChat(chat.id);
      });

      const title = document.createElement('span');
      title.className = 'aw-session-title';
      title.textContent = shortId(chat.id);
      const meta = document.createElement('span');
      meta.className = 'aw-session-meta';
      meta.textContent = `${chat.messageCount ?? 0} messages${chat.updatedAt ? ` - ${formatTime(chat.updatedAt)}` : ''}`;
      button.append(title, meta);
      elements.chatList.append(button);
    }
  }

  function messageRoleLabel(message) {
    if (message.role === 'user') {
      return 'You';
    }
    if (message.role === 'tool') {
      return 'Tool';
    }
    return 'Agent';
  }

  function isToolRelatedMessage(message) {
    if (message.role === 'tool') {
      return true;
    }
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      return true;
    }
    if (message.tool_call_id || message.toolCallId) {
      return true;
    }
    return /^calling tool\s*:/i.test(String(message.content || '').trim());
  }

  function formatToolName(toolName) {
    return String(toolName || 'tool')
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim() || 'Tool';
  }

  function resolveToolName(message) {
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const firstToolCall = toolCalls.find(Boolean);
    const functionName = firstToolCall?.function?.name || firstToolCall?.name || firstToolCall?.toolName;
    if (functionName) {
      return formatToolName(functionName);
    }

    const contentMatch = String(message.content || '').match(/calling tool\s*:\s*([^\n]+)/i);
    if (contentMatch?.[1]) {
      return formatToolName(contentMatch[1]);
    }

    return message.role === 'tool' ? 'Tool Result' : 'Tool Request';
  }

  function resolveToolStatus(message) {
    if (message.role === 'tool') {
      return /error|failed|exception/i.test(String(message.content || '')) ? 'error' : 'completed';
    }
    return 'requested';
  }

  function renderToolMessage(message) {
    const article = document.createElement('article');
    const status = resolveToolStatus(message);
    article.className = `aw-message aw-tool-card aw-tool-card-${status}`;

    const dot = document.createElement('div');
    dot.className = 'aw-tool-dot';
    const body = document.createElement('div');
    body.className = 'aw-tool-body';
    const heading = document.createElement('div');
    heading.className = 'aw-tool-heading';
    const title = document.createElement('span');
    title.className = 'aw-tool-title';
    title.textContent = resolveToolName(message);
    const statusPill = document.createElement('span');
    statusPill.className = 'aw-tool-status';
    statusPill.textContent = status;
    heading.append(title, statusPill);

    const content = document.createElement('p');
    content.textContent = String(message.content || '').trim() || (status === 'requested' ? 'Waiting for tool result.' : 'No tool output.');
    body.append(heading, content);
    article.append(dot, body);
    return article;
  }

  function renderMessages() {
    if (!elements.messageList) {
      return;
    }

    elements.messageList.replaceChildren();

    const visibleMessages = state.messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => state.showToolMessages || !isToolRelatedMessage(message));

    if (visibleMessages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'aw-empty-state';
      empty.textContent = state.messages.length === 0 ? 'No messages yet.' : 'Tool messages hidden.';
      elements.messageList.append(empty);
      updateWorkspaceView();
      return;
    }

    visibleMessages.forEach(({ message, index }) => {
      const article = document.createElement('article');
      const isUser = message.role === 'user';
      const isTool = isToolRelatedMessage(message);
      article.className = isTool
        ? 'aw-message aw-tool-card'
        : `aw-message ${isUser ? 'aw-message-user' : 'aw-message-agent'}`;

      if (isTool) {
        elements.messageList.append(renderToolMessage(message));
        return;
      }

      const avatar = document.createElement('div');
      avatar.className = 'aw-message-avatar';
      avatar.textContent = isUser ? 'Y' : 'AI';

      const card = document.createElement('div');
      card.className = 'aw-message-card';
      const meta = document.createElement('div');
      meta.className = 'aw-message-meta';
      const author = document.createElement('span');
      author.textContent = messageRoleLabel(message);
      const time = document.createElement('time');
      time.textContent = formatTime(message.createdAt);
      meta.append(author, time);

      const content = document.createElement('p');
      content.textContent = String(message.content || '');
      card.append(meta, content);

      if (isUser) {
        const actions = document.createElement('div');
        actions.className = 'aw-message-actions';
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.textContent = 'Edit and resend';
        editButton.addEventListener('click', () => startEdit(index, String(message.content || '')));
        actions.append(editButton);
        card.append(actions);
      }

      article.append(avatar, card);
      elements.messageList.append(article);
    });

    elements.messageList.scrollTop = elements.messageList.scrollHeight;
    updateWorkspaceView();
  }

  function clearEdit() {
    state.editingIndex = null;
    setText(elements.editModeLabel, 'Ready');
    if (elements.cancelEditButton) {
      elements.cancelEditButton.hidden = true;
    }
    if (elements.sendButton) {
      elements.sendButton.textContent = '↑';
      elements.sendButton.title = 'Send message';
    }
  }

  function startEdit(index, content) {
    state.editingIndex = index;
    if (elements.messageInput) {
      elements.messageInput.value = content;
      elements.messageInput.focus();
    }
    setText(elements.editModeLabel, `Editing message ${index + 1}`);
    if (elements.cancelEditButton) {
      elements.cancelEditButton.hidden = false;
    }
    if (elements.sendButton) {
      elements.sendButton.textContent = '↻';
      elements.sendButton.title = 'Resend edited message';
    }
  }

  async function refreshChats() {
    const response = await desktopApi.listChats();
    state.workspaceRoot = response.workspaceRoot || state.workspaceRoot;
    state.chats = response.chats || [];
    if (response.currentChatId) {
      state.currentChatId = response.currentChatId;
    }
    updateWorkspaceView();
    renderChats();
  }

  async function loadWorkspace() {
    const response = await desktopApi.getWorkspace();
    state.workspaceRoot = response.workspaceRoot || '';
    state.chats = response.chats || [];
    state.currentChatId = response.currentChatId || '';
    updateWorkspaceView();
    renderChats();

    if (state.currentChatId) {
      await loadMessages(state.currentChatId);
    } else {
      renderMessages();
    }
  }

  async function selectWorkspace() {
    setBusy(true, 'Selecting workspace');
    try {
      const response = await desktopApi.selectWorkspace();
      state.workspaceRoot = response.workspaceRoot || state.workspaceRoot;
      state.chats = response.chats || [];
      state.currentChatId = response.currentChatId || '';
      state.messages = [];
      updateWorkspaceView();
      renderChats();
      if (state.currentChatId) {
        await loadMessages(state.currentChatId);
      } else {
        renderMessages();
      }
      log(response.canceled ? 'info' : 'info', response.canceled ? 'Workspace selection canceled.' : `Workspace selected: ${state.workspaceRoot}`);
    } finally {
      setBusy(false);
    }
  }

  async function createChat() {
    setBusy(true, 'Creating chat');
    try {
      const response = await desktopApi.createChat({ workspaceRoot: state.workspaceRoot });
      state.workspaceRoot = response.workspaceRoot || state.workspaceRoot;
      state.chats = response.chats || [];
      state.currentChatId = response.chat?.id || '';
      state.messages = response.chat?.messages || [];
      clearEdit();
      updateWorkspaceView();
      renderChats();
      renderMessages();
      log('info', `Created chat ${shortId(state.currentChatId)}.`);
    } finally {
      setBusy(false);
    }
  }

  async function selectChat(chatId) {
    if (!chatId) {
      return;
    }

    setBusy(true, 'Loading chat');
    try {
      const response = await desktopApi.selectChat({ chatId });
      state.workspaceRoot = response.workspaceRoot || state.workspaceRoot;
      state.chats = response.chats || [];
      state.currentChatId = response.chat?.id || chatId;
      state.messages = response.chat?.messages || [];
      clearEdit();
      updateWorkspaceView();
      renderChats();
      renderMessages();
    } finally {
      setBusy(false);
    }
  }

  async function loadMessages(chatId) {
    const response = await desktopApi.getChatMessages({ chatId });
    state.currentChatId = response.chat?.id || chatId || '';
    state.messages = response.messages || [];
    clearEdit();
    updateWorkspaceView();
    renderMessages();
  }

  async function submitMessage(event) {
    event.preventDefault();
    if (state.busy) {
      return;
    }

    const content = String(elements.messageInput?.value || '').trim();
    if (!content) {
      return;
    }

    setBusy(true, state.editingIndex === null ? 'Sending message' : 'Resending edited message');

    try {
      const wasEditing = state.editingIndex !== null;
      const request = {
        chatId: state.currentChatId || undefined,
        content,
        agentConfig: buildAgentConfig(),
        stream: false,
      };
      const response = !wasEditing
        ? await desktopApi.sendChatMessage(request)
        : await desktopApi.editAndResendMessage({
          ...request,
          chatId: state.currentChatId,
          messageIndex: state.editingIndex,
        });

      state.currentChatId = response.chatId || state.currentChatId;
      state.messages = response.messages || [];
      if (elements.messageInput) {
        elements.messageInput.value = '';
      }
      clearEdit();
      await refreshChats();
      renderMessages();
      log('info', wasEditing ? 'Edited message resent.' : 'Message sent.');
    } catch (error) {
      log('error', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function hydrateMetadata() {
    if (!desktopApi?.getAppInfo) {
      setText(elements.status, 'Bridge unavailable');
      return;
    }

    const info = await desktopApi.getAppInfo();
    setText(elements.appName, info.name || 'Agent World');
    setText(elements.appVersion, info.version || '0.1.0');
    setText(elements.appPlatform, info.platform || 'unknown');
    setText(elements.rendererMode, info.rendererMode || 'electron');
    setText(elements.status, 'Ready');
  }

  function bindEvents() {
    elements.workspaceButton?.addEventListener('click', () => {
      void selectWorkspace().catch((error) => log('error', error instanceof Error ? error.message : String(error)));
    });
    elements.newChatButton?.addEventListener('click', () => {
      void createChat().catch((error) => log('error', error instanceof Error ? error.message : String(error)));
    });
    elements.openWorkspaceButton?.addEventListener('click', () => {
      void selectWorkspace().catch((error) => log('error', error instanceof Error ? error.message : String(error)));
    });
    elements.sidebarCollapseButton?.addEventListener('click', () => setSidebarCollapsed(true));
    elements.sidebarRestoreButton?.addEventListener('click', () => setSidebarCollapsed(false));
    elements.settingsPanelButton?.addEventListener('click', () => setRightPanelOpen(!state.panelOpen));
    elements.rightPanelCloseButton?.addEventListener('click', () => setRightPanelOpen(false));
    for (const button of elements.themeButtons) {
      button.addEventListener('click', () => setThemePreference(button.dataset.themeChoice));
    }
    elements.showToolMessagesToggle?.addEventListener('change', (event) => {
      state.showToolMessages = event.target.checked;
      renderSettings();
      renderMessages();
      log('info', state.showToolMessages ? 'Tool messages shown.' : 'Tool messages hidden.');
    });
    elements.enableGlobalSkillsToggle?.addEventListener('change', (event) => {
      state.globalSkillsEnabled = event.target.checked;
      renderSettings();
      log('info', 'Global skills UI setting changed.');
    });
    elements.enableProjectSkillsToggle?.addEventListener('change', (event) => {
      state.projectSkillsEnabled = event.target.checked;
      renderSettings();
      log('info', 'Project skills UI setting changed.');
    });
    elements.chatFilter?.addEventListener('input', renderChats);
    elements.cancelEditButton?.addEventListener('click', clearEdit);
    elements.messageForm?.addEventListener('submit', (event) => {
      void submitMessage(event).catch((error) => log('error', error instanceof Error ? error.message : String(error)));
    });
  }

  async function boot() {
    bindEvents();
    applyThemePreference(state.themePreference);
    setSidebarCollapsed(state.sidebarCollapsed);
    renderSettings();

    if (!desktopApi) {
      setText(elements.status, 'Bridge unavailable');
      return;
    }

    try {
      await hydrateMetadata();
      await loadWorkspace();
      log('info', 'Workspace loaded.');
    } catch (error) {
      setText(elements.status, 'Load failed');
      log('error', error instanceof Error ? error.message : String(error));
    }
  }

  void boot();
})();
