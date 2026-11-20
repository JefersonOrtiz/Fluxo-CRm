# ADR-0006: Acesso temporário do Super Admin somente leitura

- Status: aceito
- Data: 2026-11-20

## Contexto

O Painel Supremo precisa abrir o CRM de um Tenant para inspeção sem transferir a
identidade do cliente nem conceder ao Super Admin uma sessão de escrita dentro
do Tenant.

## Decisão

Sessões em `platform_access_sessions` possuem `access_mode=readonly`. O backend
valida esse modo, fixa a sessão à organização registrada e bloqueia qualquer
rota de plataforma ou operação que não seja leitura. A autorização é aplicada
no backend, independentemente do frontend ou do método usado para iniciar a
requisição.

## Consequências

- O Dashboard administrativo pode consultar dados do Tenant, mas não alterar
  perfil, contatos, mensagens, configurações, Aurora ou integrações.
- A sessão continua expirada e revogável, e suas ações permanecem auditáveis.
- A migration 0009 deve ser aplicada antes de emitir novas sessões em ambientes
  existentes; sessões antigas recebem `readonly` pelo valor padrão.
- Um modo de escrita administrativo, se necessário no futuro, exigirá uma nova
  decisão e uma permissão explícita diferente.
