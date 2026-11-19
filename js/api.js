(function exposeFluxoApi(root) {
  const SESSION_KEY = 'fluxo-crm:session:v1';
  const PLATFORM_ACCESS_KEY = 'fluxo-crm:platform-access:v1';
  const DEFAULT_TIMEOUT_MS = 8_000;

  class ApiError extends Error {
    constructor(message, { status = 0, code = 'API_ERROR', details = null } = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  const normalizeBaseUrl = value => String(value || '/api').replace(/\/+$/, '');

  function createClient(options = {}) {
    const fetchImpl = options.fetch || root.fetch?.bind(root);
    const storage = options.storage || root.sessionStorage;
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

    if (!fetchImpl) throw new Error('Uma implementação de fetch é obrigatória');
    if (!storage) throw new Error('Um armazenamento de sessão é obrigatório');

    const readSession = () => {
      try {
        const value = JSON.parse(storage.getItem(SESSION_KEY));
        return value?.user && (value?.token || value?.platformAccess) ? value : null;
      } catch {
        storage.removeItem(SESSION_KEY);
        return null;
      }
    };

    const writeSession = session => {
      if ((!session?.token && !session?.platformAccessToken) || !session?.user) throw new ApiError('Sessão inválida recebida da API', { code: 'INVALID_RESPONSE' });
      if (session.platformAccessToken) storage.setItem(PLATFORM_ACCESS_KEY, session.platformAccessToken);
      else storage.removeItem(PLATFORM_ACCESS_KEY);
      storage.setItem(SESSION_KEY, JSON.stringify({ token: session.token || null, user: session.user, platformAccess: Boolean(session.platformAccessToken) }));
      return readSession();
    };

    const readPlatformAccess = () => storage.getItem(PLATFORM_ACCESS_KEY);
    const clearSession = () => { storage.removeItem(SESSION_KEY); storage.removeItem(PLATFORM_ACCESS_KEY); };

    const notifyUnauthorized = () => {
      clearSession();
      if (typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
        root.dispatchEvent(new root.CustomEvent('fluxo:unauthorized'));
      }
    };

    const request = async (path, requestOptions = {}) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestOptions.timeoutMs || timeoutMs);
      const session = readSession();
      const headers = { Accept: 'application/json', ...(requestOptions.headers || {}) };
      const platformAccessToken = readPlatformAccess();
      if (platformAccessToken) headers['X-Platform-Access-Token'] = platformAccessToken;
      let body;

      if (requestOptions.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(requestOptions.body);
      }
      if (session?.token && requestOptions.auth !== false) headers.Authorization = `Bearer ${session.token}`;

      try {
        const response = await fetchImpl(`${baseUrl}${path}`, {
          method: requestOptions.method || 'GET',
          headers,
          body,
          signal: controller.signal
        });
        const text = response.status === 204 ? '' : await response.text();
        let payload = null;

        if (text) {
          try {
            payload = JSON.parse(text);
          } catch {
            throw new ApiError('A API retornou uma resposta inválida', {
              status: response.status,
              code: 'INVALID_RESPONSE'
            });
          }
        }

        if (!response.ok) {
          if (response.status === 401) notifyUnauthorized();
          throw new ApiError(payload?.error || `A API respondeu com HTTP ${response.status}`, {
            status: response.status,
            code: response.status === 401 ? 'UNAUTHORIZED' : 'HTTP_ERROR',
            details: payload
          });
        }
        return payload;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error?.name === 'AbortError') throw new ApiError('A API demorou demais para responder', { code: 'TIMEOUT' });
        throw new ApiError('Não foi possível conectar à API', { code: 'NETWORK_ERROR' });
      } finally {
        clearTimeout(timer);
      }
    };

    const login = async (email, password) => {
      const result = await request('/auth/login', {
        method: 'POST',
        auth: false,
        body: { email, password }
      });
      return writeSession(result);
    };

    const me = async () => {
      const result = await request('/auth/me');
      if (!result?.user) throw new ApiError('A API retornou uma sessão inválida', { code: 'INVALID_RESPONSE' });
      const current = readSession();
      if (readPlatformAccess()) return writeSession({ platformAccessToken: readPlatformAccess(), user: result.user });
      return writeSession({ token: current?.token, user: result.user });
    };

    return { request, login, me, getSession: readSession, clearSession };
  }

  root.FluxoApiClient = Object.freeze({ createClient, ApiError, SESSION_KEY });
  if (root.document) {
    const config = root.FLUXO_CONFIG || {};
    root.FluxoApi = createClient({ baseUrl: config.apiBaseUrl || '/api' });
  }
})(typeof window === 'undefined' ? globalThis : window);
