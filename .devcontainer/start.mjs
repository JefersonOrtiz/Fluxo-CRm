import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve ser uma porta válida.');
const address = `http://127.0.0.1:${port}`;
const logDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(root, 'data');
const logPath = join(logDir, 'codespaces-preview.log');

async function healthy() {
  let response;
  try { response = await fetch(`${address}/api/health`, { signal: AbortSignal.timeout(2000) }); }
  catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return false;
    throw new Error(`Não foi possível conferir a porta ${port}. Nenhum processo existente foi alterado.`);
  }
  let body;
  try { body = await response.json(); } catch { /* Porta em uso por outro serviço. */ }
  if (!response.ok || body?.ok !== true || body?.database !== 'sqlite') {
    throw new Error(`A porta ${port} já está em uso por outro serviço.`);
  }
  return true;
}

if (await healthy()) {
  console.log(`JF System CRM já está disponível em http://localhost:${port}`);
} else {
  await mkdir(logDir, { recursive: true });
  const log = await open(logPath, 'a');
  let child;
  try {
    child = spawn(process.execPath, ['--watch', join(root, 'server.mjs')], {
      cwd: root, detached: true,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', log.fd, log.fd],
    });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  } finally { await log.close(); }
  child.unref();
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      await delay(250);
      if (await healthy()) { ready = true; break; }
    }
    if (!ready) throw new Error(`O CRM não iniciou. Consulte ${logPath}.`);
    console.log(`JF System CRM disponível em http://localhost:${port} (processo ${child.pid})`);
  } catch (error) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Processo já encerrado. */ }
    throw error;
  }
}
