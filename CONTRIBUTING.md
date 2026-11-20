# Como contribuir

## Antes de começar

1. Leia `GOVERNANCE.md` e os ADRs relacionados.
2. Confirme o estado do repositório e não sobrescreva mudanças alheias.
3. Descreva objetivo, escopo, riscos, plano e critérios de aceite.

## Desenvolvimento

- Use Node.js 24 e Docker Compose para reproduzir o ambiente oficial.
- Crie mudanças pequenas, coesas e reversíveis.
- Não adicione dependências sem justificar necessidade, manutenção e impacto de segurança.
- Não versione credenciais ou dados pessoais reais.
- Preserve o isolamento por `organization_id` em todas as consultas multi-tenant.
- Trate erros no limite correto e não exponha detalhes internos ao cliente.

## Documentação e testes

- Mudanças de API exigem atualização do OpenAPI.
- Mudanças de banco exigem migration, estratégia de rollback/recuperação e atualização do modelo de dados.
- Mudanças operacionais exigem atualização do runbook.
- Correções devem possuir teste de regressão quando a infraestrutura de testes existir; até lá, registre a verificação manual reproduzível.

## Commits e revisão

Use mensagens imperativas e específicas. Uma revisão deve verificar comportamento, segurança, isolamento organizacional, falhas, testes, migração e documentação.

## Definição de pronto

Uma entrega só está pronta quando atende aos critérios de `GOVERNANCE.md`, não deixa comportamento parcialmente documentado e informa limitações conhecidas.
