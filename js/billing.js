/* Credenciais privadas, preços e confirmação de pagamentos pertencem ao servidor.
   Nenhum dado financeiro ou token é salvo no localStorage. */
const billingState = {
  config: null, user: null, data: null, planId: 'essencial', method: 'card', busy: false,
  cardForm: null, cardReady: false, mountVersion: 0, loading: null, poll: null,
};
const billingDate = value => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'A confirmar';
let billingSdkPromise;

async function billingRequest(path, body, key) {
  let response;
  try {
    response = await fetch(`api/${path}`, { credentials: 'same-origin',
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new Error('Não foi possível conectar ao serviço de pagamentos. Tente novamente.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('O serviço de assinaturas não está disponível nesta instalação.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'Não foi possível concluir a solicitação.');
    error.status = response.status;
    throw error;
  }
  return data;
}
function billingFeedback(message = '') {
  $('#billingFeedback').textContent = message;
  $('#billingFeedback').hidden = !message;
}
function billingCanCheckout() {
  const account = billingState.data?.account;
  return !(account?.method === 'card' && account.status !== 'cancelled') && !billingState.data?.pendingOperation;
}
function billingUpdateButton() {
  const state = billingState, plan = crmPlanById(state.planId);
  const button = $('#billingSubmit');
  const account = state.data?.account;
  const inTrial = account ? new Date(account.trialEndsAt) > new Date() : true;
  const pixTrialStarted = state.method === 'pix' && account?.method === 'pix' && account.status === 'manual' && inTrial;
  const pixWaiting = state.method === 'pix' && state.data?.pendingPix && new Date(state.data.pendingPix.expiresAt) > new Date();
  button.textContent = state.busy ? 'Aguarde…' : !state.config?.enabled ? 'Pagamento ainda não habilitado'
    : !state.user ? 'Entre para continuar' : state.method === 'card' ? 'Autorizar assinatura mensal'
    : pixWaiting ? 'PIX aguardando pagamento' : pixTrialStarted ? 'PIX disponível após o teste' : inTrial ? `Iniciar teste de ${plan.trialDays} dias com PIX` : 'Gerar PIX da mensalidade';
  button.disabled = state.busy || !state.config?.enabled || !state.user || !$('#billingAccept').checked
    || !billingCanCheckout() || pixTrialStarted || pixWaiting || (state.method === 'card' && !state.cardReady);
  $$('#billingCheckout input[name="billingMethod"], #subscriptionPlans button').forEach(element => { element.disabled = state.busy; });
  $('#billingAccept').disabled = state.busy || !state.config?.enabled || !state.user;
}
function billingPaintPlans() {
  $$('#subscriptionPlans .pricing-card').forEach(card => {
    let button = card.querySelector('.billing-plan-button');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button'; button.className = 'btn ghost billing-plan-button';
      button.onclick = () => {
        if (billingState.busy) return;
        billingState.planId = card.dataset.planId;
        $('#billingAccept').checked = false;
        billingFeedback(); billingPaint(); billingMountCard();
      };
      card.append(button);
    }
    const selected = card.dataset.planId === billingState.planId;
    card.classList.toggle('billing-selected', selected);
    button.textContent = selected ? 'Plano selecionado ✓' : 'Escolher plano';
    button.setAttribute('aria-pressed', String(selected));
  });
}
function billingPaint() {
  const state = billingState, plan = crmPlanById(state.planId);
  const account = state.data?.account;
  $$('input[name="billingMethod"]').forEach(input => { input.checked = input.value === state.method; });
  billingPaintPlans();
  $('#billingLogin').hidden = !state.config?.enabled || Boolean(state.user);
  $('#billingCheckout').hidden = !billingCanCheckout();
  const hasTrial = !account || new Date(account.trialEndsAt) > new Date();
  $('#billingSummary').innerHTML = `<h4>${esc(plan.name)}</h4><p>Até ${plan.maxUsers} usuários</p><div class="billing-summary-price">R$ ${esc(formatPlanAmount(plan))}<small> /mês</small></div><p class="billing-summary-trial">${account ? hasTrial ? `Teste até ${esc(billingDate(account.trialEndsAt))}` : 'Cobrança mensal' : `${plan.trialDays} dias de teste gratuito`}</p><p>${state.method === 'card' ? 'Renovação automática no cartão.' : 'Renovação com pagamento manual por PIX.'}</p><p>${hasTrial ? 'A primeira mensalidade será devida após o teste.' : 'O período de teste desta empresa já foi utilizado.'}</p>`;
  $('#billingCardInfo').hidden = state.method !== 'card';
  $('#billingPixInfo').hidden = state.method !== 'pix';
  const cardVisible = state.method === 'card' && state.config?.enabled && state.user && billingCanCheckout();
  $('#billingCardFields').hidden = !cardVisible;
  $$('#billingCardFields input, #billingCardFields select').forEach(input => { input.disabled = !cardVisible; });
  $('#billingPixFields').hidden = state.method !== 'pix' || !state.config?.enabled || !state.user;
  $$('#billingPixFields input').forEach(input => { input.disabled = state.method !== 'pix' || !state.config?.enabled || !state.user; });
  $('#billingConsentText').textContent = state.method === 'card'
    ? 'Autorizo a cobrança mensal recorrente no cartão após o período de teste, até o cancelamento.'
    : 'Entendo que devo pagar cada mensalidade por PIX. Esta opção não tem débito automático.';
  const notice = $('#billingNotice');
  notice.dataset.tone = !state.config?.enabled || state.data?.pendingOperation ? 'warning' : 'success';
  notice.textContent = !state.config ? 'Consultando disponibilidade dos pagamentos…'
    : !state.config.enabled ? 'Os pagamentos ainda não foram ativados. Você já pode conhecer os planos e escolher entre cartão ou PIX; a contratação ficará disponível após a ativação.'
    : state.data?.pendingOperation ? 'Sua solicitação está aguardando confirmação do Mercado Pago. Atualize o status antes de tentar novamente. Se continuar pendente, entre em contato com o suporte financeiro.'
    : !state.user ? 'Entre com a conta da empresa para contratar ou consultar sua assinatura.'
    : 'Pagamentos via Mercado Pago. A confirmação da mensalidade é feita com segurança pelo servidor.';
  billingPaintAccount();
  billingPaintPix();
  billingUpdateButton();
}
function billingPaintAccount() {
  const element = $('#billingAccount'), state = billingState, account = state.data?.account;
  element.hidden = !state.user;
  if (!state.user) { $('#billingHistory').hidden = true; $('#billingHistoryList').replaceChildren(); return; }
  const plan = crmPlanById(account?.planId);
  const labels = { trial: 'Em período de teste', paid: 'Mensalidade confirmada', expired: 'Sem período ativo' };
  element.innerHTML = `<div class="billing-account-top"><div><span class="billing-eyebrow">CONTA DA EMPRESA</span><h3>${esc(plan?.name || 'Sem assinatura vinculada')}</h3><p>${esc(account ? labels[account.accessStatus] : 'Escolha um plano para começar.')} ${account?.status === 'cancelled' ? '· Renovação cancelada' : ''}</p></div><button class="btn ghost" id="billingLogout" type="button">Sair da conta de cobrança</button></div>${account ? `<dl><div><dt>Forma de pagamento</dt><dd>${account.method === 'card' ? 'Cartão · mensal recorrente' : account.method === 'pix' ? 'PIX · pagamento mensal' : 'Aguardando contratação'}</dd></div><div><dt>${account.accessStatus === 'trial' ? 'Fim do teste' : 'Período confirmado até'}</dt><dd>${esc(billingDate(account.accessStatus === 'trial' ? account.trialEndsAt : account.paidUntil))}</dd></div><div><dt>Próxima mensalidade</dt><dd>${account.status === 'cancelled' ? 'Renovação cancelada' : account.method === 'card' ? esc(billingDate(account.nextPaymentAt || account.trialEndsAt)) : 'Gerar PIX nesta página'}</dd></div></dl>` : ''}<div class="billing-account-actions"><button class="btn ghost" id="billingRefresh" type="button">Atualizar status</button>${account?.method && account.status !== 'cancelled' ? '<button class="btn ghost" id="billingCancel" type="button">Cancelar renovação</button><button class="btn" id="billingConfirmCancel" type="button" hidden>Confirmar cancelamento</button>' : ''}</div><p class="inline-note" id="billingCancelHelp" hidden>O período já pago será preservado. Confirme para interromper as próximas renovações.</p>`;
  $('#billingLogout').onclick = async () => {
    if (state.busy) return;
    try { await billingRequest('auth/logout', {}); state.user = null; state.data = null; billingUnmountCard(); billingPaint(); billingSchedulePoll(); }
    catch (error) { billingFeedback(error.message); }
  };
  $('#billingRefresh').onclick = billingRefresh;
  if ($('#billingCancel')) {
    $('#billingCancel').onclick = () => { $('#billingConfirmCancel').hidden = false; $('#billingCancelHelp').hidden = false; };
    $('#billingConfirmCancel').onclick = () => billingAction('billing/cancel');
  }
  $$('#billingAccount button').forEach(button => { button.disabled = state.busy; });
  const payments = state.data?.payments || [];
  $('#billingHistory').hidden = !payments.length;
  const statuses = { approved: 'Aprovado', pending: 'Pendente', in_process: 'Em processamento', rejected: 'Recusado', cancelled: 'Cancelado', refunded: 'Estornado', charged_back: 'Contestado' };
  $('#billingHistoryList').innerHTML = payments.map(payment => `<div class="billing-history-row"><div><b>${esc(money(payment.amount_cents / 100))}</b><small>${esc(billingDate(payment.period_start))} a ${esc(billingDate(payment.period_end))}</small></div><span class="billing-status ${payment.status === 'approved' ? 'approved' : ''}">${esc(statuses[payment.status] || 'A confirmar')}</span></div>`).join('');
}
function billingPaintPix() {
  const pix = billingState.data?.pendingPix;
  $('#billingPixResult').hidden = !pix;
  if (!pix) { $('#billingPixQr').removeAttribute('src'); $('#billingPixCode').value = ''; return; }
  $('#billingPixCode').value = pix.qrCode || '';
  $('#billingPixExpiry').textContent = `Código válido até ${billingDate(pix.expiresAt)}. Após esse horário, atualize o status para gerar outro PIX.`;
  const base64 = pix.qrCodeBase64;
  const valid = typeof base64 === 'string' && base64.length < 1_000_000 && /^[A-Za-z0-9+/=]+$/.test(base64);
  $('#billingPixQr').hidden = !valid;
  if (valid) $('#billingPixQr').src = `data:image/png;base64,${base64}`;
  else $('#billingPixQr').removeAttribute('src');
}
function billingUnmountCard() {
  billingState.mountVersion++;
  try { billingState.cardForm?.unmount(); } catch { /* Formulário já removido. */ }
  billingState.cardForm = null; billingState.cardReady = false;
  $$('#billingCardFields input').forEach(input => { input.value = ''; });
}
function billingLoadSdk() {
  if (window.MercadoPago) return Promise.resolve();
  if (!billingSdkPromise) billingSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2'; script.async = true;
    const timeout = setTimeout(() => fail(), 15000);
    const fail = () => { clearTimeout(timeout); script.remove(); billingSdkPromise = null; reject(new Error('O formulário seguro do Mercado Pago não carregou. Selecione a forma de pagamento novamente para tentar.')); };
    script.onload = () => { clearTimeout(timeout); if (window.MercadoPago) resolve(); else fail(); };
    script.onerror = fail; document.head.append(script);
  });
  return billingSdkPromise;
}
async function billingMountCard() {
  billingUnmountCard();
  const state = billingState;
  if (!$('#view-subscription').classList.contains('active') || state.method !== 'card' || !state.config?.enabled || !state.user || !billingCanCheckout()) return;
  const version = state.mountVersion;
  billingUpdateButton();
  try {
    await billingLoadSdk();
    if (version !== state.mountVersion) return;
    const plan = crmPlanById(state.planId);
    const mp = new MercadoPago(state.config.publicKey, { locale: 'pt-BR' });
    state.cardForm = mp.cardForm({
      amount: (plan.monthlyPriceCents / 100).toFixed(2), iframe: true,
      form: {
        id: 'billingCheckoutForm', cardNumber: { id: 'billingCardNumber', placeholder: 'Número do cartão' },
        expirationDate: { id: 'billingCardExpiration', placeholder: 'MM/AA' },
        securityCode: { id: 'billingCardCode', placeholder: 'CVV' },
        cardholderName: { id: 'billingCardName', placeholder: 'Como aparece no cartão' },
        cardholderEmail: { id: 'billingCardEmail', placeholder: 'seu@email.com' },
        identificationType: { id: 'billingCardDocType' }, identificationNumber: { id: 'billingCardDocNumber' },
        issuer: { id: 'billingCardIssuer' }, installments: { id: 'billingCardInstallments' },
      },
      callbacks: {
        onFormMounted: error => {
          if (version !== state.mountVersion) return;
          state.cardReady = !error;
          if (error) billingFeedback('Não foi possível abrir o formulário seguro. Selecione a forma de pagamento novamente.');
          billingUpdateButton();
        },
        onSubmit: async event => {
          event.preventDefault();
          if (state.method !== 'card' || state.busy || !$('#billingAccept').checked || !state.cardReady) return;
          const { token, cardholderEmail } = state.cardForm.getCardFormData();
          // Somente o token e o e-mail saem do navegador para o CRM.
          await billingCheckout({ cardTokenId: token, payer: { email: cardholderEmail } });
        },
        onError: () => billingFeedback('Confira os dados no formulário seguro do cartão e tente novamente.'),
      },
    });
  } catch (error) { if (version === state.mountVersion) { billingFeedback(error.message); billingUpdateButton(); } }
}
async function billingCheckout(payment) {
  if (billingState.busy || !billingState.config?.enabled || !billingState.user || !$('#billingAccept').checked) return;
  billingState.busy = true; billingFeedback(); billingUpdateButton();
  try {
    billingState.data = await billingRequest('billing/checkout', { planId: billingState.planId, method: billingState.method, acceptedTerms: true, ...payment }, crypto.randomUUID());
    billingUnmountCard(); $('#billingAccept').checked = false;
    billingPaint(); billingSchedulePoll();
    if (billingState.data.pendingPix) $('#billingPixResult').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    billingFeedback(error.message);
    // Token de cartão é de uso único. Desmontar limpa o formulário após qualquer tentativa.
    if (billingState.method === 'card') billingMountCard();
    try { billingState.data = await billingRequest('billing/subscription'); } catch { /* Manter mensagem original. */ }
    billingPaint(); billingSchedulePoll();
  } finally { billingState.busy = false; billingPaintAccount(); billingUpdateButton(); }
}
async function billingAction(path) {
  if (billingState.busy || !billingState.user) return;
  billingState.busy = true; billingFeedback(); billingUpdateButton(); billingPaintAccount();
  try {
    billingState.data = await billingRequest(path, {});
    billingPaint(); billingSchedulePoll();
    if (billingState.method === 'card' && billingCanCheckout() && !billingState.cardForm) billingMountCard();
  } catch (error) { billingFeedback(error.message); }
  finally { billingState.busy = false; billingPaintAccount(); billingUpdateButton(); }
}
const billingRefresh = () => billingAction('billing/refresh');
function suspendBilling() { clearTimeout(billingState.poll); billingUnmountCard(); }
function billingSchedulePoll() {
  clearTimeout(billingState.poll);
  if (document.hidden || !$('#view-subscription').classList.contains('active') || !billingState.user || !billingState.data?.pendingPix) return;
  billingState.poll = setTimeout(async () => {
    if (!billingState.busy) {
      try { billingState.data = await billingRequest('billing/subscription'); billingPaint(); } catch { /* Verificação manual permanece disponível. */ }
    }
    billingSchedulePoll();
  }, 15000);
}
async function renderBilling() {
  billingPaintPlans();
  if (billingState.loading) return;
  billingState.loading = (async () => {
    try {
      billingState.config = await billingRequest('billing/config');
      if (billingState.config.enabled) {
        try {
          billingState.user = (await billingRequest('auth/me')).user;
          billingState.data = await billingRequest('billing/subscription');
          if (billingState.data.account) { billingState.planId = billingState.data.account.planId; billingState.method = billingState.data.account.method || 'card'; }
        } catch (error) { if (error.status === 401) { billingState.user = null; billingState.data = null; } else throw error; }
      }
      billingPaint(); billingMountCard(); billingSchedulePoll();
    } catch (error) { if (!billingState.config) billingState.config = { enabled: false }; billingPaint(); billingFeedback(error.message); }
    finally { billingState.loading = null; }
  })();
  return billingState.loading;
}
$$('input[name="billingMethod"]').forEach(input => input.addEventListener('change', () => {
  billingState.method = input.value; $('#billingAccept').checked = false;
  billingFeedback(); billingPaint(); billingMountCard();
}));
$('#billingAccept').addEventListener('change', billingUpdateButton);
$('#billingCheckoutForm').addEventListener('submit', event => {
  event.preventDefault();
  if (billingState.method !== 'pix') return;
  if (!event.currentTarget.reportValidity()) return;
  const documentNumber = $('#billingPixDocument').value.replace(/\D/g, '');
  if (![11, 14].includes(documentNumber.length)) { billingFeedback('Informe um CPF ou CNPJ válido.'); return; }
  billingCheckout({ payer: { email: $('#billingPixEmail').value.trim(), firstName: $('#billingPixFirstName').value.trim(), lastName: $('#billingPixLastName').value.trim(), document: documentNumber } });
});
$('#billingLoginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button'); button.disabled = true;
  billingFeedback();
  try {
    const result = await billingRequest('auth/login', { email: $('#billingLoginEmail').value.trim(), password: $('#billingLoginPassword').value });
    billingState.user = result.user;
    billingState.data = await billingRequest('billing/subscription');
    if (billingState.data.account) { billingState.planId = billingState.data.account.planId; billingState.method = billingState.data.account.method || 'card'; }
    billingPaint(); billingMountCard(); billingSchedulePoll();
  } catch (error) { billingFeedback(error.message); }
  finally { $('#billingLoginPassword').value = ''; button.disabled = false; }
});
$('#billingCopyPix').onclick = async () => {
  try { await navigator.clipboard.writeText($('#billingPixCode').value); $('#billingCopyPix').textContent = 'Código copiado ✓'; }
  catch { $('#billingPixCode').focus(); $('#billingPixCode').select(); billingFeedback('Selecione e copie o código PIX exibido.'); }
};
$('#billingCheckPix').onclick = billingRefresh;
document.addEventListener('visibilitychange', billingSchedulePoll);
window.addEventListener('hashchange', billingSchedulePoll);
