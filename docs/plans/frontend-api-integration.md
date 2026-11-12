# Plano: integração frontend–API

- Status: Fases 1 a 5 concluídas
- Responsável: a definir
- Dependências: ADR-0001, ADR-0002, ADR-0003, ADR-0004 e ADR-0005

## Objetivo

Fazer a interface oficial usar autenticação e dados PostgreSQL sem interromper o modo demonstrativo estático.

## Fora do escopo inicial

- IA externa.
- Envio real de WhatsApp.
- Importação automática do `localStorage`.
- Agenda, conversas e mensagens na primeira fatia.

## Fase 1: contrato e infraestrutura de frontend

Concluída em 2026-11-11.

1. Introduzir configuração explícita de modo `demo` ou `api`.
2. Criar cliente HTTP centralizado com JSON, timeout, erro normalizado e header de autenticação.
3. Criar armazenamento de sessão separado dos dados demonstrativos.
4. Implementar tela de login e restauração via `/api/auth/me`.
5. Implementar logout local e expiração da sessão.

Critérios de aceite:

- modo demo continua funcionando sem API;
- modo API exige login;
- token inválido ou expirado volta ao login;
- nenhum segredo de integração é persistido no navegador;
- testes cobrem sucesso, 401, indisponibilidade e resposta inválida.

Resultado: `js/runtime-config.js`, `js/api.js` e `js/auth.js` implementam o recorte. O modo Nginx exige login, enquanto GitHub Pages e o servidor legado permanecem em demonstração. Os módulos de negócio continuam explicitamente demonstrativos até a Fase 2.

## Fase 2: organização

Concluída em 2026-11-11.

1. Carregar setores, membros e tags pela API.
2. Substituir gravações locais de setores e tags pelos endpoints.
3. Ocultar ou desabilitar ações sem permissão, mantendo a API como autoridade.
4. Implementar endpoints ausentes de papéis e criação/edição de membros antes de conectar seus formulários.

Critérios de aceite:

- recarregar a página preserva dados no PostgreSQL;
- duas organizações não observam dados uma da outra;
- erros de conflito e permissão têm mensagem e estado visual adequados;
- OpenAPI e testes de contrato refletem todos os endpoints.

Resultado: setores, colaboradores, privilégios, tags e configuração Meta são carregados e alterados pela API no modo conectado. A API valida permissões e propriedade das referências; o teste de integração comprova isolamento entre organizações. A edição de colaboradores existe no contrato, mas ainda não possui formulário dedicado.

## Fase 3: contatos e funil

Concluída em 2026-11-11.

1. Implementar endpoints paginados de contatos.
2. Definir validação, filtros, busca e ordenação.
3. Conectar lista, detalhes e movimentação do Kanban.
4. Definir concorrência de atualização antes de habilitar múltiplos usuários.

Critérios de aceite:

- criação e alteração sobrevivem a recarregamento;
- valores monetários permanecem em centavos na API;
- paginação e busca não carregam a base inteira;
- mudanças concorrentes possuem comportamento definido e testado.

Resultado: a lista usa paginação, busca, filtro de etapa e ordenação no servidor; criação e edição preservam valores em centavos e tags da organização. O Kanban consulta cada etapa em lotes limitados e move cards por `PATCH`. A versão opaca baseada em `xmin` impede sobrescrita silenciosa, e o teste de integração cobre isolamento multi-tenant e `STALE_WRITE`.

## Fase 4: conversas e mensagens

Concluída em 2026-11-11.

1. Introduzir migrations versionadas antes de evoluir o schema.
2. Paginar conversas e mensagens por cursor estável.
3. Persistir mensagens manuais com chave idempotente e estado inicial honesto.
4. Integrar abertura, histórico, envio e atribuição no frontend.

Resultado: o modo API não usa mais conversas locais. A API isola cada consulta por organização, reutiliza conversa aberta, valida responsável, detecta atualização concorrente e impede duplicidade por `clientMessageId`. Mensagens ficam `pending` até existir um adaptador externo; nenhum estado de entrega é simulado.

## Fase 5: agenda

Concluída em 2026-11-11.

1. Criar migration e endpoints de eventos antes de remover os dados locais.
2. Persistir instantes em UTC e preservar o fuso IANA informado.
3. Detectar sobreposição por responsável com override somente após confirmação explícita.
4. Integrar mês, painel diário, criação, edição e exclusão.

Resultado: o modo API não usa mais eventos locais. Consultas possuem intervalo máximo de 366 dias e paginação por cursor; referências e conflitos respeitam organização e responsável. Recorrência, lembretes e calendários externos permanecem explicitamente fora do escopo.

## Correção administrativa: edição de funções

Concluída em 2026-11-12 como correção transversal da Fase 2.

O endpoint `PATCH /api/roles/:id` e o formulário existente agora permitem alterar nome, descrição e permissões. A API revalida a organização a cada requisição, exige `roles:write`, requer confirmação para funções com `*` e rejeita a remoção do último acesso administrativo ativo. A interface oferece editar, salvar e cancelar sem criar um segundo formulário.

## Estratégia de rollout

- Manter demo e API como modos explicitamente separados.
- Liberar uma fatia vertical por vez.
- Não criar fallback silencioso da API para `localStorage`, pois ele mascara falhas e produz divergência.
- Remover o servidor SQLite somente após todas as jornadas oficiais estarem cobertas e o deploy legado possuir plano de migração.

## Riscos

- Exposição de token no navegador: reduzir com política de sessão e hardening definido no ADR-0003.
- Vazamento multi-tenant: cobrir cada repositório/consulta com testes entre organizações.
- Divergência demo/API: usar configuração explícita e adaptadores separados.
- Contrato instável: tratar o OpenAPI como parte obrigatória da mudança.
