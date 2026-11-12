import { timingSafeEqual } from 'node:crypto';
import { databaseError, email, HttpError, json, optionalString, parseBody, requiredString, routeId } from './http.mjs';

export const ROLE_PERMISSIONS = Object.freeze([
  'organization:write',
  'contacts:write',
  'conversations:write',
  'messages:write',
  'events:write',
  'members:write',
  'roles:write',
  'integrations:write'
]);

const CONTACT_STAGES = Object.freeze(['Novo lead', 'Qualificação', 'Proposta', 'Negociação', 'Fechamento']);
const CONTACT_SORTS = Object.freeze({
  updatedAt: 'c.updated_at',
  name: 'c.name',
  value: 'c.value_cents',
  createdAt: 'c.created_at'
});
const CONTACT_SELECT = `SELECT c.id,c.name,c.phone,c.email,c.company,c.stage,c.value_cents "valueCents",c.created_at "createdAt",c.updated_at "updatedAt",c.xmin::text version,COALESCE(json_agg(json_build_object('id',t.id,'name',t.name,'color',t.color) ORDER BY t.name) FILTER (WHERE t.id IS NOT NULL),'[]'::json) tags FROM contacts c LEFT JOIN contact_tags ct ON ct.contact_id=c.id LEFT JOIN tags t ON t.id=ct.tag_id`;
const CONVERSATION_STATUSES = Object.freeze(['open', 'closed']);
const CONVERSATION_SELECT = `SELECT cv.id,cv.channel,cv.status,cv.contact_id "contactId",cv.assigned_user_id "assignedUserId",cv.created_at "createdAt",cv.updated_at "updatedAt",cv.xmin::text version,c.name "contactName",c.company "contactCompany",c.phone "contactPhone",u.name "assignedUserName",lm.id "latestMessageId",lm.body "latestMessageBody",lm.direction "latestMessageDirection",lm.sender_type "latestMessageSenderType",lm.status "latestMessageStatus",lm.sent_at "latestMessageSentAt" FROM conversations cv JOIN contacts c ON c.id=cv.contact_id LEFT JOIN users u ON u.id=cv.assigned_user_id LEFT JOIN LATERAL (SELECT m.id,m.body,m.direction,m.sender_type,m.status,m.sent_at FROM messages m WHERE m.conversation_id=cv.id ORDER BY m.sent_at DESC,m.id DESC LIMIT 1) lm ON true`;
const MESSAGE_SELECT = `SELECT id,conversation_id "conversationId",direction,sender_type "senderType",body,client_message_id "clientMessageId",provider_message_id "providerMessageId",status,sent_at "sentAt" FROM messages`;
const EVENT_TYPES = Object.freeze(['reuniao', 'followup', 'entrega', 'lead']);
const EVENT_SELECT = `SELECT e.id,e.title,e.type,e.start_at "startAt",e.end_at "endAt",e.timezone,e.contact_id "contactId",e.assigned_user_id "assignedUserId",e.created_at "createdAt",e.updated_at "updatedAt",e.xmin::text version,c.name "contactName",c.company "contactCompany",u.name "assignedUserName" FROM events e LEFT JOIN contacts c ON c.id=e.contact_id LEFT JOIN users u ON u.id=e.assigned_user_id`;

const encodeCursor = (timestamp, id) => Buffer.from(JSON.stringify([new Date(timestamp).toISOString(), id])).toString('base64url');
const decodeCursor = value => {
  if (!value) return null;
  try {
    const [timestamp, id] = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!timestamp || Number.isNaN(Date.parse(timestamp)) || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error();
    return { timestamp, id };
  } catch {
    throw new HttpError(400, 'Cursor inválido', 'VALIDATION_ERROR');
  }
};

const conversationOutput = row => ({ ...row, nextCursor: undefined });

const getConversation = async (queryable, conversationId, organizationId) => {
  const { rows } = await queryable.query(`${CONVERSATION_SELECT} WHERE cv.id=$1 AND cv.organization_id=$2`, [conversationId, organizationId]);
  return rows[0] ? conversationOutput(rows[0]) : null;
};

const getEvent = async (queryable, eventId, organizationId) => {
  const { rows } = await queryable.query(`${EVENT_SELECT} WHERE e.id=$1 AND e.organization_id=$2`, [eventId, organizationId]);
  return rows[0] || null;
};

const readInstant = (body, field, label) => {
  const value = requiredString(body, field, { max: 40, label });
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${label} deve ser um instante ISO 8601 com fuso`, 'VALIDATION_ERROR');
  }
  return new Date(value);
};

const readTimezone = (body, field = 'timezone') => {
  const value = requiredString(body, field, { max: 64, label: 'Fuso horário' });
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: value }).format(); }
  catch { throw new HttpError(400, 'Fuso horário IANA inválido', 'VALIDATION_ERROR'); }
  return value;
};

const assertNoEventConflict = async (queryable, { organizationId, assignedUserId, startAt, endAt, excludeId }) => {
  if (!assignedUserId) return;
  const values = [organizationId, assignedUserId, startAt, endAt];
  let exclude = '';
  if (excludeId) { values.push(excludeId); exclude = ` AND id<>$${values.length}`; }
  const conflict = await queryable.query(`SELECT id,title,start_at "startAt",end_at "endAt" FROM events WHERE organization_id=$1 AND assigned_user_id=$2 AND start_at<$4 AND end_at>$3${exclude} ORDER BY start_at LIMIT 1`, values);
  if (conflict.rowCount) {
    const error = new HttpError(409, 'O responsável já possui um evento nesse horário', 'EVENT_CONFLICT');
    error.conflict = conflict.rows[0];
    throw error;
  }
};

const readContactTags = body => {
  if (body.tagIds === undefined) return undefined;
  if (!Array.isArray(body.tagIds) || body.tagIds.length > 20) throw new HttpError(400, 'Tags inválidas', 'VALIDATION_ERROR');
  return [...new Set(body.tagIds.map(value => String(value)))];
};

const validateContactTags = async (queryable, tagIds, organizationId) => {
  if (!tagIds?.length) return;
  const { rows } = await queryable.query('SELECT id FROM tags WHERE organization_id=$1 AND id=ANY($2::uuid[])', [organizationId, tagIds]);
  if (rows.length !== tagIds.length) throw new HttpError(400, 'Uma ou mais tags não pertencem à organização', 'INVALID_REFERENCE');
};

const replaceContactTags = async (queryable, contactId, tagIds) => {
  await queryable.query('DELETE FROM contact_tags WHERE contact_id=$1', [contactId]);
  if (tagIds.length) await queryable.query('INSERT INTO contact_tags(contact_id,tag_id) SELECT $1,unnest($2::uuid[])', [contactId, tagIds]);
};

const getContact = async (queryable, contactId, organizationId) => {
  const { rows } = await queryable.query(`${CONTACT_SELECT} WHERE c.id=$1 AND c.organization_id=$2 GROUP BY c.id`, [contactId, organizationId]);
  return rows[0] || null;
};

const contactFields = (body, { partial = false } = {}) => {
  const fields = {};
  if (!partial || body.name !== undefined) fields.name = requiredString(body, 'name', { max: 160, label: 'Nome' });
  for (const [field, max, label] of [['phone', 40, 'Telefone'], ['email', 255, 'E-mail'], ['company', 160, 'Empresa']]) {
    if (!partial || body[field] !== undefined) fields[field] = optionalString(body, field, { max, label });
  }
  if (!partial || body.stage !== undefined) {
    const stage = body.stage === undefined ? 'Novo lead' : requiredString(body, 'stage', { max: 60, label: 'Etapa' });
    if (!CONTACT_STAGES.includes(stage)) throw new HttpError(400, 'Etapa do funil inválida', 'VALIDATION_ERROR');
    fields.stage = stage;
  }
  if (!partial || body.valueCents !== undefined) {
    const value = body.valueCents === undefined ? 0 : Number(body.valueCents);
    if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) throw new HttpError(400, 'Valor deve ser um inteiro não negativo em centavos', 'VALIDATION_ERROR');
    fields.valueCents = value;
  }
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new HttpError(400, 'E-mail inválido', 'VALIDATION_ERROR');
  return fields;
};

const userPayload = row => ({
  userId: row.id,
  organizationId: row.organization_id,
  name: row.name,
  role: row.role_name,
  permissions: row.permissions || []
});

const auth = async (request, security, pool) => {
  const token = security.readToken(request);

  if (!token?.userId || !token?.organizationId) {
    throw new HttpError(401, 'Não autorizado', 'UNAUTHORIZED');
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.organization_id, u.name,
            r.name AS role_name, r.permissions
       FROM users u
       JOIN roles r
         ON r.id = u.role_id
        AND r.organization_id = u.organization_id
      WHERE u.id = $1
        AND u.organization_id = $2
        AND u.active = true`,
    [token.userId, token.organizationId]
  );

  if (!rows[0]) {
    throw new HttpError(401, 'Sessão inválida ou usuário desativado', 'UNAUTHORIZED');
  }

  return userPayload(rows[0]);
};

const requirePermission = (session, permission) => {
  const permissions = Array.isArray(session.permissions) ? session.permissions : [];
  if (!permissions.includes('*') && !permissions.includes(permission)) {
    throw new HttpError(403, 'Sem permissão para esta ação', 'FORBIDDEN');
  }
};

const readPermissions = body => {
  if (body.permissions === undefined) return [];
  if (!Array.isArray(body.permissions) || body.permissions.length > ROLE_PERMISSIONS.length) {
    throw new HttpError(400, 'Permissões inválidas', 'VALIDATION_ERROR');
  }
  const permissions = [...new Set(body.permissions.map(value => String(value)))];
  if (permissions.some(value => !ROLE_PERMISSIONS.includes(value))) {
    throw new HttpError(400, 'Permissão desconhecida ou reservada', 'VALIDATION_ERROR');
  }
  return permissions;
};

const assertOwnedReference = async (pool, table, id, organizationId, label) => {
  if (!id) return null;
  const { rowCount } = await pool.query(`SELECT 1 FROM ${table} WHERE id=$1 AND organization_id=$2`, [id, organizationId]);
  if (!rowCount) throw new HttpError(400, `${label} não pertence à organização`, 'INVALID_REFERENCE');
  return id;
};

const notFound = label => new HttpError(404, `${label} não encontrado`, 'NOT_FOUND');

export function createRequestHandler({ pool, security, config }) {
  return async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.setHeader('Vary', 'Origin');
    if (request.method === 'OPTIONS') return response.writeHead(204).end();

    const url = new URL(request.url, `http://${request.headers.host}`);
    try {
      if (url.pathname === '/api/health' && request.method === 'GET') {
        await pool.query('SELECT 1');
        return json(response, 200, { ok: true, service: 'fluxo-api' });
      }

      if (url.pathname === '/api/auth/bootstrap' && request.method === 'POST') {
        const configuredSecret = config.bootstrapSecret;
        const suppliedSecret = request.headers['x-bootstrap-secret'];

        const expected = Buffer.from(configuredSecret || '');
        const supplied = Buffer.from(typeof suppliedSecret === 'string' ? suppliedSecret : '');

        if (expected.length < 32 ||
            supplied.length !== expected.length ||
            !timingSafeEqual(expected, supplied)) {
          throw new HttpError(403, 'Bootstrap não autorizado', 'FORBIDDEN');
        }

        const body = await parseBody(request);
        const organizationName = requiredString(body, 'organizationName', { max: 120, label: 'Organização' });
        const name = requiredString(body, 'name', { max: 120, label: 'Nome' });
        const userEmail = email(body);
        const password = requiredString(body, 'password', { min: 8, max: 128, label: 'Senha' });
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock(824731, 1)');
          const { rows: [{ count }] } = await client.query('SELECT COUNT(*)::int AS count FROM users');
          if (count) throw new HttpError(409, 'A organização inicial já foi criada', 'BOOTSTRAP_COMPLETED');
          const org = await client.query('INSERT INTO organizations(name) VALUES($1) RETURNING id,name', [organizationName]);
          const role = await client.query("INSERT INTO roles(organization_id,name,description,permissions) VALUES($1,'Administrador','Acesso total',$2) RETURNING id,name,permissions", [org.rows[0].id, JSON.stringify(['*'])]);
          const user = await client.query('INSERT INTO users(organization_id,role_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,organization_id,name', [org.rows[0].id, role.rows[0].id, name, userEmail, security.passwordHash(password)]);
          await client.query('COMMIT');
          const payload = { userId: user.rows[0].id, organizationId: user.rows[0].organization_id, name: user.rows[0].name, role: role.rows[0].name, permissions: role.rows[0].permissions };
          return json(response, 201, { token: security.signToken(payload), user: payload });
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        const body = await parseBody(request);
        const userEmail = email(body);
        const password = requiredString(body, 'password', { min: 1, max: 128, label: 'Senha' });
        const { rows } = await pool.query(`SELECT u.*, r.name role_name, r.permissions FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.email=$1 AND u.active=true`, [userEmail]);
        if (!rows[0] || !security.passwordMatches(password, rows[0].password_hash)) throw new HttpError(401, 'E-mail ou senha inválidos', 'UNAUTHORIZED');
        const user = userPayload(rows[0]);
        await pool.query('UPDATE users SET last_seen_at=now() WHERE id=$1', [user.userId]);
        return json(response, 200, { token: security.signToken(user), user });
      }

      if (url.pathname === '/api/auth/me' && request.method === 'GET') return json(response, 200, { user: await auth(request, security, pool) });

      if (url.pathname === '/api/departments' && request.method === 'GET') {
        const session = await auth(request, security, pool);
        const { rows } = await pool.query('SELECT id,name,color,created_at "createdAt" FROM departments WHERE organization_id=$1 ORDER BY name', [session.organizationId]);
        return json(response, 200, rows);
      }
      if (url.pathname === '/api/departments' && request.method === 'POST') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'organization:write');
        const body = await parseBody(request);
        const name = requiredString(body, 'name', { max: 100, label: 'Nome' });
        const color = optionalString(body, 'color', { max: 24, label: 'Cor' }) || 'jade';
        const { rows } = await pool.query('INSERT INTO departments(organization_id,name,color) VALUES($1,$2,$3) RETURNING id,name,color,created_at "createdAt"', [session.organizationId, name, color]);
        return json(response, 201, rows[0]);
      }
      const departmentId = routeId(url.pathname, 'departments');
      if (departmentId && request.method === 'DELETE') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'organization:write');
        const usage = await pool.query('SELECT 1 FROM users WHERE organization_id=$1 AND department_id=$2 LIMIT 1', [session.organizationId, departmentId]);
        if (usage.rowCount) throw new HttpError(409, 'Setor em uso por colaboradores', 'RESOURCE_IN_USE');
        const result = await pool.query('DELETE FROM departments WHERE id=$1 AND organization_id=$2 RETURNING id', [departmentId, session.organizationId]);
        if (!result.rowCount) throw notFound('Setor');
        return response.writeHead(204).end();
      }

      if (url.pathname === '/api/roles' && request.method === 'GET') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'roles:write');
        const { rows } = await pool.query('SELECT id,name,description,permissions,created_at "createdAt" FROM roles WHERE organization_id=$1 ORDER BY name', [session.organizationId]);
        return json(response, 200, rows);
      }
      if (url.pathname === '/api/roles' && request.method === 'POST') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'roles:write');
        const body = await parseBody(request);
        const name = requiredString(body, 'name', { max: 80, label: 'Nome' });
        const description = optionalString(body, 'description', { max: 500, label: 'Descrição' }) || '';
        const permissions = readPermissions(body);
        const { rows } = await pool.query('INSERT INTO roles(organization_id,name,description,permissions) VALUES($1,$2,$3,$4) RETURNING id,name,description,permissions,created_at "createdAt"', [session.organizationId, name, description, JSON.stringify(permissions)]);
        return json(response, 201, rows[0]);
      }
      const roleId = routeId(url.pathname, 'roles');
      if (roleId && request.method === 'DELETE') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'roles:write');
        const usage = await pool.query('SELECT 1 FROM users WHERE organization_id=$1 AND role_id=$2 LIMIT 1', [session.organizationId, roleId]);
        if (usage.rowCount) throw new HttpError(409, 'Privilégio em uso por colaboradores', 'RESOURCE_IN_USE');
        const result = await pool.query('DELETE FROM roles WHERE id=$1 AND organization_id=$2 RETURNING id', [roleId, session.organizationId]);
        if (!result.rowCount) throw notFound('Privilégio');
        return response.writeHead(204).end();
      }

      if (url.pathname === '/api/members' && request.method === 'GET') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'members:write');
        const { rows } = await pool.query(`SELECT u.id,u.name,u.email,u.active,u.department_id "departmentId",u.role_id "roleId",u.last_seen_at "lastSeenAt",(u.last_seen_at > now() - interval '5 minutes') online,d.name department,r.name role FROM users u LEFT JOIN departments d ON d.id=u.department_id LEFT JOIN roles r ON r.id=u.role_id WHERE u.organization_id=$1 ORDER BY u.name`, [session.organizationId]);
        return json(response, 200, rows);
      }
      if (url.pathname === '/api/members' && request.method === 'POST') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'members:write');
        const body = await parseBody(request);
        const name = requiredString(body, 'name', { max: 120, label: 'Nome' });
        const userEmail = email(body);
        const password = requiredString(body, 'password', { min: 8, max: 128, label: 'Senha temporária' });
        const selectedDepartmentId = optionalString(body, 'departmentId', { max: 36, label: 'Setor' });
        const selectedRoleId = optionalString(body, 'roleId', { max: 36, label: 'Privilégio' });
        await assertOwnedReference(pool, 'departments', selectedDepartmentId, session.organizationId, 'Setor');
        await assertOwnedReference(pool, 'roles', selectedRoleId, session.organizationId, 'Privilégio');
        const { rows } = await pool.query('INSERT INTO users(organization_id,department_id,role_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,email,active,department_id "departmentId",role_id "roleId",last_seen_at "lastSeenAt",false online', [session.organizationId, selectedDepartmentId, selectedRoleId, name, userEmail, security.passwordHash(password)]);
        return json(response, 201, rows[0]);
      }
      const memberId = routeId(url.pathname, 'members');
      if (memberId && request.method === 'PATCH') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'members:write');
        const body = await parseBody(request);
        const updates = [];
        const values = [];
        const add = (column, value) => { values.push(value); updates.push(`${column}=$${values.length}`); };
        if (body.name !== undefined) add('name', requiredString(body, 'name', { max: 120, label: 'Nome' }));
        if (body.email !== undefined) add('email', email(body));
        if (body.active !== undefined) {
          if (typeof body.active !== 'boolean') throw new HttpError(400, 'Estado ativo inválido', 'VALIDATION_ERROR');
          add('active', body.active);
        }
        if (body.departmentId !== undefined) {
          const value = optionalString(body, 'departmentId', { max: 36, label: 'Setor' });
          await assertOwnedReference(pool, 'departments', value, session.organizationId, 'Setor');
          add('department_id', value);
        }
        if (body.roleId !== undefined) {
          const value = optionalString(body, 'roleId', { max: 36, label: 'Privilégio' });
          await assertOwnedReference(pool, 'roles', value, session.organizationId, 'Privilégio');
          add('role_id', value);
        }
        if (body.password !== undefined) add('password_hash', security.passwordHash(requiredString(body, 'password', { min: 8, max: 128, label: 'Senha' })));
        if (!updates.length) throw new HttpError(400, 'Nenhum campo editável enviado', 'VALIDATION_ERROR');
        values.push(memberId, session.organizationId);
        const { rows } = await pool.query(`UPDATE users SET ${updates.join(',')} WHERE id=$${values.length - 1} AND organization_id=$${values.length} RETURNING id,name,email,active,department_id "departmentId",role_id "roleId",last_seen_at "lastSeenAt",false online`, values);
        if (!rows[0]) throw notFound('Colaborador');
        return json(response, 200, rows[0]);
      }

      if (url.pathname === '/api/tags' && request.method === 'GET') {
        const session = await auth(request, security, pool);
        const { rows } = await pool.query('SELECT id,name,color FROM tags WHERE organization_id=$1 ORDER BY name', [session.organizationId]);
        return json(response, 200, rows);
      }
      if (url.pathname === '/api/tags' && request.method === 'POST') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'organization:write');
        const body = await parseBody(request);
        const name = requiredString(body, 'name', { max: 60, label: 'Nome' });
        const color = optionalString(body, 'color', { max: 24, label: 'Cor' }) || 'sky';
        const { rows } = await pool.query('INSERT INTO tags(organization_id,name,color) VALUES($1,$2,$3) RETURNING id,name,color', [session.organizationId, name, color]);
        return json(response, 201, rows[0]);
      }
      const tagId = routeId(url.pathname, 'tags');
      if (tagId && request.method === 'DELETE') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'organization:write');
        const result = await pool.query('DELETE FROM tags WHERE id=$1 AND organization_id=$2 RETURNING id', [tagId, session.organizationId]);
        if (!result.rowCount) throw notFound('Tag');
        return response.writeHead(204).end();
      }

      if (url.pathname === '/api/contacts' && request.method === 'GET') {
        const session = await auth(request, security, pool);
        const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '20', 10) || 20));
        const sort = url.searchParams.get('sort') || 'updatedAt';
        const direction = (url.searchParams.get('direction') || 'desc').toLowerCase();
        const stage = url.searchParams.get('stage') || '';
        const search = (url.searchParams.get('q') || '').trim().slice(0, 120);
        if (!CONTACT_SORTS[sort] || !['asc', 'desc'].includes(direction)) throw new HttpError(400, 'Ordenação inválida', 'VALIDATION_ERROR');
        if (stage && !CONTACT_STAGES.includes(stage)) throw new HttpError(400, 'Etapa do funil inválida', 'VALIDATION_ERROR');
        const values = [session.organizationId];
        const where = ['c.organization_id=$1'];
        if (stage) { values.push(stage); where.push(`c.stage=$${values.length}`); }
        if (search) { values.push(`%${search}%`); where.push(`(c.name ILIKE $${values.length} OR COALESCE(c.company,'') ILIKE $${values.length} OR COALESCE(c.phone,'') ILIKE $${values.length} OR COALESCE(c.email,'') ILIKE $${values.length})`); }
        const count = await pool.query(`SELECT COUNT(*)::int total,COALESCE(SUM(c.value_cents),0)::bigint "valueCentsTotal" FROM contacts c WHERE ${where.join(' AND ')}`, values);
        values.push(limit, (page - 1) * limit);
        const { rows } = await pool.query(`${CONTACT_SELECT} WHERE ${where.join(' AND ')} GROUP BY c.id ORDER BY ${CONTACT_SORTS[sort]} ${direction.toUpperCase()},c.id ${direction.toUpperCase()} LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
        const total = count.rows[0].total;
        return json(response, 200, { items: rows, page: { number: page, limit, total, totalPages: Math.ceil(total / limit), valueCentsTotal: Number(count.rows[0].valueCentsTotal) } });
      }
      if (url.pathname === '/api/contacts' && request.method === 'POST') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'contacts:write');
        const body = await parseBody(request);
        const fields = contactFields(body);
        const tagIds = readContactTags(body) || [];
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await validateContactTags(client, tagIds, session.organizationId);
          const inserted = await client.query('INSERT INTO contacts(organization_id,name,phone,email,company,stage,value_cents) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [session.organizationId, fields.name, fields.phone, fields.email, fields.company, fields.stage, fields.valueCents]);
          await replaceContactTags(client, inserted.rows[0].id, tagIds);
          const contact = await getContact(client, inserted.rows[0].id, session.organizationId);
          await client.query('COMMIT');
          return json(response, 201, contact);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
      const contactId = routeId(url.pathname, 'contacts');
      if (contactId && request.method === 'GET') {
        const session = await auth(request, security, pool);
        const contact = await getContact(pool, contactId, session.organizationId);
        if (!contact) throw notFound('Contato');
        return json(response, 200, contact);
      }
      if (contactId && request.method === 'PATCH') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'contacts:write');
        const body = await parseBody(request);
        const expectedVersion = requiredString(body, 'expectedVersion', { max: 32, label: 'Versão esperada' });
        const fields = contactFields(body, { partial: true });
        const tagIds = readContactTags(body);
        if (!Object.keys(fields).length && tagIds === undefined) throw new HttpError(400, 'Nenhum campo editável enviado', 'VALIDATION_ERROR');
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await validateContactTags(client, tagIds, session.organizationId);
          const updates = [];
          const values = [];
          const columns = { name: 'name', phone: 'phone', email: 'email', company: 'company', stage: 'stage', valueCents: 'value_cents' };
          for (const [field, value] of Object.entries(fields)) { values.push(value); updates.push(`${columns[field]}=$${values.length}`); }
          updates.push('updated_at=now()');
          values.push(contactId, session.organizationId, expectedVersion);
          const result = await client.query(`UPDATE contacts SET ${updates.join(',')} WHERE id=$${values.length - 2} AND organization_id=$${values.length - 1} AND xmin::text=$${values.length} RETURNING id`, values);
          if (!result.rowCount) {
            const exists = await client.query('SELECT 1 FROM contacts WHERE id=$1 AND organization_id=$2', [contactId, session.organizationId]);
            if (!exists.rowCount) throw notFound('Contato');
            throw new HttpError(409, 'O contato foi alterado por outro usuário; recarregue antes de salvar', 'STALE_WRITE');
          }
          if (tagIds !== undefined) await replaceContactTags(client, contactId, tagIds);
          const contact = await getContact(client, contactId, session.organizationId);
          await client.query('COMMIT');
          return json(response, 200, contact);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      if (url.pathname === '/api/conversations' && request.method === 'GET') {
        const session = await auth(request, security, pool);
        const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '30', 10) || 30));
        const status = url.searchParams.get('status') || '';
        const search = (url.searchParams.get('q') || '').trim().slice(0, 120);
        const cursor = decodeCursor(url.searchParams.get('cursor'));
        if (status && !CONVERSATION_STATUSES.includes(status)) throw new HttpError(400, 'Estado da conversa inválido', 'VALIDATION_ERROR');
        const values = [session.organizationId];
        const where = ['cv.organization_id=$1'];
        if (status) { values.push(status); where.push(`cv.status=$${values.length}`); }
        if (search) { values.push(`%${search}%`); where.push(`(c.name ILIKE $${values.length} OR COALESCE(c.company,'') ILIKE $${values.length})`); }
        if (cursor) {
          values.push(cursor.timestamp, cursor.id);
          where.push(`(cv.updated_at,cv.id) < ($${values.length - 1}::timestamptz,$${values.length}::uuid)`);
        }
        values.push(limit + 1);
        const { rows } = await pool.query(`${CONVERSATION_SELECT} WHERE ${where.join(' AND ')} ORDER BY cv.updated_at DESC,cv.id DESC LIMIT $${values.length}`, values);
        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit).map(conversationOutput);
        const last = items.at(-1);
        return json(response, 200, { items, nextCursor: hasMore ? encodeCursor(last.updatedAt, last.id) : null });
      }
      if (url.pathname === '/api/conversations' && request.method === 'POST') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'conversations:write');
        const body = await parseBody(request);
        const selectedContactId = requiredString(body, 'contactId', { max: 36, label: 'Contato' });
        const channel = optionalString(body, 'channel', { max: 30, label: 'Canal' }) || 'manual';
        if (!['manual', 'whatsapp'].includes(channel)) throw new HttpError(400, 'Canal inválido', 'VALIDATION_ERROR');
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`conversation:${session.organizationId}:${selectedContactId}:${channel}`]);
          await assertOwnedReference(client, 'contacts', selectedContactId, session.organizationId, 'Contato');
          const existing = await client.query("SELECT id FROM conversations WHERE organization_id=$1 AND contact_id=$2 AND channel=$3 AND status='open' ORDER BY created_at DESC LIMIT 1", [session.organizationId, selectedContactId, channel]);
          if (existing.rowCount) {
            const conversation = await getConversation(client, existing.rows[0].id, session.organizationId);
            await client.query('COMMIT');
            return json(response, 200, conversation);
          }
          const inserted = await client.query('INSERT INTO conversations(organization_id,contact_id,channel,status) VALUES($1,$2,$3,$4) RETURNING id', [session.organizationId, selectedContactId, channel, 'open']);
          const conversation = await getConversation(client, inserted.rows[0].id, session.organizationId);
          await client.query('COMMIT');
          return json(response, 201, conversation);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      const conversationMessagesMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
      if (conversationMessagesMatch && request.method === 'GET') {
        const session = await auth(request, security, pool);
        const conversationId = decodeURIComponent(conversationMessagesMatch[1]);
        const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50));
        const cursor = decodeCursor(url.searchParams.get('cursor'));
        if (!await getConversation(pool, conversationId, session.organizationId)) throw notFound('Conversa');
        const values = [conversationId];
        let cursorClause = '';
        if (cursor) {
          values.push(cursor.timestamp, cursor.id);
          cursorClause = ` AND (sent_at,id) < ($${values.length - 1}::timestamptz,$${values.length}::uuid)`;
        }
        values.push(limit + 1);
        const { rows } = await pool.query(`${MESSAGE_SELECT} WHERE conversation_id=$1${cursorClause} ORDER BY sent_at DESC,id DESC LIMIT $${values.length}`, values);
        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit);
        const last = items.at(-1);
        return json(response, 200, { items, nextCursor: hasMore ? encodeCursor(last.sentAt, last.id) : null });
      }
      if (conversationMessagesMatch && request.method === 'POST') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'messages:write');
        const conversationId = decodeURIComponent(conversationMessagesMatch[1]);
        const payload = await parseBody(request);
        const messageBody = requiredString(payload, 'body', { max: 10_000, label: 'Mensagem' });
        const clientMessageId = requiredString(payload, 'clientMessageId', { max: 120, label: 'Identificador idempotente' });
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`message:${conversationId}:${clientMessageId}`]);
          if (!await getConversation(client, conversationId, session.organizationId)) throw notFound('Conversa');
          const duplicate = await client.query(`${MESSAGE_SELECT} WHERE conversation_id=$1 AND client_message_id=$2`, [conversationId, clientMessageId]);
          if (duplicate.rowCount) {
            await client.query('COMMIT');
            return json(response, 200, { message: duplicate.rows[0], duplicate: true });
          }
          const inserted = await client.query(`INSERT INTO messages(conversation_id,direction,sender_type,body,client_message_id,status) VALUES($1,'outbound','user',$2,$3,'pending') RETURNING id`, [conversationId, messageBody, clientMessageId]);
          await client.query('UPDATE conversations SET updated_at=now() WHERE id=$1', [conversationId]);
          const message = await client.query(`${MESSAGE_SELECT} WHERE id=$1`, [inserted.rows[0].id]);
          await client.query('COMMIT');
          return json(response, 201, { message: message.rows[0], duplicate: false });
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      const conversationId = routeId(url.pathname, 'conversations');
      if (conversationId && request.method === 'GET') {
        const session = await auth(request, security, pool);
        const conversation = await getConversation(pool, conversationId, session.organizationId);
        if (!conversation) throw notFound('Conversa');
        return json(response, 200, conversation);
      }
      if (conversationId && request.method === 'PATCH') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'conversations:write');
        const body = await parseBody(request);
        const expectedVersion = requiredString(body, 'expectedVersion', { max: 32, label: 'Versão esperada' });
        const updates = [];
        const values = [];
        const add = (column, value) => { values.push(value); updates.push(`${column}=$${values.length}`); };
        if (body.status !== undefined) {
          const status = requiredString(body, 'status', { max: 30, label: 'Estado' });
          if (!CONVERSATION_STATUSES.includes(status)) throw new HttpError(400, 'Estado da conversa inválido', 'VALIDATION_ERROR');
          add('status', status);
        }
        if (body.assignedUserId !== undefined) {
          const assignedUserId = optionalString(body, 'assignedUserId', { max: 36, label: 'Responsável' });
          await assertOwnedReference(pool, 'users', assignedUserId, session.organizationId, 'Responsável');
          add('assigned_user_id', assignedUserId);
        }
        if (!updates.length) throw new HttpError(400, 'Nenhum campo editável enviado', 'VALIDATION_ERROR');
        updates.push('updated_at=now()');
        values.push(conversationId, session.organizationId, expectedVersion);
        const updated = await pool.query(`UPDATE conversations SET ${updates.join(',')} WHERE id=$${values.length - 2} AND organization_id=$${values.length - 1} AND xmin::text=$${values.length} RETURNING id`, values);
        if (!updated.rowCount) {
          const exists = await pool.query('SELECT 1 FROM conversations WHERE id=$1 AND organization_id=$2', [conversationId, session.organizationId]);
          if (!exists.rowCount) throw notFound('Conversa');
          throw new HttpError(409, 'A conversa foi alterada por outro usuário; recarregue antes de salvar', 'STALE_WRITE');
        }
        return json(response, 200, await getConversation(pool, conversationId, session.organizationId));
      }

      if (url.pathname === '/api/events' && request.method === 'GET') {
        const session = await auth(request, security, pool);
        const from = readInstant({ from: url.searchParams.get('from') }, 'from', 'Início do intervalo');
        const to = readInstant({ to: url.searchParams.get('to') }, 'to', 'Fim do intervalo');
        if (to <= from || to - from > 366 * 24 * 60 * 60 * 1000) throw new HttpError(400, 'Intervalo deve ser positivo e ter no máximo 366 dias', 'VALIDATION_ERROR');
        const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '200', 10) || 200));
        const cursor = decodeCursor(url.searchParams.get('cursor'));
        const contactId = (url.searchParams.get('contactId') || '').trim();
        const values = [session.organizationId, from, to];
        const where = ['e.organization_id=$1', 'e.start_at<$3', 'e.end_at>$2'];
        if (contactId) { values.push(contactId); where.push(`e.contact_id=$${values.length}`); }
        if (cursor) {
          values.push(cursor.timestamp, cursor.id);
          where.push(`(e.start_at,e.id)>($${values.length - 1}::timestamptz,$${values.length}::uuid)`);
        }
        values.push(limit + 1);
        const { rows } = await pool.query(`${EVENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.start_at,e.id LIMIT $${values.length}`, values);
        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit);
        const last = items.at(-1);
        return json(response, 200, { items, nextCursor: hasMore ? encodeCursor(last.startAt, last.id) : null });
      }
      if (url.pathname === '/api/events' && request.method === 'POST') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'events:write');
        const body = await parseBody(request);
        const title = requiredString(body, 'title', { max: 200, label: 'Título' });
        const type = requiredString(body, 'type', { max: 30, label: 'Tipo' });
        if (!EVENT_TYPES.includes(type)) throw new HttpError(400, 'Tipo de evento inválido', 'VALIDATION_ERROR');
        const startAt = readInstant(body, 'startAt', 'Início');
        const endAt = readInstant(body, 'endAt', 'Fim');
        if (endAt <= startAt) throw new HttpError(400, 'Fim deve ser posterior ao início', 'VALIDATION_ERROR');
        const timezone = readTimezone(body);
        const contactId = optionalString(body, 'contactId', { max: 36, label: 'Contato' });
        const assignedUserId = body.assignedUserId === undefined ? session.userId : optionalString(body, 'assignedUserId', { max: 36, label: 'Responsável' });
        if (body.allowConflict !== undefined && typeof body.allowConflict !== 'boolean') throw new HttpError(400, 'Permissão de conflito inválida', 'VALIDATION_ERROR');
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await assertOwnedReference(client, 'contacts', contactId, session.organizationId, 'Contato');
          await assertOwnedReference(client, 'users', assignedUserId, session.organizationId, 'Responsável');
          if (assignedUserId) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`event:${session.organizationId}:${assignedUserId}`]);
          if (!body.allowConflict) await assertNoEventConflict(client, { organizationId: session.organizationId, assignedUserId, startAt, endAt });
          const inserted = await client.query('INSERT INTO events(organization_id,contact_id,assigned_user_id,title,type,start_at,end_at,timezone) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [session.organizationId, contactId, assignedUserId, title, type, startAt, endAt, timezone]);
          const event = await getEvent(client, inserted.rows[0].id, session.organizationId);
          await client.query('COMMIT');
          return json(response, 201, event);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      const eventId = routeId(url.pathname, 'events');
      if (eventId && request.method === 'GET') {
        const session = await auth(request, security, pool);
        const event = await getEvent(pool, eventId, session.organizationId);
        if (!event) throw notFound('Evento');
        return json(response, 200, event);
      }
      if (eventId && request.method === 'PATCH') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'events:write');
        const body = await parseBody(request);
        const expectedVersion = requiredString(body, 'expectedVersion', { max: 32, label: 'Versão esperada' });
        if (body.allowConflict !== undefined && typeof body.allowConflict !== 'boolean') throw new HttpError(400, 'Permissão de conflito inválida', 'VALIDATION_ERROR');
        if (!['title', 'type', 'startAt', 'endAt', 'timezone', 'contactId', 'assignedUserId'].some(field => body[field] !== undefined)) throw new HttpError(400, 'Nenhum campo editável enviado', 'VALIDATION_ERROR');
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const currentResult = await client.query('SELECT *,xmin::text version FROM events WHERE id=$1 AND organization_id=$2', [eventId, session.organizationId]);
          if (!currentResult.rowCount) throw notFound('Evento');
          const current = currentResult.rows[0];
          if (current.version !== expectedVersion) throw new HttpError(409, 'O evento foi alterado por outro usuário; recarregue antes de salvar', 'STALE_WRITE');
          const title = body.title === undefined ? current.title : requiredString(body, 'title', { max: 200, label: 'Título' });
          const type = body.type === undefined ? current.type : requiredString(body, 'type', { max: 30, label: 'Tipo' });
          if (!EVENT_TYPES.includes(type)) throw new HttpError(400, 'Tipo de evento inválido', 'VALIDATION_ERROR');
          const startAt = body.startAt === undefined ? current.start_at : readInstant(body, 'startAt', 'Início');
          const endAt = body.endAt === undefined ? current.end_at : readInstant(body, 'endAt', 'Fim');
          if (endAt <= startAt) throw new HttpError(400, 'Fim deve ser posterior ao início', 'VALIDATION_ERROR');
          const timezone = body.timezone === undefined ? current.timezone : readTimezone(body);
          const contactId = body.contactId === undefined ? current.contact_id : optionalString(body, 'contactId', { max: 36, label: 'Contato' });
          const assignedUserId = body.assignedUserId === undefined ? current.assigned_user_id : optionalString(body, 'assignedUserId', { max: 36, label: 'Responsável' });
          await assertOwnedReference(client, 'contacts', contactId, session.organizationId, 'Contato');
          await assertOwnedReference(client, 'users', assignedUserId, session.organizationId, 'Responsável');
          const assigneesToLock = [...new Set([current.assigned_user_id, assignedUserId].filter(Boolean))].sort();
          for (const userId of assigneesToLock) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`event:${session.organizationId}:${userId}`]);
          const locked = await client.query('SELECT xmin::text version FROM events WHERE id=$1 AND organization_id=$2 FOR UPDATE', [eventId, session.organizationId]);
          if (!locked.rowCount) throw notFound('Evento');
          if (locked.rows[0].version !== expectedVersion) throw new HttpError(409, 'O evento foi alterado por outro usuário; recarregue antes de salvar', 'STALE_WRITE');
          if (!body.allowConflict) await assertNoEventConflict(client, { organizationId: session.organizationId, assignedUserId, startAt, endAt, excludeId: eventId });
          const updated = await client.query('UPDATE events SET contact_id=$1,assigned_user_id=$2,title=$3,type=$4,start_at=$5,end_at=$6,timezone=$7,updated_at=now() WHERE id=$8 AND organization_id=$9 AND xmin::text=$10 RETURNING id', [contactId, assignedUserId, title, type, startAt, endAt, timezone, eventId, session.organizationId, expectedVersion]);
          if (!updated.rowCount) throw new HttpError(409, 'O evento foi alterado por outro usuário; recarregue antes de salvar', 'STALE_WRITE');
          const event = await getEvent(client, eventId, session.organizationId);
          await client.query('COMMIT');
          return json(response, 200, event);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
      if (eventId && request.method === 'DELETE') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'events:write');
        const expectedVersion = requiredString({ expectedVersion: url.searchParams.get('expectedVersion') }, 'expectedVersion', { max: 32, label: 'Versão esperada' });
        const deleted = await pool.query('DELETE FROM events WHERE id=$1 AND organization_id=$2 AND xmin::text=$3 RETURNING id', [eventId, session.organizationId, expectedVersion]);
        if (!deleted.rowCount) {
          const exists = await pool.query('SELECT 1 FROM events WHERE id=$1 AND organization_id=$2', [eventId, session.organizationId]);
          if (!exists.rowCount) throw notFound('Evento');
          throw new HttpError(409, 'O evento foi alterado por outro usuário; recarregue antes de excluir', 'STALE_WRITE');
        }
        return response.writeHead(204).end();
      }

      if (url.pathname === '/api/integrations/meta' && request.method === 'GET') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'integrations:write');
        const { rows } = await pool.query('SELECT app_id,business_id,waba_id,phone_number_id,status,updated_at FROM integrations WHERE organization_id=$1 AND provider=$2', [session.organizationId, 'meta']);
        return json(response, 200, rows[0] || { status: 'not_configured' });
      }
      if (url.pathname === '/api/integrations/meta' && request.method === 'PUT') {
        const session = await auth(request, security, pool);
        requirePermission(session, 'integrations:write');
        const body = await parseBody(request);
        const secrets = body.accessToken || body.appSecret ? security.encrypt(JSON.stringify({ accessToken: body.accessToken || '', appSecret: body.appSecret || '' })) : null;
        const { rows } = await pool.query(`INSERT INTO integrations(organization_id,provider,app_id,business_id,waba_id,phone_number_id,secret_ciphertext,status) VALUES($1,'meta',$2,$3,$4,$5,$6,'pending') ON CONFLICT(organization_id,provider) DO UPDATE SET app_id=EXCLUDED.app_id,business_id=EXCLUDED.business_id,waba_id=EXCLUDED.waba_id,phone_number_id=EXCLUDED.phone_number_id,secret_ciphertext=COALESCE(EXCLUDED.secret_ciphertext,integrations.secret_ciphertext),updated_at=now() RETURNING app_id,business_id,waba_id,phone_number_id,status,updated_at`, [session.organizationId, optionalString(body, 'appId', { max: 120 }), optionalString(body, 'businessId', { max: 120 }), optionalString(body, 'wabaId', { max: 120 }), optionalString(body, 'phoneNumberId', { max: 120 }), secrets ? JSON.stringify(secrets) : null]);
        return json(response, 200, rows[0]);
      }

      if (url.pathname === '/api/webhooks/meta' && request.method === 'GET') {
        if (!config.metaVerifyToken) throw new HttpError(503, 'Webhook Meta não configurado', 'NOT_CONFIGURED');
        if (url.searchParams.get('hub.verify_token') !== config.metaVerifyToken) return response.writeHead(403).end();
        return response.writeHead(200, { 'Content-Type': 'text/plain' }).end(url.searchParams.get('hub.challenge') || '');
      }
      if (url.pathname === '/api/webhooks/meta' && request.method === 'POST') {
        await parseBody(request);
        return response.writeHead(200).end();
      }

      throw new HttpError(404, 'Rota não encontrada', 'NOT_FOUND');
    } catch (error) {
      const mapped = databaseError(error);
      const safe = mapped || new HttpError(500, 'Erro interno', 'INTERNAL_ERROR');
      if (safe.status >= 500) console.error(error);
      return json(response, safe.status, { error: safe.message, code: safe.code, ...(safe.conflict ? { conflict: safe.conflict } : {}) });
    }
  };
}
