/* ═══════ CONFIGURAÇÃO DA AURORA ═══════ */
(function configureAurora(root) {
  const apiMode = () => root.FLUXO_CONFIG?.mode === 'api';
  const can = permission => {
    const permissions = root.FluxoApi?.getSession()?.user?.permissions || [];
    return permissions.includes('*') || permissions.includes(permission);
  };
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const status = (text, tone = '') => {
    const element = document.querySelector('#auroraSettingsStatus');
    if (element) { element.textContent = text; element.dataset.tone = tone; }
  };
  const toneNames = { formal: 'Formal', amigavel: 'Amigável', descontraido: 'Descontraído' };
  const selectedTone = () => ({ Formal: 'formal', Amigável: 'amigavel', Descontraído: 'descontraido' }[[...document.querySelectorAll('[data-tone]')].find(button => button.classList.contains('on'))?.textContent] || 'amigavel');
  const applyTone = tone => document.querySelectorAll('[data-tone]').forEach(button => button.classList.toggle('on', toneNames[tone] === button.textContent));
  let knowledge = [];
  const renderKnowledge = () => {
    const box = document.querySelector('#kbBox');
    if (!box) return;
    box.innerHTML = knowledge.length ? knowledge.map(item => `<span class="kbpill ${item.active ? '' : 'inactive'}" title="${escapeHtml(item.content)}">📄 ${escapeHtml(item.title)} <small>${item.type === 'faq' ? 'FAQ' : 'Texto'}</small><button type="button" data-kb-edit="${item.id}" aria-label="Editar ${escapeHtml(item.title)}">✎</button><button type="button" data-kb-delete="${item.id}" aria-label="Excluir ${escapeHtml(item.title)}">✕</button></span>`).join('') : '<span class="empty-state">Nenhum conteúdo cadastrado.</span>';
  };
  const loadKnowledge = async () => {
    if (!apiMode() || !root.FluxoApi?.getSession()) return;
    try { const data = await root.FluxoApi.request('/aurora/knowledge'); knowledge = Array.isArray(data.items) ? data.items : []; renderKnowledge(); }
    catch (error) { status(error?.message || 'Não foi possível carregar a base de conhecimento.', 'error'); }
  };
  const canConfigureKnowledge = () => can('ai:configuration');
  const askKnowledge = (item = {}) => {
    const title = root.prompt('Título do conteúdo:', item.title || '');
    if (title === null) return null;
    const type = root.prompt('Tipo: digite text para texto ou faq para pergunta frequente:', item.type || 'text');
    if (type === null) return null;
    const content = root.prompt(type === 'faq' ? 'Pergunta e resposta da FAQ:' : 'Conteúdo textual:', item.content || '');
    if (content === null) return null;
    return { title: title.trim(), type: type.trim().toLowerCase(), content: content.trim() };
  };
  const setEditable = editable => {
    const prompt = document.querySelector('#personaTxt');
    const save = document.querySelector('#auroraSaveBtn');
    if (prompt) prompt.readOnly = !editable;
    if (save) { save.disabled = !editable; save.title = editable ? '' : 'Somente usuários autorizados podem alterar o Prompt Mestre'; }
    document.querySelectorAll('[data-tone]').forEach(button => { button.disabled = !editable; });
  };
  const load = async () => {
    if (!apiMode() || !root.FluxoApi?.getSession()) return;
    status('Carregando configuração…');
    try {
      const data = await root.FluxoApi.request('/aurora/settings');
      document.querySelector('#personaTxt').value = data.masterPrompt || '';
      applyTone(data.tone || 'amigavel');
      setEditable(Boolean(data.canEdit && can('ai:configuration')));
      status(data.canEdit ? 'Configuração carregada.' : 'Configuração carregada. Somente leitura.');
    } catch (error) { setEditable(false); status(error?.message || 'Não foi possível carregar a configuração.', 'error'); }
  };
  const test = async () => {
    const input = document.querySelector('#pgInput');
    const box = document.querySelector('#pgBox');
    const message = input?.value.trim();
    if (!message) return;
    if (!apiMode()) return;
    if (!can('ai:suggestions')) return root.toast?.('⚠️', 'Aurora', 'Você não possui permissão para usar o laboratório.', 'coral');
    const button = document.querySelector('#pgBtn');
    button.disabled = true;
    box.insertAdjacentHTML('beforeend', `<div class="msg me" style="margin-left:auto"><p>${escapeHtml(message)}</p></div>`);
    input.value = '';
    try {
      const result = await root.FluxoApi.request('/aurora/test', { method: 'POST', body: { message } });
      (result.suggestions || []).forEach(suggestion => box.insertAdjacentHTML('beforeend', `<div class="msg them" style="max-width:85%"><span class="ai-tag">✦ AURORA</span><p>${escapeHtml(suggestion)}</p></div>`));
    } catch (error) { box.insertAdjacentHTML('beforeend', `<div class="msg them" style="max-width:85%"><p>${escapeHtml(error?.message || 'Não foi possível testar a Aurora.')}</p></div>`); }
    finally { button.disabled = false; box.scrollTop = 1e5; }
  };
  document.querySelector('#auroraSaveBtn')?.addEventListener('click', async () => {
    if (!apiMode() || !can('ai:configuration')) return;
    const button = document.querySelector('#auroraSaveBtn');
    button.disabled = true; status('Salvando…');
    try {
      await root.FluxoApi.request('/aurora/settings', { method: 'PATCH', body: { masterPrompt: document.querySelector('#personaTxt').value, tone: selectedTone() } });
      status('Configuração salva.'); root.toast?.('✅', 'Aurora', 'Configuração salva para esta organização.', 'gold');
    } catch (error) { status(error?.message || 'Não foi possível salvar.', 'error'); }
    finally { setEditable(can('ai:configuration')); }
  });
  document.querySelector('#kbAdd')?.addEventListener('click', async () => {
    if (!apiMode()) return root.toast?.('💡', 'Base de conhecimento', 'Disponível no modo API.', 'gold');
    if (!canConfigureKnowledge()) return root.toast?.('⚠️', 'Base de conhecimento', 'Você não possui permissão para alterar conteúdos.', 'coral');
    const fields = askKnowledge();
    if (!fields?.title || !fields.content || !['text', 'faq'].includes(fields.type)) return root.toast?.('⚠️', 'Conteúdo inválido', 'Informe título, tipo text/faq e conteúdo.', 'coral');
    try { const item = await root.FluxoApi.request('/aurora/knowledge', { method: 'POST', body: fields }); knowledge = [item, ...knowledge]; renderKnowledge(); root.toast?.('✅', 'Base atualizada', 'Conteúdo salvo. Nenhum arquivo foi processado nem houve treinamento.', 'gold'); }
    catch (error) { root.toast?.('⚠️', 'Base de conhecimento', error?.message || 'Não foi possível salvar o conteúdo.', 'coral'); }
  });
  document.querySelector('#kbBox')?.addEventListener('click', async event => {
    const edit = event.target.closest('[data-kb-edit]');
    const remove = event.target.closest('[data-kb-delete]');
    if (!edit && !remove) return;
    if (!canConfigureKnowledge()) return root.toast?.('⚠️', 'Base de conhecimento', 'Você não possui permissão para alterar conteúdos.', 'coral');
    const id = (edit || remove).dataset.kbEdit || (edit || remove).dataset.kbDelete;
    const item = knowledge.find(entry => entry.id === id);
    if (!item) return;
    if (remove) {
      if (!root.confirm(`Excluir “${item.title}”?`)) return;
      try { await root.FluxoApi.request(`/aurora/knowledge/${encodeURIComponent(id)}`, { method: 'DELETE' }); knowledge = knowledge.filter(entry => entry.id !== id); renderKnowledge(); root.toast?.('🗑', 'Conteúdo removido', 'O conteúdo foi excluído da base.', 'gold'); }
      catch (error) { root.toast?.('⚠️', 'Base de conhecimento', error?.message || 'Não foi possível excluir o conteúdo.', 'coral'); }
      return;
    }
    const fields = askKnowledge(item);
    if (!fields?.title || !fields.content || !['text', 'faq'].includes(fields.type)) return root.toast?.('⚠️', 'Conteúdo inválido', 'Informe título, tipo text/faq e conteúdo.', 'coral');
    try { const updated = await root.FluxoApi.request(`/aurora/knowledge/${encodeURIComponent(id)}`, { method: 'PATCH', body: fields }); knowledge = knowledge.map(entry => entry.id === id ? updated : entry); renderKnowledge(); root.toast?.('✅', 'Base atualizada', 'Conteúdo atualizado.', 'gold'); }
    catch (error) { root.toast?.('⚠️', 'Base de conhecimento', error?.message || 'Não foi possível atualizar o conteúdo.', 'coral'); }
  });
  document.querySelector('#pgBtn')?.addEventListener('click', test);
  root.addEventListener('fluxo:session', () => { load(); loadKnowledge(); });
  if (apiMode()) { document.querySelector('#kbAdd')?.style.setProperty('display', canConfigureKnowledge() ? '' : 'none'); document.querySelector('#kbInput')?.style.setProperty('display', 'none'); loadKnowledge(); }
  load();
})(window);
