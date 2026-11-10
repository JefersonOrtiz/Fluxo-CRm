import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const script = fileURLToPath(new URL('../.devcontainer/start.mjs', import.meta.url));
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = server => new Promise(resolve => server.close(resolve));

test('Codespaces inicia a prévia e reutiliza o servidor ao reabrir', async () => {
  const reservation = createServer();
  await listen(reservation);
  const port = reservation.address().port;
  await close(reservation);
  const data = await mkdtemp(join(tmpdir(), 'jf-codespaces-test-'));
  const env = { ...process.env, PORT: String(port), DATA_DIR: data };
  let pid;
  try {
    const first = await exec(process.execPath, [script], { env, timeout: 20000 });
    pid = Number(first.stdout.match(/processo (\d+)/)?.[1]);
    assert.ok(pid > 0, first.stdout);
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.deepEqual(await response.json(), { ok: true, database: 'sqlite' });
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.match(await page.text(), /JF System CRM/);
    const second = await exec(process.execPath, [script], { env, timeout: 5000 });
    assert.match(second.stdout, /já está disponível/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
  } finally {
    if (pid) { try { process.kill(-pid, 'SIGTERM'); } catch { /* Encerrado. */ } }
    await rm(data, { recursive: true, force: true });
  }
});

test('Codespaces preserva outro serviço quando a porta está ocupada', async () => {
  const server = createServer((_request, response) => response.end('Outro serviço'));
  await listen(server);
  const port = server.address().port;
  try {
    await assert.rejects(exec(process.execPath, [script], { env: { ...process.env, PORT: String(port) }, timeout: 5000 }), /já está em uso por outro serviço/);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'Outro serviço');
  } finally { await close(server); }
});

test('Codespaces recusa porta inválida antes de iniciar o servidor', async () => {
  await assert.rejects(exec(process.execPath, [script], { env: { ...process.env, PORT: 'invalid' }, timeout: 5000 }), /PORT deve ser uma porta válida/);
});
