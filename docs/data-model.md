# Modelo de dados

## PostgreSQL oficial

Todas as entidades de negócio devem pertencer direta ou indiretamente a uma organização.

```text
organizations
  ├─ roles
  ├─ departments
  ├─ users
  ├─ tags
  ├─ contacts ── contact_tags ── tags
  ├─ conversations ── messages
  ├─ events
  └─ integrations
```

### Entidades

- `organizations`: tenant raiz.
- `roles`: nome, descrição e lista JSON de permissões por organização.
- `departments`: setores internos da organização.
- `users`: colaboradores, credencial derivada, setor, papel e estado de atividade.
- `tags`: classificações por organização.
- `contacts`: clientes, empresa, etapa do funil e valor estimado em centavos.
- `contact_tags`: relação muitos-para-muitos.
- `conversations`: canal, contato, responsável e estado.
- `messages`: direção, remetente, conteúdo, estado de entrega e identificadores idempotente/do provedor.
- `events`: compromisso com intervalo UTC, fuso IANA original, contato e responsável opcionais.
- `integrations`: identificadores do provedor e envelope cifrado de segredos.

### Restrições relevantes

- Nomes de papéis, setores e tags são únicos dentro da organização.
- O e-mail do usuário é atualmente único globalmente.
- Mensagens aceitam apenas direção `inbound`/`outbound` e remetente `contact`/`user`/`ai`.
- `client_message_id` é único por conversa quando informado. Mensagens manuais iniciam em `pending`, que representa persistência local na API, não entrega externa.
- Exclusões da organização propagam para seus dados; referências opcionais de usuário e setor usam `SET NULL`.
- A API representa valores de contato em centavos inteiros (`valueCents`) e valida tags na mesma organização.
- Atualizações de contato exigem uma versão opaca derivada de `xmin`; uma versão obsoleta retorna `STALE_WRITE` sem sobrescrever a alteração concorrente.
- Eventos exigem fim posterior ao início; sobreposições do mesmo responsável são bloqueadas pela API salvo confirmação explícita.

## Lacunas conhecidas

- Agenda ainda não possui recorrência, lembretes ou sincronização com calendários externos.
- Não há trilha de auditoria.
- `updated_at` depende da aplicação e não possui trigger genérico.
- A versão de concorrência baseada em `xmin` é uma solução transitória; migrations futuras devem avaliar uma coluna de versão explícita antes de replicação lógica ou migração entre bancos.
- Regras de retenção e anonimização ainda não foram definidas.

## SQLite legado

O banco local contém `contacts`, `tags`, `contact_tags`, `messages` e `events`. O modelo não é multi-tenant e não deve ser usado como base para novas funcionalidades.

## Migrations

`database/init.sql` representa o schema consolidado para bancos vazios. Antes de abrir a porta HTTP, a API executa os arquivos ordenados de `backend/migrations/` em transação e registra cada versão em `schema_migrations`. O advisory lock evita aplicação simultânea por duas instâncias. Consulte o [ADR-0004](adr/0004-migrations-versionadas.md).
