# Governança do Fluxo CRM

Este documento define como o Fluxo CRM deve ser evoluído. Ele deve ser lido antes de qualquer análise, planejamento ou alteração no repositório.

## Princípios

1. **Uma fonte de verdade:** PostgreSQL e a API são o caminho oficial do produto. O modo estático é apenas uma demonstração isolada.
2. **Simplicidade com limites claros:** adicionar abstrações somente quando reduzirem risco, duplicação ou acoplamento real.
3. **Segurança por padrão:** segredos nunca entram no repositório, entradas são validadas e permissões são verificadas no servidor.
4. **Mudanças verificáveis:** toda alteração deve possuir critérios de aceite e validação proporcional ao risco.
5. **Documentação faz parte da entrega:** código, configuração, API, operação e limitações devem permanecer sincronizados.
6. **Compatibilidade intencional:** mudanças incompatíveis exigem ADR, plano de migração e registro no changelog.
7. **Sem funcionalidades fictícias:** recursos simulados ou incompletos devem ser identificados como demonstração.

## Fluxo obrigatório de mudança

1. Ler `GOVERNANCE.md` e `AGENTS.md`.
2. Verificar o estado do repositório e preservar alterações não relacionadas.
3. Descrever objetivo, escopo, riscos, plano e critérios de aceite antes de editar.
4. Registrar decisões arquiteturais relevantes em `docs/adr/`.
5. Implementar a menor mudança coerente que conclua o objetivo.
6. Executar testes e verificações proporcionais ao impacto.
7. Atualizar a documentação e o `CHANGELOG.md` na mesma entrega.
8. Informar resultado, validações realizadas, limitações e próximos passos.

## Critérios de aceite gerais

Uma mudança está concluída somente quando:

- o comportamento esperado está implementado;
- erros e estados limites relevantes foram considerados;
- nenhuma credencial foi adicionada ao repositório;
- testes ou verificações foram executados e documentados;
- documentação e exemplos refletem o comportamento real;
- migrations, rollback ou recuperação foram descritos quando aplicável;
- pendências conhecidas estão registradas, sem serem apresentadas como prontas.

## Decisões e exceções

Decisões duradouras devem usar um Architecture Decision Record (ADR) com contexto, decisão, consequências e alternativas. Exceções a esta governança precisam ser explícitas, justificadas e temporárias.

## Responsabilidade por documentação

- Alteração de API: atualizar `docs/api/openapi.yaml`.
- Alteração de configuração: atualizar `.env.example` e `docs/configuration.md`.
- Alteração de arquitetura: criar ou atualizar ADR e `docs/architecture.md`.
- Alteração operacional: atualizar `docs/deployment.md` e `docs/operations-runbook.md`.
- Correção ou funcionalidade relevante: atualizar `CHANGELOG.md`.
