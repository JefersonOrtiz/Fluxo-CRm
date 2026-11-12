(function initializeNavigation(root) {
  const shell = document.querySelector('#appShell');
  const rail = document.querySelector('.rail');
  if (!shell || !rail) return;
  document.querySelector('#mobileNavToggle')?.addEventListener('click', () => shell.classList.toggle('mobile-nav-open'));
  const toggle = document.createElement('button');
  toggle.className = 'rail-btn';
  toggle.type = 'button';
  toggle.title = 'Recolher menu';
  toggle.setAttribute('aria-label', toggle.title);
  toggle.innerHTML = '<span aria-hidden="true">☰</span><span class="tip">Recolher menu</span>';
  rail.insertBefore(toggle, rail.firstElementChild?.nextElementSibling || rail.firstChild);
  toggle.addEventListener('click', () => {
    const collapsed = !shell.classList.contains('sidebar-collapsed');
    shell.classList.toggle('sidebar-collapsed', collapsed);
    toggle.title = collapsed ? 'Expandir menu' : 'Recolher menu';
    toggle.setAttribute('aria-label', toggle.title);
    toggle.querySelector('.tip').textContent = toggle.title;
  });
  const profileMenu = document.querySelector('#profileMenu');
  const profileButton = document.querySelector('#railUser');
  const closeProfileMenu = () => { profileMenu.hidden = true; profileButton.setAttribute('aria-expanded', 'false'); };
  const positionProfileMenu = () => {
    profileMenu.style.width = '';
    profileMenu.style.left = '';
    profileMenu.style.right = '';
    profileMenu.style.top = '';
    profileMenu.style.bottom = '';
  };
  profileButton.addEventListener('click', event => { event.stopPropagation(); profileMenu.hidden = !profileMenu.hidden; if (!profileMenu.hidden) positionProfileMenu(); profileButton.setAttribute('aria-expanded', String(!profileMenu.hidden)); });
  window.addEventListener('resize', () => { if (!profileMenu.hidden) positionProfileMenu(); });
  profileMenu.addEventListener('click', event => {
    const item = event.target.closest('[data-settings-section]');
    if (!item) return;
    closeProfileMenu();
    window.switchView?.('settings');
    root.dispatchEvent(new CustomEvent('fluxo:settings', { detail: { section: item.dataset.settingsSection } }));
  });
  document.querySelector('#profileLogout')?.addEventListener('click', () => { closeProfileMenu(); document.querySelector('#logoutBtn')?.click(); });
  document.addEventListener('click', event => { if (!event.target.closest('.profile-menu-wrap')) closeProfileMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeProfileMenu(); });
  const headings = new Map([['chat', 'Operação'], ['contacts', 'Operação'], ['dashboard', 'Operação'], ['kanban', 'Operação'], ['calendar', 'Sistema'], ['ai', 'Operação'], ['integrations', 'Sistema'], ['organization', 'Gestão'], ['admin', 'Gestão'], ['settings', 'Gestão']]);
  const seen = new Set();
  rail.querySelectorAll('.rail-btn[data-view]').forEach(button => {
    const group = headings.get(button.dataset.view);
    if (group && !seen.has(group)) {
      const label = document.createElement('small');
      label.className = 'rail-section-label';
      label.textContent = group;
      rail.insertBefore(label, button);
      seen.add(group);
    }
  });
  root.addEventListener('fluxo:session', event => {
    const user = event.detail?.user;
    if (user?.name) document.querySelector('#railUser')?.setAttribute('title', `${user.name} · perfil`);
    if (user?.name) document.querySelector('#profileMenuName').textContent = user.name;
  });
})(window);
