(() => {
  const KEY = 'fluxo-crm:platform-access:v1';
  const opener = window.opener;
  if (!opener || opener === window) return;
  const channelId = crypto.randomUUID();
  const origin = window.location.origin;
  const receive = event => {
    if (event.origin !== origin || event.source !== opener) return;
    const data = event.data || {};
    if (data.type !== 'jfcrm-platform-access-offer' || data.channelId !== channelId || typeof data.token !== 'string' || data.token.length < 32) return;
    sessionStorage.setItem(KEY, data.token);
    window.removeEventListener('message', receive);
    opener.postMessage({ type: 'jfcrm-platform-access-accepted', channelId }, origin);
  };
  window.addEventListener('message', receive);
  opener.postMessage({ type: 'jfcrm-platform-access-hello', channelId }, origin);
})();
