/* Contatos e funil persistidos pela API no modo conectado. */
const apiContactsMode = () => window.FLUXO_CONFIG?.mode === 'api';
const contactListState = { items: [], page: 1, pageInfo: null, loaded: false, loading: false };
const contactBoardState = { columns: {}, loaded: false, loading: false };
let contactEditing = null;
let contactSearchTimer;

const contactCanWrite = () => {
  const permissions = window.FluxoApi?.getSession()?.user?.permissions || [];
  return !apiContactsMode() || permissions.includes('*') || permissions.includes('contacts:write');
};
const contactHue = id => [...String(id)].reduce((total, char) => total + char.charCodeAt(0), 0) % 360;
const contactUi = item => ({ ...item, mail: item.email || '', value: item.valueCents / 100, hue: contactHue(item.id), tags: item.tags || [], days: 0 });
const contactMoney = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
const contactError = (error, fallback) => {
  const stale = error?.details?.code === 'STALE_WRITE';
  toast('⚠️', stale ? 'Contato alterado por outra pessoa' : 'Contato não atualizado', stale ? 'Os dados foram recarregados. Revise antes de tentar novamente.' : error?.message || fallback, 'coral');
};

async function loadApiContacts({ page = contactListState.page } = {}) {
  if (!apiContactsMode() || !window.FluxoApi?.getSession() || contactListState.loading) return;
  contactListState.loading = true;
  renderApiContacts();
  const [sort, direction] = $('#ctSort').value.split(':');
  const params = new URLSearchParams({ page: String(page), limit: '20', sort, direction });
  const query = $('#ctSearch').value.trim();
  const stage = $('#ctStage').value;
  if (query) params.set('q', query);
  if (stage) params.set('stage', stage);
  try {
    const result = await FluxoApi.request(`/contacts?${params}`);
    contactListState.items = result.items.map(contactUi);
    contactListState.page = result.page.number;
    contactListState.pageInfo = result.page;
    contactListState.loaded = true;
  } catch (error) {
    contactListState.items = [];
    contactListState.pageInfo = null;
    contactError(error, 'Não foi possível carregar os contatos.');
  } finally {
    contactListState.loading = false;
    renderApiContacts();
  }
}

function renderApiContacts() {
  if (!contactListState.loaded && !contactListState.loading) loadApiContacts({ page: 1 });
  if (contactListState.loading && !contactListState.loaded) {
    $('#ctBody').innerHTML = '<tr><td colspan="6" class="empty-state">Carregando contatos…</td></tr>';
    return;
  }
  $('#ctBody').innerHTML = contactListState.items.map(contact => `<tr data-id="${contact.id}">
    <td><div style="display:flex;gap:11px;align-items:center"><span class="cava" style="${avaStyle(contact)};width:34px;height:34px;font-size:11px">${initials(contact.name)}</span><div><b>${esc(contact.name)}</b><small style="display:block;color:var(--dim)">${esc(contact.company || '—')}</small></div></div></td>
    <td class="mono" style="font-size:12px;color:var(--mut)">${esc(contact.phone || '—')}</td>
    <td><span class="stbadge" style="background:${STBG[contact.stage]};color:${SCOLOR[contact.stage]}">${esc(contact.stage)}</span></td>
    <td class="mono" style="color:var(--jade);font-weight:600">${contactMoney(contact.valueCents)}</td>
    <td>${contact.tags.slice(0, 3).map(tag => `<span class="tag" style="margin-right:4px">${esc(tag.name)}</span>`).join('') || '—'}</td>
    <td><span class="ia-dot" style="background:var(--dim)"></span>não integrada</td></tr>`).join('') || '<tr><td colspan="6" class="empty-state">Nenhum contato encontrado.</td></tr>';
  const page = contactListState.pageInfo;
  $('#ctPageInfo').textContent = page ? `Página ${page.number} de ${Math.max(1, page.totalPages)} · ${page.total} contatos` : '—';
  $('#ctPrev').disabled = !page || page.number <= 1 || contactListState.loading;
  $('#ctNext').disabled = !page || page.number >= page.totalPages || contactListState.loading;
  $$('[data-open-contact]').forEach(button => { button.disabled = !contactCanWrite(); });
}

async function loadApiKanban() {
  if (!apiContactsMode() || !window.FluxoApi?.getSession() || contactBoardState.loading) return;
  contactBoardState.loading = true;
  renderApiKanban();
  try {
    const results = await Promise.all(STAGES.map(stage => FluxoApi.request(`/contacts?${new URLSearchParams({ stage, page: '1', limit: '50', sort: 'updatedAt', direction: 'desc' })}`)));
    contactBoardState.columns = Object.fromEntries(STAGES.map((stage, index) => [stage, { items: results[index].items.map(contactUi), page: results[index].page }]));
    contactBoardState.loaded = true;
  } catch (error) {
    contactBoardState.columns = {};
    contactError(error, 'Não foi possível carregar o funil.');
  } finally {
    contactBoardState.loading = false;
    renderApiKanban();
  }
}

function renderApiKanban() {
  const board = $('#board');
  if (!contactBoardState.loaded && !contactBoardState.loading) loadApiKanban();
  if (contactBoardState.loading && !contactBoardState.loaded) {
    board.innerHTML = '<p class="empty-state">Carregando funil…</p>';
    return;
  }
  board.innerHTML = STAGES.map(stage => {
    const column = contactBoardState.columns[stage] || { items: [], page: { total: 0, valueCentsTotal: 0 } };
    return `<div class="kcol"><div class="khead"><span class="kdot" style="background:${SCOLOR[stage]}"></span><b>${stage}</b><span class="kcount">${column.page.total}</span><span class="ksum">${contactMoney(column.page.valueCentsTotal)}</span></div><div class="kbody" data-stage="${stage}">${column.items.map(contact => `<div class="kcard" ${contactCanWrite() ? 'draggable="true"' : ''} data-id="${contact.id}"><div class="krow"><span class="kava" style="${avaStyle(contact)}">${initials(contact.name)}</span><div><b>${esc(contact.name)}</b><small>${esc(contact.company || '—')}</small></div></div><div class="krow kb"><span class="kval">${contactMoney(contact.valueCents)}</span><span class="kdays">Atualizado recentemente</span></div><div class="ktags">${contact.tags.slice(0, 2).map(tag => `<i>${esc(tag.name)}</i>`).join('')}</div></div>`).join('') || '<div class="kempty">Nenhum contato</div>'}${column.page.total > column.items.length ? `<div class="kempty">+${column.page.total - column.items.length} fora deste lote</div>` : ''}</div></div>`;
  }).join('');
  const total = STAGES.reduce((sum, stage) => sum + Number(contactBoardState.columns[stage]?.page?.valueCentsTotal || 0), 0);
  $('#kanbanTotal').textContent = contactMoney(total);
  board.querySelectorAll('.kcard').forEach(card => {
    card.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', card.dataset.id); setTimeout(() => card.classList.add('dragging'), 0); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dblclick', () => openModal('contact', card.dataset.id));
  });
  board.querySelectorAll('.kbody').forEach(zone => {
    zone.addEventListener('dragover', event => { if (contactCanWrite()) { event.preventDefault(); zone.classList.add('over'); } });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', async event => {
      event.preventDefault(); zone.classList.remove('over');
      const id = event.dataTransfer.getData('text/plain');
      const contact = STAGES.flatMap(stage => contactBoardState.columns[stage]?.items || []).find(item => item.id === id);
      if (!contact || contact.stage === zone.dataset.stage) return;
      try {
        await FluxoApi.request(`/contacts/${encodeURIComponent(id)}`, { method: 'PATCH', body: { stage: zone.dataset.stage, expectedVersion: contact.version } });
        await Promise.all([loadApiKanban(), loadApiContacts({ page: contactListState.page })]);
        toast('🎯', 'Funil atualizado', `${contact.name} → ${zone.dataset.stage}`);
      } catch (error) {
        contactError(error, 'Não foi possível mover o contato.');
        await loadApiKanban();
      }
    });
  });
}

const findApiContact = id => contactListState.items.find(item => item.id === id) || STAGES.flatMap(stage => contactBoardState.columns[stage]?.items || []).find(item => item.id === id);

async function prepareContactModal(id) {
  contactEditing = null;
  $('#mTitle').textContent = id ? '👤 Editar contato' : '👤 Novo contato';
  $('#mb-contact').classList.add('open');
  $('#contactStage').innerHTML = STAGES.map(stage => `<option>${stage}</option>`).join('');
  ['contactName', 'contactCompany', 'contactPhone', 'contactEmail'].forEach(field => { $(`#${field}`).value = ''; });
  $('#contactValue').value = '0';
  $('#contactStage').value = 'Novo lead';
  $('#mAction').disabled = !!id;
  let contact = id ? (apiContactsMode() ? findApiContact(id) : byId(id)) : null;
  if (id && apiContactsMode() && !contact) {
    try { contact = contactUi(await FluxoApi.request(`/contacts/${encodeURIComponent(id)}`)); }
    catch (error) { contactError(error, 'Não foi possível carregar o contato.'); return closeModal(); }
  }
  contactEditing = contact;
  if (contact) {
    $('#contactName').value = contact.name || '';
    $('#contactCompany').value = contact.company || '';
    $('#contactPhone').value = contact.phone || '';
    $('#contactEmail').value = contact.email || contact.mail || '';
    $('#contactStage').value = contact.stage;
    $('#contactValue').value = ((contact.valueCents ?? Math.round((contact.value || 0) * 100)) / 100).toFixed(2);
  }
  const selectedTags = new Set(apiContactsMode() ? (contact?.tags || []).map(tag => tag.id) : (contact?.tags || []));
  $('#contactTagOptions').innerHTML = (management.tags || []).map(tag => `<label><input type="checkbox" name="contactTag" value="${tag.id}" ${selectedTags.has(apiContactsMode() ? tag.id : tag.name) ? 'checked' : ''}> ${esc(tag.name)}</label>`).join('') || '<span class="empty-state">Nenhuma tag cadastrada.</span>';
  $('#mAction').disabled = !contactCanWrite();
}

async function saveContactModal() {
  const name = $('#contactName').value.trim();
  if (!name) { toast('⚠️', 'Campo obrigatório', 'Informe o nome do contato.', 'coral'); return false; }
  const tagIds = $$('input[name="contactTag"]:checked').map(input => input.value);
  const payload = {
    name,
    company: $('#contactCompany').value.trim() || null,
    phone: $('#contactPhone').value.trim() || null,
    email: $('#contactEmail').value.trim() || null,
    stage: $('#contactStage').value,
    valueCents: Math.round(Number($('#contactValue').value || 0) * 100),
    tagIds
  };
  try {
    if (apiContactsMode()) {
      if (contactEditing) await FluxoApi.request(`/contacts/${encodeURIComponent(contactEditing.id)}`, { method: 'PATCH', body: { ...payload, expectedVersion: contactEditing.version } });
      else await FluxoApi.request('/contacts', { method: 'POST', body: payload });
      await Promise.all([loadApiContacts({ page: contactListState.page }), loadApiKanban()]);
    } else if (contactEditing) {
      Object.assign(contactEditing, { ...payload, value: payload.valueCents / 100, mail: payload.email, tags: management.tags.filter(tag => tagIds.includes(tag.id)).map(tag => tag.name) });
      renderContacts(); renderKanban();
    } else {
      contacts.push({ id: managementId('contact'), ...payload, value: payload.valueCents / 100, mail: payload.email, tags: management.tags.filter(tag => tagIds.includes(tag.id)).map(tag => tag.name), hue: contactHue(name), online: false, lastSeen: '—', unread: 0, fav: false, aiOn: false, ts: Date.now(), days: 0, msgs: [] });
      renderContacts(); renderKanban();
    }
    toast('✓', contactEditing ? 'Contato atualizado' : 'Contato criado', `${name} foi salvo com sucesso.`);
    return true;
  } catch (error) {
    contactError(error, 'Não foi possível salvar o contato.');
    if (error?.details?.code === 'STALE_WRITE') await Promise.all([loadApiContacts({ page: contactListState.page }), loadApiKanban()]);
    return false;
  }
}

$('#ctStage').innerHTML += STAGES.map(stage => `<option>${stage}</option>`).join('');
$('#ctSearch').addEventListener('input', () => { if (apiContactsMode()) { clearTimeout(contactSearchTimer); contactSearchTimer = setTimeout(() => loadApiContacts({ page: 1 }), 300); } });
$('#ctStage').addEventListener('change', () => { if (apiContactsMode()) loadApiContacts({ page: 1 }); });
$('#ctSort').addEventListener('change', () => { if (apiContactsMode()) loadApiContacts({ page: 1 }); });
$('#ctPrev').addEventListener('click', () => loadApiContacts({ page: contactListState.page - 1 }));
$('#ctNext').addEventListener('click', () => loadApiContacts({ page: contactListState.page + 1 }));
window.addEventListener('fluxo:session', event => { if (event.detail && apiContactsMode()) Promise.all([loadApiContacts({ page: 1 }), loadApiKanban()]); });
