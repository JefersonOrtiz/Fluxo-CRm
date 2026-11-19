# ADR-0002: Autoridade e persistência dos dados

- Status: aceito
- Data: 2026-11-11

## Contexto

A interface atual armazena contatos, eventos, organização e configurações não sensíveis no navegador. As APIs SQLite e PostgreSQL não são consumidas por ela.

## Decisão

No produto oficial, a API PostgreSQL será a única autoridade para dados de negócio. O navegador poderá armazenar apenas sessão, preferências e caches descartáveis definidos explicitamente.

O modo demo manterá seu namespace próprio no `localStorage` e não prometerá sincronização, backup, multiusuário ou recuperação.

## Consequências

- A integração frontend–API deve substituir gradualmente os arrays e gravações locais.
- Migrações de banco devem ser versionadas e aplicadas antes da inicialização da API.
- Dados sensíveis nunca serão armazenados no navegador.
- Não haverá sincronização automática dos dados existentes no modo demo sem um plano de importação específico.
