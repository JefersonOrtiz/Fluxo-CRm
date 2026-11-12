# Estado do projeto

Data da revisão: 2026-11-11.

## Matriz de funcionalidades

| Recurso | Interface demo | API PostgreSQL | Integração ponta a ponta |
|---|---:|---:|---:|
| Contatos | API no modo conectado | GET/POST/PATCH paginados | Sim |
| Conversas e mensagens | API no modo conectado | Cursor/atribuição/idempotência | Parcial: sem provedor externo |
| Funil Kanban | API no modo conectado | Filtro por etapa e atualização concorrente | Sim |
| Agenda | API no modo conectado | Cursor/UTC/fuso/conflitos | Sim |
| Setores | API no modo conectado | GET/POST/DELETE | Sim |
| Colaboradores | API no modo conectado | GET/POST/PATCH | Parcial: edição ainda sem formulário |
| Privilégios | API no modo conectado | GET/POST/PATCH/DELETE | Sim |
| Tags | API no modo conectado | GET/POST/DELETE | Sim |
| Autenticação | Login, restauração e logout no modo API | Bootstrap/login/me | Parcial |
| Aurora | Regras por palavras-chave | Não implementada | Não |
| Meta/WhatsApp | Configuração persistida pela API | Configuração e webhook básico | Parcial: sem comunicação com a Meta |

## O que funciona hoje

- Navegação e interações da interface demonstrativa.
- Persistência local de contatos, mensagens, eventos e administração no modo demo.
- Seleção explícita de runtime: GitHub Pages/servidor legado em `demo` e Nginx em `api`.
- Login, restauração de sessão via `/api/auth/me`, logout local e tratamento de expiração/indisponibilidade.
- Leitura e administração de setores, colaboradores, privilégios e tags pela API, respeitando permissões.
- Edição de funções pela API e interface, com preservação de `*`, confirmação administrativa e proteção do último acesso.
- Lista, criação e edição de contatos pela API, com busca, filtro, ordenação, paginação e tags.
- Funil carregado por etapa e movimentação de cards com detecção de atualização concorrente.
- Conversas e mensagens manuais persistidas, com paginação por cursor, busca, atribuição e escrita idempotente.
- Agenda mensal persistida, com criação, edição, exclusão, fuso IANA e conflito por responsável.
- Migrations SQL versionadas, transacionais e serializadas por advisory lock antes da inicialização HTTP.
- Persistência cifrada da configuração Meta no backend, sem validação externa do provedor.
- Inicialização da stack PostgreSQL por Docker Compose.
- Bootstrap, login, identificação da sessão, setores, listagem de membros, tags e configuração Meta na API.
- Health checks básicos das APIs.

## Limitações conhecidas

- Agenda não possui recorrência, lembretes, sincronização externa ou atualização em tempo real.
- O seletor de contato do evento carrega os primeiros 100 contatos em ordem alfabética; busca dedicada ainda não foi implementada.
- A interface mensal carrega no máximo 2.500 eventos; a API continua paginada para consumidores administrativos.
- Contatos não recebem atualização em tempo real; outras sessões veem mudanças ao recarregar a lista ou o funil.
- Cada etapa do Kanban exibe no máximo os 50 contatos atualizados mais recentemente, preservando contagem e valor total da etapa.
- A Aurora não utiliza modelo de IA externo.
- Mensagens e anexos não são enviados a provedores reais; `pending` significa apenas persistência na API.
- Não há atualização em tempo real, contagem de não lidas nem persistência de favoritos, notas, anexos ou sugestões da Aurora.
- O webhook Meta não valida assinatura nem processa eventos.
- O token de autenticação não possui renovação ou revogação.
- Existem testes do cliente HTTP e integração multi-tenant de organização, contatos, funil, conversas e mensagens; ainda faltam testes de navegador, rate limiting e observabilidade.

## Próxima entrega recomendada

Implementar o adaptador Meta de forma segura: validar assinatura, usar outbox/retries, consumir mensagens inbound e promover estados `pending` para `sent`, `delivered`, `read` ou `failed` idempotentemente. Antes de dados reais, concluir rate limiting, revogação de sessão e observabilidade.
