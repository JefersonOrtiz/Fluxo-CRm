# Segurança

## Estado de segurança

O projeto está em desenvolvimento e não deve ser exposto como serviço de produção. Faltam rate limiting, revogação de sessão, validação de assinatura do webhook, auditoria e testes de segurança.

## Relato de vulnerabilidades

Não publique credenciais, dados pessoais ou detalhes exploráveis em issues públicas. O responsável pelo repositório deve definir um canal privado antes da abertura externa do projeto. Enquanto esse canal não existir, suspenda qualquer deploy público que trate dados reais.

## Segredos

- Nunca versione `.env`, senhas, tokens, chaves privadas ou App Secret.
- Gere `JWT_SECRET` e `ENCRYPTION_KEY` independentemente por ambiente.
- `ENCRYPTION_KEY` deve representar exatamente 32 bytes em Base64.
- Não reutilize valores de desenvolvimento em produção.
- Guarde segredos de produção no gerenciador do provedor de deploy.
- A rota de leitura da integração nunca deve retornar os segredos cifrados ou em texto puro.

## Dados e acesso

- Toda consulta de negócio deve ser limitada pela organização autenticada.
- Permissões devem ser verificadas no servidor, nunca apenas na interface.
- Logs não devem conter senhas, tokens, App Secret, corpos completos de webhook ou dados pessoais desnecessários.
- Produção exige HTTPS e CORS limitado à origem oficial.
- O frontend atual guarda o token somente em `sessionStorage`, limpa-o em HTTP 401 e o revalida ao recarregar. Isso reduz persistência entre abas, mas não elimina o risco de XSS; CSP e hardening de sessão continuam obrigatórios antes da produção.
- Referências de setor e privilégio são validadas contra a organização autenticada; testes de integração cobrem tentativas de associação cruzada.
- Contatos e tags associadas são sempre filtrados pela organização; tentativas de leitura ou associação cruzada são cobertas pelo teste de integração.
- Atualizações de contato exigem a versão da última leitura, evitando sobrescrita silenciosa entre usuários.
- Conversas e mensagens são resolvidas através da organização autenticada; responsáveis de outro tenant são rejeitados.
- `clientMessageId` é único por conversa e torna retries de escrita idempotentes. Isso não substitui a futura idempotência de eventos do provedor.
- Eventos, contatos e responsáveis são validados na organização autenticada. Advisory locks serializam a verificação de sobreposições do mesmo responsável.
- `allowConflict` nunca deve ser enviado automaticamente; ele representa decisão explícita de aceitar uma sobreposição.
- Funções com `*` exigem confirmação explícita para edição e a API impede remover o último acesso administrativo ativo da organização.
- Permissões são incorporadas ao token por oito horas. Alterações de papel não revogam tokens emitidos; revogação e redução imediata de privilégio continuam obrigatórias antes da produção.

## Antes da produção

- Adicionar validação de entrada e limites em todos os endpoints.
- Implementar rate limiting e proteção de login.
- Definir renovação, revogação e armazenamento de sessão.
- Validar assinatura e idempotência de webhooks.
- Executar análise de dependências e testes de autorização multi-tenant.
- Definir retenção, backup, restauração e exclusão de dados pessoais.
