import test from 'node:test';
import assert from 'node:assert/strict';

export const validateMigrationTestTarget = ({ allowed, databaseUrl }) => {
  if (allowed !== 'true') throw new Error('MIGRATIONS_TEST_ALLOWED=true é obrigatório');
  if (typeof databaseUrl !== 'string' || !databaseUrl) throw new Error('DATABASE_URL é obrigatório');
  let url;
  try { url = new URL(databaseUrl); } catch { throw new Error('DATABASE_URL inválida'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('protocolo PostgreSQL inválido');
  if (url.hostname !== '127.0.0.1' || url.port !== '55432') throw new Error('host ou porta não autorizados');
  if (url.search || url.hash) throw new Error('parâmetros de conexão não são permitidos');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (database !== 'jfcrm_migrations_etapa21') throw new Error('banco não autorizado');
  if (['railway', 'postgres', 'template0', 'template1', 'jfcrm_restauracao_teste'].includes(database)) {
    throw new Error('banco protegido não pode ser usado');
  }
  return Object.freeze({ protocol: url.protocol, hostname: url.hostname, port: url.port, database });
};

const valid = 'postgresql://tester:secret@127.0.0.1:55432/jfcrm_migrations_etapa21';

test('aceita somente o destino local descartável autorizado', () => {
  assert.deepEqual(validateMigrationTestTarget({ allowed: 'true', databaseUrl: valid }), {
    protocol: 'postgresql:', hostname: '127.0.0.1', port: '55432', database: 'jfcrm_migrations_etapa21'
  });
  assert.equal(validateMigrationTestTarget({ allowed: 'true', databaseUrl: valid.replace('postgresql:', 'postgres:') }).port, '55432');
});

test('rejeita configuração ausente, inválida, Railway, staging, restauração e portas incorretas', () => {
  const cases = [
    {},
    { allowed: 'false', databaseUrl: valid },
    { allowed: 'true', databaseUrl: 'not-a-url' },
    { allowed: 'true', databaseUrl: valid.replace('postgresql:', 'mysql:') },
    { allowed: 'true', databaseUrl: valid.replace('127.0.0.1', 'railway.internal') },
    { allowed: 'true', databaseUrl: valid.replace('55432', '5432') },
    { allowed: 'true', databaseUrl: valid.replace('jfcrm_migrations_etapa21', 'railway') },
    { allowed: 'true', databaseUrl: valid.replace('jfcrm_migrations_etapa21', 'jfcrm_restauracao_teste') },
    { allowed: 'true', databaseUrl: `${valid}?host=railway.internal` },
    { allowed: 'true', databaseUrl: `${valid}#staging` }
  ];
  for (const value of cases) assert.throws(() => validateMigrationTestTarget(value));
});
