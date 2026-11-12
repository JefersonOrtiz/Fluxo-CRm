/* Conversas e mensagens persistidas pela API no modo conectado. */
const apiConversationsMode = () => window.FLUXO_CONFIG?.mode === 'api';
const apiConversationState = {
  items: [], nextCursor: null, activeId: null, active: null, contact: null,
  messages: [], messageCursor: null, loading: false, messagesLoading: false
};
let apiConversationSearchTimer;

const conversationCan = permission => {
  const permissions = window.FluxoApi?.getSession()?.user?.permissions || [];
  return permissions.includes('*') || permissions.includes(permission);
};
const conversationTime = value => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const conversationDateTime = value => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
const conversationError = (error, fallback) => toast('⚠️', 'Conversa não atualizada', error?.message || fallback, 'coral');

async function loadApiConversations({ append = false } = {}) {
  if (!apiConversationsMode() || !FluxoApi.getSession() || apiConversationState.loading) return;
  apiConversationState.loading = true;
  renderApiConversationList();
  const params = new URLSearchParams({ limit: '30', status: 'open' });
  const query = $('#chatSearch').value.trim();
  if (query) params.set('q', query);
  if (append && apiConversationState.nextCursor) params.set('cursor', apiConversationState.nextCursor);
  try {
    const result = await FluxoApi.request(`/conversations?${params}`);
    apiConversationState.items = append ? [...apiConversationState.items, ...result.items] : result.items;
    apiConversationState.nextCursor = result.nextCursor;
    if (!apiConversationState.activeId && apiConversationState.items[0]) await openApiConversation(apiConversationState.items[0].id);
  } catch (error) {
    if (!append) apiConversationState.items = [];
    conversationError(error, 'Não foi possível carregar as conversas.');
  } finally {
    apiConversationState.loading = false;
    renderApiConversationList();
  }
}

function renderApiConversationList() {
  const list = $('#chatList');
  list.innerHTML = apiConversationState.items.map(item => {
    const active = item.id === apiConversationState.activeId ? 'on' : '';
    const preview = item.latestMessageBody || 'Conversa sem mensagens';
    const contact = { id: item.contactId, name: item.contactName, hue: contactHue(item.contactId) };
    return `<div class="citem ${active}" data-id="${item.id}"><span class="cava" style="${avaStyle(contact)}">${initials(item.contactName)}</span><div class="cmeta"><div class="crow"><b>${esc(item.contactName)}</b><span class="ctime">${conversationTime(item.latestMessageSentAt || item.updatedAt)}</span></div><div class="crow"><span class="cprev">${item.latestMessageDirection === 'outbound' ? 'Você: ' : ''}${esc(preview)}</span></div></div></div>`;
  }).join('') || (apiConversationState.loading ? '<p class="empty-state">Carregando conversas…</p>' : '<p class="empty-state">Nenhuma conversa aberta.</p>');
  if (apiConversationState.nextCursor) list.insertAdjacentHTML('beforeend', '<button class="btn ghost chat-load-more" data-load-conversations>Carregar mais</button>');
  $$('[data-open-newchat]').forEach(button => { button.disabled = !conversationCan('conversations:write'); });
  $$('.fchip').forEach(button => {
    const available = button.dataset.f === 'all';
    button.disabled = !available;
    button.title = available ? '' : 'Filtro ainda não disponível no modo conectado';
  });
}

function apiMessageHtml(message) {
  const mine = message.direction === 'outbound';
  const ai = message.senderType === 'ai';
  const status = mine ? `<span class="message-status">${message.status === 'pending' ? 'pendente' : esc(message.status)}</span>` : '';
  return `<div class="msg ${mine ? 'me' : 'them'}" data-mid="${message.id}">${ai ? '<span class="ai-tag">✦ AURORA</span>' : ''}<p>${esc(message.body)}</p><div class="meta">${conversationTime(message.sentAt)} ${status}</div></div>`;
}

function renderApiMessages() {
  const older = apiConversationState.messageCursor ? '<button class="btn ghost chat-load-more" data-load-messages>Carregar mensagens anteriores</button>' : '';
  const ordered = [...apiConversationState.messages].reverse();
  $('#msgsBox').innerHTML = `<div class="sys-chip">🔐 Mensagens persistidas · envio ao provedor ainda não integrado</div>${older}${ordered.map(apiMessageHtml).join('') || '<p class="empty-state">Nenhuma mensagem nesta conversa.</p>'}`;
  scrollBottom();
}

async function loadApiMessages({ append = false } = {}) {
  if (!apiConversationState.activeId || apiConversationState.messagesLoading) return;
  apiConversationState.messagesLoading = true;
  const params = new URLSearchParams({ limit: '50' });
  if (append && apiConversationState.messageCursor) params.set('cursor', apiConversationState.messageCursor);
  try {
    const result = await FluxoApi.request(`/conversations/${encodeURIComponent(apiConversationState.activeId)}/messages?${params}`);
    apiConversationState.messages = append ? [...apiConversationState.messages, ...result.items] : result.items;
    apiConversationState.messageCursor = result.nextCursor;
    renderApiMessages();
  } catch (error) {
    conversationError(error, 'Não foi possível carregar as mensagens.');
  } finally {
    apiConversationState.messagesLoading = false;
  }
}

function renderApiConversationDetails() {
  const conversation = apiConversationState.active;
  const contact = apiConversationState.contact;
  if (!conversation || !contact) return;
  const ui = contactUi(contact);
  $('#chAva').innerHTML = `<span class="cava" style="${avaStyle(ui)};width:40px;height:40px">${initials(contact.name)}</span>`;
  $('#chName').textContent = `${contact.name} · ${contact.company || 'Sem empresa'}`;
  $('#chSub').textContent = `${conversation.channel} · ${conversation.assignedUserName || 'sem responsável'}`;
  $('#chSub').className = '';
  $('#dAva').innerHTML = `<span class="cava" style="${avaStyle(ui)};width:52px;height:52px;font-size:16px">${initials(contact.name)}</span>`;
  $('#dName').textContent = contact.name;
  $('#dComp').textContent = contact.company || '—';
  $('#dPhone').textContent = contact.phone || '—';
  $('#dMail').textContent = contact.email || '—';
  $('#stageSel').value = contact.stage;
  $('#tagBox').innerHTML = contact.tags.map(tag => `<span class="tag">${esc(tag.name)}</span>`).join('') || '—';
  $('#tagInput').disabled = true;
  $('#tagInput').placeholder = 'Edite tags no cadastro do contato';
  $('#notesBox').disabled = true;
  $('#notesBox').value = '';
  $('#notesBox').placeholder = 'Notas ainda não persistidas pela API';
  $('#favBtn').disabled = true;
  $('#aiSwitch').classList.remove('on');
  $('#aiSwitch').title = 'Aurora ainda não integrada às conversas da API';
  $('#suggBox').innerHTML = '<small class="empty-state">Copiloto ainda não integrado.</small>';
}

async function openApiConversation(id) {
  apiConversationState.activeId = id;
  apiConversationState.messages = [];
  apiConversationState.messageCursor = null;
  renderApiConversationList();
  try {
    const conversation = await FluxoApi.request(`/conversations/${encodeURIComponent(id)}`);
    const contact = await FluxoApi.request(`/contacts/${encodeURIComponent(conversation.contactId)}`);
    apiConversationState.active = conversation;
    apiConversationState.contact = contact;
    renderApiConversationDetails();
    await loadApiMessages();
  } catch (error) {
    conversationError(error, 'Não foi possível abrir a conversa.');
  }
}

async function sendApiMessage(text) {
  if (!apiConversationState.activeId || !conversationCan('messages:write')) {
    toast('⚠️', 'Envio indisponível', 'Sua conta não possui permissão para enviar mensagens.', 'coral');
    return false;
  }
  const clientMessageId = crypto.randomUUID ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    const result = await FluxoApi.request(`/conversations/${encodeURIComponent(apiConversationState.activeId)}/messages`, { method: 'POST', body: { body: text, clientMessageId } });
    apiConversationState.messages.unshift(result.message);
    renderApiMessages();
    const refreshed = await FluxoApi.request(`/conversations/${encodeURIComponent(apiConversationState.activeId)}`);
    apiConversationState.active = refreshed;
    await loadApiConversations();
    return true;
  } catch (error) {
    conversationError(error, 'Não foi possível persistir a mensagem.');
    return false;
  }
}

async function renderApiNewConversationContacts() {
  const params = new URLSearchParams({ limit: '20', sort: 'name', direction: 'asc' });
  const query = $('#ncSearch').value.trim();
  if (query) params.set('q', query);
  try {
    const result = await FluxoApi.request(`/contacts?${params}`);
    $('#ncList').innerHTML = result.items.map(contact => `<div class="ncitem" data-id="${contact.id}"><span class="cava" style="${avaStyle(contactUi(contact))};width:38px;height:38px;font-size:12px">${initials(contact.name)}</span><div><b>${esc(contact.name)}</b><small>${esc(contact.company || '—')} · ${esc(contact.phone || '—')}</small></div></div>`).join('') || '<p class="empty-state">Nenhum contato encontrado.</p>';
  } catch (error) {
    conversationError(error, 'Não foi possível listar os contatos.');
  }
}

async function createApiConversation(contactId) {
  if (!conversationCan('conversations:write')) return;
  try {
    const conversation = await FluxoApi.request('/conversations', { method: 'POST', body: { contactId, channel: 'manual' } });
    closeModal();
    await loadApiConversations();
    await openApiConversation(conversation.id);
    switchView('chat');
  } catch (error) {
    conversationError(error, 'Não foi possível criar a conversa.');
  }
}

async function updateActiveApiContactStage(stage) {
  const contact = apiConversationState.contact;
  if (!contact || !conversationCan('contacts:write')) return false;
  try {
    const updated = await FluxoApi.request(`/contacts/${encodeURIComponent(contact.id)}`, { method: 'PATCH', body: { expectedVersion: contact.version, stage } });
    apiConversationState.contact = updated;
    contactListState.loaded = false;
    contactBoardState.loaded = false;
    toast('🎯', 'Funil atualizado', `${contact.name} → ${stage}`);
    return true;
  } catch (error) {
    conversationError(error, 'Não foi possível atualizar o funil.');
    await openApiConversation(apiConversationState.activeId);
    return false;
  }
}

async function assignActiveApiConversation() {
  const conversation = apiConversationState.active;
  const userId = FluxoApi.getSession()?.user?.userId;
  if (!conversation || !userId || !conversationCan('conversations:write')) return false;
  try {
    apiConversationState.active = await FluxoApi.request(`/conversations/${encodeURIComponent(conversation.id)}`, { method: 'PATCH', body: { expectedVersion: conversation.version, assignedUserId: userId } });
    renderApiConversationDetails();
    await loadApiConversations();
    toast('🙋', 'Conversa assumida', 'Você agora é responsável por este atendimento.');
    return true;
  } catch (error) {
    conversationError(error, 'Não foi possível assumir a conversa.');
    await openApiConversation(conversation.id);
    return false;
  }
}

$('#chatList').addEventListener('click', event => {
  if (!apiConversationsMode()) return;
  const load = event.target.closest('[data-load-conversations]');
  if (load) return void loadApiConversations({ append: true });
});
$('#msgsBox').addEventListener('click', event => {
  if (apiConversationsMode() && event.target.closest('[data-load-messages]')) loadApiMessages({ append: true });
});
$('#chatSearch').addEventListener('input', () => {
  if (!apiConversationsMode()) return;
  clearTimeout(apiConversationSearchTimer);
  apiConversationSearchTimer = setTimeout(() => loadApiConversations(), 300);
});
window.addEventListener('fluxo:session', event => { if (event.detail && apiConversationsMode()) loadApiConversations(); });
