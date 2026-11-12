(function exposeNavigationPolicy(root) {
  const adminPermissions = Object.freeze(['organization:write', 'members:write', 'roles:write']);
  const readOnlyViews = Object.freeze(['dashboard', 'chat', 'contacts', 'kanban', 'calendar', 'ai', 'integrations', 'organization', 'settings']);
  function canAccessView(view, session, mode = 'demo') {
    if (mode !== 'api') return true;
    if (view === 'admin') {
      const permissions = session?.user?.permissions;
      return Array.isArray(permissions) && (permissions.includes('*') || adminPermissions.some(permission => permissions.includes(permission)));
    }
    return readOnlyViews.includes(view);
  }
  root.FluxoNavigationPolicy = Object.freeze({ canAccessView, adminPermissions });
})(typeof window === 'undefined' ? globalThis : window);
