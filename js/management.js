/* Organização, administração e configurações não sensíveis da Meta. */
const MANAGEMENT_KEY = 'fluxo-crm:management:v1';
const defaultManagement = {
  meta: { appId: '', businessId: '', phoneId: '', wabaId: '' },
  departments: [
    { id: 'dep-sales', name: 'Comercial', color: 'jade' },
    { id: 'dep-service', name: 'Atendimento', color: 'sky' },
    { id: 'dep-success', name: 'Sucesso do Cliente', color: 'gold' }
  ],
  roles: [
    { id: 'role-admin', name: 'Administrador', description: 'Acesso total à empresa' },
    { id: 'role-manager', name: 'Gestor', description: 'Gerencia setor e clientes' },
    { id: 'role-agent', name: 'Atendente', description: 'Atende conversas atribuídas' }
  ],
  members: [
    { id: 'mem-1', name: 'Marina Duarte', email: 'marina@fluxo.com', departmentId: 'dep-sales', roleId: 'role-admin', online: true },
    { id: 'mem-2', name: 'Pedro Lima', email: 'pedro@fluxo.com', departmentId: 'dep-service', roleId: 'role-agent', online: true },
    { id: 'mem-3', name: 'Luiza Costa', email: 'luiza@fluxo.com', departmentId: 'dep-success', roleId: 'role-manager', online: false }
  ],
  tags: ['quente', 'follow-up', 'cliente VIP', 'onboarding'],
  statuses: [...STAGES]
};

let management = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(MANAGEMENT_KEY));
    return saved && saved.departments && saved.members ? { ...structuredClone(defaultManagement), ...saved } : structuredClone(defaultManagement);
  } catch { return structuredClone(defaultManagement); }
})();
const saveManagement = () => localStorage.setItem(MANAGEMENT_KEY, JSON.stringify(management));
const managementId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
const depById = id => management.departments.find(item => item.id === id);
const roleById = id => management.roles.find(item => item.id === id);
const memberInitials = name => name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();
STAGES.splice(0, STAGES.length, ...new Set([...management.statuses, ...contacts.map(contact => contact.stage)]));
function syncStatusColors() {
  const colors = ['sky', 'gold', 'coral', 'jade'];
  STAGES.forEach((status, index) => {
    SCOLOR[status] ||= `var(--${colors[index % colors.length]})`;
    STBG[status] ||= `var(--${colors[index % colors.length]}-t)`;
  });
}
syncStatusColors();

function renderMeta() {
  const m = management.meta;
  $('#metaAppId').value = m.appId || '';
  $('#metaBusinessId').value = m.businessId || '';
  $('#metaPhoneId').value = m.phoneId || '';
  $('#metaWabaId').value = m.wabaId || '';
  const ready = m.appId && m.businessId && m.phoneId;
  $('#metaState').textContent = ready ? 'Configuração pendente de backend' : 'Não conectado';
  $('#metaState').classList.toggle('ready', !!ready);
  $('#webhookUrl').textContent = `${location.origin}/api/webhooks/meta`;
}

function renderOrganization() {
  $('#orgMemberCount').textContent = management.members.length;
  $('#departmentList').innerHTML = management.departments.map(department => {
    const members = management.members.filter(member => member.departmentId === department.id);
    return `<div class="department-card"><span class="department-dot ${department.color}"></span><div><b>${esc(department.name)}</b><small>${members.length} usuário${members.length === 1 ? '' : 's'}</small></div><span>${members.map(member => `<i class="member-mini" title="${esc(member.name)}">${esc(memberInitials(member.name))}</i>`).join('') || '—'}</span></div>`;
  }).join('') || '<p class="empty-state">Nenhum departamento cadastrado.</p>';
  $('#memberList').innerHTML = management.members.map(member => {
    const department = depById(member.departmentId), role = roleById(member.roleId);
    return `<div class="member-row"><span class="member-avatar">${esc(memberInitials(member.name))}<i class="presence ${member.online ? 'online' : ''}"></i></span><div><b>${esc(member.name)}</b><small>${esc(member.email)}</small></div><span class="member-sector">${esc(department?.name || 'Sem departamento')}</span><span class="role-badge">${esc(role?.name || 'Sem função')}</span></div>`;
  }).join('') || '<p class="empty-state">Nenhum usuário cadastrado.</p>';
}

function renderAdmin() {
  const departmentOptions = management.departments.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('');
  const roleOptions = management.roles.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('');
  $('#memberDepartment').innerHTML = departmentOptions || '<option value="">Sem departamento</option>';
  $('#memberRole').innerHTML = roleOptions || '<option value="">Sem função</option>';
  $('#adminDepartmentList').innerHTML = management.departments.map(item => `<span class="admin-item"><i class="department-dot ${item.color}"></i>${esc(item.name)}<button data-remove-department="${item.id}" title="Excluir">×</button></span>`).join('');
  $('#roleList').innerHTML = management.roles.map(item => `<div class="role-item"><b>${esc(item.name)}</b><small>${esc(item.description)}</small><button data-remove-role="${item.id}" title="Excluir">×</button></div>`).join('');
  $('#adminTagList').innerHTML = management.tags.map((tag, index) => `<span class="tag">${esc(tag)} <button data-remove-tag="${index}" title="Excluir">×</button></span>`).join('');
  $('#statusList').innerHTML = STAGES.map((status, index) => `<div class="status-row"><i class="department-dot" style="background:${SCOLOR[status]}"></i><b>${esc(status)}</b><small>${contacts.filter(contact => contact.stage === status).length} clientes</small><button type="button" data-remove-status="${index}" aria-label="Excluir status ${esc(status)}">×</button></div>`).join('');
}

function renderManagement() { renderMeta(); renderOrganization(); renderAdmin(); }

$('#saveMetaConfig').onclick = () => {
  management.meta = { appId: $('#metaAppId').value.trim(), businessId: $('#metaBusinessId').value.trim(), phoneId: $('#metaPhoneId').value.trim(), wabaId: $('#metaWabaId').value.trim() };
  saveManagement(); renderMeta();
  toast('✓', 'Identificadores salvos', 'Tokens e App Secret não foram armazenados no navegador.', 'gold');
};
$('#testMetaConfig').onclick = () => {
  const ids = [$('#metaAppId').value, $('#metaBusinessId').value, $('#metaPhoneId').value];
  if (ids.some(value => !value.trim())) return toast('⚠️', 'Dados incompletos', 'Informe App ID, Business Manager ID e Phone Number ID.', 'coral');
  toast('🔒', 'Backend necessário', 'A validação real do token deve ocorrer no servidor seguro.', 'gold');
};

$('#departmentForm').addEventListener('submit', event => {
  event.preventDefault(); const input = $('#departmentName'), name = input.value.trim(); if (!name) return;
  management.departments.push({ id: managementId('dep'), name, color: ['jade', 'sky', 'gold', 'coral'][management.departments.length % 4] });
  input.value = ''; saveManagement(); renderOrganization(); renderAdmin(); toast('✓', 'Departamento criado', `${name} foi adicionado à organização.`);
});
$('#memberForm').addEventListener('submit', event => {
  event.preventDefault(); const name = $('#memberName').value.trim(), email = $('#memberEmail').value.trim();
  if (!name || !email) return;
  if (management.members.some(member => member.email.toLowerCase() === email.toLowerCase())) return toast('⚠️', 'E-mail já cadastrado', 'Este e-mail já pertence a um usuário.', 'coral');
  management.members.push({ id: managementId('member'), name, email, departmentId: $('#memberDepartment').value, roleId: $('#memberRole').value, online: false });
  event.target.reset(); saveManagement(); renderOrganization(); renderAdmin(); toast('✓', 'Usuário cadastrado', `${name} entrou na equipe.`);
});
$('#roleForm').addEventListener('submit', event => {
  event.preventDefault(); const input = $('#roleName'), name = input.value.trim(); if (!name) return;
  management.roles.push({ id: managementId('role'), name, description: $('#roleDescription').value.trim() || 'Função personalizada' }); event.target.reset();
  saveManagement(); renderOrganization(); renderAdmin(); toast('✓', 'Função criada', `${name} está disponível para a equipe.`);
});
$('#tagForm').addEventListener('submit', event => {
  event.preventDefault(); const input = $('#adminTagName'), name = input.value.trim(); if (!name || management.tags.includes(name)) return;
  management.tags.push(name); input.value = ''; saveManagement(); renderAdmin(); toast('✓', 'Tag criada', `${name} foi adicionada.`);
});
$('#statusForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#statusName'), name = input.value.trim();
  if (!name) return;
  if (STAGES.some(status => status.toLowerCase() === name.toLowerCase())) return toast('⚠️', 'Status já cadastrado', 'Escolha outro nome.', 'coral');
  STAGES.push(name); management.statuses = [...STAGES]; syncStatusColors(); saveManagement(); renderAdmin();
  $('#stageSel').innerHTML = STAGES.map(status => `<option>${esc(status)}</option>`).join('');
  $('#stageSel').value = byId(activeId).stage;
  input.value = ''; renderKanban(); toast('✓', 'Status criado', name);
});
document.addEventListener('click', event => {
  const departmentButton = event.target.closest('[data-remove-department]');
  const roleButton = event.target.closest('[data-remove-role]');
  const tagButton = event.target.closest('[data-remove-tag]');
  const statusButton = event.target.closest('[data-remove-status]');
  if (departmentButton) { const id = departmentButton.dataset.removeDepartment; if (management.members.some(member => member.departmentId === id)) return toast('⚠️', 'Departamento em uso', 'Mova os usuários antes de excluir este departamento.', 'coral'); management.departments = management.departments.filter(item => item.id !== id); }
  if (roleButton) { const id = roleButton.dataset.removeRole; if (management.members.some(member => member.roleId === id)) return toast('⚠️', 'Função em uso', 'Altere a função dos usuários antes de excluir.', 'coral'); management.roles = management.roles.filter(item => item.id !== id); }
  if (tagButton) management.tags.splice(Number(tagButton.dataset.removeTag), 1);
  if (statusButton) {
    const index = Number(statusButton.dataset.removeStatus), status = STAGES[index];
    if (contacts.some(contact => contact.stage === status) || STAGES.length === 1) return toast('⚠️', 'Status em uso', 'Mova os clientes para outra etapa antes de excluir. Mantenha ao menos um status.', 'coral');
    STAGES.splice(index, 1); management.statuses = [...STAGES];
    $('#stageSel').innerHTML = STAGES.map(item => `<option>${esc(item)}</option>`).join('');
    $('#stageSel').value = byId(activeId).stage; renderKanban();
  }
  if (departmentButton || roleButton || tagButton || statusButton) { saveManagement(); renderOrganization(); renderAdmin(); }
});

renderManagement();
