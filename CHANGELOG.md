# Changelog

O projeto segue o formato do Keep a Changelog enquanto não possui versões publicadas formalmente.

## Não publicado

### Adicionado

- Tela de configurações com edição de perfil, troca de senha com revogação global de sessões e organização protegida por permissão.

- Governança, instruções de contribuição e política de segurança.
- ADRs para runtime, persistência, autenticação e segredos.
- Documentação de arquitetura, dados, configuração, desenvolvimento, testes, deploy, operação e troubleshooting.
- Contrato OpenAPI inicial para a API PostgreSQL.
- Plano incremental da integração frontend–API.
- Runtime explícito `demo/api`, cliente HTTP centralizado e sessão por aba.
- Tela de login, restauração via `/api/auth/me` e logout local.
- Testes automatizados para sucesso, 401, indisponibilidade e resposta inválida do cliente HTTP.
- Integração frontend–API para setores, colaboradores, privilégios, tags e configuração Meta.
- Endpoints de criação e edição de colaboradores, CRUD administrativo de privilégios e exclusão de setores/tags.
- Permissões administrativas granulares e teste real de isolamento multi-tenant.
- Endpoints paginados de contatos com busca, filtro, ordenação, tags e valores em centavos.
- Integração da lista de contatos e do funil Kanban com a API PostgreSQL.
- Concorrência otimista de contatos com versão opaca e erro `STALE_WRITE`.
- Cobertura de integração para contatos, permissão de escrita, paginação e isolamento entre organizações.
- Executor de migrations SQL versionadas com registro transacional e advisory lock.
- Conversas e mensagens paginadas por cursor, com isolamento multi-tenant e atribuição de responsável.
- Escrita idempotente de mensagens por `clientMessageId` e estados explícitos de entrega.
- Interface conectada para abrir conversas, consultar histórico, persistir mensagens e assumir atendimento.
- ADR-0004 para evolução segura do schema PostgreSQL.
- Migration e API de agenda com intervalo UTC, fuso IANA, contato e responsável.
- Calendário conectado com visualização mensal/diária, criação, edição e exclusão.
- Detecção transacional de sobreposição por responsável e override explicitamente confirmado.
- Permissão `events:write` e testes multi-tenant da agenda.
- ADR-0005 para armazenamento temporal e conflitos de agenda.
- Edição de funções com PATCH, formulário reutilizado e ações de editar/cancelar na administração.
- Proteção de funções com `*` e bloqueio da remoção do último acesso administrativo da organização.
- Validação estrutural do baseline de migrations, com testes para bancos novos, consolidados e incompletos.

### Alterado

- README consolidado para distinguir demonstração, servidor SQLite legado e stack PostgreSQL oficial.
- Backend separado em configuração, segurança, utilitários HTTP e aplicação.
- Respostas organizacionais padronizadas em camelCase e erros com código estável.
- Permissões de papéis ampliadas com `contacts:write`, `conversations:write` e `messages:write`.

### Corrigido

- Serviço da página inicial no servidor SQLite legado.
- Caminho do webhook Meta exibido na interface.
- Carregamento opcional de `backend/.env` no desenvolvimento standalone.

### Segurança

- Compose passa a exigir segredos locais explícitos para JWT e criptografia.
- Artefato do GitHub Pages passa a conter apenas os arquivos necessários à demonstração.

## Histórico anterior

O histórico anterior não foi mantido em changelog. Consulte os commits do repositório.
