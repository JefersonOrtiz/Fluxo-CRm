# ADR-0005: Tempo e conflitos da agenda

- Status: aceito
- Data: 2026-11-11

## Contexto

A demonstração representava eventos apenas como data e hora locais. Em um sistema multiusuário isso é ambíguo em fusos diferentes e durante transições de horário de verão. Também não havia regra para dois compromissos simultâneos do mesmo responsável.

## Decisão

- A API receberá instantes ISO 8601, armazenados em PostgreSQL como `TIMESTAMPTZ`.
- O fuso IANA informado pelo cliente será preservado em `timezone` como contexto do agendamento.
- A interface converterá data e hora escolhidas no fuso do navegador para UTC antes do envio.
- Um evento conflita quando seu intervalo semiaberto `[startAt, endAt)` se sobrepõe a outro evento do mesmo responsável.
- A API responderá `409 EVENT_CONFLICT`; sobreposição intencional exige `allowConflict=true` em cada escrita.
- Consultas de agenda exigirão intervalo e serão limitadas a 366 dias.

## Consequências

- Eventos consecutivos, em que um termina exatamente quando outro começa, não conflitam.
- O fuso preservado não altera o instante; ele permite explicar e futuramente reeditar o horário original.
- Recorrência, lembretes e calendários externos exigem decisões posteriores.
- Clientes devem tratar conflito explicitamente; retries não devem habilitar `allowConflict` automaticamente.

## Alternativas consideradas

- Salvar texto local sem fuso: rejeitado por ambiguidade.
- Salvar somente UTC: rejeitado por perder o contexto original do agendamento.
- Permitir toda sobreposição: rejeitado por produzir conflitos silenciosos.
