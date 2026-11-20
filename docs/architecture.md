# Arquitetura

## Visão alvo

```text
Navegador
   |
   | HTTPS / JSON
   v
Nginx ---- arquivos estáticos
   |
   | /api/*
   v
API Node.js
   |
   | SQL parametrizado
   v
PostgreSQL
```

O Nginx serve a aplicação e encaminha `/api/*` para o backend. A API autentica o usuário, limita todas as consultas pela organização e centraliza regras de negócio. O PostgreSQL é a autoridade dos dados.

## Componentes atuais

### Frontend

HTML, CSS e JavaScript sem etapa de build. `js/runtime-config.js` seleciona o modo demo por padrão; o Nginx o substitui por configuração `api`. `js/api.js` centraliza HTTP e sessão, `js/auth.js` controla login, `js/management.js` integra administração, `js/contacts.js` integra contatos/funil, `js/conversations.js` integra conversas/mensagens e `js/calendar.js` integra a agenda. `js/data.js`, `js/storage.js` e `js/ai.js` sustentam o modo demonstrativo, enquanto `js/app.js` coordena a interface.

A sessão autenticada fica em `sessionStorage` e é revalidada em `/api/auth/me` a cada carregamento. Um HTTP 401 limpa a sessão e retorna ao login. Organização, contatos, funil, conversas, mensagens, agenda e configuração Meta passam pelo cliente HTTP. Não existe fallback silencioso para dados locais.

### API PostgreSQL

`backend/server.mjs` aplica migrations e controla o ciclo do processo. Configuração, segurança, migrations, HTTP e rotas estão separados em `backend/src/`. Autenticação, administração, CRM, conversas e agenda estão integrados; os domínios devem ser extraídos por módulo quando crescerem, sem camadas vazias.

### Banco PostgreSQL

O schema atual está em `database/init.sql` e cobre organizações, papéis, usuários, setores, tags, contatos, conversas, mensagens e integrações. Eventos ainda não fazem parte desse schema.

### Servidor SQLite legado

`server.mjs` serve arquivos estáticos e uma API local limitada. Ele existe para compatibilidade e não integra a interface. Sua remoção depende da conclusão da stack oficial.

## Fronteiras

- O navegador não deve acessar o banco diretamente.
- Regras de permissão e isolamento multi-organização pertencem à API.
- Tokens e App Secret nunca devem chegar ao `localStorage`.
- Integrações externas devem ser tratadas como adaptadores da API, com idempotência e observação.

## Evolução planejada

1. ~~Cliente HTTP, login e sessão no frontend.~~
2. ~~Organização, setores, membros, papéis e tags via API.~~
3. ~~Contatos e funil.~~
4. ~~Conversas e mensagens.~~
5. ~~Agenda.~~
6. Integração Meta real.
