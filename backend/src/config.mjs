import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) loadEnvFile(envPath);

export function loadConfig() {
  const errors = [];
  if (!process.env.DATABASE_URL) errors.push('DATABASE_URL é obrigatória');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) errors.push('JWT_SECRET deve ter ao menos 32 caracteres');

  const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY || '', 'base64');
  if (encryptionKey.length !== 32) errors.push('ENCRYPTION_KEY deve representar 32 bytes em Base64');
  if (errors.length) throw new Error(`Configuração inválida: ${errors.join('; ')}`);

  return Object.freeze({
    port: Number(process.env.PORT || 3001),
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey,
    corsOrigin: process.env.CORS_ORIGIN || '*',
    metaVerifyToken: process.env.META_VERIFY_TOKEN || ''
  });
}
