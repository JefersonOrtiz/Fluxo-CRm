# Testes e verificações

## Estado atual

O repositório possui testes automatizados do cliente HTTP e um teste de integração de organização, contatos, funil, conversas, mensagens e agenda contra PostgreSQL real. Ainda não possui testes de navegador, lint ou pipeline de CI.

```bash
npm test
npm run check
```

Os testes atuais cobrem login bem-sucedido, limpeza da sessão em 401, indisponibilidade de rede e resposta JSON inválida.

O teste multi-tenant exige banco descartável e uma confirmação explícita. Com o Compose ativo:

```bash
docker compose exec -T \
  -e INTEGRATION_TEST_ALLOWED=true \
  -e API_BASE_URL=http://127.0.0.1:3001/api \
  api npm run test:integration
```

Ele cria organizações com identificadores aleatórios, testa isolamento, permissões, referências cruzadas, contatos, cursores, idempotência, atribuição, agenda UTC/fuso, sobreposições e conflitos de versão, e remove as organizações no encerramento. Nunca habilite a flag contra uma base que não seja destinada a testes.

Para validar uma migration contra schema anterior, use somente uma base descartável: remova nela as alterações correspondentes, apague apenas o registro da migration testada e reinicie a API. Confirme o schema resultante e descarte o volume. Nunca execute esse procedimento destrutivo em uma base compartilhada.

## Smoke tests mínimos

### Configuração do Compose

```bash
docker compose config --quiet
```

### Servidor SQLite legado

```bash
npm start
curl --fail http://localhost:3000/
curl --fail http://localhost:3000/api/health
```

### Stack PostgreSQL

```bash
docker compose up --build
curl --fail http://localhost:3001/api/health
curl --fail http://localhost:8080/
```

Depois do bootstrap, valide login, `/api/auth/me` e ao menos uma rota protegida.

## Cobertura a implantar

1. Testes unitários de backend para configuração, senha, token, permissões e validação.
2. Testes de integração com PostgreSQL descartável.
3. Testes de isolamento entre duas organizações.
4. Testes de contrato alinhados ao OpenAPI.
5. Testes de interface para login e principais jornadas.
6. Testes de webhook, assinatura, idempotência e retries antes da integração Meta real.

## Critério para CI

O pipeline deverá falhar em instalação não reproduzível, lint, testes, migrations, divergência do OpenAPI, segredo detectado ou smoke test malsucedido.
