# Aurora — sugestões com OpenAI (Etapa 2A)

Esta etapa oferece somente sugestões para revisão humana. Nenhuma sugestão é gravada em `messages` e nenhuma mensagem é enviada ao cliente.

## Configuração

- `OPENAI_API_KEY`: segredo exclusivo do processo backend; nunca deve ser exposto ao frontend ou versionado.
- `OPENAI_MODEL`: modelo configurável (padrão `gpt-4o-mini`).
- `AI_PROVIDER`: `openai` por padrão; `mock` somente para testes locais explícitos. O backend rejeita `mock` quando `NODE_ENV=production`.

## Limites atuais

- Até 20 mensagens recentes.
- Até 2.000 caracteres por mensagem.
- Até 20.000 caracteres de contexto.
- Até 300 tokens de saída.
- Até 10 solicitações por usuário/minuto.
- Até 30 solicitações por organização/minuto.
- Timeout do provedor: 12 segundos.

## Privacidade e LGPD

O contexto é carregado exclusivamente do PostgreSQL da organização autenticada. O navegador não pode fornecer histórico arbitrário. Antes de usar conversas reais, a organização deve avaliar base legal, finalidade, minimização de dados, retenção, contratos com o provedor e eventuais dados pessoais/sensíveis presentes nas mensagens.

O cliente usa `store: false` na Responses API. Conteúdo de mensagens não é escrito em logs pelo endpoint. Ainda assim, o envio a um provedor externo deve ser aprovado pelo responsável de privacidade da organização.
