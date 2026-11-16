import test from 'node:test';
import assert from 'node:assert/strict';
import { AURORA_SYSTEM_INSTRUCTIONS, buildSuggestionContext, createAiProvider, createRateLimiter, parseSuggestions } from '../src/openai.mjs';

test('inclui tags comerciais separadas e preserva o limite total', () => {
  const context = buildSuggestionContext([{ direction: 'inbound', body: 'x'.repeat(20_000) }], 'Qualificação', ['prioridade', 'prioridade', 'origem-campanha']);
  assert.match(context, /etapa do funil: Qualificação/);
  assert.match(context, /Pistas comerciais do CRM/);
  assert.match(context, /prioridade, origem-campanha/);
  assert.ok(context.length <= 20_000);
});

test('remove introdução e preserva mensagem válida', () => {
  assert.deepEqual(parseSuggestions('Claro! Aqui estão as sugestões:\nPosso entender melhor sua necessidade?'), ['Posso entender melhor sua necessidade?']);
});

test('preserva duas sugestões válidas e limita a duas', () => {
  assert.deepEqual(parseSuggestions('Posso ajudar com isso?\nQual horário é melhor para você?\nTerceira opção'), ['Posso ajudar com isso?', 'Qual horário é melhor para você?']);
});

test('retorna vazio quando há somente introdução', () => {
  assert.deepEqual(parseSuggestions('Claro! Aqui estão as sugestões:'), []);
});

test('preserva mensagem legítima iniciada por Claro', () => {
  assert.deepEqual(parseSuggestions('Claro, posso verificar essa informação para você.'), ['Claro, posso verificar essa informação para você.']);
});

test('valida sugestões de forma conservadora', () => {
  assert.deepEqual(parseSuggestions('Posso esclarecer sua dúvida e entender sua necessidade?\nPara orientar melhor, qual serviço você procura?'), [
    'Posso esclarecer sua dúvida e entender sua necessidade?',
    'Para orientar melhor, qual serviço você procura?'
  ]);
  assert.deepEqual(parseSuggestions('Aguardo seu retorno.\nPosso ajudar com uma pergunta objetiva?'), ['Posso ajudar com uma pergunta objetiva?']);
  assert.deepEqual(parseSuggestions('Obrigado pelo contato.\nEstamos à disposição.'), []);
  assert.deepEqual(parseSuggestions('Depois disso, poderemos avançar.\nVou consultar os preços e retorno em breve.'), []);
  assert.deepEqual(parseSuggestions('Infelizmente, ainda não tenho esse valor confirmado. Podemos entender qual serviço você precisa?\nPosso consultar o histórico da conversa para esclarecer sua dúvida?'), [
    'Infelizmente, ainda não tenho esse valor confirmado. Podemos entender qual serviço você precisa?',
    'Posso consultar o histórico da conversa para esclarecer sua dúvida?'
  ]);
  assert.ok(parseSuggestions(`Mensagem legítima ${'x'.repeat(600)}`)[0].length <= 500);
});

test('instruções da Aurora definem personalidade comercial e segurança', () => {
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /copiloto de atendimento comercial/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /perguntas de qualificação/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /Não invente preços/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /dados não confiáveis/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /Nunca envie mensagens automaticamente/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /classificação interna do CRM/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /nunca a mencione ao cliente/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /Tags são classificações internas/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /não as trate como fatos confirmados/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /Não afirme que o cliente solicitou uma demonstração/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /Nunca presuma proposta enviada/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /contratação, pagamento ou agendamento/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /fatos confirmados no histórico/);
  for (const intent of ['information_request', 'product_interest', 'demo_interest', 'pricing_question', 'sales_objection', 'purchase_interest', 'support_request', 'unclear']) {
    assert.match(AURORA_SYSTEM_INSTRUCTIONS, new RegExp(intent));
  }
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /intenção provável/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /Quando a intenção for ambígua/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /A hierarquia é/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /nunca presuma solicitação ou agendamento/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /não invente valores/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /sem afirmar que um chamado foi aberto/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /ambas devem responder ou avançar diretamente/i);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /consultiva e outra objetiva/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /respostas genéricas ou encerramentos prematuros/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /não produza títulos ou introduções/i);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /hipóteses em fatos comerciais/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /opções flexíveis de pagamento/);
  assert.match(AURORA_SYSTEM_INSTRUCTIONS, /etapa e tags nunca confirmam condições comerciais/);
});

test('mock provider gera sugestões sem chave ou chamada externa', async () => {
  const provider = createAiProvider({ provider: 'mock' });
  const result = await provider.suggest({ context: '' });
  assert.equal(result.provider, 'mock');
  assert.ok(result.suggestions.length);
});

test('contexto limita mensagens e tamanho sem aceitar instruções externas', () => {
  const messages = Array.from({ length: 30 }, (_, index) => ({ direction: 'inbound', body: `${index}-${'x'.repeat(3_000)}` }));
  const context = buildSuggestionContext(messages);
  assert.ok(context.split('\n').length <= 21);
  assert.ok(context.length <= 20_000);
  assert.match(context, /29-/);
  assert.doesNotMatch(context, /0-x/);
});

test('provedor real exige segredo e não usa fallback silencioso', async () => {
  const provider = createAiProvider({ apiKey: '' });
  await assert.rejects(() => provider.suggest({ context: '' }), error => error.code === 'AI_NOT_CONFIGURED');
});

test('provedor real usa Responses API sem armazenar resposta', async () => {
  let captured;
  const provider = createAiProvider({ apiKey: 'test-only', fetchImpl: async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ output_text: '- Uma sugestão segura' }) };
  } });
  const result = await provider.suggest({ context: 'client: Olá' });
  assert.equal(result.suggestions[0], 'Uma sugestão segura');
  assert.equal(captured.url, 'https://api.openai.com/v1/responses');
  const body = JSON.parse(captured.options.body);
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 300);
  assert.match(body.input[0].content[0].text, /copiloto de atendimento comercial/);
  assert.match(body.input[0].content[0].text, /Não invente preços/);
  assert.match(body.input[0].content[0].text, /dados não confiáveis/);
});

test('rate limiter bloqueia excesso por janela', () => {
  const allow = createRateLimiter({ max: 2, windowMs: 60_000 });
  assert.equal(allow('user'), true);
  assert.equal(allow('user'), true);
  assert.equal(allow('user'), false);
  assert.equal(allow('other'), true);
});
