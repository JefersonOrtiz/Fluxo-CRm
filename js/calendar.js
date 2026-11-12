/* Agenda persistida pela API no modo conectado. */
const apiCalendarMode = () => window.FLUXO_CONFIG?.mode === 'api';
const apiCalendarState = { items: [], rangeKey: '', loading: false, editing: null };
const calendarTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const calendarCanWrite = () => {
  const permissions = window.FluxoApi?.getSession()?.user?.permissions || [];
  return permissions.includes('*') || permissions.includes('events:write');
};
const calendarError = (error, fallback) => toast('⚠️', 'Agenda não atualizada', error?.message || fallback, 'coral');
const calendarRange = () => {
  const from = new Date(calRef.getFullYear(), calRef.getMonth(), 1);
  const to = new Date(calRef.getFullYear(), calRef.getMonth() + 1, 1);
  return { from, to, key: `${from.toISOString()}|${to.toISOString()}` };
};

async function loadApiCalendar() {
  if (!apiCalendarMode() || !FluxoApi.getSession() || apiCalendarState.loading) return;
  const range = calendarRange();
  apiCalendarState.loading = true;
  apiCalendarState.items = [];
  apiCalendarState.rangeKey = range.key;
  renderApiCalendar();
  try {
    let cursor = null;
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString(), limit: '500' });
      if (cursor) params.set('cursor', cursor);
      const result = await FluxoApi.request(`/events?${params}`);
      apiCalendarState.items.push(...result.items);
      cursor = result.nextCursor;
      if (!cursor) break;
      if (page === 4) toast('⚠️', 'Agenda muito extensa', 'O mês excede 2.500 eventos; refine a operação pela API.', 'gold');
    }
  } catch (error) {
    apiCalendarState.items = [];
    calendarError(error, 'Não foi possível carregar os eventos.');
  } finally {
    apiCalendarState.loading = false;
    renderApiCalendar();
  }
}

const eventOccursOnDay = (event, dayString) => {
  const [year, month, day] = dayString.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  return new Date(event.startAt) < end && new Date(event.endAt) > start;
};
const apiEventsForDay = dayString => apiCalendarState.items.filter(event => eventOccursOnDay(event, dayString)).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
const eventLocalTime = value => new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function renderApiCalendar() {
  const range = calendarRange();
  $('#calTitle').textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calRef);
  $('#newEventBtn').disabled = !calendarCanWrite();
  if (apiCalendarState.rangeKey !== range.key && !apiCalendarState.loading) {
    $('#calGrid').innerHTML = '<p class="empty-state">Carregando agenda…</p>';
    loadApiCalendar();
    return;
  }
  if (apiCalendarState.loading) {
    $('#calGrid').innerHTML = '<p class="empty-state">Carregando agenda…</p>';
    return;
  }
  const year = calRef.getFullYear(), month = calRef.getMonth();
  const first = new Date(year, month, 1).getDay(), days = new Date(year, month + 1, 0).getDate(), previousDays = new Date(year, month, 0).getDate();
  let html = DOW.map(day => `<div class="dow">${day}</div>`).join('');
  for (let index = 0; index < first; index++) html += `<div class="ccell dim"><span class="cnum">${previousDays - first + 1 + index}</span></div>`;
  for (let day = 1; day <= days; day++) {
    const dayString = isoLocal(new Date(year, month, day));
    const dayEvents = apiEventsForDay(dayString);
    html += `<div class="ccell ${dayString === isoLocal(new Date()) ? 'today' : ''} ${dayString === selDate ? 'sel' : ''}" data-d="${dayString}"><span class="cnum">${day}</span><div>${dayEvents.slice(0, 2).map(event => `<i class="echip ${event.type}">${eventLocalTime(event.startAt)} ${esc(event.title)}</i>`).join('')}${dayEvents.length > 2 ? `<i class="emore">+${dayEvents.length - 2} mais</i>` : ''}</div></div>`;
  }
  const total = first + days;
  for (let index = 0; index < (7 - total % 7) % 7; index++) html += `<div class="ccell dim"><span class="cnum">${index + 1}</span></div>`;
  $('#calGrid').innerHTML = html;
  renderApiDayPanel();
}

function renderApiDayPanel() {
  const [year, month, day] = selDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  $('#dayTitle').innerHTML = '📅 ' + date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const dayEvents = apiEventsForDay(selDate);
  $('#dayList').innerHTML = dayEvents.map(event => `<div class="day-item" data-api-event="${event.id}"><span class="dtime">${eventLocalTime(event.startAt)}<small style="display:block;color:var(--dim)">${eventLocalTime(event.endAt)}</small></span><div><div class="dtit"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px" class="dot-${event.type === 'reuniao' ? 'sky' : event.type}"></i>${esc(event.title)}</div><div class="dcon">${event.contactName ? `👤 ${esc(event.contactName)}${event.contactCompany ? ` · ${esc(event.contactCompany)}` : ''}` : 'Sem contato'} · ${esc(event.assignedUserName || 'sem responsável')}</div></div></div>`).join('') || '<p style="color:var(--dim);padding:14px 0;font-size:13px">Nenhum compromisso — dia livre 🌿</p>';
}

const setLocalDateTimeFields = (prefix, value) => {
  const date = new Date(value);
  $(`#${prefix}Date`).value = isoLocal(date);
  $(`#${prefix}Time`).value = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const readLocalInstant = (dateId, timeId, label) => {
  const dateValue = $(`#${dateId}`).value;
  const timeValue = $(`#${timeId}`).value;
  if (!dateValue || !timeValue) throw new Error(`Informe ${label.toLowerCase()}.`);
  const value = new Date(`${dateValue}T${timeValue}:00`);
  if (Number.isNaN(value.getTime()) || isoLocal(value) !== dateValue || `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}` !== timeValue) throw new Error(`${label} não existe no fuso selecionado.`);
  return value;
};

async function prepareApiEventModal(id) {
  $('#mAction').disabled = true;
  $('#evDelete').hidden = true;
  $('#evTitle').value = '';
  apiCalendarState.editing = id ? apiCalendarState.items.find(event => event.id === id) || null : null;
  if (id && !apiCalendarState.editing) {
    try { apiCalendarState.editing = await FluxoApi.request(`/events/${encodeURIComponent(id)}`); }
    catch (error) { calendarError(error, 'Não foi possível carregar o evento.'); return closeModal(); }
  }
  const params = new URLSearchParams({ limit: '100', sort: 'name', direction: 'asc' });
  let contactsResult = { items: [] };
  try { contactsResult = await FluxoApi.request(`/contacts?${params}`); }
  catch (error) { calendarError(error, 'Não foi possível listar os contatos.'); }
  const editing = apiCalendarState.editing;
  const selectableContacts = [...contactsResult.items];
  if (editing?.contactId && !selectableContacts.some(contact => contact.id === editing.contactId)) selectableContacts.push({ id: editing.contactId, name: editing.contactName || 'Contato atual', company: editing.contactCompany || '' });
  $('#evContact').innerHTML = '<option value="">— nenhum —</option>' + selectableContacts.map(contact => `<option value="${contact.id}">${esc(contact.name)} · ${esc(contact.company || '—')}</option>`).join('');
  $('#mTitle').textContent = editing ? '📅 Editar evento' : '📅 Novo evento';
  $('#evTitle').value = editing?.title || '';
  $('#evType').value = editing?.type || 'reuniao';
  $('#evContact').value = editing?.contactId || '';
  if (editing) {
    setLocalDateTimeFields('ev', editing.startAt);
    setLocalDateTimeFields('evEnd', editing.endAt);
  } else {
    $('#evDate').value = selDate;
    $('#evEndDate').value = selDate;
    $('#evTime').value = '10:00';
    $('#evEndTime').value = '11:00';
  }
  $('#evTimezoneHelp').textContent = `Fuso: ${calendarTimezone}. Horários serão persistidos em UTC.`;
  $('#evDelete').hidden = !editing;
  $('#evDelete').disabled = !calendarCanWrite();
  $('#mAction').disabled = !calendarCanWrite();
}

async function persistApiEvent(payload, allowConflict = false) {
  const editing = apiCalendarState.editing;
  const path = editing ? `/events/${encodeURIComponent(editing.id)}` : '/events';
  const method = editing ? 'PATCH' : 'POST';
  return FluxoApi.request(path, { method, body: { ...payload, ...(editing ? { expectedVersion: editing.version } : {}), ...(allowConflict ? { allowConflict: true } : {}) } });
}

async function saveApiEventModal() {
  const title = $('#evTitle').value.trim();
  if (!title) { toast('⚠️', 'Campo obrigatório', 'Dê um título ao evento.', 'coral'); return false; }
  let startAt, endAt;
  try {
    startAt = readLocalInstant('evDate', 'evTime', 'Início');
    endAt = readLocalInstant('evEndDate', 'evEndTime', 'Fim');
  } catch (error) {
    toast('⚠️', 'Horário inválido', error.message, 'coral');
    return false;
  }
  if (endAt <= startAt) { toast('⚠️', 'Intervalo inválido', 'O fim deve ser posterior ao início.', 'coral'); return false; }
  const payload = { title, type: $('#evType').value, contactId: $('#evContact').value || null, startAt: startAt.toISOString(), endAt: endAt.toISOString(), timezone: calendarTimezone };
  try {
    await persistApiEvent(payload);
  } catch (error) {
    if (error?.details?.code !== 'EVENT_CONFLICT') { calendarError(error, 'Não foi possível salvar o evento.'); return false; }
    const conflict = error.details.conflict;
    const detail = conflict ? ` Conflito com “${conflict.title}”.` : '';
    if (!window.confirm(`O responsável já possui outro evento nesse horário.${detail} Deseja salvar mesmo assim?`)) return false;
    try { await persistApiEvent(payload, true); }
    catch (retryError) { calendarError(retryError, 'Não foi possível salvar o evento.'); return false; }
  }
  apiCalendarState.rangeKey = '';
  await loadApiCalendar();
  toast('📅', apiCalendarState.editing ? 'Evento atualizado' : 'Evento criado', title);
  return true;
}

async function deleteApiEvent() {
  const editing = apiCalendarState.editing;
  if (!editing || !window.confirm(`Excluir “${editing.title}”?`)) return;
  try {
    await FluxoApi.request(`/events/${encodeURIComponent(editing.id)}?expectedVersion=${encodeURIComponent(editing.version)}`, { method: 'DELETE' });
    closeModal();
    apiCalendarState.rangeKey = '';
    await loadApiCalendar();
    toast('🗑', 'Evento excluído', editing.title);
  } catch (error) {
    calendarError(error, 'Não foi possível excluir o evento.');
  }
}

$('#dayList').addEventListener('click', event => {
  if (!apiCalendarMode()) return;
  const item = event.target.closest('[data-api-event]');
  if (item) openModal('event', item.dataset.apiEvent);
});
$('#evDelete').addEventListener('click', () => { if (apiCalendarMode()) deleteApiEvent(); });
window.addEventListener('fluxo:session', event => { if (event.detail && apiCalendarMode()) { apiCalendarState.rangeKey = ''; loadApiCalendar(); } });
