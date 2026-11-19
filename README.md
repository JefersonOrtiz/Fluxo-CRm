# Fluxo CRM

CRM conversacional em evolução, com interface de chat, funil Kanban, agenda, gestão organizacional e uma base para integração com a WhatsApp Business Platform.

> **Estado atual:** no Docker, autenticação, organização, contatos, funil, conversas, mensagens manuais, agenda e configuração Meta usam a API PostgreSQL. Aurora, anexos, lembretes e envio pela Meta não estão integrados. Mensagem `pending` significa persistida, não entregue. Consulte [Estado do projeto](docs/project-status.md).

## Arquitetura oficial

O caminho oficial do produto é:

```text
Navegador → Nginx → API Node.js → PostgreSQL
```

O GitHub Pages/localStorage é um modo de demonstração. O servidor SQLite permanece temporariamente para compatibilidade local e não deve receber novas funcionalidades. As decisões estão registradas em [ADR-0001](docs/adr/0001-runtime-canonico.md) e [ADR-0002](docs/adr/0002-persistencia.md).

## Início rápido

### Demonstração estática

Requer apenas um servidor HTTP. Na raiz do projeto:

```bash
python3 -m http.server 5500
```

Abra `http://localhost:5500`. Também é possível usar a extensão Live Server do VS Code.

Os dados ficam somente no navegador. Para restaurar a demonstração, execute `resetFluxoData()` no console e recarregue a página.

### Stack oficial de desenvolvimento

Requisitos: Docker com Compose e portas `8080` e `3001` livres.

```bash
cp .env.example .env
# Substitua os valores marcados antes de continuar.
docker compose up --build
```

- Interface: `http://localhost:8080`
- API: `http://localhost:3001/api/health`

Crie a organização e o administrador iniciais uma única vez:

```bash
curl --fail-with-body \
  -X POST http://localhost:3001/api/auth/bootstrap \
  -H 'Content-Type: application/json' \
  -d '{"organizationName":"Minha empresa","name":"Administrador","email":"admin@empresa.com","password":"troque-esta-senha"}'
```

Depois do bootstrap, abra a interface e entre com a conta criada. Administração, contatos, funil, conversas e agenda usam a API; um aviso identifica o que ainda é demonstrativo ou preparatório.

## Documentação

- [Governança](GOVERNANCE.md)
- [Estado e limitações](docs/project-status.md)
- [Arquitetura](docs/architecture.md)
- [Modelo de dados](docs/data-model.md)
- [Configuração](docs/configuration.md)
- [Desenvolvimento](docs/development.md)
- [Contrato da API](docs/api/openapi.yaml)
- [Testes](docs/testing.md)
- [Deploy](docs/deployment.md)
- [Runbook operacional](docs/operations-runbook.md)
- [Solução de problemas](docs/troubleshooting.md)
- [Segurança](SECURITY.md)
- [Como contribuir](CONTRIBUTING.md)

## Regras essenciais

- Leia `GOVERNANCE.md` antes de alterar o projeto.
- Não versione `.env`, tokens, senhas ou App Secret.
- Atualize código, testes, OpenAPI e documentação na mesma mudança.
- Não apresente recursos simulados como integrações reais.

## Licença

Ainda não foi definida uma licença. Até que o responsável pelo projeto escolha e adicione uma, o repositório não concede permissão geral de redistribuição.
