# JF System CRM — ambiente local

O CRM pode rodar como um site estático no GitHub Pages. Nesse modo, contatos, conversas e agenda são salvos no `localStorage` de cada navegador: não há servidor nem banco compartilhado na internet.

## Continuar o desenvolvimento em outro PC com Codespaces

O repositório inclui `.devcontainer/devcontainer.json` com Node.js 24. Ao criar o ambiente, as dependências de desenvolvimento da API são instaladas; ao iniciar ou retomar o ambiente, a prévia do CRM é iniciada automaticamente na porta 3000. A inicialização confere se o servidor já está ativo antes de iniciar outro processo.

1. Entre no GitHub com sua conta pessoal **JefersonOrtiz** e abra a [branch atualizada](https://github.com/JefersonOrtiz/Fluxo-CRm/tree/codex/jf-system-crm-atualizacao).
2. Clique em **Code → Codespaces → Create codespace on codex/jf-system-crm-atualizacao**. Aguarde a preparação do editor.
3. A prévia abre pelo encaminhamento da porta 3000. Se a aba não abrir, acesse **Ports**, encontre **JF System CRM** e clique em **Open in Browser**. Mantenha a visibilidade da porta como **Private**.
4. No outro PC, entre na mesma conta em [github.com/codespaces](https://github.com/codespaces) e retome **o mesmo Codespace** para encontrar os arquivos de trabalho no mesmo ambiente.
5. Depois de editar, faça **Commit** e **Sync Changes/Push** para registrar as alterações na branch do GitHub. Em outro clone ou outro Codespace, faça **Pull** para obter os commits mais recentes.

Se o Codespace já existia antes desta configuração, abra a paleta de comandos do editor e execute **Codespaces: Rebuild Container**. Para conferir ou retomar manualmente a prévia, execute `node .devcontainer/start.mjs`; os logs ficam em `data/codespaces-preview.log`. Ao alterar arquivos da interface, atualize a aba da prévia para visualizar o resultado.

Essa configuração prepara a edição do código e a prévia do CRM. A API com PostgreSQL não é iniciada automaticamente nesta etapa. Os cadastros operacionais continuam no armazenamento do navegador, e os pagamentos dependem da configuração descrita abaixo. Usar o mesmo Codespace em outro navegador não transfere o `localStorage` do navegador anterior. O compartilhamento dos dados operacionais será implementado na integração das telas com a API e o banco central.

Arquivos em `/workspaces`, como o código e o SQLite em `data/`, são preservados ao parar e retomar o mesmo Codespace. Eles não são copiados automaticamente para outro Codespace ou para outro PC. Os arquivos ignorados pelo Git, incluindo bancos e credenciais, também não são enviados ao repositório.

Referências: [configuração de dev containers](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/introduction-to-dev-containers), [portas do Codespaces](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace) e [persistência dos arquivos](https://docs.github.com/en/codespaces/developing-in-a-codespace/persisting-environment-variables-and-temporary-files).

## Publicar no GitHub Pages

1. Envie o projeto para a branch `main` do seu repositório GitHub.
2. No repositório, abra **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **GitHub Actions**.
4. Faça um novo `git push`. O workflow `.github/workflows/pages.yml` fará a publicação.

A URL final será `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

> Cada navegador mantém seus próprios dados. Para restaurar os contatos de demonstração, abra o console do navegador, execute `resetFluxoData()` e recarregue a página.

## Servidor local opcional

O projeto também possui um servidor Node.js e SQLite para uso local. Ele não é executado pelo GitHub Pages.

## Ambiente local de produção — etapa 1

Esta etapa adiciona uma API Node.js, PostgreSQL, autenticação, organizações, setores, colaboradores, privilégios, tags e uma base segura para a integração da Meta.

### Requisitos

- Docker Desktop com Docker Compose (recomendado para executar todos os serviços).
- Node.js 24 ou superior, caso queira desenvolver somente a API.

### Iniciar tudo com Docker

```powershell
docker compose up --build
```

- CRM: `http://localhost:8080`
- API: `http://localhost:3001/api/health`
- PostgreSQL: acessível apenas entre os containers.

Na primeira vez, crie a organização e a conta administradora pela API:

```powershell
Invoke-RestMethod http://localhost:3001/api/auth/bootstrap -Method Post -ContentType 'application/json' -Body '{"organizationName":"Minha empresa","name":"Administrador","email":"admin@empresa.com","password":"uma-senha-com-8-caracteres"}'
```

### Executar só a API

Copie `backend/.env.example` para `backend/.env`, preencha `DATABASE_URL` apontando para um PostgreSQL local e execute:

```powershell
Set-Location backend
npm.cmd install
npm.cmd run dev
```

### Endpoints incluídos

- `POST /api/auth/bootstrap` — cria a primeira organização e administrador.
- `POST /api/auth/login` e `GET /api/auth/me` — autenticação por token.
- `POST /api/auth/logout` — encerra o cookie de sessão da cobrança.
- `GET/POST /api/departments` — setores.
- `GET /api/members` — colaboradores.
- `GET/POST /api/tags` — tags.
- `GET/PUT /api/integrations/meta` — configura IDs e guarda tokens cifrados no backend.
- `GET/POST /api/webhooks/meta` — endpoint preparado para validação e eventos da Meta.

> Para produção, substitua todos os segredos de desenvolvimento por variáveis de ambiente fortes, use PostgreSQL gerenciado com backups e configure o webhook da Meta em um domínio HTTPS público. Não envie tokens, App Secret ou senhas ao repositório.

## Pré-requisito

Node.js 22.5 ou superior (a instalação atual usa Node 24).

## Executar

No PowerShell, dentro da pasta do projeto:

```powershell
npm.cmd run dev
```

Abra `http://localhost:3000`.

Se a porta 3000 já estiver ocupada, use outra porta nesta sessão do PowerShell:

```powershell
$env:PORT=3001; npm.cmd start
```

Então abra `http://localhost:3001`.

Para iniciar sem modo de observação:

```powershell
npm.cmd start
```

## Banco e API local

O banco SQLite contém as tabelas `contacts`, `messages`, `events`, `tags` e `contact_tags`, com chaves estrangeiras e índices para conversas e agenda. Há contatos iniciais de demonstração.

- `GET /api/health` verifica servidor e banco.
- `GET` e `POST /api/contacts` lista e cria contatos.
- `PATCH /api/contacts/:id` atualiza dados de um contato.
- `GET /api/events` lista eventos.

O arquivo do banco não é versionado e fica preservado entre reinicializações. Para começar do zero, pare o servidor e apague apenas `data/fluxo-crm.sqlite`.

## Publicar no Railway

1. Envie este projeto para um repositório no GitHub.
2. No Railway, crie um projeto com **New Project → Deploy from GitHub repo** e selecione o repositório.
3. No serviço criado, abra **Volumes** e crie um volume com o ponto de montagem `/data`.
4. Em **Variables**, crie `DATA_DIR` com o valor `/data`.
5. Em **Networking**, use **Generate Domain** para obter a URL pública.

O arquivo `railway.json` já informa ao Railway como iniciar o app e valida a publicação usando `GET /api/health`. Todo push na branch conectada ao Railway dispara um novo deploy; o banco permanece no volume `/data`.

> SQLite deve usar somente uma instância do serviço, pois o arquivo do banco não é apropriado para escrita concorrente por várias réplicas. Quando o CRM precisar escalar, migre para PostgreSQL gerenciado.

## Assinatura do CRM — Mercado Pago

A página **Gestão → Assinatura** oferece cartão de crédito com cobrança mensal recorrente pela API `/preapproval`, e PIX com QR Code e Copia e Cola pela API `/v1/payments`. O PIX desta integração é um pagamento manual por mensalidade. Não é Pix Automático.

| Plano | Mensalidade | Usuários | Teste inicial |
| --- | --- | --- | --- |
| Básico | R$ 499 | 3 | 15 dias |
| Essencial | R$ 799 | 6 | 30 dias |
| Profissional | R$ 1.099 | 12 | 30 dias |

Os preços são definidos em `shared/plans.js`, usado pelo navegador e pela API. O servidor ignora valores do navegador e recusa campos fora do contrato da API. Não há contratação funcional apenas com hospedagem estática no GitHub Pages.

### Estado atual e ativação

As credenciais não foram criadas. Sem a configuração completa, os pagamentos ficam desabilitados e a página permite conhecer os planos e as duas formas de pagamento. Nenhuma cobrança real foi realizada na implementação ou nos testes.

1. Crie uma conta e uma aplicação em [Suas integrações do Mercado Pago](https://www.mercadopago.com.br/developers/panel/app). Obtenha Public Key e Access Token próprios para os produtos utilizados. Comece pelos testes previstos pelo provedor; não misture credenciais de teste e produção.
2. Execute a API com PostgreSQL, inicializando a base com `database/init.sql` para uma instalação nova. A API aplica `backend/billing/schema.sql` automaticamente ao iniciar, inclusive em bases existentes. Crie o primeiro administrador por `/api/auth/bootstrap`, conforme o exemplo acima.
3. Configure no servidor `MP_PUBLIC_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `JWT_SECRET` aleatório com pelo menos 32 caracteres, `APP_PUBLIC_URL` com o domínio HTTPS público do CRM e `CORS_ORIGIN` com a origem exata da interface. Os exemplos estão em `backend/.env.example`. Nunca envie Access Token ou segredo do webhook pelo chat ou pelo formulário do CRM.
4. No painel do Mercado Pago, cadastre a URL **`https://SEU-DOMINIO/api/billing/webhook`**, copie o segredo de assinatura para `MP_WEBHOOK_SECRET` e habilite os tópicos `payment`, `subscription_preapproval` e `subscription_authorized_payment`. A URL precisa encaminhar à API; localhost não recebe notificações públicas. Em desenvolvimento, use um domínio HTTPS/túnel encaminhando a interface e `/api` e ajuste `CORS_ORIGIN`.
5. No modo local com a interface em 3000 e a API em 3001, `server.mjs` encaminha `/api/auth/*` e `/api/billing/*` para `API_PROXY_URL` (padrão `http://127.0.0.1:3001`). No Docker, o Nginx já encaminha `/api` à API. Use a mesma origem pública para interface e API.
6. Entre como administrador em Assinatura e valide cartão, PIX, notificações, estorno e cancelamento no ambiente de teste compatível com sua conta. Só então configure credenciais de produção. A validação ponta a ponta com o Mercado Pago permanece pendente até existir a aplicação e suas credenciais.

O Docker Compose lê as variáveis comerciais do `.env` da raiz; para executar a API diretamente, `backend/server.mjs` carrega `backend/.env`. Os arquivos privados, o banco e os arquivos do backend não são servidos pelo site. O workflow do GitHub Pages empacota apenas os arquivos públicos.

### Comportamento da cobrança

- Cartão: o SDK oficial com `iframe: true` recebe número, validade e CVV em campos hospedados pelo Mercado Pago e gera um token no navegador. O CRM recebe somente o token transitório e o e-mail. Não grava token, PAN ou CVV, nem registra corpos de requisições/respostas de pagamento. A recorrência é mensal, em BRL, com início após o teste ou após o período já pago. O provedor pode fazer e devolver uma pequena cobrança para validar o cartão.
- PIX: a contratação inicial começa o teste sem cobrar. Após o teste, o administrador gera a mensalidade, cujo QR tem validade de uma hora. Um PIX pendente válido é reaproveitado. A renovação seguinte fica disponível nos últimos sete dias do período já pago. Não há envio automático de lembretes nesta etapa.
- O teste é registrado uma única vez por organização e não recomeça ao cancelar ou contratar outro plano. Usuários ativos são contados no banco antes da contratação, conforme o limite do plano.
- Uma assinatura autorizada ou a exibição do QR não significa pagamento aprovado. O status financeiro só muda após consulta autenticada ao Mercado Pago, validando referência, moeda e valor. Redirecionamentos e informações de pagamento enviadas pelo navegador não ativam assinatura.
- Webhooks exigem HMAC válido e timestamp recente. Uma fila persistida no PostgreSQL responde rapidamente ao provedor e tenta processar novamente em caso de falha; recursos repetidos são conciliados sem duplicar o período pago. Estornos e contestações retiram a confirmação do respectivo pagamento. A tela também oferece atualização manual e consulta leve do PIX enquanto estiver aberta.
- Solicitações concorrentes são serializadas por organização. Uma resposta incerta bloqueia nova contratação até a conciliação por referência, para evitar cobrança duplicada. Se a busca não encontrar o recurso após um timeout, a tentativa continua pendente e exige conferência do suporte na conta do Mercado Pago; não apague o registro nem recrie a cobrança sem conferir o provedor.
- Cancelar renovação chama o Mercado Pago antes de confirmar o cancelamento local e preserva o período já pago. A alteração de plano ou de método exige cancelar a renovação atual. Um PIX pendente precisa ser pago ou expirar antes disso.

Os endpoints financeiros exigem usuário ativo da organização e permissão `*` ou `billing:write`, revalidadas no banco. A interface usa cookie HttpOnly, SameSite=Lax e Secure em HTTPS; tokens não são persistidos no navegador. O cabeçalho Bearer permanece disponível para clientes de API. A sessão de cobrança é independente do perfil de demonstração salvo no navegador.

Esta etapa integra o faturamento e apresenta o período financeiro confirmado. As telas operacionais existentes continuam com seus cadastros locais de demonstração; o bloqueio global do CRM por inadimplência e a fiscalização de limites na criação de usuários exigem ligar essas operações à autenticação e à organização do backend. Não use o perfil local como controle de acesso de um SaaS em produção.

### Endpoints e testes

- `GET /api/billing/config`: disponibilidade, Public Key e catálogo, sem segredos privados.
- `GET /api/billing/subscription`: contrato, teste, período confirmado, PIX pendente e histórico da organização autenticada.
- `POST /api/billing/checkout`: `planId`, `method` (`card` ou `pix`), `acceptedTerms: true`, `payer` e, para cartão, `cardTokenId`. Exige `Idempotency-Key` UUID. PIX usa `payer.email`, `firstName`, `lastName` e `document` (CPF/CNPJ sem pontuação).
- `POST /api/billing/refresh`: concilia com o provedor.
- `POST /api/billing/cancel`: cancela a renovação.
- `POST /api/billing/webhook`: entrada assinada de notificações do Mercado Pago.

```sh
npm test
npm ci --prefix backend
npm test --prefix backend
```

Os testes financeiros usam PostgreSQL em WASM (PGlite) e um provedor simulado: não exigem credenciais, não acessam o Mercado Pago e não geram cobranças. Cobrem preços e testes, usuários, idempotência, PIX, faturas recorrentes, assinaturas antigas, conciliação após timeout, estorno, HMAC, fila persistida, isolamento entre organizações e revogação de permissões.

Referências oficiais: [assinaturas com pagamento autorizado](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/authorized-payments), [CardForm com campos hospedados](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/how-tos/how-to-migrate/cardform/clientside), [pagamento por PIX](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/payment-submission/pix) e [webhooks](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks).
