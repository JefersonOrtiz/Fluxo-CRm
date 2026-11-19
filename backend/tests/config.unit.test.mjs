import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';

const requiredKeys = ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY', 'AI_PROVIDER', 'OPENAI_ENABLED', 'OPENAI_API_KEY'];

const withEnvironment = (values, callback) => {
  const previous = Object.fromEntries(requiredKeys.map(key => [key, process.env[key]]));
  try {
    for (const key of requiredKeys) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    return callback();
  } finally {
    for (const key of requiredKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
};

const validBase = {
  DATABASE_URL: 'postgres://test',
  JWT_SECRET: 'j'.repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32).toString('base64')
};

test('configuração ausente mantém OpenAI desativada e seleciona mock', () => {
  withEnvironment(validBase, () => {
    const config = loadConfig();
    assert.equal(config.aiProvider, 'mock');
    assert.equal(config.openAiEnabled, false);
    assert.equal(config.openAiApiKey, '');
  });
});

test('configuração OpenAI incompleta falha sem fallback silencioso', () => {
  withEnvironment({ ...validBase, AI_PROVIDER: 'openai', OPENAI_ENABLED: 'true' }, () => {
    assert.throws(() => loadConfig(), error => error.code === undefined && /OPENAI_API_KEY é obrigatória/.test(error.message));
  });
});

test('configuração inválida de provedor falha explicitamente', () => {
  withEnvironment({ ...validBase, AI_PROVIDER: 'outro-provedor' }, () => {
    assert.throws(() => loadConfig(), /AI_PROVIDER deve ser mock ou openai/);
  });
});

test('OpenAI habilitada exige explicitamente provider e chave', () => {
  withEnvironment({ ...validBase, AI_PROVIDER: 'openai', OPENAI_ENABLED: 'true', OPENAI_API_KEY: 'test-only-key' }, () => {
    const config = loadConfig();
    assert.equal(config.aiProvider, 'openai');
    assert.equal(config.openAiEnabled, true);
    assert.equal(config.openAiApiKey, 'test-only-key');
  });
});
