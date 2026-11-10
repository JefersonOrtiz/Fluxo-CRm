/* Persistência estática para GitHub Pages.
   Os dados ficam somente neste navegador, em localStorage. */
const FLUXO_STORAGE_KEY = 'fluxo-crm:state:v1';
const FLUXO_USER_NAME_KEY = 'fluxo-crm:user-name';

window.getFluxoUserName = () => localStorage.getItem(FLUXO_USER_NAME_KEY) || 'Marina Duarte';
window.setFluxoUserName = name => {
  const value = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!value) return false;
  localStorage.setItem(FLUXO_USER_NAME_KEY, value);
  return true;
};

function persistCrm() {
  try {
    localStorage.setItem(FLUXO_STORAGE_KEY, JSON.stringify({ contacts, events }));
  } catch (error) {
    console.warn('Não foi possível salvar os dados locais do JF System CRM.', error);
  }
}

function restoreCrm() {
  try {
    const raw = localStorage.getItem(FLUXO_STORAGE_KEY);
    if (!raw) return persistCrm();
    const saved = JSON.parse(raw);
    if (Array.isArray(saved.contacts) && saved.contacts.length) contacts = saved.contacts;
    if (Array.isArray(saved.events)) events = saved.events;
  } catch (error) {
    console.warn('Os dados locais do JF System CRM não puderam ser restaurados.', error);
  }
}

// Disponível no console do navegador caso queira restaurar os dados de demonstração.
window.resetFluxoData = () => {
  localStorage.removeItem(FLUXO_STORAGE_KEY);
  window.location.reload();
};

restoreCrm();
window.addEventListener('beforeunload', persistCrm);
document.addEventListener('visibilitychange', () => { if (document.hidden) persistCrm(); });
setInterval(persistCrm, 1500);
