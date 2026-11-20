# ADR-0001: Runtime canônico do produto

- Status: aceito
- Data: 2026-11-11

## Contexto

O repositório possuía três caminhos apresentados sem hierarquia clara: site estático com `localStorage`, servidor Node.js com SQLite e stack Nginx/API/PostgreSQL.

## Decisão

O runtime oficial do produto será frontend servido pelo Nginx, API Node.js e PostgreSQL. Docker Compose é o ambiente local de referência.

O GitHub Pages será mantido como demonstração sem dados compartilhados. O servidor SQLite fica temporariamente em manutenção de compatibilidade, sem novas funcionalidades, até a integração frontend–API e a retirada planejada.

## Consequências

- Novas regras de negócio e persistência devem ser implementadas na API PostgreSQL.
- Recursos demonstrativos devem ser identificados visualmente e na documentação.
- Deploys de produção não devem usar GitHub Pages nem SQLite.
- O servidor SQLite pode receber correções de segurança e compatibilidade, mas não expansão funcional.

## Alternativas consideradas

- Manter SQLite como produção: rejeitado por concorrência, escalabilidade e separação insuficiente entre organizações.
- Manter os três modos equivalentes: rejeitado pelo custo de manutenção e risco de divergência.
