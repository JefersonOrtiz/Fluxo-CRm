/* Fonte única dos preços: o servidor sempre calcula o valor a cobrar. */
globalThis.JF_CRM_PLANS = Object.freeze([
  Object.freeze({ id: 'basico', name: 'Básico', monthlyPriceCents: 49900, maxUsers: 3, trialDays: 15, description: 'Para começar a organizar o atendimento da sua equipe.' }),
  Object.freeze({ id: 'essencial', name: 'Essencial', monthlyPriceCents: 79900, maxUsers: 6, trialDays: 30, description: 'Para acompanhar o crescimento da sua operação.', featured: true }),
  Object.freeze({ id: 'profissional', name: 'Profissional', monthlyPriceCents: 109900, maxUsers: 12, trialDays: 30, description: 'Para equipes maiores e uma operação de atendimento mais ampla.' })
]);
