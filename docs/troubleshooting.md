# Solução de problemas

## Compose exige variáveis

Sintoma: erro sobre `JWT_SECRET` ou `ENCRYPTION_KEY`.

Solução: copie `.env.example` para `.env`, gere valores conforme `docs/configuration.md` e execute novamente. Não use os placeholders.

## Porta ocupada

Verifique qual serviço usa `3000`, `3001` ou `8080`. Prefira encerrar ou reconfigurar explicitamente o serviço conflitante; não altere portas sem atualizar CORS e documentação.

Para o servidor SQLite legado:

```bash
PORT=3010 npm start
```

## API não conecta ao PostgreSQL

1. Execute `docker compose ps` e confirme que `postgres` está healthy.
2. Revise `DATABASE_URL` sem publicar a senha.
3. Consulte `docker compose logs --tail=200 postgres api`.
4. Em banco externo, confirme rede, TLS, usuário, banco e aplicação do schema.

## Tabelas não existem ou migration falha

O arquivo `database/init.sql` roda automaticamente apenas em volume novo. Para banco externo vazio, aplique-o manualmente com `psql`. Em banco persistente, a API aplica `backend/migrations/` e só inicia depois do sucesso. Consulte os logs da API e `schema_migrations`; não reaplique `init.sql`, não marque manualmente uma migration como concluída e não apague o volume para contornar a falha.

## Bootstrap retorna 409

O bootstrap é permitido apenas quando não existe nenhum usuário. Use `/api/auth/login` com a conta criada. Não apague o banco para contornar credenciais perdidas; implemente um procedimento administrativo de recuperação antes da produção.

## Integração Meta retorna erro de chave

`ENCRYPTION_KEY` deve decodificar para exatamente 32 bytes. Gere uma nova chave somente em ambiente sem credenciais cifradas ou execute um plano de rotação/recifragem.

## Interface não mostra contatos da API

Confirme que a interface foi aberta pelo Nginx do Compose em `http://localhost:8080`. GitHub Pages, `python3 -m http.server` e o servidor SQLite usam intencionalmente o modo demo e `localStorage`. No modo API, valide a sessão e a resposta de `/api/contacts` nas ferramentas do navegador.

## Mensagem permanece pendente

Esse é o estado esperado enquanto não existir adaptador de envio. `pending` confirma apenas que a API persistiu a mensagem; não significa que a Meta a recebeu. Não altere o estado manualmente para simular entrega.

## Evento retorna conflito 409

`EVENT_CONFLICT` indica sobreposição com outro compromisso do mesmo responsável. Revise o evento indicado pela resposta. A interface pergunta antes de repetir a escrita com `allowConflict=true`; não automatize esse override.

## Horário do evento parece diferente

A API retorna instantes UTC e preserva o fuso IANA do agendamento. A interface exibe no fuso atual do navegador. Confirme o fuso do sistema e o campo `timezone`; diferença esperada de offset não representa alteração do instante.

## Dados da demonstração ficaram inconsistentes

No console do navegador, execute:

```javascript
resetFluxoData()
```

Isso remove contatos e eventos da demonstração, mas não altera dados PostgreSQL do modo API nem limpa o namespace separado de administração. A função de reset completo ainda não foi implementada.
