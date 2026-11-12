# Configuração

## Stack Docker

Copie `.env.example` para `.env`. O Compose usa o arquivo da raiz para interpolar segredos e não o envia ao controle de versão.

| Variável | Obrigatória | Uso |
|---|---:|---|
| `JWT_SECRET` | Sim | Assinatura dos tokens da API |
| `ENCRYPTION_KEY` | Sim | AES-256-GCM para credenciais externas |
| `META_VERIFY_TOKEN` | Para Meta | Validação inicial do webhook |
| `DATA_DIR` | Somente legado | Diretório do SQLite no servidor raiz |

O runtime da interface é explícito: o arquivo estático `js/runtime-config.js` define `demo`; no Compose, o Nginx responde esse caminho com `mode: "api"` e base `/api`. Não há fallback automático entre os modos.

Gere valores locais independentes:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Use o primeiro resultado como `JWT_SECRET` e o segundo como `ENCRYPTION_KEY`. Não copie os valores para logs, tickets ou commits.

## API standalone

Copie `backend/.env.example` para `backend/.env`.

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3001` | Porta HTTP da API |
| `DATABASE_URL` | nenhum seguro | URL do PostgreSQL |
| `JWT_SECRET` | fallback inseguro | Deve ser definido fora de testes descartáveis |
| `ENCRYPTION_KEY` | nenhum | Chave Base64 de 32 bytes |
| `CORS_ORIGIN` | vazio | Lista separada por vírgulas de origens exatas permitidas; `*` não é aceito |
| `META_VERIFY_TOKEN` | vazio | Token compartilhado da verificação Meta |

A API carrega `backend/.env` quando o arquivo existe. Variáveis já definidas no ambiente têm precedência conforme o comportamento do Node.js.

## Produção

- Use o gerenciador de segredos do provedor.
- Não use valores padrão ou de desenvolvimento.
- Restrinja `CORS_ORIGIN` ao domínio oficial.
- Use PostgreSQL gerenciado com TLS, backup e restauração testada.
- Rotacione chaves por procedimento planejado; trocar `ENCRYPTION_KEY` sem recifrar os dados torna os segredos existentes ilegíveis.
