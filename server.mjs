import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import './shared/plans.js';

const root = process.cwd();
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
const port = Number(process.env.PORT || 3000);
// No Railway, defina DATA_DIR=/data para manter o SQLite no Volume persistente.
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(root, 'data');
const dbPath = join(dataDir, 'fluxo-crm.sqlite');
await mkdir(dataDir, { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    email TEXT,
    stage TEXT NOT NULL DEFAULT 'Novo lead',
    value_cents INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    ai_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS contact_tags (
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (contact_id, tag_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK(sender IN ('client', 'agent', 'ai')),
    body TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'sent'
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'reuniao',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_messages_contact_date ON messages(contact_id, sent_at);
  CREATE INDEX IF NOT EXISTS idx_events_start ON events(starts_at);
`);

const seed = db.prepare('SELECT COUNT(*) AS total FROM contacts').get();
if (seed.total === 0) {
  const insert = db.prepare(`INSERT INTO contacts (id, name, company, phone, email, stage, value_cents, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const seedContacts = [
    ['c1', 'Carla Mendes', 'Luma Studio', '+55 11 98877-1020', 'carla@lumastudio.com.br', 'Negociação', 1490000, 'Prefere contato à tarde.'],
    ['c2', 'João Pedro Alves', 'JP Alimentos', '+55 31 99811-4455', 'jp@jpalimentos.com.br', 'Proposta', 820000, ''],
    ['c3', 'Bianca Rocha', 'Ateliê Raízes', '+55 21 97744-8899', 'bi@atelierraizes.com', 'Qualificação', 240000, ''],
    ['c4', 'Rafael Costa', 'Studio Vértice', '+55 11 96622-3311', 'rafa@studiovertice.com', 'Novo lead', 0, '']
  ];
  db.exec('BEGIN');
  try { for (const contact of seedContacts) insert.run(...contact); db.exec('COMMIT'); }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};
const readBody = async req => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 1_000_000) reject(new Error('Payload muito grande')); });
  req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('JSON inválido')); } });
  req.on('error', reject);
});
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (/^\/api\/(billing|auth)\//.test(url.pathname)) {
      res.setHeader('Cache-Control', 'no-store');
      const target = new URL(process.env.API_PROXY_URL || 'http://127.0.0.1:3001');
      target.pathname = url.pathname;
      target.search = url.search;
      const upstream = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, {
        method: req.method, headers: { ...req.headers, host: target.host }, timeout: 20_000,
      }, upstreamResponse => {
        res.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
        upstreamResponse.pipe(res);
      });
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => {
        if (res.headersSent) return res.destroy();
        if (url.pathname === '/api/billing/config') return json(res, 200, { enabled: false, publicKey: null, plans: globalThis.JF_CRM_PLANS });
        json(res, 503, { error: 'O serviço de assinaturas ainda não está disponível nesta instalação.' });
      });
      req.pipe(upstream);
      return;
    }
    if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true, database: 'sqlite' });
    if (url.pathname === '/api/contacts' && req.method === 'GET') {
      return json(res, 200, db.prepare('SELECT * FROM contacts ORDER BY updated_at DESC').all());
    }
    if (url.pathname === '/api/contacts' && req.method === 'POST') {
      const item = await readBody(req);
      if (!item.id || !item.name) return json(res, 400, { error: 'id e name são obrigatórios' });
      db.prepare(`INSERT INTO contacts (id,name,company,phone,email,stage,value_cents,notes,ai_enabled)
        VALUES (@id,@name,@company,@phone,@email,@stage,@value_cents,@notes,@ai_enabled)`).run({
          company: '', phone: '', email: '', stage: 'Novo lead', value_cents: 0, notes: '', ai_enabled: 1, ...item
        });
      return json(res, 201, db.prepare('SELECT * FROM contacts WHERE id = ?').get(item.id));
    }
    const contactMatch = url.pathname.match(/^\/api\/contacts\/([^/]+)$/);
    if (contactMatch && req.method === 'PATCH') {
      const patch = await readBody(req); const id = decodeURIComponent(contactMatch[1]);
      const allowed = ['name', 'company', 'phone', 'email', 'stage', 'value_cents', 'notes', 'ai_enabled'];
      const keys = Object.keys(patch).filter(key => allowed.includes(key));
      if (!keys.length) return json(res, 400, { error: 'Nenhum campo editável enviado' });
      const values = Object.fromEntries(keys.map(key => [key, patch[key]]));
      values.id = id;
      const set = keys.map(key => `${key} = @${key}`).join(', ');
      const result = db.prepare(`UPDATE contacts SET ${set}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run(values);
      if (!result.changes) return json(res, 404, { error: 'Contato não encontrado' });
      return json(res, 200, db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
    }
    if (url.pathname === '/api/events' && req.method === 'GET') return json(res, 200, db.prepare('SELECT * FROM events ORDER BY starts_at').all());

    let requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\//, '');
    requested = normalize(requested).replace(/^([.][.][\\/])+/, '');
    const publicFile = requested === 'index.html' || requested === 'shared/plans.js'
      || /^(js\/[a-z0-9-]+\.js|css\/[a-z0-9-]+\.css|assets\/[a-z0-9_/-]+\.(png|webp|jpe?g|svg|ico|woff2?))$/i.test(requested);
    if (!publicFile) return json(res, 404, { error: 'Não encontrado' });
    let filePath = join(root, requested);
    const legacyFiles = {
      'js/app.js': 'js/app.js.txt',
      'js/ai.js': 'js/ai.js.txt',
      'js/data.js': 'js/data.js.txt',
      'css/style.css': 'css/style.css.css'
    };
    if (!existsSync(filePath) && legacyFiles[requested]) filePath = join(root, legacyFiles[requested]);
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime[extname(requested)] || 'application/octet-stream' });
    res.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') return json(res, 404, { error: 'Não encontrado' });
    console.error(error); return json(res, 500, { error: error.message || 'Erro interno' });
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`A porta ${port} já está em uso. Use outra porta, por exemplo: $env:PORT=3001; npm.cmd start`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
server.listen(port, () => console.log(`JF System CRM em http://localhost:${port}`));
