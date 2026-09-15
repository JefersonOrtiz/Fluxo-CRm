# Fluxo CRM — ambiente local

O CRM pode rodar como um site estático no GitHub Pages. Nesse modo, contatos, conversas e agenda são salvos no `localStorage` de cada navegador: não há servidor nem banco compartilhado na internet.

## Publicar no GitHub Pages

1. Envie o projeto para a branch `main` do seu repositório GitHub.
2. No repositório, abra **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **GitHub Actions**.
4. Faça um novo `git push`. O workflow `.github/workflows/pages.yml` fará a publicação.

A URL final será `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

> Cada navegador mantém seus próprios dados. Para restaurar os contatos de demonstração, abra o console do navegador, execute `resetFluxoData()` e recarregue a página.

## Servidor local opcional

O projeto também possui um servidor Node.js e SQLite para uso local. Ele não é executado pelo GitHub Pages.

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
