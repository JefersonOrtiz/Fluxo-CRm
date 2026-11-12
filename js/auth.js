(function initializeAuthentication(root) {
  const config = root.FLUXO_CONFIG || { mode: 'demo' };
  const gate = document.querySelector('#authGate');
  const form = document.querySelector('#loginForm');
  const errorBox = document.querySelector('#loginError');
  const submitButton = document.querySelector('#loginSubmit');
  const notice = document.querySelector('#runtimeNotice');
  const logoutButton = document.querySelector('#logoutBtn');

  root.FluxoRuntime = Object.freeze({ mode: config.mode });

  const showError = message => {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  };

  const setPending = pending => {
    submitButton.disabled = pending;
    submitButton.textContent = pending ? 'Entrando…' : 'Entrar';
  };

  const updateSessionIdentity = session => {
    root.FluxoSessionUser = session?.user || null;
    root.dispatchEvent(new CustomEvent('fluxo:session', { detail: session }));
  };

  const showLogin = message => {
    document.documentElement.dataset.authState = 'anonymous';
    gate.hidden = false;
    notice.hidden = true;
    logoutButton.hidden = true;
    updateSessionIdentity(null);
    showError(message || '');
    document.querySelector('#loginEmail').focus();
  };

  const showApplication = session => {
    document.documentElement.dataset.authState = 'authenticated';
    gate.hidden = true;
    logoutButton.hidden = false;
    notice.hidden = false;
    notice.className = 'runtime-notice api';
    notice.textContent = 'CRM conectado à API · envio externo e Aurora ainda não integrados';
    updateSessionIdentity(session);
  };

  const messageForError = error => {
    if (error?.code === 'UNAUTHORIZED') return 'E-mail ou senha inválidos, ou sua sessão expirou.';
    if (error?.code === 'TIMEOUT') return 'A API demorou demais para responder. Tente novamente.';
    if (error?.code === 'NETWORK_ERROR') return 'Não foi possível conectar à API. Verifique se o ambiente está ativo.';
    if (error?.code === 'INVALID_RESPONSE') return 'A API retornou uma resposta inválida.';
    return error?.message || 'Não foi possível autenticar.';
  };

  if (config.mode !== 'api') {
    document.documentElement.dataset.authState = 'demo';
    gate.hidden = true;
    logoutButton.hidden = true;
    notice.hidden = false;
    notice.className = 'runtime-notice demo';
    notice.textContent = 'Modo demonstração · dados salvos somente neste navegador';
    return;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    showError('');
    setPending(true);
    try {
      const session = await root.FluxoApi.login(
        document.querySelector('#loginEmail').value.trim(),
        document.querySelector('#loginPassword').value
      );
      form.reset();
      showApplication(session);
    } catch (error) {
      showLogin(messageForError(error));
    } finally {
      setPending(false);
    }
  });

  logoutButton.addEventListener('click', () => {
    root.FluxoApi.clearSession();
    showLogin('Sessão encerrada com segurança neste navegador.');
  });

  root.addEventListener('fluxo:unauthorized', () => showLogin('Sua sessão expirou. Entre novamente.'));

  const restore = async () => {
    const session = root.FluxoApi.getSession();
    if (!session) return showLogin();
    try {
      showApplication(await root.FluxoApi.me());
    } catch (error) {
      showLogin(messageForError(error));
    }
  };

  restore();
})(window);
