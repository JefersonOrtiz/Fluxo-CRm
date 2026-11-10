/* Janela de atendimento: 24 horas desde a última mensagem do cliente.
   sentAt guarda um instante completo (ISO com fuso ou milissegundos Unix).
   Horários de exibição, atividade do contato e mensagens da empresa não renovam a janela. */
const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function serviceMessageTimestamp(message) {
  const value = message?.sentAt;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : NaN;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  return Date.parse(value);
}

function getCustomerServiceWindow(contact, now = Date.now()) {
  const incoming = (contact.msgs || []).filter(message => message.who === 'c');
  if (!incoming.length) return { status: 'not-started', openedAt: null, expiresAt: null, remainingMs: 0 };
  if (!Number.isFinite(serviceMessageTimestamp(incoming[incoming.length - 1]))) {
    return { status: 'unavailable', openedAt: null, expiresAt: null, remainingMs: 0 };
  }
  // A ordem de chegada pode diferir da ordem cronológica.
  const openedAt = incoming.reduce((latest, message) => {
    const timestamp = serviceMessageTimestamp(message);
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
  if (openedAt > now) return { status: 'unavailable', openedAt: null, expiresAt: null, remainingMs: 0 };
  const expiresAt = openedAt + CUSTOMER_SERVICE_WINDOW_MS;
  return { status: now < expiresAt ? 'open' : 'expired', openedAt, expiresAt, remainingMs: Math.max(0, expiresAt - now) };
}
