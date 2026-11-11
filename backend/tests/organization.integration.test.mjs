import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createSecurity } from '../src/security.mjs';

if (process.env.INTEGRATION_TEST_ALLOWED !== 'true') {
  throw new Error('Defina INTEGRATION_TEST_ALLOWED=true somente em um banco descartável');
}

const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001/api';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const security = createSecurity({
  jwtSecret: process.env.JWT_SECRET,
  encryptionKey: Buffer.from(process.env.ENCRYPTION_KEY, 'base64')
});
const suffix = randomUUID();
const password = `Teste-${suffix}`;
const state = { organizationIds: [] };

const api = async (path, { token, method = 'GET', body } = {}) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
};

const insertOrganization = async (name, email, permissions) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const organization = await client.query('INSERT INTO organizations(name) VALUES($1) RETURNING id', [name]);
    const role = await client.query('INSERT INTO roles(organization_id,name,description,permissions) VALUES($1,$2,$3,$4) RETURNING id', [organization.rows[0].id, `Papel ${suffix}`, 'Teste de integração', JSON.stringify(permissions)]);
    const user = await client.query('INSERT INTO users(organization_id,role_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id', [organization.rows[0].id, role.rows[0].id, `Usuário ${suffix}`, email, security.passwordHash(password)]);
    await client.query('COMMIT');
    state.organizationIds.push(organization.rows[0].id);
    return { organizationId: organization.rows[0].id, roleId: role.rows[0].id, userId: user.rows[0].id, email };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const login = async email => {
  const response = await api('/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 200);
  return response.body.token;
};

before(async () => {
  state.adminA = await insertOrganization(`Organização A ${suffix}`, `admin-a-${suffix}@example.test`, ['*']);
  state.adminB = await insertOrganization(`Organização B ${suffix}`, `admin-b-${suffix}@example.test`, ['*']);
  state.viewerA = await insertOrganization(`Organização Viewer ${suffix}`, `viewer-${suffix}@example.test`, []);
  state.tokenA = await login(state.adminA.email);
  state.tokenB = await login(state.adminB.email);
  state.tokenViewer = await login(state.viewerA.email);
});

after(async () => {
  if (state.organizationIds.length) await pool.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [state.organizationIds]);
  await pool.end();
});

test('recursos organizacionais permanecem isolados e respeitam permissões', async () => {
  const departmentA = await api('/departments', { token: state.tokenA, method: 'POST', body: { name: `Comercial ${suffix}`, color: 'jade' } });
  const departmentB = await api('/departments', { token: state.tokenB, method: 'POST', body: { name: `Suporte ${suffix}`, color: 'sky' } });
  assert.equal(departmentA.status, 201);
  assert.equal(departmentB.status, 201);

  const departmentsA = await api('/departments', { token: state.tokenA });
  assert.deepEqual(departmentsA.body.map(item => item.id), [departmentA.body.id]);
  assert.equal(departmentsA.body.some(item => item.id === departmentB.body.id), false);

  const denied = await api('/departments', { token: state.tokenViewer, method: 'POST', body: { name: 'Negado' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'FORBIDDEN');

  const roleA = await api('/roles', {
    token: state.tokenA,
    method: 'POST',
    body: { name: `Atendente ${suffix}`, description: 'Atendimento', permissions: ['organization:write'] }
  });
  assert.equal(roleA.status, 201);

  const tagA = await api('/tags', { token: state.tokenA, method: 'POST', body: { name: `VIP ${suffix}` } });
  const tagB = await api('/tags', { token: state.tokenB, method: 'POST', body: { name: `B ${suffix}` } });
  assert.equal(tagA.status, 201);
  assert.equal(tagB.status, 201);
  const tagsA = await api('/tags', { token: state.tokenA });
  assert.equal(tagsA.body.some(item => item.id === tagB.body.id), false);

  const deniedContact = await api('/contacts', {
    token: state.tokenViewer,
    method: 'POST',
    body: { name: 'Contato negado' }
  });
  assert.equal(deniedContact.status, 403);
  assert.equal(deniedContact.body.code, 'FORBIDDEN');

  const contactA = await api('/contacts', {
    token: state.tokenA,
    method: 'POST',
    body: {
      name: `Ana ${suffix}`,
      company: 'Empresa Alfa',
      phone: '+55 11 99999-0001',
      email: `ana-${suffix}@example.test`,
      stage: 'Qualificação',
      valueCents: 125050,
      tagIds: [tagA.body.id]
    }
  });
  const contactA2 = await api('/contacts', {
    token: state.tokenA,
    method: 'POST',
    body: { name: `Bruno ${suffix}`, company: 'Empresa Beta', stage: 'Novo lead', valueCents: 9000 }
  });
  const contactB = await api('/contacts', {
    token: state.tokenB,
    method: 'POST',
    body: { name: `Contato B ${suffix}`, stage: 'Qualificação', valueCents: 777 }
  });
  assert.equal(contactA.status, 201);
  assert.equal(contactA2.status, 201);
  assert.equal(contactB.status, 201);
  assert.equal(contactA.body.tags[0].id, tagA.body.id);
  assert.equal(contactA.body.valueCents, 125050);

  const firstContactPage = await api('/contacts?limit=1&page=1&sort=name&direction=asc', { token: state.tokenA });
  assert.equal(firstContactPage.status, 200);
  assert.equal(firstContactPage.body.items.length, 1);
  assert.equal(firstContactPage.body.items[0].id, contactA.body.id);
  assert.deepEqual(firstContactPage.body.page, { number: 1, limit: 1, total: 2, totalPages: 2, valueCentsTotal: 134050 });

  const filteredContacts = await api(`/contacts?q=${encodeURIComponent('Empresa Alfa')}&stage=${encodeURIComponent('Qualificação')}`, { token: state.tokenA });
  assert.deepEqual(filteredContacts.body.items.map(item => item.id), [contactA.body.id]);
  assert.equal(filteredContacts.body.page.valueCentsTotal, 125050);

  const hiddenCrossOrganizationContact = await api(`/contacts/${contactA.body.id}`, { token: state.tokenB });
  assert.equal(hiddenCrossOrganizationContact.status, 404);
  assert.equal(hiddenCrossOrganizationContact.body.code, 'NOT_FOUND');

  const crossOrganizationTag = await api('/contacts', {
    token: state.tokenA,
    method: 'POST',
    body: { name: 'Tag inválida', tagIds: [tagB.body.id] }
  });
  assert.equal(crossOrganizationTag.status, 400);
  assert.equal(crossOrganizationTag.body.code, 'INVALID_REFERENCE');

  const movedContact = await api(`/contacts/${contactA.body.id}`, {
    token: state.tokenA,
    method: 'PATCH',
    body: { expectedVersion: contactA.body.version, stage: 'Proposta', valueCents: 130000 }
  });
  assert.equal(movedContact.status, 200);
  assert.equal(movedContact.body.stage, 'Proposta');
  assert.equal(movedContact.body.valueCents, 130000);
  assert.notEqual(movedContact.body.version, contactA.body.version);

  const staleContactUpdate = await api(`/contacts/${contactA.body.id}`, {
    token: state.tokenA,
    method: 'PATCH',
    body: { expectedVersion: contactA.body.version, stage: 'Negociação' }
  });
  assert.equal(staleContactUpdate.status, 409);
  assert.equal(staleContactUpdate.body.code, 'STALE_WRITE');

  const deniedConversation = await api('/conversations', {
    token: state.tokenViewer,
    method: 'POST',
    body: { contactId: contactA.body.id }
  });
  assert.equal(deniedConversation.status, 403);
  assert.equal(deniedConversation.body.code, 'FORBIDDEN');

  const conversationA = await api('/conversations', {
    token: state.tokenA,
    method: 'POST',
    body: { contactId: contactA.body.id, channel: 'manual' }
  });
  const conversationA2 = await api('/conversations', {
    token: state.tokenA,
    method: 'POST',
    body: { contactId: contactA2.body.id, channel: 'manual' }
  });
  const conversationB = await api('/conversations', {
    token: state.tokenB,
    method: 'POST',
    body: { contactId: contactB.body.id, channel: 'manual' }
  });
  assert.equal(conversationA.status, 201);
  assert.equal(conversationA2.status, 201);
  assert.equal(conversationB.status, 201);

  const reusedConversation = await api('/conversations', {
    token: state.tokenA,
    method: 'POST',
    body: { contactId: contactA.body.id, channel: 'manual' }
  });
  assert.equal(reusedConversation.status, 200);
  assert.equal(reusedConversation.body.id, conversationA.body.id);

  const conversationPage1 = await api('/conversations?limit=1', { token: state.tokenA });
  assert.equal(conversationPage1.status, 200);
  assert.equal(conversationPage1.body.items.length, 1);
  assert.ok(conversationPage1.body.nextCursor);
  const conversationPage2 = await api(`/conversations?limit=1&cursor=${encodeURIComponent(conversationPage1.body.nextCursor)}`, { token: state.tokenA });
  assert.equal(conversationPage2.body.items.length, 1);
  assert.notEqual(conversationPage2.body.items[0].id, conversationPage1.body.items[0].id);
  assert.equal([...conversationPage1.body.items, ...conversationPage2.body.items].some(item => item.id === conversationB.body.id), false);

  const hiddenConversation = await api(`/conversations/${conversationA.body.id}`, { token: state.tokenB });
  assert.equal(hiddenConversation.status, 404);
  const hiddenMessages = await api(`/conversations/${conversationA.body.id}/messages`, { token: state.tokenB });
  assert.equal(hiddenMessages.status, 404);
  const deniedMessage = await api(`/conversations/${conversationA.body.id}/messages`, {
    token: state.tokenViewer,
    method: 'POST',
    body: { body: 'Negada', clientMessageId: `denied-${suffix}` }
  });
  assert.equal(deniedMessage.status, 403);
  assert.equal(deniedMessage.body.code, 'FORBIDDEN');

  const crossOrganizationAssignment = await api(`/conversations/${conversationA.body.id}`, {
    token: state.tokenA,
    method: 'PATCH',
    body: { expectedVersion: conversationA.body.version, assignedUserId: state.adminB.userId }
  });
  assert.equal(crossOrganizationAssignment.status, 400);
  assert.equal(crossOrganizationAssignment.body.code, 'INVALID_REFERENCE');

  const firstMessage = await api(`/conversations/${conversationA.body.id}/messages`, {
    token: state.tokenA,
    method: 'POST',
    body: { body: 'Mensagem idempotente', clientMessageId: `client-${suffix}-1` }
  });
  assert.equal(firstMessage.status, 201);
  assert.equal(firstMessage.body.duplicate, false);
  assert.equal(firstMessage.body.message.status, 'pending');

  const duplicateMessage = await api(`/conversations/${conversationA.body.id}/messages`, {
    token: state.tokenA,
    method: 'POST',
    body: { body: 'Mensagem idempotente', clientMessageId: `client-${suffix}-1` }
  });
  assert.equal(duplicateMessage.status, 200);
  assert.equal(duplicateMessage.body.duplicate, true);
  assert.equal(duplicateMessage.body.message.id, firstMessage.body.message.id);

  const secondMessage = await api(`/conversations/${conversationA.body.id}/messages`, {
    token: state.tokenA,
    method: 'POST',
    body: { body: 'Segunda mensagem', clientMessageId: `client-${suffix}-2` }
  });
  assert.equal(secondMessage.status, 201);

  const messagePage1 = await api(`/conversations/${conversationA.body.id}/messages?limit=1`, { token: state.tokenA });
  assert.equal(messagePage1.body.items.length, 1);
  assert.equal(messagePage1.body.items[0].id, secondMessage.body.message.id);
  assert.ok(messagePage1.body.nextCursor);
  const messagePage2 = await api(`/conversations/${conversationA.body.id}/messages?limit=1&cursor=${encodeURIComponent(messagePage1.body.nextCursor)}`, { token: state.tokenA });
  assert.equal(messagePage2.body.items.length, 1);
  assert.equal(messagePage2.body.items[0].id, firstMessage.body.message.id);

  const currentConversation = await api(`/conversations/${conversationA.body.id}`, { token: state.tokenA });
  const assignedConversation = await api(`/conversations/${conversationA.body.id}`, {
    token: state.tokenA,
    method: 'PATCH',
    body: { expectedVersion: currentConversation.body.version, assignedUserId: state.adminA.userId }
  });
  assert.equal(assignedConversation.status, 200);
  assert.equal(assignedConversation.body.assignedUserId, state.adminA.userId);

  const staleConversation = await api(`/conversations/${conversationA.body.id}`, {
    token: state.tokenA,
    method: 'PATCH',
    body: { expectedVersion: currentConversation.body.version, status: 'closed' }
  });
  assert.equal(staleConversation.status, 409);
  assert.equal(staleConversation.body.code, 'STALE_WRITE');

  const deniedEvent = await api('/events', {
    token: state.tokenViewer,
    method: 'POST',
    body: { title: 'Negado', type: 'reuniao', startAt: '2030-01-15T10:00:00-03:00', endAt: '2030-01-15T11:00:00-03:00', timezone: 'America/Sao_Paulo' }
  });
  assert.equal(deniedEvent.status, 403);
  assert.equal(deniedEvent.body.code, 'FORBIDDEN');

  const crossOrganizationEvent = await api('/events', {
    token: state.tokenA,
    method: 'POST',
    body: { title: 'Contato cruzado', type: 'followup', startAt: '2030-01-15T08:00:00-03:00', endAt: '2030-01-15T09:00:00-03:00', timezone: 'America/Sao_Paulo', contactId: contactB.body.id }
  });
  assert.equal(crossOrganizationEvent.status, 400);
  assert.equal(crossOrganizationEvent.body.code, 'INVALID_REFERENCE');

  const eventA = await api('/events', {
    token: state.tokenA,
    method: 'POST',
    body: { title: 'Reunião principal', type: 'reuniao', startAt: '2030-01-15T10:00:00-03:00', endAt: '2030-01-15T11:00:00-03:00', timezone: 'America/Sao_Paulo', contactId: contactA.body.id }
  });
  assert.equal(eventA.status, 201);
  assert.equal(eventA.body.startAt, '2030-01-15T13:00:00.000Z');
  assert.equal(eventA.body.endAt, '2030-01-15T14:00:00.000Z');
  assert.equal(eventA.body.timezone, 'America/Sao_Paulo');
  assert.equal(eventA.body.assignedUserId, state.adminA.userId);

  const eventConflict = await api('/events', {
    token: state.tokenA,
    method: 'POST',
    body: { title: 'Sobreposto', type: 'followup', startAt: '2030-01-15T10:30:00-03:00', endAt: '2030-01-15T11:30:00-03:00', timezone: 'America/Sao_Paulo' }
  });
  assert.equal(eventConflict.status, 409);
  assert.equal(eventConflict.body.code, 'EVENT_CONFLICT');
  assert.equal(eventConflict.body.conflict.id, eventA.body.id);

  const allowedConflict = await api('/events', {
    token: state.tokenA,
    method: 'POST',
    body: { title: 'Sobreposto permitido', type: 'followup', startAt: '2030-01-15T10:30:00-03:00', endAt: '2030-01-15T11:30:00-03:00', timezone: 'America/Sao_Paulo', allowConflict: true }
  });
  assert.equal(allowedConflict.status, 201);

  const eventB = await api('/events', {
    token: state.tokenB,
    method: 'POST',
    body: { title: 'Mesmo horário outro tenant', type: 'reuniao', startAt: '2030-01-15T10:00:00-03:00', endAt: '2030-01-15T11:00:00-03:00', timezone: 'America/Sao_Paulo' }
  });
  assert.equal(eventB.status, 201);

  const eventPage1 = await api(`/events?from=${encodeURIComponent('2030-01-01T00:00:00Z')}&to=${encodeURIComponent('2030-02-01T00:00:00Z')}&limit=1`, { token: state.tokenA });
  assert.equal(eventPage1.status, 200);
  assert.equal(eventPage1.body.items.length, 1);
  assert.ok(eventPage1.body.nextCursor);
  const eventPage2 = await api(`/events?from=${encodeURIComponent('2030-01-01T00:00:00Z')}&to=${encodeURIComponent('2030-02-01T00:00:00Z')}&limit=1&cursor=${encodeURIComponent(eventPage1.body.nextCursor)}`, { token: state.tokenA });
  assert.equal(eventPage2.body.items.length, 1);
  assert.notEqual(eventPage2.body.items[0].id, eventPage1.body.items[0].id);
  assert.equal([...eventPage1.body.items, ...eventPage2.body.items].some(item => item.id === eventB.body.id), false);

  const hiddenEvent = await api(`/events/${eventA.body.id}`, { token: state.tokenB });
  assert.equal(hiddenEvent.status, 404);

  const updatedEvent = await api(`/events/${eventA.body.id}`, {
    token: state.tokenA,
    method: 'PATCH',
    body: { expectedVersion: eventA.body.version, title: 'Reunião atualizada', allowConflict: true }
  });
  assert.equal(updatedEvent.status, 200);
  assert.equal(updatedEvent.body.title, 'Reunião atualizada');
  assert.notEqual(updatedEvent.body.version, eventA.body.version);

  const staleEvent = await api(`/events/${eventA.body.id}`, {
    token: state.tokenA,
    method: 'PATCH',
    body: { expectedVersion: eventA.body.version, title: 'Atualização obsoleta', allowConflict: true }
  });
  assert.equal(staleEvent.status, 409);
  assert.equal(staleEvent.body.code, 'STALE_WRITE');

  const deletedEvent = await api(`/events/${allowedConflict.body.id}?expectedVersion=${encodeURIComponent(allowedConflict.body.version)}`, { token: state.tokenA, method: 'DELETE' });
  assert.equal(deletedEvent.status, 204);

  const crossOrganizationMember = await api('/members', {
    token: state.tokenA,
    method: 'POST',
    body: { name: 'Referência inválida', email: `cross-${suffix}@example.test`, password, departmentId: departmentB.body.id, roleId: roleA.body.id }
  });
  assert.equal(crossOrganizationMember.status, 400);
  assert.equal(crossOrganizationMember.body.code, 'INVALID_REFERENCE');

  const memberA = await api('/members', {
    token: state.tokenA,
    method: 'POST',
    body: { name: `Membro ${suffix}`, email: `member-${suffix}@example.test`, password, departmentId: departmentA.body.id, roleId: roleA.body.id }
  });
  assert.equal(memberA.status, 201);

  const updatedMember = await api(`/members/${memberA.body.id}`, {
    token: state.tokenA,
    method: 'PATCH',
    body: { name: `Membro atualizado ${suffix}`, active: false }
  });
  assert.equal(updatedMember.status, 200);
  assert.equal(updatedMember.body.active, false);

  const membersB = await api('/members', { token: state.tokenB });
  assert.equal(membersB.body.some(item => item.id === memberA.body.id), false);

  const usedDepartment = await api(`/departments/${departmentA.body.id}`, { token: state.tokenA, method: 'DELETE' });
  assert.equal(usedDepartment.status, 409);
  assert.equal(usedDepartment.body.code, 'RESOURCE_IN_USE');

  const deletedTag = await api(`/tags/${tagA.body.id}`, { token: state.tokenA, method: 'DELETE' });
  assert.equal(deletedTag.status, 204);
});
