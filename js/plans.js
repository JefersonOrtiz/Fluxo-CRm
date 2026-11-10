const CRM_PLANS = globalThis.JF_CRM_PLANS;
const planNumberFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const crmPlanById = id => CRM_PLANS.find(plan => plan.id === id);
const formatPlanAmount = plan => planNumberFormatter.format(plan.monthlyPriceCents / 100);
const formatPlanPrice = plan => `R$ ${formatPlanAmount(plan)}/mês`;
const formatPlanOffer = plan => `${plan.name}: ${formatPlanPrice(plan)}, até ${plan.maxUsers} usuários e ${plan.trialDays} dias de teste`;

function renderPlanCatalog(container) {
  if (!container) return;
  const cards = CRM_PLANS.map(plan => {
    const card = document.createElement('article');
    card.className = 'pricing-card' + (plan.featured ? ' featured' : '');
    card.dataset.planId = plan.id;
    card.innerHTML = '<h3></h3><p class="pricing-description"></p><p class="pricing-users"></p><div class="pricing-amount"><span>R$</span><strong></strong><small>/mês</small></div><p class="pricing-trial"></p>';
    card.querySelector('h3').textContent = plan.name;
    card.querySelector('.pricing-description').textContent = plan.description;
    card.querySelector('.pricing-users').textContent = `Até ${plan.maxUsers} usuários`;
    card.querySelector('.pricing-amount strong').textContent = formatPlanAmount(plan);
    card.querySelector('.pricing-trial').textContent = `${plan.trialDays} dias de teste`;
    return card;
  });
  container.replaceChildren(...cards);
}
