import { createCipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const base64url = value => Buffer.from(value).toString('base64url');

export function createSecurity({ jwtSecret, encryptionKey }) {
  const passwordHash = password => {
    const salt = randomBytes(16).toString('hex');
    return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
  };

  const passwordMatches = (password, encoded) => {
    try {
      const [algorithm, salt, hash] = String(encoded || '').split('$');
      if (algorithm !== 'scrypt' || !salt || !hash) return false;
      const expected = Buffer.from(hash, 'hex');
      const derived = scryptSync(password, salt, expected.length);
      return expected.length === derived.length && timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  };

  const signToken = payload => {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 }));
    const signature = createHmac('sha256', jwtSecret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
  };

  const readToken = request => {
    const raw = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!raw) return null;
    const parts = raw.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expected = createHmac('sha256', jwtSecret).update(`${header}.${body}`).digest('base64url');
    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      return payload.exp > Date.now() / 1000 ? payload : null;
    } catch {
      return null;
    }
  };

  const encrypt = value => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64')
    };
  };

  return Object.freeze({ passwordHash, passwordMatches, signToken, readToken, encrypt });
}
