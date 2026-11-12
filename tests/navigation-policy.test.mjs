import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/navigation-policy.js', import.meta.url), 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const { canAccessView } = context.globalThis.FluxoNavigationPolicy;
const session = permissions => ({ user: { permissions } });

test('administrador acessa módulos administrativos e públicos', () => {
  assert.equal(canAccessView('admin', session(['*']), 'api'), true);
  assert.equal(canAccessView('organization', session(['*']), 'api'), true);
});

test('gestor acessa administração parcial e usuário sem privilégios não acessa', () => {
  assert.equal(canAccessView('admin', session(['members:write']), 'api'), true);
  assert.equal(canAccessView('admin', session([]), 'api'), false);
  assert.equal(canAccessView('admin', session(['contacts:write']), 'api'), false);
});

test('atendente e usuário somente leitura preservam módulos de leitura', () => {
  for (const permissions of [[], ['contacts:read']]) {
    assert.equal(canAccessView('dashboard', session(permissions), 'api'), true);
    assert.equal(canAccessView('contacts', session(permissions), 'api'), true);
    assert.equal(canAccessView('organization', session(permissions), 'api'), true);
    assert.equal(canAccessView('admin', session(permissions), 'api'), false);
  }
});

test('carregamento, sessão inválida e logout ocultam somente o módulo restrito', () => {
  assert.equal(canAccessView('admin', null, 'api'), false);
  assert.equal(canAccessView('admin', session([]), 'api'), false);
  assert.equal(canAccessView('dashboard', null, 'api'), true);
  assert.equal(canAccessView('settings', null, 'api'), true);
});

test('acesso direto restrito é negado e novas permissões são avaliadas', () => {
  assert.equal(canAccessView('admin', session([]), 'api'), false);
  assert.equal(canAccessView('admin', session(['roles:write']), 'api'), true);
});

test('modo demonstração não usa a política da sessão API', () => {
  assert.equal(canAccessView('admin', session([]), 'demo'), true);
});
