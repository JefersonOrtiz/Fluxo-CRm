import { createServer } from 'node:http';
import { Pool } from 'pg';
import { createRequestHandler } from './src/app.mjs';
import { loadConfig } from './src/config.mjs';
import { createSecurity } from './src/security.mjs';
import { runMigrations } from './src/migrations.mjs';

const config = loadConfig();
const pool = new Pool({ connectionString: config.databaseUrl });
const security = createSecurity(config);
await runMigrations(pool);
const server = createServer(createRequestHandler({ pool, security, config }));

const shutdown = signal => {
  console.log(`${signal} recebido; encerrando a API.`);
  server.close(async error => {
    await pool.end();
    process.exitCode = error ? 1 : 0;
  });
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
server.listen(config.port, () => console.log(`Fluxo API disponível em http://localhost:${config.port}`));
