import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../js/service-window.js', import.meta.url), 'utf8');
const calculate = runInNewContext(source + '\ngetCustomerServiceWindow;');
const hour = 60 * 60 * 1000;
const now = Date.parse('2026-11-09T18:00:00-03:00');
const message = (who, timestamp) => ({ who, sentAt: new Date(timestamp).toISOString() });

test('sem mensagem do cliente, a janela não foi iniciada', () => {
  for (const msgs of [[], [message('me', now), message('ai', now)]]) {
    assert.equal(calculate({ msgs }, now).status, 'not-started');
  }
});

test('a janela expira exatamente 24 horas após a mensagem do cliente', () => {
  const contact = { msgs: [message('c', now - 24 * hour)] };
  assert.equal(calculate(contact, now - 1).status, 'open');
  assert.equal(calculate(contact, now - 1).remainingMs, 1);
  assert.equal(calculate(contact, now).status, 'expired');
  assert.equal(calculate(contact, now).remainingMs, 0);
});

test('respostas do atendente e da IA não renovam a janela', () => {
  const state = calculate({ ts: now, msgs: [message('c', now - 26 * hour), message('me', now), message('ai', now)] }, now);
  assert.equal(state.status, 'expired');
  assert.equal(state.expiresAt, now - 2 * hour);
});

test('nova mensagem do cliente renova o prazo por 24 horas', () => {
  const contact = { msgs: [message('c', now - 26 * hour), message('c', now)] };
  const state = calculate(contact, now);
  assert.equal(state.status, 'open');
  assert.equal(state.openedAt, now);
  assert.equal(state.expiresAt, now + 24 * hour);
});

test('eventos fora de ordem usam a mensagem mais recente pelo instante', () => {
  const contact = { msgs: [message('c', now - hour), message('c', now - 3 * hour)] };
  assert.equal(calculate(contact, now).openedAt, now - hour);
});

test('horários antigos e atividade do contato não são convertidos em datas inventadas', () => {
  const contact = { ts: now, msgs: [{ who: 'c', time: '09:41' }] };
  const state = calculate(contact, now);
  assert.equal(state.status, 'unavailable');
  assert.equal(state.expiresAt, null);
  assert.equal(calculate({ msgs: [{ who: 'c', sentAt: '2026-11-09T10:00:00' }] }, now).status, 'unavailable');
});

test('histórico antigo fica disponível após uma mensagem com data completa', () => {
  const contact = { msgs: [{ who: 'c', time: 'Ontem' }, message('c', now - hour)] };
  assert.equal(calculate(contact, now).remainingMs, 23 * hour);
  contact.msgs.push({ who: 'c', time: '18:00' });
  assert.equal(calculate(contact, now).status, 'unavailable');
});

test('datas inválidas ou futuras não produzem um prazo válido', () => {
  for (const sentAt of ['inválida', null, Infinity, -1, new Date(now + hour).toISOString()]) {
    assert.equal(calculate({ msgs: [{ who: 'c', sentAt }] }, now).status, 'unavailable');
  }
});

test('instantes com fusos diferentes produzem a mesma expiração, sem alterar o contato', () => {
  const local = Object.freeze({ msgs: Object.freeze([Object.freeze({ who: 'c', sentAt: '2026-11-09T17:00:00-03:00' })]) });
  const utc = { msgs: [{ who: 'c', sentAt: '2026-11-09T20:00:00Z' }] };
  assert.equal(calculate(local, now).expiresAt, calculate(utc, now).expiresAt);
  assert.equal(calculate(local, now).remainingMs, 23 * hour);
});
