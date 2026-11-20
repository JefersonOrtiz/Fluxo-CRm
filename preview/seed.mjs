import { Pool } from 'pg';
import { createSecurity } from '/app/src/security.mjs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const security = createSecurity({
  jwtSecret: 'preview-only-seed-secret',
  encryptionKey: Buffer.alloc(32)
});

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const org = await client.query(
    `INSERT INTO organizations(name) VALUES($1)
     ON CONFLICT DO NOTHING RETURNING id`,
    ['JF System Demo Tenant']
  );
  const orgId = org.rows[0]?.id || (await client.query('SELECT id FROM organizations WHERE name=$1', ['JF System Demo Tenant'])).rows[0].id;
  const role = await client.query(
    `INSERT INTO roles(organization_id,name,description,permissions) VALUES($1,$2,$3,$4)
     ON CONFLICT (organization_id,name) DO UPDATE SET permissions=EXCLUDED.permissions
     RETURNING id`,
    [orgId, 'Super Admin', 'Administrador da demonstração', JSON.stringify(['*'])]
  );
  const admin = await client.query(
    `INSERT INTO users(organization_id,role_id,name,email,password_hash,is_platform_admin)
     VALUES($1,$2,$3,$4,$5,true)
     ON CONFLICT (email) DO UPDATE SET organization_id=EXCLUDED.organization_id, role_id=EXCLUDED.role_id, is_platform_admin=true, active=true
     RETURNING id`,
    [orgId, role.rows[0].id, 'Administrador Demo', 'superadmin.preview@example.invalid', security.passwordHash('DemoAurora!2026')]
  );
  await client.query(
    `INSERT INTO platform_tenant_settings(organization_id,plan,monthly_fee,billing_due_day,user_limit,ai_requests_limit,ai_input_tokens_limit,ai_output_tokens_limit)
     VALUES($1,'demo',0,10,25,1000,100000,50000)
     ON CONFLICT (organization_id) DO NOTHING`, [orgId]
  );
  for (const featureKey of ['dashboard', 'contacts', 'conversations', 'calendar', 'aurora', 'integrations', 'administration']) {
    await client.query(`INSERT INTO platform_tenant_features(organization_id,feature_key,enabled,visible,updated_by)
      VALUES($1,$2,true,true,$3) ON CONFLICT (organization_id,feature_key) DO NOTHING`, [orgId, featureKey, admin.rows[0].id]);
  }
  await client.query('COMMIT');
  console.log(`Preview seed ready (${admin.rows[0].id})`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
