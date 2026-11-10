/* Cadastros e rascunhos locais. Nenhuma ação deste módulo envia mensagens. */
const WORKSPACE_KEY = 'fluxo-crm:workspace:v1';
const workspaceDefaults = {
  orders: [], templates: [], workflows: [], campaigns: [],
  gateway: { provider: '', model: '', url: '' },
  profile: { email: 'marina@fluxo.com', company: '', start: '09:00', end: '18:00', days: 'weekdays', photo: '' }
};
let workspaceData;
try { workspaceData = JSON.parse(localStorage.getItem(WORKSPACE_KEY)) || {}; } catch { workspaceData = {}; }
workspaceData = { ...structuredClone(workspaceDefaults), ...workspaceData,
  profile: { ...workspaceDefaults.profile, ...workspaceData.profile },
  gateway: { ...workspaceDefaults.gateway, ...workspaceData.gateway }
};
const saveWorkspace = () => localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspaceData));
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const orderStatuses = ['Aberta', 'Em andamento', 'Concluída', 'Cancelada'];
let editingTemplateId = null;
let profilePhotoDraft = workspaceData.profile.photo;
let profilePhotoTask = 0;
let profilePhotoBusy = false;

function emptyContent(icon, title, description, action = '') {
  return `<div class="card content-empty"><span class="empty-icon">${navIcon(icon)}</span><h3>${title}</h3><p>${description}</p>${action}</div>`;
}
function renderWorkspace(view) {
  if (view === 'orders') renderOrders();
  if (view === 'templates') renderTemplates();
  if (view === 'workflows') renderWorkflows();
  if (view === 'bulk') renderBulk();
  if (view === 'subscription') { renderPlanCatalog($('#subscriptionPlans')); renderBilling(); }
  else if (typeof suspendBilling === 'function') suspendBilling();
  if (view === 'connections') {
    $('#gatewayProvider').value = workspaceData.gateway.provider;
    $('#gatewayModel').value = workspaceData.gateway.model;
    $('#gatewayUrl').value = workspaceData.gateway.url;
  }
  if (view === 'profile') renderProfile();
  $$('[data-icon]').forEach(element => { element.innerHTML = navIcon(element.dataset.icon); });
}
function prepareWorkspaceModal(mode) {
  const forms = { client: 'clientForm', order: 'orderForm', template: 'templateForm', workflow: 'workflowForm' };
  if (!forms[mode]) return;
  $('#' + forms[mode]).reset();
  if (mode === 'client') { $('#clientStage').innerHTML = STAGES.map(status => `<option>${esc(status)}</option>`).join(''); $('#clientPhone').setCustomValidity(''); }
  if (mode === 'order') $('#orderClient').innerHTML = '<option value="">Selecione um cliente</option>' + contacts.map(contact => `<option value="${contact.id}">${esc(contact.name)}${contact.company ? ' · ' + esc(contact.company) : ''}</option>`).join('');
  if (mode === 'template') editingTemplateId = null;
}

$('#view-support').addEventListener('click', event => {
  const option = event.target.closest('[data-support-topic]');
  if (!option) return;
  const expanded = option.getAttribute('aria-expanded') !== 'true';
  $$('#view-support [data-support-topic]').forEach(button => {
    const selected = expanded && button === option;
    button.setAttribute('aria-expanded', String(selected));
    button.classList.toggle('selected', selected);
    document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
  });
});

const normalizedPhone = phone => {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11 ? '55' + digits : digits;
};
$('#clientForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#clientName').value.trim(), phone = $('#clientPhone').value.trim();
  if (!name) { $('#clientName').focus(); return; }
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    $('#clientPhone').setCustomValidity('Informe um telefone com DDD, entre 10 e 15 dígitos.');
    $('#clientPhone').reportValidity(); return;
  }
  if (contacts.some(contact => normalizedPhone(contact.phone) === normalizedPhone(phone))) {
    $('#clientPhone').setCustomValidity('Este telefone já pertence a um cliente cadastrado.');
    $('#clientPhone').reportValidity(); return;
  }
  const tags = [...new Set($('#clientTags').value.split(',').map(tag => tag.trim()).filter(Boolean))];
  const contact = {
    id: managementId('client'), name, company: $('#clientCompany').value.trim(), phone,
    mail: $('#clientEmail').value.trim(), stage: $('#clientStage').value,
    note: $('#clientNote').value.trim(), tags, hue: [152, 205, 32, 175][contacts.length % 4],
    online: false, lastSeen: 'não disponível', value: 0, days: 0, unread: 0, fav: false,
    aiOn: false, ts: Date.now(), msgs: []
  };
  contacts.push(contact);
  tags.forEach(tag => { if (!management.tags.includes(tag)) management.tags.push(tag); });
  persistCrm(); saveManagement(); renderChatList(); renderKanban(); closeModal(); switchView('contacts');
  toast('✓', 'Cliente cadastrado', `${name} foi adicionado à sua base.`);
});
$('#clientPhone').addEventListener('input', event => event.target.setCustomValidity(''));

function renderOrders() {
  const query = $('#orderSearch').value.trim().toLowerCase(), status = $('#orderFilter').value;
  const list = workspaceData.orders.filter(order => {
    const contact = byId(order.clientId);
    return (!status || order.status === status) && `${order.number} ${order.title} ${contact?.name || ''} ${contact?.company || ''}`.toLowerCase().includes(query);
  });
  $('#ordersTotal').textContent = workspaceData.orders.length;
  $('#ordersOpen').textContent = workspaceData.orders.filter(order => ['Aberta', 'Em andamento'].includes(order.status)).length;
  $('#ordersDone').textContent = workspaceData.orders.filter(order => order.status === 'Concluída').length;
  $('#orderList').innerHTML = list.map(order => {
    const contact = byId(order.clientId);
    const due = order.due ? new Date(order.due + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem prazo';
    return `<tr><td><small class="mono" style="color:var(--dim)">OS-${String(order.number).padStart(3, '0')}</small><b style="display:block;margin-top:4px">${esc(order.title)}</b>${order.description ? `<small style="display:block;color:var(--mut);max-width:260px;margin-top:5px">${esc(order.description)}</small>` : ''}</td><td>${esc(contact?.name || 'Cliente não encontrado')}</td><td class="mono" style="font-size:11px">${due}</td><td class="mono" style="color:var(--jade);white-space:nowrap">${money(order.value)}</td><td><select class="inp order-status" aria-label="Status da ordem OS-${order.number}" data-order-status="${order.id}">${orderStatuses.map(item => `<option${item === order.status ? ' selected' : ''}>${item}</option>`).join('')}</select></td></tr>`;
  }).join('') || `<tr><td colspan="5" class="table-empty">${workspaceData.orders.length ? 'Nenhuma ordem encontrada para estes filtros.' : 'Nenhuma ordem de serviço cadastrada. Clique em Nova ordem de serviço para começar.'}</td></tr>`;
}
$('#orderForm').addEventListener('submit', event => {
  event.preventDefault(); const title = $('#orderTitle').value.trim(), clientId = $('#orderClient').value;
  if (!title || !byId(clientId)) return;
  const number = Math.max(0, ...workspaceData.orders.map(order => order.number)) + 1;
  workspaceData.orders.unshift({ id: managementId('order'), number, title, clientId,
    description: $('#orderDescription').value.trim(), due: $('#orderDue').value,
    value: Number($('#orderValue').value || 0), status: 'Aberta', createdAt: new Date().toISOString()
  });
  saveWorkspace(); closeModal(); renderOrders(); toast('✓', 'Ordem de serviço criada', `OS-${String(number).padStart(3, '0')} · ${title}`);
});
$('#orderSearch').oninput = renderOrders;
$('#orderFilter').onchange = renderOrders;
$('#orderList').addEventListener('change', event => {
  const select = event.target.closest('[data-order-status]');
  if (!select || !orderStatuses.includes(select.value)) return;
  const order = workspaceData.orders.find(item => item.id === select.dataset.orderStatus);
  if (!order) return;
  order.status = select.value; saveWorkspace(); renderOrders(); toast('✓', 'Status atualizado', `${order.title} · ${order.status}`);
});

function renderTemplates() {
  const query = $('#templateSearch').value.trim().toLowerCase();
  const list = workspaceData.templates.filter(template => `${template.name} ${template.content}`.toLowerCase().includes(query));
  $('#templateCount').textContent = `${workspaceData.templates.length} template${workspaceData.templates.length === 1 ? '' : 's'}`;
  $('#templateList').innerHTML = list.map(template => `<article class="card draft-card"><div class="draft-head"><b>${esc(template.name)}</b><span class="draft-status">Rascunho</span><button class="icon-btn" data-edit-template="${template.id}" title="Editar template" aria-label="Editar ${esc(template.name)}">✎</button></div><p>${esc(template.content)}</p><div class="draft-meta"><span>${esc(template.category)}</span>·<span>${esc(template.language)}</span></div><button class="btn ghost" data-use-template="${template.id}" style="align-self:flex-start;font-size:12px">Usar em campanha ↗</button></article>`).join('') || emptyContent('templates', query ? 'Nenhum template encontrado' : 'Sua biblioteca de mensagens', query ? 'Tente buscar por outro nome ou trecho da mensagem.' : 'Crie seu primeiro template para preparar campanhas com mensagens padronizadas.', '<button class="btn" data-open-modal="template">＋ Novo template</button>');
  $('#templateList').style.gridTemplateColumns = list.length ? '' : '1fr';
}
$('#templateSearch').oninput = renderTemplates;
$('#templateForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#templateName').value.trim(), content = $('#templateContent').value.trim();
  if (!name || !content) return;
  if (workspaceData.templates.some(template => template.id !== editingTemplateId && template.name.toLowerCase() === name.toLowerCase())) return toast('⚠️', 'Nome já cadastrado', 'Escolha outro nome para este template.', 'coral');
  const template = { id: editingTemplateId || managementId('template'), name, content, category: $('#templateCategory').value, language: $('#templateLanguage').value };
  const index = workspaceData.templates.findIndex(item => item.id === editingTemplateId);
  if (index >= 0) workspaceData.templates[index] = template; else workspaceData.templates.unshift(template);
  saveWorkspace(); closeModal(); renderTemplates(); toast('✓', 'Template salvo', `${name} foi salvo como rascunho.`);
});
$('#templateList').addEventListener('click', event => {
  const edit = event.target.closest('[data-edit-template]'), use = event.target.closest('[data-use-template]');
  if (edit) {
    const template = workspaceData.templates.find(item => item.id === edit.dataset.editTemplate);
    if (!template) return;
    openModal('template'); editingTemplateId = template.id;
    $('#templateName').value = template.name; $('#templateContent').value = template.content;
    $('#templateCategory').value = template.category; $('#templateLanguage').value = template.language;
    $('#mTitle').textContent = 'Editar template';
  }
  if (use) { switchView('bulk'); $('#bulkTemplate').value = use.dataset.useTemplate; updateBulkPreview(); }
});

function renderWorkflows() {
  $('#workflowList').innerHTML = workspaceData.workflows.map(workflow => `<article class="card draft-card"><div class="draft-head">${navIcon('workflows')}<b>${esc(workflow.name)}</b><span class="draft-status">Rascunho</span></div><div class="flow-steps"><span class="flow-step">${esc(workflow.trigger)}</span><span class="flow-arrow">→</span><span class="flow-step">${esc(workflow.action)}</span></div><p>Aguardando conexão com o gateway para executar.</p></article>`).join('') || emptyContent('workflows', 'O próximo passo pode ser automático', 'Desenhe um workflow para organizar o que acontece quando um cliente chega ou envia uma mensagem.', '<button class="btn" data-open-modal="workflow">＋ Novo workflow</button>');
  $('#workflowList').style.gridTemplateColumns = workspaceData.workflows.length ? '' : '1fr';
}
$('#workflowForm').addEventListener('submit', event => {
  event.preventDefault(); const name = $('#workflowName').value.trim(); if (!name) return;
  workspaceData.workflows.unshift({ id: managementId('workflow'), name, trigger: $('#workflowTrigger').value, action: $('#workflowAction').value });
  saveWorkspace(); closeModal(); renderWorkflows(); toast('✓', 'Workflow salvo', `${name} foi salvo como rascunho.`);
});

function renderBulk() {
  const selected = $('#bulkTemplate').value, selectedTag = $('#bulkTag').value;
  $('#bulkTemplate').innerHTML = '<option value="">Selecione um template</option>' + workspaceData.templates.map(template => `<option value="${template.id}">${esc(template.name)} · rascunho</option>`).join('');
  if (workspaceData.templates.some(template => template.id === selected)) $('#bulkTemplate').value = selected;
  const tags = [...new Set([...management.tags, ...contacts.flatMap(contact => contact.tags)])];
  $('#bulkTag').innerHTML = '<option value="">Todos os clientes</option>' + tags.map(tag => `<option value="${esc(tag)}">Tag: ${esc(tag)}</option>`).join('');
  if (tags.includes(selectedTag)) $('#bulkTag').value = selectedTag;
  $('#campaignCount').textContent = workspaceData.campaigns.length;
  $('#campaignList').innerHTML = workspaceData.campaigns.map(campaign => `<div class="status-row"><div><b>${esc(campaign.name)}</b><small style="display:block;margin-top:4px">${esc(campaign.templateName)} · ${campaign.recipients.length} destinatários</small></div><small>Rascunho · não enviado</small></div>`).join('') || '<p class="empty-state">Nenhum rascunho de campanha salvo.</p>';
  updateBulkPreview();
}
function bulkRecipients() { return contacts.filter(contact => !$('#bulkTag').value || contact.tags.includes($('#bulkTag').value)); }
function updateBulkPreview() {
  const template = workspaceData.templates.find(item => item.id === $('#bulkTemplate').value), recipients = bulkRecipients(), sample = recipients[0];
  $('#recipientCount').textContent = `${recipients.length} cliente${recipients.length === 1 ? '' : 's'}`;
  $('#recipientList').innerHTML = recipients.map(contact => `<div class="recipient-row"><span class="recipient-check">✓</span><b>${esc(contact.name)}</b><small>${esc(contact.phone)}</small></div>`).join('') || '<p class="empty-state">Nenhum cliente neste público.</p>';
  $('#bulkPreview').textContent = template ? template.content.replace(/\{\{nome\}\}/g, () => sample?.name || 'Nome do cliente').replace(/\{\{empresa\}\}/g, () => sample?.company || 'Empresa') : 'Cadastre e selecione um template para visualizar a mensagem.';
}
$('#bulkTag').onchange = updateBulkPreview;
$('#bulkTemplate').onchange = updateBulkPreview;
$('#bulkForm').addEventListener('submit', event => {
  event.preventDefault();
  const template = workspaceData.templates.find(item => item.id === $('#bulkTemplate').value), recipients = bulkRecipients();
  if (!$('#bulkName').value.trim()) { $('#bulkName').focus(); return; }
  if (!template || !recipients.length) return toast('⚠️', 'Revise o público', 'Selecione um template e pelo menos um destinatário.', 'coral');
  workspaceData.campaigns.unshift({ id: managementId('campaign'), name: $('#bulkName').value.trim(), templateId: template.id, templateName: template.name, tag: $('#bulkTag').value, recipients: recipients.map(contact => contact.id) });
  saveWorkspace(); $('#bulkName').value = ''; renderBulk(); toast('✓', 'Rascunho salvo', 'A campanha foi preparada. Nenhuma mensagem foi enviada.');
});

$('#gatewayForm').addEventListener('submit', event => {
  event.preventDefault();
  const url = $('#gatewayUrl').value.trim();
  if (url) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return toast('⚠️', 'Revise a URL', 'Use um endereço HTTP ou HTTPS sem credenciais ou parâmetros.', 'coral');
  }
  workspaceData.gateway = { provider: $('#gatewayProvider').value, model: $('#gatewayModel').value.trim(), url };
  saveWorkspace(); toast('✓', 'Preferências salvas', 'O provedor ainda precisa ser conectado para executar automações.');
});
function renderUserAvatar(element, name, photo, presence = false) {
  element.replaceChildren();
  if (typeof photo === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/.test(photo)) {
    const image = document.createElement('img');
    image.src = photo; image.alt = `Foto de ${name}`; image.decoding = 'async';
    element.appendChild(image);
  } else element.appendChild(document.createTextNode(memberInitials(name)));
  if (presence) {
    const indicator = document.createElement('i'); indicator.setAttribute('aria-hidden', 'true');
    element.appendChild(indicator);
  }
}
function setProfilePhotoFeedback(message = '', error = false) {
  const feedback = $('#profilePhotoFeedback');
  feedback.textContent = message; feedback.hidden = !message;
  feedback.classList.toggle('error', error);
}
function renderProfilePhoto() {
  renderUserAvatar($('#accountAvatar'), getFluxoUserName(), profilePhotoDraft);
  $('#removeProfilePhoto').hidden = !profilePhotoDraft;
  $('#changeProfilePhoto').disabled = profilePhotoBusy;
  $('#profileSaveButton').disabled = profilePhotoBusy;
}
async function prepareProfilePhoto(file) {
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve; image.onerror = () => reject(new Error('Não foi possível abrir esta imagem. Escolha outro arquivo.'));
      image.src = source;
    });
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context || !image.naturalWidth || !image.naturalHeight) throw new Error('Não foi possível preparar a foto neste navegador.');
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = '#131d18'; context.fillRect(0, 0, 256, 256);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally { URL.revokeObjectURL(source); }
}
$('#changeProfilePhoto').onclick = () => $('#profilePhotoInput').click();
$('#profilePhotoInput').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const task = ++profilePhotoTask;
  profilePhotoBusy = false;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    event.target.value = ''; renderProfilePhoto();
    setProfilePhotoFeedback('Formato não aceito. Escolha uma imagem JPG, PNG ou WebP.', true); return;
  }
  if (file.size > 5 * 1024 * 1024) {
    event.target.value = ''; renderProfilePhoto();
    setProfilePhotoFeedback('A imagem deve ter no máximo 5 MB.', true); return;
  }
  profilePhotoBusy = true; renderProfilePhoto(); setProfilePhotoFeedback('Preparando a prévia da foto…');
  try {
    const photo = await prepareProfilePhoto(file);
    if (task !== profilePhotoTask) return;
    profilePhotoDraft = photo;
    setProfilePhotoFeedback('Prévia pronta. Clique em Salvar alterações para aplicar a foto.');
  } catch (error) {
    if (task === profilePhotoTask) setProfilePhotoFeedback(error.message, true);
  } finally {
    if (task === profilePhotoTask) { profilePhotoBusy = false; event.target.value = ''; renderProfilePhoto(); }
  }
});
$('#removeProfilePhoto').onclick = () => {
  ++profilePhotoTask; profilePhotoBusy = false; profilePhotoDraft = '';
  $('#profilePhotoInput').value = ''; renderProfilePhoto();
  setProfilePhotoFeedback('Foto removida da prévia. Clique em Salvar alterações para confirmar.');
};
function renderProfile() {
  ++profilePhotoTask; profilePhotoBusy = false; profilePhotoDraft = workspaceData.profile.photo;
  $('#profilePhotoInput').value = ''; setProfilePhotoFeedback();
  $('#profileName').value = getFluxoUserName(); $('#profileEmail').value = workspaceData.profile.email;
  $('#profileCompany').value = workspaceData.profile.company;
  $('#businessStart').value = workspaceData.profile.start; $('#businessEnd').value = workspaceData.profile.end;
  $('#businessDays').value = workspaceData.profile.days;
  $('#accountName').textContent = getFluxoUserName(); renderProfilePhoto();
}
$('#profileForm').addEventListener('submit', event => {
  event.preventDefault();
  if (profilePhotoBusy) return;
  const name = $('#profileName').value.trim(); if (!name) { $('#profileName').focus(); return; }
  const previousProfile = workspaceData.profile, previousName = getFluxoUserName();
  workspaceData.profile = { ...previousProfile, email: $('#profileEmail').value.trim(), company: $('#profileCompany').value.trim(), start: $('#businessStart').value, end: $('#businessEnd').value, days: $('#businessDays').value, photo: profilePhotoDraft };
  try { saveWorkspace(); setFluxoUserName(name); }
  catch {
    workspaceData.profile = previousProfile;
    try { saveWorkspace(); setFluxoUserName(previousName); } catch { /* A versão anterior permanece no armazenamento. */ }
    setProfilePhotoFeedback('Não foi possível salvar o perfil. O armazenamento do navegador pode estar cheio.', true);
    toast('⚠️', 'Perfil não salvo', 'Libere espaço no navegador e tente novamente.', 'coral'); return;
  }
  updateUserIdentity(); renderProfile(); toast('✓', 'Perfil atualizado', 'Sua foto, seus dados e preferências foram salvos neste navegador.');
});
