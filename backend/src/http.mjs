export class HttpError extends Error {
  constructor(status, message, code = 'HTTP_ERROR') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const json = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

export const parseBody = request => new Promise((resolve, reject) => {
  let data = '';
  let rejected = false;
  request.on('data', chunk => {
    if (rejected) return;
    data += chunk;
    if (data.length > 1_000_000) {
      rejected = true;
      reject(new HttpError(413, 'Payload muito grande', 'PAYLOAD_TOO_LARGE'));
    }
  });
  request.on('end', () => {
    if (rejected) return;
    try {
      resolve(data ? JSON.parse(data) : {});
    } catch {
      reject(new HttpError(400, 'JSON inválido', 'INVALID_JSON'));
    }
  });
  request.on('error', reject);
});

export function requiredString(body, field, { min = 1, max = 255, label = field } = {}) {
  const value = String(body[field] ?? '').trim();
  if (value.length < min || value.length > max) {
    throw new HttpError(400, `${label} deve ter entre ${min} e ${max} caracteres`, 'VALIDATION_ERROR');
  }
  return value;
}

export function optionalString(body, field, { max = 255, label = field } = {}) {
  if (body[field] === undefined || body[field] === null || body[field] === '') return null;
  const value = String(body[field]).trim();
  if (value.length > max) throw new HttpError(400, `${label} deve ter no máximo ${max} caracteres`, 'VALIDATION_ERROR');
  return value;
}

export function email(body, field = 'email') {
  const value = requiredString(body, field, { min: 3, max: 255, label: 'E-mail' }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new HttpError(400, 'E-mail inválido', 'VALIDATION_ERROR');
  return value;
}

export const routeId = (pathname, resource) => {
  const match = pathname.match(new RegExp(`^/api/${resource}/([^/]+)$`));
  return match ? decodeURIComponent(match[1]) : null;
};

export function databaseError(error) {
  if (error instanceof HttpError) return error;
  if (error?.code === '23505') return new HttpError(409, 'Já existe um registro com esses dados', 'CONFLICT');
  if (error?.code === '23503') return new HttpError(409, 'O registro está vinculado a outros dados', 'CONFLICT');
  if (error?.code === '22P02') return new HttpError(400, 'Identificador inválido', 'VALIDATION_ERROR');
  return null;
}
