# Runbook operacional

## Verificação inicial

```bash
docker compose ps
curl --fail-with-body http://localhost:3001/api/health
curl --fail-with-body http://localhost:8080/
```

Um health check da API confirma conectividade básica com o PostgreSQL; ele ainda não substitui readiness detalhada ou monitoramento das jornadas do usuário.

## Logs

```bash
docker compose logs --tail=200 api
docker compose logs --tail=200 postgres
docker compose logs --tail=200 web
```

Antes de compartilhar logs, remova tokens, e-mails, telefones, corpos de mensagens e outros dados pessoais.

## Reinício controlado

```bash
docker compose restart api
docker compose ps
curl --fail-with-body http://localhost:3001/api/health
```

Reiniciar a API não deve remover o volume do banco.

## Migrations

A API aplica `backend/migrations/*.sql` antes de escutar HTTP. Acompanhe o log por `Migration aplicada:` e confirme a saúde depois do início. Para consultar o histórico:

```sql
SELECT version, applied_at FROM schema_migrations ORDER BY version;
```

Não apague registros dessa tabela nem edite migrations aplicadas. Em caso de falha, mantenha a API fora de tráfego, preserve logs, restaure o backup quando necessário e corrija com uma nova migration. Migrations destrutivas exigem plano próprio de expand/contract e retorno.

## Painel Supremo e acesso de plataforma

A migration `0007_platform_admin_and_tenant_control.sql` cria o marcador global `users.is_platform_admin`, inicialmente `false` para todos, além das tabelas de configuração de tenants, auditoria e sessões temporárias.

Nenhum cadastro, bootstrap ou login promove um usuário automaticamente. A designação inicial deve ser feita manualmente, após confirmação administrativa, identificando o UUID exato:

```sql
UPDATE users SET is_platform_admin = TRUE WHERE id = '<UUID_EXATO_DO_USUARIO>';
```

As rotas `/api/platform/*` exigem esse privilégio global e não aceitam o wildcard de permissões da organização como substituto. O botão Dashboard emite uma sessão temporária de dez minutos; o token bruto não é armazenado no banco, somente seu hash. Sessões podem ser revogadas e todas as emissões e revogações são registradas em `platform_audit_log`.

Antes de aplicar a migration, manter backup válido e validar em PostgreSQL temporário. A designação do primeiro Super Admin não faz parte da migration e não deve ser executada automaticamente em staging ou produção.

## Backup PostgreSQL

Em desenvolvimento, um backup lógico pode ser criado com:

```bash
docker compose exec -T postgres pg_dump -U fluxo -d fluxo_crm -Fc > fluxo-crm.dump
```

O arquivo pode conter dados pessoais e deve ser protegido. Produção deve usar backups gerenciados, cifrados, com retenção e testes periódicos de restauração.

## Restauração

Restaure primeiro em ambiente isolado e valide schema, contagens e jornadas. Não restaure sobre produção sem janela, backup anterior e plano de retorno.

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" fluxo-crm.dump
```

Esse comando altera e remove objetos do banco de destino. Confirme explicitamente o ambiente e a URL antes de executá-lo.

## Reset de desenvolvimento

Remover o volume do Compose apaga permanentemente o banco local. Somente depois de confirmar que não há dados necessários:

```bash
docker compose down -v
docker compose up --build
```

Nunca use esse procedimento em produção.

## Incidente

1. Preserve evidências e horários.
2. Contenha o acesso sem apagar logs ou dados.
3. Rotacione apenas os segredos potencialmente comprometidos, considerando o impacto sobre dados cifrados.
4. Restaure o serviço pelo caminho de menor risco.
5. Documente causa, impacto, linha do tempo e ações preventivas.

Ainda não existe canal formal de incidentes; ele deve ser definido antes da produção.
