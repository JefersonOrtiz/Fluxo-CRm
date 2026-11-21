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
  const user = decodeURIComponent(url.username);
  if (database !== 'jfcrm_migrations_etapa21') throw new Error('banco não autorizado');
  if (user !== 'tester') throw new Error('usuário não autorizado');
  if (['railway', 'postgres', 'template0', 'template1', 'jfcrm_restauracao_teste'].includes(database)) {
    throw new Error('banco protegido não pode ser usado');
  }
  return Object.freeze({ protocol: url.protocol, hostname: url.hostname, port: url.port, database, user });
};

const isLocalOrPrivateAddress = address => (
  address === '::1' ||
  /^127\./.test(address) ||
  /^10\./.test(address) ||
  /^192\.168\./.test(address) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
  /^(fc|fd)[0-9a-f]{2}:/i.test(address)
);

export const validateConnectedMigrationTestTarget = ({ target, identity }) => {
  if (!identity || identity.database !== target.database || identity.user !== target.user) {
    throw new Error('banco ou usuário PostgreSQL conectado não corresponde ao alvo autorizado');
  }

  // GitHub Actions encaminha 127.0.0.1:55432 do runner para a porta 5432 do
  // container. A identidade do servidor, portanto, não pode ser comparada à
  // superfície de conexão usada pelo cliente.
  if (!isLocalOrPrivateAddress(identity.address) || String(identity.port) !== '5432') {
    throw new Error('servidor PostgreSQL conectado não corresponde ao alvo descartável autorizado');
  }
};

const valid = 'postgresql://tester:secret@127.0.0.1:55432/jfcrm_migrations_etapa21';

test('aceita somente o destino local descartável autorizado', () => {
  assert.deepEqual(validateMigrationTestTarget({ allowed: 'true', databaseUrl: valid }), {
    protocol: 'postgresql:', hostname: '127.0.0.1', port: '55432', database: 'jfcrm_migrations_etapa21', user: 'tester'
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
    { allowed: 'true', databaseUrl: valid.replace('tester:', 'postgres:') },
    { allowed: 'true', databaseUrl: valid.replace('jfcrm_migrations_etapa21', 'railway') },
    { allowed: 'true', databaseUrl: valid.replace('jfcrm_migrations_etapa21', 'jfcrm_restauracao_teste') },
    { allowed: 'true', databaseUrl: `${valid}?host=railway.internal` },
    { allowed: 'true', databaseUrl: `${valid}#staging` }
  ];
  for (const value of cases) assert.throws(() => validateMigrationTestTarget(value));
});

test('aceita a identidade interna do container somente após validar a superfície local do runner', () => {
  const target = validateMigrationTestTarget({ allowed: 'true', databaseUrl: valid });
  assert.doesNotThrow(() => validateConnectedMigrationTestTarget({
    target,
    identity: { database: target.database, user: target.user, address: '172.18.0.2', port: 5432 }
  }));
});

test('rejeita identidade de banco, usuário, rede ou porta diferente antes de operações destrutivas', () => {
  const target = validateMigrationTestTarget({ allowed: 'true', databaseUrl: valid });
  const validIdentity = { database: target.database, user: target.user, address: '172.18.0.2', port: 5432 };
  for (const identity of [
    { ...validIdentity, database: 'railway' },
    { ...validIdentity, user: 'postgres' },
    { ...validIdentity, address: '198.51.100.10' },
    { ...validIdentity, address: null },
    { ...validIdentity, port: 55432 }
  ]) assert.throws(() => validateConnectedMigrationTestTarget({ target, identity }));
});
