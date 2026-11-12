/* Organização, administração e configuração da Meta. */
const MANAGEMENT_KEY = 'fluxo-crm:management:v1';
const defaultManagement = {
  meta: { appId: '', businessId: '', phoneId: '', wabaId: '', status: 'not_configured' },
  departments: [
    { id: 'dep-sales', name: 'Comercial', color: 'jade' },
    { id: 'dep-service', name: 'Atendimento', color: 'sky' },
    { id: 'dep-success', name: 'Sucesso do Cliente', color: 'gold' }
  ],
  roles: [
    { id: 'role-admin', name: 'Administrador', description: 'Acesso total à empresa', permissions: ['*'] },
    { id: 'role-manager', name: 'Gestor', description: 'Gerencia setor e clientes', permissions: ['organization:write', 'members:write'] },
    { id: 'role-agent', name: 'Atendente', description: 'Atende conversas atribuídas', permissions: [] }
  ],
  members: [
    { id: 'mem-1', name: 'Marina Duarte', email: 'marina@fluxo.com', departmentId: 'dep-sales', roleId: 'role-admin', online: true },
    { id: 'mem-2', name: 'Pedro Lima', email: 'pedro@fluxo.com', departmentId: 'dep-service', roleId: 'role-agent', online: true },
    { id: 'mem-3', name: 'Luiza Costa', email: 'luiza@fluxo.com', departmentId: 'dep-success', roleId: 'role-manager', online: false }
  ],
  tags: [
    { id: 'tag-hot', name: 'quente', color: 'sky' },
    { id: 'tag-followup', name: 'follow-up', color: 'sky' },
    { id: 'tag-vip', name: 'cliente VIP', color: 'sky' },
    { id: 'tag-onboarding', name: 'onboarding', color: 'sky' }
  ]
};

const apiMode = () => window.FLUXO_CONFIG?.mode === 'api';
const emptyManagement = () => ({ meta: { status: 'not_configured' }, departments: [], roles: [], members: [], tags: [] });
const loadDemoManagement = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(MANAGEMENT_KEY));
    if (!saved?.departments || !saved?.members) return structuredClone(defaultManagement);
    saved.tags = (saved.tags || []).map((tag, index) => typeof tag === 'string' ? { id: `legacy-${index}`, name: tag, color: 'sky' } : tag);
    saved.roles = (saved.roles || []).map(role => ({ permissions: [], ...role }));
    return saved;
  } catch {
    return structuredClone(defaultManagement);
  }
};

let management = apiMode() ? emptyManagement() : loadDemoManagement();
const saveManagement = () => { if (!apiMode()) localStorage.setItem(MANAGEMENT_KEY, JSON.stringify(management)); };
const managementId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
const depById = id => management.departments.find(item => item.id === id);
const roleById = id => management.roles.find(item => item.id === id);
const memberInitials = name => name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();
const currentPermissions = () => window.FluxoApi?.getSession()?.user?.permissions || [];
const can = permission => !apiMode() || currentPermissions().includes('*') || currentPermissions().includes(permission);
const permissionLabels = {
  'organization:write': 'Setores e tags',
  'contacts:write': 'Contatos e funil',
  'conversations:write': 'Conversas e atribuição',
  'messages:write': 'Envio de mensagens',
  'events:write': 'Agenda',
  'members:write': 'Colaboradores',
  'roles:write': 'Privilégios',
  'integrations:write': 'Integrações',
  '*': 'Acesso total'
};

const setManagementState = (text, ready = false) => {
  const state = $('#managementState');
  state.textContent = text;
  state.style.color = ready ? 'var(--jade)' : '';
};

const actionError = (error, fallback) => {
  const message = error?.status === 403 ? 'Sua conta não possui permissão para esta ação.' : error?.message || fallback;
  toast('⚠️', 'Operação não concluída', message, 'coral');
};

const setFormEnabled = (form, enabled) => {
  [...form.elements].forEach(element => { element.disabled = !enabled; });
  form.title = enabled ? '' : 'Sem permissão para alterar';
};

function renderMeta() {
  const m = management.meta || {};
  $('#metaAppId').value = m.appId || '';
  $('#metaBusinessId').value = m.businessId || '';
  $('#metaPhoneId').value = m.phoneId || '';
  $('#metaWabaId').value = m.wabaId || '';
  const ready = m.status && !['not_configured'].includes(m.status);
  $('#metaState').textContent = ready ? `Meta · ${m.status}` : 'Não conectado';
  $('#metaState').classList.toggle('ready', !!ready);
  $('#webhookUrl').textContent = `${location.origin}${location.pathname.replace(/\/$/, '')}/api/webhooks/meta`;
  $('#saveMetaConfig').disabled = apiMode() && !can('integrations:write');
}

function renderOrganization() {
  $('#orgMemberCount').textContent = management.members.length;
  $('#departmentList').innerHTML = management.departments.map(department => {
    const members = management.members.filter(member => member.departmentId === department.id);
    return `<div class="department-card"><span class="department-dot ${department.color}"></span><div><b>${esc(department.name)}</b><small>${members.length} colaborador${members.length === 1 ? '' : 'es'}</small></div><span>${members.map(member => `<i class="member-mini" title="${esc(member.name)}">${memberInitials(member.name)}</i>`).join('') || '—'}</span></div>`;
  }).join('') || '<p class="empty-state">Nenhum setor cadastrado.</p>';
  $('#memberList').innerHTML = management.members.map(member => {
    const department = depById(member.departmentId), role = roleById(member.roleId);
    return `<div class="member-row"><span class="member-avatar">${memberInitials(member.name)}<i class="presence ${member.online ? 'online' : ''}"></i></span><div><b>${esc(member.name)}</b><small>${esc(member.email)}</small></div><span class="member-sector">${esc(department?.name || member.department || 'Sem setor')}</span><span class="role-badge">${esc(role?.name || member.role || 'Sem privilégio')}</span></div>`;
  }).join('') || '<p class="empty-state">Nenhum colaborador cadastrado.</p>';
}

function renderAdmin() {
  const departmentOptions = management.departments.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('');
  const roleOptions = management.roles.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('');
  $('#memberDepartment').innerHTML = '<option value="">Sem setor</option>' + departmentOptions;
  $('#memberRole').innerHTML = '<option value="">Sem privilégio</option>' + roleOptions;
  $('#memberPassword').required = apiMode();
  $('#adminDepartmentList').innerHTML = management.departments.map(item => `<span class="admin-item"><i class="department-dot ${item.color}"></i>${esc(item.name)}${can('organization:write') ? `<button data-remove-department="${item.id}" title="Excluir">×</button>` : ''}</span>`).join('');
  $('#roleList').innerHTML = management.roles.map(item => {
    const permissions = (item.permissions || []).map(permission => permissionLabels[permission] || permission).join(', ') || 'Sem permissões administrativas';
    return `<div class="role-item"><b>${esc(item.name)}</b><small>${esc(item.description || '')}</small><small>${esc(permissions)}</small>${can('roles:write') ? `<button data-remove-role="${item.id}" title="Excluir">×</button>` : ''}</div>`;
  }).join('');
  $('#adminTagList').innerHTML = management.tags.map(tag => `<span class="tag">${esc(tag.name)} ${can('organization:write') ? `<button data-remove-tag="${tag.id}" title="Excluir">×</button>` : ''}</span>`).join('');
  setFormEnabled($('#departmentForm'), can('organization:write'));
  setFormEnabled($('#tagForm'), can('organization:write'));
  setFormEnabled($('#memberForm'), can('members:write'));
  setFormEnabled($('#roleForm'), can('roles:write'));
}

function renderManagement() { renderMeta(); renderOrganization(); renderAdmin(); }

async function loadApiManagement() {
  if (!apiMode() || !window.FluxoApi?.getSession()) return;
  setManagementState('Sincronizando API…');
  try {
    const [departments, members, roles, tags, meta] = await Promise.all([
      FluxoApi.request('/departments'),
      can('members:write') ? FluxoApi.request('/members') : Promise.resolve([]),
      can('roles:write') ? FluxoApi.request('/roles') : Promise.resolve([]),
      FluxoApi.request('/tags'),
      can('integrations:write')
        ? FluxoApi.request('/integrations/meta')
        : Promise.resolve({ status: 'restricted' })
    ]);
    management = {
      departments,
      members,
      roles,
      tags,
      meta: {
        appId: meta.app_id || '', businessId: meta.business_id || '', phoneId: meta.phone_number_id || '',
        wabaId: meta.waba_id || '', status: meta.status || 'not_configured'
      }
    };
    setManagementState('API sincronizada', true);
    renderManagement();
  } catch (error) {
    management = emptyManagement();
    setManagementState('Falha na API');
    renderManagement();
    actionError(error, 'Não foi possível carregar a organização.');
  }
}

$('#saveMetaConfig').onclick = async () => {
  const payload = {
    appId: $('#metaAppId').value.trim(), businessId: $('#metaBusinessId').value.trim(),
    phoneNumberId: $('#metaPhoneId').value.trim(), wabaId: $('#metaWabaId').value.trim(),
    accessToken: $('#metaAccessToken').value, appSecret: $('#metaAppSecret').value
  };
  try {
    if (apiMode()) {
      const result = await FluxoApi.request('/integrations/meta', { method: 'PUT', body: payload });
      management.meta = { appId: result.app_id || '', businessId: result.business_id || '', phoneId: result.phone_number_id || '', wabaId: result.waba_id || '', status: result.status };
    } else {
      management.meta = { appId: payload.appId, businessId: payload.businessId, phoneId: payload.phoneNumberId, wabaId: payload.wabaId, status: 'demo' };
      saveManagement();
    }
    $('#metaAccessToken').value = '';
    $('#metaAppSecret').value = '';
    renderMeta();
    toast('✓', 'Configuração salva', apiMode() ? 'Segredos enviados ao backend e identificadores sincronizados.' : 'Somente identificadores foram salvos neste navegador.', 'gold');
  } catch (error) { actionError(error, 'Não foi possível salvar a integração.'); }
};

$('#testMetaConfig').onclick = () => {
  const ids = [$('#metaAppId').value, $('#metaBusinessId').value, $('#metaPhoneId').value];
  if (ids.some(value => !value.trim())) return toast('⚠️', 'Dados incompletos', 'Informe App ID, Business Manager ID e Phone Number ID.', 'coral');
  toast('🛠️', 'Validação ainda preparatória', 'O backend armazena a configuração, mas ainda não consulta a API da Meta.', 'gold');
};

$('#departmentForm').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('#departmentName'), name = input.value.trim();
  if (!name) return;
  try {
    const department = apiMode()
      ? await FluxoApi.request('/departments', { method: 'POST', body: { name, color: ['jade', 'sky', 'gold', 'coral'][management.departments.length % 4] } })
      : { id: managementId('dep'), name, color: ['jade', 'sky', 'gold', 'coral'][management.departments.length % 4] };
    management.departments.push(department);
    input.value = '';
    saveManagement(); renderOrganization(); renderAdmin();
    toast('✓', 'Setor criado', `${name} foi adicionado à organização.`);
  } catch (error) { actionError(error, 'Não foi possível criar o setor.'); }
});

$('#memberForm').addEventListener('submit', async event => {
  event.preventDefault();
  const name = $('#memberName').value.trim(), memberEmail = $('#memberEmail').value.trim();
  if (!name || !memberEmail) return;
  const payload = { name, email: memberEmail, password: $('#memberPassword').value, departmentId: $('#memberDepartment').value || null, roleId: $('#memberRole').value || null };
  try {
    const member = apiMode()
      ? await FluxoApi.request('/members', { method: 'POST', body: payload })
      : { id: managementId('member'), name, email: memberEmail, departmentId: payload.departmentId, roleId: payload.roleId, online: false };
    management.members.push(member);
    event.target.reset();
    saveManagement(); renderOrganization(); renderAdmin();
    toast('✓', 'Colaborador cadastrado', `${name} entrou na organização.`);
  } catch (error) { actionError(error, 'Não foi possível cadastrar o colaborador.'); }
});

$('#roleForm').addEventListener('submit', async event => {
  event.preventDefault();
  const name = $('#roleName').value.trim();
  if (!name) return;
  const payload = {
    name,
    description: $('#roleDescription').value.trim(),
    permissions: $$('input[name="rolePermission"]:checked').map(input => input.value)
  };
  try {
    const role = apiMode()
      ? await FluxoApi.request('/roles', { method: 'POST', body: payload })
      : { id: managementId('role'), ...payload };
    management.roles.push(role);
    event.target.reset();
    saveManagement(); renderOrganization(); renderAdmin();
    toast('✓', 'Privilégio criado', `${name} está disponível para a equipe.`);
  } catch (error) { actionError(error, 'Não foi possível criar o privilégio.'); }
});

$('#tagForm').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('#adminTagName'), name = input.value.trim();
  if (!name || management.tags.some(tag => tag.name === name)) return;
  try {
    const tag = apiMode()
      ? await FluxoApi.request('/tags', { method: 'POST', body: { name, color: 'sky' } })
      : { id: managementId('tag'), name, color: 'sky' };
    management.tags.push(tag);
    input.value = '';
    saveManagement(); renderAdmin();
    toast('✓', 'Tag criada', `${name} foi adicionada.`);
  } catch (error) { actionError(error, 'Não foi possível criar a tag.'); }
});

$('#view-admin').addEventListener('click', async event => {
  const departmentButton = event.target.closest('[data-remove-department]');
  const roleButton = event.target.closest('[data-remove-role]');
  const tagButton = event.target.closest('[data-remove-tag]');
  if (!departmentButton && !roleButton && !tagButton) return;
  try {
    if (departmentButton) {
      const id = departmentButton.dataset.removeDepartment;
      if (!apiMode() && management.members.some(member => member.departmentId === id)) throw new Error('Mova os colaboradores antes de excluir este setor.');
      if (apiMode()) await FluxoApi.request(`/departments/${encodeURIComponent(id)}`, { method: 'DELETE' });
      management.departments = management.departments.filter(item => item.id !== id);
    }
    if (roleButton) {
      const id = roleButton.dataset.removeRole;
      if (!apiMode() && management.members.some(member => member.roleId === id)) throw new Error('Altere os colaboradores antes de excluir este privilégio.');
      if (apiMode()) await FluxoApi.request(`/roles/${encodeURIComponent(id)}`, { method: 'DELETE' });
      management.roles = management.roles.filter(item => item.id !== id);
    }
    if (tagButton) {
      const id = tagButton.dataset.removeTag;
      if (apiMode()) await FluxoApi.request(`/tags/${encodeURIComponent(id)}`, { method: 'DELETE' });
      management.tags = management.tags.filter(item => item.id !== id);
    }
    saveManagement(); renderOrganization(); renderAdmin();
  } catch (error) { actionError(error, 'Não foi possível excluir o registro.'); }
});

window.addEventListener('fluxo:session', event => {
  if (event.detail && apiMode()) loadApiManagement();
});

setManagementState(apiMode() ? 'Aguardando sessão' : 'Demonstração local', !apiMode());
renderManagement();
