# Deploy

## Classificação dos modos

| Destino | Uso permitido | Persistência |
|---|---|---|
| GitHub Pages | Demonstração | `localStorage` por navegador |
| Docker Compose | Desenvolvimento e homologação local | PostgreSQL em volume |
| Railway configurado na raiz | Legado, não recomendado | SQLite em volume |
| Produção oficial | Ainda não aprovada | PostgreSQL gerenciado |

## GitHub Pages

O workflow `.github/workflows/pages.yml` empacota apenas `index.html`, `.nojekyll`, `css/` e `js/` quando há push em `main`. Configure **Settings → Pages → Source → GitHub Actions**.

Esse deploy:

- não executa Node.js;
- não possui autenticação real;
- não recebe webhooks;
- não compartilha dados entre navegadores;
- não pode armazenar segredos.

Revise sempre o artefato publicado para impedir a inclusão acidental de arquivos desnecessários.

## Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
curl --fail http://localhost:3001/api/health
curl --fail http://localhost:8080/
```

O volume `postgres_data` preserva o banco. O script de inicialização roda somente quando esse volume está vazio; em todo início, a API aplica migrations pendentes antes de abrir a porta HTTP. Falha de migration impede a inicialização.

## Railway legado

`railway.json` inicia o servidor SQLite da raiz. Esse caminho não é a arquitetura oficial e não deve receber novos ambientes. Instâncias existentes devem permanecer com uma única réplica e volume montado em `/data` até possuírem plano de migração.

## Requisitos para produção

Antes de publicar dados reais:

- concluir a integração frontend–API;
- validar migrations em cópia restaurada, definir backup e procedimento de retorno para cada alteração destrutiva;
- usar PostgreSQL gerenciado com TLS, backups e restore testado;
- usar HTTPS e segredos do provedor;
- configurar CORS para a origem oficial;
- implementar rate limiting, logs estruturados, métricas e alertas;
- implementar renovação/revogação de sessão;
- executar testes de autorização multi-tenant;
- validar assinatura, idempotência e retries dos webhooks;
- definir política de dados pessoais, retenção e resposta a incidentes.

Enquanto esses itens não forem atendidos, qualquer ambiente público deve ser tratado apenas como demonstração sem dados reais.
