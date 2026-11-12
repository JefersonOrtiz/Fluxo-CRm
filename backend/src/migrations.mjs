import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migrationsDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));

const INITIAL_SCHEMA_TABLES = {
  organizations: ['id', 'name', 'created_at'],
  roles: ['id', 'organization_id', 'name', 'description', 'permissions', 'created_at'],
  departments: ['id', 'organization_id', 'name', 'color', 'created_at'],
  users: ['id', 'organization_id', 'department_id', 'role_id', 'name', 'email', 'password_hash', 'active', 'last_seen_at', 'created_at'],
  tags: ['id', 'organization_id', 'name', 'color'],
  contacts: ['id', 'organization_id', 'name', 'phone', 'email', 'company', 'stage', 'value_cents', 'created_at', 'updated_at'],
  contact_tags: ['contact_id', 'tag_id'],
  conversations: ['id', 'organization_id', 'contact_id', 'assigned_user_id', 'channel', 'status', 'created_at', 'updated_at'],
  messages: ['id', 'conversation_id', 'direction', 'sender_type', 'body', 'provider_message_id', 'client_message_id', 'status', 'sent_at'],
  events: ['id', 'organization_id', 'contact_id', 'assigned_user_id', 'title', 'type', 'start_at', 'end_at', 'timezone', 'created_at', 'updated_at'],
  integrations: ['id', 'organization_id', 'provider', 'app_id', 'business_id', 'waba_id', 'phone_number_id', 'secret_ciphertext', 'status', 'created_at', 'updated_at']
};

const INITIAL_SCHEMA_INDEXES = [
  'contacts_org_idx', 'conversations_org_idx', 'messages_conversation_idx',
  'messages_conversation_client_id_idx', 'events_org_start_idx', 'events_assignee_time_idx'
];

const INITIAL_SCHEMA_CONSTRAINT_COUNTS = {
  organizations: { p: 1 }, roles: { p: 1, f: 1, u: 1 }, departments: { p: 1, f: 1, u: 1 },
  users: { p: 1, f: 3, u: 1 }, tags: { p: 1, f: 1, u: 1 }, contacts: { p: 1, f: 1 },
  contact_tags: { p: 1, f: 2 }, conversations: { p: 1, f: 3 }, messages: { p: 1, f: 1, c: 3 },
  events: { p: 1, f: 3, c: 2 }, integrations: { p: 1, f: 1, u: 1 }
};

export async function hasCompleteInitialSchema(client) {
  const requiredColumns = Object.entries(INITIAL_SCHEMA_TABLES)
    .flatMap(([table, columns]) => columns.map(column => ({ table, column })));
  const columns = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
  `, [Object.keys(INITIAL_SCHEMA_TABLES)]);
  const existingColumns = new Set(columns.rows.map(row => `${row.table_name}.${row.column_name}`));
  if (requiredColumns.some(({ table, column }) => !existingColumns.has(`${table}.${column}`))) return false;

  const indexes = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ANY($1::text[])
  `, [INITIAL_SCHEMA_INDEXES]);
  if (indexes.rows.length !== INITIAL_SCHEMA_INDEXES.length) return false;

  const constraints = await client.query(`
    SELECT table_record.relname AS table_name, constraint_record.contype
    FROM pg_constraint constraint_record
    JOIN pg_class table_record ON table_record.oid = constraint_record.conrelid
    JOIN pg_namespace namespace_record ON namespace_record.oid = table_record.relnamespace
    WHERE namespace_record.nspname = 'public'
      AND table_record.relname = ANY($1::text[])
  `, [Object.keys(INITIAL_SCHEMA_TABLES)]);
  const counts = new Map();
  for (const row of constraints.rows) {
    const tableCounts = counts.get(row.table_name) || {};
    tableCounts[row.contype] = (tableCounts[row.contype] || 0) + 1;
    counts.set(row.table_name, tableCounts);
  }
  return Object.entries(INITIAL_SCHEMA_CONSTRAINT_COUNTS).every(([table, required]) => {
    const actual = counts.get(table) || {};
    return Object.entries(required).every(([type, minimum]) => (actual[type] || 0) >= minimum);
  });
}

export async function runMigrations(pool) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('fluxo_crm_migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(160) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(migrationsDirectory)).filter(file => file.endsWith('.sql')).sort();
    const applied = await client.query('SELECT version FROM schema_migrations');
    const completed = new Set(applied.rows.map(row => row.version));
    const initialMigration = files[0];
    if (!completed.size && initialMigration && await hasCompleteInitialSchema(client)) {
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [initialMigration]);
        completed.add(initialMigration);
        console.log(`Baseline registrada: ${initialMigration}`);
    }
    for (const file of files) {
      if (completed.has(file)) continue;
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]);
        await client.query('COMMIT');
        console.log(`Migration aplicada: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('fluxo_crm_migrations'))").catch(() => {});
    client.release();
  }
}
