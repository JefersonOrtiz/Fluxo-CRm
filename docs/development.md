# Desenvolvimento

## Requisitos

- Node.js 24 para alinhar ambiente local e imagem Docker.
- npm compatível com o lockfile v3.
- Docker com Compose para a stack oficial.
- `curl` para smoke tests.
- `psql` somente se a API for executada contra PostgreSQL fora do Docker.

## Stack oficial

```bash
cp .env.example .env
docker compose up --build
```

Em outro terminal:

```bash
curl --fail http://localhost:3001/api/health
```

O SQL de inicialização roda apenas quando o volume do PostgreSQL está vazio.

Depois do bootstrap descrito no README, a interface do Compose exige login. A sessão fica em `sessionStorage`, portanto abrir outra aba ou fechar a aba exige nova autenticação.

O administrador inicial possui `*`. Novos privilégios podem combinar `organization:write`, `contacts:write`, `conversations:write`, `messages:write`, `events:write`, `members:write`, `roles:write` e `integrations:write`. O cadastro de colaborador exige uma senha temporária; troca obrigatória de senha ainda não foi implementada.

Ao iniciar, a API aplica em ordem as migrations ainda não registradas em `schema_migrations`. Quando `schema_migrations` está vazia, o baseline só é registrado se tabelas, colunas, índices e constraints essenciais do schema consolidado estiverem presentes; um schema parcial não é aceito como íntegro. Não altere um arquivo já aplicado; crie a próxima migration SQL e mantenha `database/init.sql` sincronizado para bancos novos.

## API fora do Docker

1. Crie um banco PostgreSQL vazio.
2. Aplique o schema:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/init.sql
```

3. Prepare e execute a API:

```bash
cp backend/.env.example backend/.env
cd backend
npm ci
npm run dev
```

## Demonstração estática

```bash
python3 -m http.server 5500
```

Esse modo não usa API, autenticação ou banco compartilhado.

## Servidor SQLite legado

```bash
npm start
```

Abre `http://localhost:3000`. Esse runtime é mantido apenas para compatibilidade e não representa a arquitetura oficial.

## Antes de entregar uma mudança

Siga `GOVERNANCE.md`, execute as verificações descritas em `docs/testing.md`, atualize o OpenAPI quando necessário e registre a mudança no changelog.
