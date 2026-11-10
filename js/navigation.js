/* Navegação e estado visual do menu. */
const NAVIGATION_KEY = 'fluxo-crm:navigation:v1';
const navIcons = {
  chat: '<path d="M21 15a3 3 0 0 1-3 3H7l-4 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/>',
  clients: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-3-5"/>',
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  ai: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z"/>',
  plug: '<path d="m12 5 7 7M14 3l-3 3M21 10l-3 3M10 7l-3 3a5 5 0 0 0 7 7l3-3M8 16l-2 2a3 3 0 0 1-4-4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  connections: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M6 9v6a3 3 0 0 0 3 3h6M15 6h3v3"/>',
  workflows: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M6 9v6a3 3 0 0 0 3 3h6M9 6h6a3 3 0 0 1 3 3v6"/>',
  templates: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h3"/>',
  settings: '<path d="m12 3 2 2 3 .5.5 3 2 2-2 2-.5 3-3 .5-2 2-2-2-3-.5-.5-3-2-2 2-2 .5-3 3-.5z"/><circle cx="12" cy="11.5" r="3"/>',
  tags: '<path d="m20 13-7 7a2 2 0 0 1-3 0l-7-7V3h10l7 7a2 2 0 0 1 0 3z"/><circle cx="7.5" cy="7.5" r="1"/>',
  departments: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  roles: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9M17 17l3-3M14 14l3-3"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  subscription: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4M12 17h.01"/>',
  support: '<path d="M4 14v-3a8 8 0 0 1 16 0v3M20 17v1a3 3 0 0 1-3 3h-3"/><rect x="2" y="11" width="5" height="8" rx="2"/><rect x="17" y="11" width="5" height="8" rx="2"/>',
  wallet: '<path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v12H6a3 3 0 0 1-3-3V6M20 12h-5v5h5M17 14.5h.01"/>',
  wrench: '<path d="M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4z"/>',
  bulk: '<path d="m3 11 18-6v14L3 13zM7 14l2 7h4l-2-6M21 10h2"/>',
  orders: '<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6M9 15h6"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M14 9l3 3-3 3"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM9 12l2 2 4-4"/>'
};
const navIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${navIcons[name] || navIcons.templates}</svg>`;
const navigation = [
  { label: 'Operação', items: [
    { label: 'Conversas', view: 'chat', icon: 'chat' },
    { label: 'Clientes', id: 'clients', icon: 'clients', children: [
      { label: 'Base de Clientes', view: 'contacts', icon: 'clients' },
      { label: 'Envio em Massa', view: 'bulk', icon: 'bulk' },
      { label: 'Ordens de Serviço', view: 'orders', icon: 'orders' }
    ] },
    { label: 'Dashboard', view: 'dashboard', icon: 'dashboard' },
    { label: 'Fluxo de Atendimento', view: 'kanban', icon: 'kanban' },
    { label: 'Aurora IA', view: 'ai', icon: 'ai' }
  ] },
  { label: 'Sistema', items: [
    { label: 'Integrações', id: 'integrations', icon: 'plug', children: [
      { label: 'Meta API Cloud', view: 'integrations', icon: 'plug' },
      { label: 'Calendário', view: 'calendar', icon: 'calendar' }
    ] },
    { label: 'Conexões', id: 'connections', icon: 'connections', children: [
      { label: 'IA e Gateway', view: 'connections', icon: 'ai' },
      { label: 'Workflows', view: 'workflows', icon: 'workflows' },
      { label: 'Templates', view: 'templates', icon: 'templates' }
    ] }
  ] },
  { label: 'Gestão', items: [
    { label: 'Configurações', id: 'settings', icon: 'settings', children: [
      { label: 'Status e Tags', view: 'settings', icon: 'tags' }
    ] },
    { label: 'Equipe', id: 'team', icon: 'clients', children: [
      { label: 'Usuários', view: 'members', icon: 'account' },
      { label: 'Departamentos', view: 'departments', icon: 'departments' },
      { label: 'Funções', view: 'roles', icon: 'roles' }
    ] },
    { label: 'Assinatura', view: 'subscription', icon: 'subscription' }
  ] },
  { label: 'Suporte', items: [
    { label: 'Suporte', view: 'support', icon: 'support' },
    { label: 'Ajuda', view: 'help', icon: 'help' }
  ] }
];
let navigationState;
try { navigationState = JSON.parse(localStorage.getItem(NAVIGATION_KEY)) || {}; } catch { navigationState = {}; }
navigationState = { collapsed: false, groups: { clients: true }, ...navigationState };
const saveNavigation = () => localStorage.setItem(NAVIGATION_KEY, JSON.stringify(navigationState));
const navButton = (item, child = false) => `<button type="button" class="nav-item ${child ? 'nav-child' : ''}" data-view="${item.view}" title="${item.label}">${navIcon(item.icon)}<span class="nav-label">${item.label}</span>${item.view === 'chat' ? '<span class="rbadge" id="railBadge">3</span>' : ''}</button>`;
$('#sidebar').innerHTML = `
  <div class="sidebar-head"><div class="brand" title="JF System CRM"><span class="logo"><img src="assets/jf-system-crm-icon.webp" alt="JF System CRM" width="38" height="38" decoding="async"></span><div class="brand-copy" aria-hidden="true"><b>JF System<span> CRM</span></b><small>Seu atendimento flui.</small></div></div><button type="button" class="icon-btn sidebar-toggle" id="sidebarToggle" aria-controls="navContent" title="Recolher menu">${navIcon('panel')}</button></div>
  <div class="sidebar-scroll" id="navContent">${navigation.filter(section => section.label !== 'Suporte').map(section => `<section class="nav-section" aria-label="${section.label}"><h2 class="nav-section-title">${section.label}</h2>${section.items.map(item => item.children ? `<div class="nav-group" data-group="${item.id}"><button type="button" class="nav-item nav-parent" data-toggle-group="${item.id}" aria-expanded="false" aria-controls="nav-${item.id}" title="${item.label}">${navIcon(item.icon)}<span class="nav-label">${item.label}</span><span class="nav-chevron">${navIcon('chevron')}</span></button><div class="nav-children" id="nav-${item.id}" hidden>${item.children.map(child => navButton(child, true)).join('')}</div></div>` : navButton(item)).join('')}</section>`).join('')}</div>
  <div class="sidebar-support"><section class="nav-section" aria-label="Suporte">${navigation.find(section => section.label === 'Suporte').items.map(item => navButton(item)).join('')}</section></div>
  <div class="sidebar-footer"><div class="user-popover" id="userPopover" hidden><div class="user-popover-head"><b id="popoverUserName">Marina Duarte</b><small>Perfil e preferências</small></div><button type="button" data-view="profile">${navIcon('account')}Meus Dados</button><button type="button" data-user-action="hours">${navIcon('clock')}Horário de funcionamento</button><button type="button" data-user-action="privacy">${navIcon('shield')}Política de Privacidade</button></div><button type="button" class="user-profile" id="userMenuButton" aria-expanded="false" aria-controls="userPopover" title="Menu do usuário"><span class="rail-user" id="railUser">MD<i></i></span><span class="user-copy"><b id="sidebarUserName">Marina Duarte</b><small>Usuário · <span id="sidebarUserRole">Administrador</span></small></span><span class="user-chevron">${navIcon('chevron')}</span></button></div>`;

function applyNavigationState() {
  $('.app').classList.toggle('sidebar-collapsed', navigationState.collapsed);
  const toggle = $('#sidebarToggle');
  toggle.setAttribute('aria-expanded', String(!navigationState.collapsed));
  toggle.title = navigationState.collapsed ? 'Expandir menu' : 'Recolher menu';
  toggle.setAttribute('aria-label', toggle.title);
  $$('.nav-group').forEach(group => {
    const open = !!navigationState.groups[group.dataset.group];
    group.classList.toggle('open', open);
    group.querySelector('.nav-parent').setAttribute('aria-expanded', String(open));
    group.querySelector('.nav-children').hidden = !open;
  });
}
function closeMobileNavigation() {
  $('.app').classList.remove('mobile-nav-open');
  $('#sidebarBackdrop').hidden = true;
  $('#mobileNavToggle').setAttribute('aria-expanded', 'false');
}
function closeUserMenu() { $('#userPopover').hidden = true; $('#userMenuButton').setAttribute('aria-expanded', 'false'); }

function switchView(view, replace = false) {
  view = ({ organization: 'members', admin: 'settings' })[view] || view;
  const target = document.getElementById('view-' + view);
  if (!target) return;
  activeView = view;
  navigationState.collapsed = view === 'chat';
  $$('.view').forEach(section => section.classList.toggle('active', section === target));
  $$('#sidebar [data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  $('#userMenuButton').classList.toggle('active', view === 'profile');
  $$('.nav-group').forEach(group => {
    const active = !!group.querySelector('.nav-child.active');
    group.querySelector('.nav-parent').classList.toggle('has-active', active);
    if (active) navigationState.groups[group.dataset.group] = true;
  });
  applyNavigationState(); saveNavigation(); closeUserMenu(); closeMobileNavigation();
  if (location.hash !== '#' + view) history[replace ? 'replaceState' : 'pushState'](null, '', '#' + view);
  const label = view === 'profile' ? 'Meus Dados' : navigation.flatMap(section => section.items.flatMap(item => item.children || [item])).find(item => item.view === view)?.label;
  document.title = `${label || 'CRM'} · JF System CRM`;
  if (view === 'chat') scrollBottom();
  if (view === 'dashboard') runCounters();
  if (view === 'kanban') renderKanban();
  if (view === 'calendar') renderCalendar();
  if (view === 'contacts') renderContacts();
  renderManagement();
  renderWorkspace(view);
}

$('#sidebarToggle').onclick = () => {
  if (matchMedia('(max-width: 700px)').matches) { closeMobileNavigation(); return; }
  navigationState.collapsed = !navigationState.collapsed; closeUserMenu(); applyNavigationState(); saveNavigation();
};
$('#sidebar').addEventListener('click', event => {
  const toggle = event.target.closest('[data-toggle-group]');
  if (toggle) {
    const id = toggle.dataset.toggleGroup;
    const wasCollapsed = navigationState.collapsed;
    navigationState.collapsed = false;
    navigationState.groups[id] = wasCollapsed || !navigationState.groups[id];
    applyNavigationState(); saveNavigation();
  }
  const destination = event.target.closest('[data-view]');
  if (destination) switchView(destination.dataset.view);
  const action = event.target.closest('[data-user-action]');
  if (action) {
    const hours = action.dataset.userAction === 'hours';
    switchView(hours ? 'profile' : 'help');
    const element = $(hours ? '#businessHours' : '#privacyHelp');
    if (!hours) element.open = true;
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
});
$('#userMenuButton').onclick = () => {
  const open = $('#userPopover').hidden;
  $('#userPopover').hidden = !open; $('#userMenuButton').setAttribute('aria-expanded', String(open));
};
$('#mobileNavToggle').onclick = () => {
  const open = !$('.app').classList.contains('mobile-nav-open');
  $('.app').classList.toggle('mobile-nav-open', open); $('#sidebarBackdrop').hidden = !open;
  $('#mobileNavToggle').setAttribute('aria-expanded', String(open));
};
$('#sidebarBackdrop').onclick = closeMobileNavigation;
document.addEventListener('click', event => { if (!event.target.closest('.sidebar-footer')) closeUserMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeUserMenu(); closeMobileNavigation(); } });
window.addEventListener('popstate', () => switchView(location.hash.slice(1) || 'dashboard', true));
applyNavigationState();
