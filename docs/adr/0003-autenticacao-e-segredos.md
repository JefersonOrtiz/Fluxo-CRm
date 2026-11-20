# ADR-0003: Autenticação e segredos

- Status: aceito como direção; implementação parcial
- Data: 2026-11-11

## Contexto

A API possui token assinado, senhas com `scrypt` e criptografia AES-256-GCM para credenciais da Meta. Ainda faltam hardening, rota de renovação/revogação, proteção contra abuso e integração com o frontend.

## Decisão

- Senhas devem permanecer derivadas com algoritmo resistente e salt individual.
- Tokens devem ter expiração, validação estrita e estratégia documentada de revogação antes da produção.
- Segredos de integração devem ser cifrados no servidor com chave externa ao banco e ao repositório.
- Autorização deve ser aplicada no servidor, por organização e permissão.
- Produção deve usar HTTPS, CORS restritivo, rate limiting e armazenamento seguro de sessão.

## Consequências

O mecanismo atual é uma fundação e não deve ser considerado pronto para produção até que os itens de hardening e seus testes sejam concluídos.
