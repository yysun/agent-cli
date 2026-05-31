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
- 2026-05-31: Added reference-aligned left sidebar collapse and restore behavior that works before IPC hydration.
- 2026-05-26: Added workspace/chat/message IPC-backed renderer behavior.
- 2026-05-24: Preserved metadata hydration for the ported desktop layout.
- 2026-05-24: Added initial renderer metadata hydration.
*/
(() => {
  const desktopApi = window.agentCliDesktop;
  const state = {
    workspaceRoot: '',
    chats: [],
    currentChatId: '',
    messages: [],
    editingIndex: null,
    sidebarCollapsed: false,
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

  function renderMessages() {
    if (!elements.messageList) {
      return;
    }

    elements.messageList.replaceChildren();

    if (state.messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'aw-empty-state';
      empty.textContent = 'No messages yet.';
      elements.messageList.append(empty);
      updateWorkspaceView();
      return;
    }

    state.messages.forEach((message, index) => {
      const article = document.createElement('article');
      const isUser = message.role === 'user';
      const isTool = message.role === 'tool';
      article.className = isTool
        ? 'aw-message aw-tool-card'
        : `aw-message ${isUser ? 'aw-message-user' : 'aw-message-agent'}`;

      if (isTool) {
        const dot = document.createElement('div');
        dot.className = 'aw-tool-dot';
        const body = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'aw-tool-title';
        title.textContent = 'tool result';
        const content = document.createElement('p');
        content.textContent = String(message.content || '');
        body.append(title, content);
        article.append(dot, body);
        elements.messageList.append(article);
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
    elements.chatFilter?.addEventListener('input', renderChats);
    elements.cancelEditButton?.addEventListener('click', clearEdit);
    elements.messageForm?.addEventListener('submit', (event) => {
      void submitMessage(event).catch((error) => log('error', error instanceof Error ? error.message : String(error)));
    });
  }

  async function boot() {
    bindEvents();
    setSidebarCollapsed(state.sidebarCollapsed);

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
