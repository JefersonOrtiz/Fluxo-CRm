(function exposeServiceWindow(root) {
  function calculateServiceWindow(messages = [], now = Date.now()) {
    const incoming = messages.filter(message => message?.who === 'c' && Number.isFinite(Date.parse(message.sentAt))).sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))[0];
    const hasIncoming = messages.some(message => message?.who === 'c');
    const openedAt = incoming ? Date.parse(incoming.sentAt) : null;
    const remainingMs = openedAt === null ? 0 : openedAt + 24 * 60 * 60 * 1000 - now;
    if (openedAt === null) return { openedAt, remainingMs, status: hasIncoming ? 'unavailable' : 'not-started', visualStatus: hasIncoming ? 'unavailable' : 'not-started', displayText: hasIncoming ? 'Janela não verificada' : 'Janela não iniciada', reason: hasIncoming ? 'invalid-timestamp' : 'no-incoming-message' };
    const status = remainingMs > 0 ? 'open' : 'expired';
    return { openedAt, remainingMs, status, visualStatus: status, displayText: status === 'open' ? 'Janela aberta' : 'Janela expirada', reason: null };
  }
  root.FluxoServiceWindow = Object.freeze({ calculateServiceWindow });
})(typeof window === 'undefined' ? globalThis : window);
