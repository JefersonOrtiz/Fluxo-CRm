# Instruções para colaboradores e agentes

Antes de executar qualquer tarefa neste repositório:

1. Leia integralmente `GOVERNANCE.md`.
2. Consulte os ADRs aplicáveis em `docs/adr/`.
3. Apresente um plano antes de alterar arquivos.
4. Preserve mudanças preexistentes e não relacionadas.
5. Mantenha código, testes, exemplos, OpenAPI e documentação sincronizados.

O caminho oficial do produto é frontend + API Node.js + PostgreSQL. O modo GitHub Pages/localStorage existe somente para demonstração. Não amplie o servidor SQLite nem introduza novas dependências nele sem uma nova decisão arquitetural.

Não declare integrações, IA, mensagens, autenticação ou persistência como funcionais quando forem simulações ou estruturas preparatórias.
