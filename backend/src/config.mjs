import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) loadEnvFile(envPath);

export function parseCorsOrigins(value) {
  const origins = String(value || '').split(',').map(origin => origin.trim()).filter(Boolean);
  if (origins.includes('*')) throw new Error('CORS_ORIGIN não pode usar *; informe uma allowlist explícita');
  for (const origin of origins) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error(`Origem CORS inválida: ${origin}`); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error(`Origem CORS inválida: ${origin}`);
    }
  }
  return Object.freeze([...new Set(origins)]);
}

export function loadConfig() {
  const errors = [];
  if (!process.env.DATABASE_URL) errors.push('DATABASE_URL é obrigatória');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) errors.push('JWT_SECRET deve ter ao menos 32 caracteres');

  const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY || '', 'base64');
  if (encryptionKey.length !== 32) errors.push('ENCRYPTION_KEY deve representar 32 bytes em Base64');
  if (errors.length) throw new Error(`Configuração inválida: ${errors.join('; ')}`);

  const aiProvider = process.env.AI_PROVIDER || 'mock';
  const openAiEnabled = process.env.OPENAI_ENABLED === 'true';
  if (!['mock', 'openai'].includes(aiProvider)) errors.push('AI_PROVIDER deve ser mock ou openai');
  if (openAiEnabled && aiProvider !== 'openai') errors.push('OPENAI_ENABLED=true exige AI_PROVIDER=openai');
  if (openAiEnabled && !process.env.OPENAI_API_KEY) errors.push('OPENAI_API_KEY é obrigatória quando OPENAI_ENABLED=true');
  if (errors.length) throw new Error(`Configuração inválida: ${errors.join('; ')}`);

  return Object.freeze({
    port: Number(process.env.PORT || 3001),
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey,
    corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
    metaVerifyToken: process.env.META_VERIFY_TOKEN || '',
    bootstrapSecret: process.env.BOOTSTRAP_SECRET || '',
    openAiApiKey: process.env.OPENAI_API_KEY || '',
    openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    aiProvider,
    openAiEnabled
  });
}
