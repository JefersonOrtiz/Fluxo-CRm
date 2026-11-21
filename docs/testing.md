# Testes e verificações

## Estado atual

O repositório possui testes automatizados do cliente HTTP, testes unitários e de endpoint da API, validação de migrations contra PostgreSQL descartável e um teste de integração de organização, contatos, funil, conversas, mensagens e agenda contra PostgreSQL real. Ainda não possui testes de navegador nem lint dedicado.

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

## CI no GitHub Actions

O workflow `.github/workflows/ci.yml` executa em push e em Pull Requests direcionados à branch `migracao-postgresql`. Ele usa Node.js 24, instala as dependências com `npm ci` e cria somente um PostgreSQL 16 temporário do runner.

O banco de CI é limitado a `127.0.0.1:55432/jfcrm_migrations_etapa21`. A suíte rejeita hosts, portas e bancos diferentes, incluindo Railway, staging e produção. O teste de migrations recria o schema desse banco descartável e valida a sequência completa de `0000` até `0010`.

O workflow mantém `AI_PROVIDER=mock` e `OPENAI_ENABLED=false`. Não define credenciais de OpenAI, Anthropic ou Meta e não realiza chamadas a provedores externos.

Para verificar o resultado, abra o repositório no GitHub, selecione a aba **Actions**, abra a execução **CI** referente ao commit ou Pull Request e consulte o job **Validate application and migrations**. Uma etapa com falha encerra o job com status de falha. Para tornar esse status obrigatório antes do merge, configure a proteção da branch `migracao-postgresql` para exigir o check `Validate application and migrations`.

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

O pipeline falha em instalação não reproduzível, verificações de sintaxe, testes ou migrations. A validação de OpenAPI, detecção de segredos e smoke tests adicionais continuam como próximas etapas do CI.
