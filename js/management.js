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
  tags: ['quente', 'follow-up', 'cliente VIP', 'onboarding']
};

let management = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(MANAGEMENT_KEY));
    return saved && saved.departments && saved.members ? saved : structuredClone(defaultManagement);
  } catch { return structuredClone(defaultManagement); }
})();
const saveManagement = () => localStorage.setItem(MANAGEMENT_KEY, JSON.stringify(management));
const managementId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
const depById = id => management.departments.find(item => item.id === id);
const roleById = id => management.roles.find(item => item.id === id);
const memberInitials = name => name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();

function renderMeta() {
  const m = management.meta;
  $('#metaAppId').value = m.appId || '';
  $('#metaBusinessId').value = m.businessId || '';
  $('#metaPhoneId').value = m.phoneId || '';
  $('#metaWabaId').value = m.wabaId || '';
  const ready = m.appId && m.businessId && m.phoneId;
  $('#metaState').textContent = ready ? 'Configuração pendente de backend' : 'Não conectado';
  $('#metaState').classList.toggle('ready', !!ready);
  $('#webhookUrl').textContent = `${location.origin}${location.pathname.replace(/\/$/, '')}/api/meta/webhook`;
}

function renderOrganization() {
  $('#orgMemberCount').textContent = management.members.length;
  $('#departmentList').innerHTML = management.departments.map(department => {
    const members = management.members.filter(member => member.departmentId === department.id);
    return `<div class="department-card"><span class="department-dot ${department.color}"></span><div><b>${esc(department.name)}</b><small>${members.length} colaborador${members.length === 1 ? '' : 'es'}</small></div><span>${members.map(member => `<i class="member-mini" title="${esc(member.name)}">${memberInitials(member.name)}</i>`).join('') || '—'}</span></div>`;
  }).join('');
  $('#memberList').innerHTML = management.members.map(member => {
    const department = depById(member.departmentId), role = roleById(member.roleId);
    return `<div class="member-row"><span class="member-avatar">${memberInitials(member.name)}<i class="presence ${member.online ? 'online' : ''}"></i></span><div><b>${esc(member.name)}</b><small>${esc(member.email)}</small></div><span class="member-sector">${esc(department?.name || 'Sem setor')}</span><span class="role-badge">${esc(role?.name || 'Sem privilégio')}</span></div>`;
  }).join('') || '<p class="empty-state">Nenhum colaborador cadastrado.</p>';
}

function renderAdmin() {
  const departmentOptions = management.departments.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('');
  const roleOptions = management.roles.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('');
  $('#memberDepartment').innerHTML = departmentOptions || '<option value="">Crie um setor primeiro</option>';
  $('#memberRole').innerHTML = roleOptions || '<option value="">Crie um privilégio primeiro</option>';
  $('#adminDepartmentList').innerHTML = management.departments.map(item => `<span class="admin-item"><i class="department-dot ${item.color}"></i>${esc(item.name)}<button data-remove-department="${item.id}" title="Excluir">×</button></span>`).join('');
  $('#roleList').innerHTML = management.roles.map(item => `<div class="role-item"><b>${esc(item.name)}</b><small>${esc(item.description)}</small><button data-remove-role="${item.id}" title="Excluir">×</button></div>`).join('');
  $('#adminTagList').innerHTML = management.tags.map((tag, index) => `<span class="tag">${esc(tag)} <button data-remove-tag="${index}" title="Excluir">×</button></span>`).join('');
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
  input.value = ''; saveManagement(); renderOrganization(); renderAdmin(); toast('✓', 'Setor criado', `${name} foi adicionado à organização.`);
});
$('#memberForm').addEventListener('submit', event => {
  event.preventDefault(); const name = $('#memberName').value.trim(), email = $('#memberEmail').value.trim();
  if (!name || !email) return;
  management.members.push({ id: managementId('member'), name, email, departmentId: $('#memberDepartment').value, roleId: $('#memberRole').value, online: false });
  event.target.reset(); saveManagement(); renderOrganization(); renderAdmin(); toast('✓', 'Colaborador cadastrado', `${name} entrou na organização.`);
});
$('#roleForm').addEventListener('submit', event => {
  event.preventDefault(); const input = $('#roleName'), name = input.value.trim(); if (!name) return;
  management.roles.push({ id: managementId('role'), name, description: 'Privilégio personalizado' }); input.value = '';
  saveManagement(); renderOrganization(); renderAdmin(); toast('✓', 'Privilégio criado', `${name} está disponível para a equipe.`);
});
$('#tagForm').addEventListener('submit', event => {
  event.preventDefault(); const input = $('#adminTagName'), name = input.value.trim(); if (!name || management.tags.includes(name)) return;
  management.tags.push(name); input.value = ''; saveManagement(); renderAdmin(); toast('✓', 'Tag criada', `${name} foi adicionada.`);
});
$('#view-admin').addEventListener('click', event => {
  const departmentButton = event.target.closest('[data-remove-department]');
  const roleButton = event.target.closest('[data-remove-role]');
  const tagButton = event.target.closest('[data-remove-tag]');
  if (departmentButton) { const id = departmentButton.dataset.removeDepartment; if (management.members.some(member => member.departmentId === id)) return toast('⚠️', 'Setor em uso', 'Mova os colaboradores antes de excluir este setor.', 'coral'); management.departments = management.departments.filter(item => item.id !== id); }
  if (roleButton) { const id = roleButton.dataset.removeRole; if (management.members.some(member => member.roleId === id)) return toast('⚠️', 'Privilégio em uso', 'Altere os colaboradores antes de excluir.', 'coral'); management.roles = management.roles.filter(item => item.id !== id); }
  if (tagButton) management.tags.splice(Number(tagButton.dataset.removeTag), 1);
  if (departmentButton || roleButton || tagButton) { saveManagement(); renderOrganization(); renderAdmin(); }
});

renderManagement();
