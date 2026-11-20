# ADR-0004: Migrations versionadas na inicialização da API

- Status: aceito
- Data: 2026-11-11

## Contexto

O `database/init.sql` inicializava apenas volumes vazios. A evolução de mensagens exige novas colunas e restrições sem recriar bancos persistentes.

## Decisão

A API aplicará, antes de aceitar conexões HTTP, os arquivos SQL ordenados de `backend/migrations/`. Uma tabela `schema_migrations` registra cada arquivo concluído. Um advisory lock do PostgreSQL impede duas instâncias de migrarem simultaneamente; cada arquivo roda em transação.

`database/init.sql` continuará representando o schema consolidado para bancos novos, e as migrations manterão bancos existentes equivalentes.

## Consequências

- Falha de migration impede a API de iniciar, em vez de operar com schema incompatível.
- Arquivos aplicados são imutáveis; correções posteriores exigem uma nova migration.
- Rollback de aplicação deve considerar compatibilidade de schema; migrations destrutivas exigem plano específico e backup.
- A implementação é intencionalmente pequena e não substitui ferramentas de expand/contract quando o produto exigir deploy sem indisponibilidade.

## Alternativas consideradas

- Recriar o volume: rejeitado por destruir dados.
- Reaplicar `init.sql`: rejeitado porque ele não representa transformações seguras de bancos existentes.
- Introduzir uma biblioteca de migrations: adiado; o executor atual cobre arquivos SQL transacionais sem nova dependência.
