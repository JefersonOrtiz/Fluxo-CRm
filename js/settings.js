(function initializeSettings(root) {
  const message = error => error?.code === 'RATE_LIMITED' ? error.message : (error?.message || 'Não foi possível salvar as configurações.');
  const load = async () => {
    if (root.FluxoRuntime?.mode !== 'api') return;
    const data = await root.FluxoApi.request('/settings');
    const profile = data.profile;
    document.querySelector('#settingsName').value = profile.name || '';
    document.querySelector('#settingsEmail').value = profile.email || '';
    document.querySelector('#settingsOrganizationName').value = profile.organizationName || '';
    const canEdit = Boolean(data.canEditOrganization);
    document.querySelector('#settingsOrganizationName').readOnly = !canEdit;
    document.querySelector('#saveOrganizationSettings').hidden = !canEdit;
    document.querySelector('#organizationSettingsHelp').textContent = canEdit ? 'Você pode editar os dados da organização.' : 'Somente usuários autorizados podem alterar a organização.';
  };
  document.querySelector('#profileSettingsForm').addEventListener('submit', async event => { event.preventDefault(); try { await root.FluxoApi.request('/settings/profile', { method: 'PATCH', body: { name: document.querySelector('#settingsName').value } }); const session = await root.FluxoApi.me(); root.toast?.('✅', 'Perfil atualizado', 'Seu nome foi atualizado.', 'gold'); window.dispatchEvent(new CustomEvent('fluxo:session', { detail: session })); } catch (error) { root.toast?.('⚠️', 'Perfil', message(error), 'coral'); } });
  document.querySelector('#passwordSettingsForm').addEventListener('submit', async event => { event.preventDefault(); const next = document.querySelector('#newPassword').value; if (next !== document.querySelector('#confirmPassword').value) return root.toast?.('⚠️', 'Senha', 'As novas senhas não coincidem.', 'coral'); try { await root.FluxoApi.request('/settings/password', { method: 'PATCH', body: { currentPassword: document.querySelector('#currentPassword').value, newPassword: next } }); root.FluxoApi.clearSession(); root.dispatchEvent(new CustomEvent('fluxo:unauthorized')); root.toast?.('✅', 'Senha alterada', 'Entre novamente para continuar.', 'gold'); } catch (error) { root.toast?.('⚠️', 'Senha', message(error), 'coral'); } });
  document.querySelector('#organizationSettingsForm').addEventListener('submit', async event => { event.preventDefault(); try { await root.FluxoApi.request('/organization', { method: 'PATCH', body: { name: document.querySelector('#settingsOrganizationName').value } }); root.toast?.('✅', 'Organização atualizada', 'Os dados foram salvos.', 'gold'); await load(); } catch (error) { root.toast?.('⚠️', 'Organização', message(error), 'coral'); } });
  root.addEventListener('fluxo:settings', event => load().then(() => { const target = event.detail?.section === 'security' ? '#newPassword' : '#settingsName'; document.querySelector(target)?.focus(); }).catch(error => root.toast?.('⚠️', 'Configurações', message(error), 'coral')));
})(window);
