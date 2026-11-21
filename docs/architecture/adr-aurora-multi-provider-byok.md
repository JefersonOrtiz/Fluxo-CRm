# ADR: Aurora multi-provedor com BYOK por tenant

- Status: aceito como direção; implementação pendente
- Data: 2026-11-21

## Contexto

A Aurora já possui Prompt Mestre, tom, Base de Conhecimento, permissões e controle de consumo por organização. A seleção do provedor, a chave e o modelo, porém, ainda dependem de variáveis de ambiente da API. Isso impede que cada tenant administre sua própria integração, exige novo deploy para trocar configuração e não suporta Claude.

O produto oficial é a API Node.js com PostgreSQL. O modo demonstrativo permanece isolado e não pode armazenar nem utilizar credenciais reais. A API já possui chave externa de cifragem, autorização por organização e quotas por tenant, que devem ser reutilizadas sem expor segredos.

## Decisão

### Escopo e provedores

- A Aurora terá configuração multi-tenant e multi-provedor, com suporte inicial a `openai` e `anthropic` (Claude).
- Cada organização poderá manter credenciais distintas por provedor e selecionar somente um provedor/modelo ativo por vez.
- A IA terá um nome por organização. O valor padrão é `Aurora`; quando não houver personalização, a identidade visual e os textos padrão do JF System CRM permanecem inalterados.
- O nome será validado após normalização e remoção de espaços externos: terá de 1 a 80 caracteres e não poderá conter caracteres de controle. Será apresentado na interface e enviado ao provider como identidade contextual. Ele não será anexado automaticamente como assinatura a todas as respostas.

### Precedência e compatibilidade

A configuração Aurora de cada tenant terá um modo explícito:

1. `disabled`: não há chamada a provider, inclusive se existir configuração global no ambiente.
2. `tenant`: usa exclusivamente a credencial cifrada, o provider e o modelo selecionados pela própria organização.
3. `environment`: usado apenas quando o tenant não tiver configurado modo próprio; preserva temporariamente o comportamento legado baseado em variáveis de ambiente.

Uma configuração de tenant ausente, sem chave, inválida ou revogada nunca fará fallback silencioso para credencial global. Nesse caso, a API responderá que a Aurora não está configurada para aquele tenant. O fallback de ambiente só é permitido para tenants ainda não migrados para uma decisão explícita.

O modo demonstrativo continua isolado: mantém o mock e os dados locais, sem ler, gravar ou enviar credenciais de tenant.

### Armazenamento e ciclo de vida das credenciais

- Credenciais BYOK serão guardadas somente no PostgreSQL, em envelope AES-256-GCM cifrado no servidor com a chave externa `ENCRYPTION_KEY`.
- O AAD da cifra vinculará, no mínimo, versão do envelope, `organization_id` e provider. Um ciphertext trocado entre organizações ou provedores deverá falhar na autenticação.
- A chave em texto puro existirá somente durante a requisição autenticada que a cadastra, substitui ou usa para chamar o provider. Ela não será serializada em resposta, log, auditoria, exceção, JavaScript, cache ou métrica.
- A API retornará apenas metadados não sensíveis, como provider, modelo, status, `keyConfigured` e datas de alteração. Não haverá endpoint de leitura de chave.
- Substituição será atômica: a nova credencial cifrada só substituirá a anterior após validação local de formato. Remoção apagará o ciphertext e deixará o tenant explicitamente desativado ou não configurado; não reativará fallback legado de forma implícita.
- Ao excluir uma organização, credenciais e auditoria associadas serão removidas por chave estrangeira com `ON DELETE CASCADE`, respeitando a política de exclusão da organização. Não haverá retenção de chaves removidas em backups aplicacionais; retenção de backups seguirá a política operacional do ambiente, com acesso restrito e prazo documentado.

### Autorização, isolamento e auditoria

- Somente sessões autenticadas da própria organização com `ai:configuration` ou `*` poderão cadastrar, substituir, remover, ativar/desativar credenciais, escolher provider/modelo, editar o nome e executar teste de conexão.
- `ai:suggestions` autoriza uso da Aurora, mas não administração de credenciais.
- Sessões temporárias de plataforma em modo somente leitura não poderão alterar configuração Aurora, independentemente do frontend.
- Toda leitura ou escrita de configuração e credencial deverá filtrar por `organization_id` derivado da sessão no servidor. Identificadores enviados pelo cliente não poderão escolher outra organização.
- Uma auditoria por tenant registrará ator, organização, ação, provider, modelo, estado e momento. Ela registrará apenas o fato de a chave ter sido adicionada, substituída ou removida; nunca segredo, ciphertext completo, request body ou conteúdo de prompt.

### Modelo, tarifação, quotas e teste de conexão

- A seleção de modelo será limitada a modelos aprovados que possuam tarifa ativa para o provider e moeda aplicáveis. Modelo livre sem tarifa não poderá ativar a Aurora paga.
- `ai_model_rates`, `ai_quotas` e `ai_usage` continuarão sendo a fonte de verdade para reserva, contabilização, idempotência e reconciliação. As constraints de provider serão ampliadas para incluir `anthropic`.
- O teste de conexão será um endpoint separado, protegido por `ai:configuration`, com confirmação explícita de que pode gerar custo. Sem a confirmação, nenhuma chamada externa ocorrerá.
- Um teste confirmado usará o mesmo fluxo de reserva, limite, tarifa e auditoria das sugestões normais. Falha antes do provider libera a reserva; resultado ambíguo, timeout ou erro de provider permanece sujeito à reconciliação atual.
- Erros devolvidos ao cliente serão categorizados sem incluir resposta bruta do provider, cabeçalhos ou credenciais.

### Separação entre BYOK e IA fornecida pela plataforma

- `tenant` identifica BYOK: o custo e a credencial pertencem à organização, mas o controle de quotas do CRM continua aplicado.
- Uma futura IA fornecida pela plataforma será um modo distinto, com política de faturamento, limites, credencial e autorização próprios. Ela não reutilizará nem sobrescreverá uma credencial BYOK.
- A introdução desse modo exigirá decisão arquitetural adicional.

### Migration 0010

A migration PostgreSQL `0010` será aditiva e transacional. Ela deverá:

- acrescentar a `aurora_settings` o nome da IA e o modo/fonte de configuração;
- criar tabela de credenciais Aurora por `(organization_id, provider)` com ciphertext, modelo, estado, usuário e timestamps;
- criar tabela de auditoria de configuração Aurora por tenant;
- ampliar de forma compatível as constraints de provider em tarifas e uso para `anthropic`;
- criar índices compostos necessários para consulta por organização/provider;
- preservar todas as configurações Aurora e dados de consumo existentes.

Não haverá migration destrutiva, recriptografia automática nem migração de segredos globais para tenants. Antes da aplicação em ambiente persistente, será necessário backup válido e validação em PostgreSQL descartável. O rollback operacional será de aplicação: manter o código novo compatível com as colunas aditivas, restaurar a versão anterior somente se ela tolerar o schema expandido e, se necessário, desativar a Aurora por tenant. A remoção de tabelas ou colunas não fará parte de rollback automático.

## Critérios de aceite e testes de segurança

- Uma organização não consegue ler, modificar, remover ou utilizar a credencial, o nome, o modelo, a quota ou a auditoria de outra organização.
- Cifra e decifra exigem o AAD correspondente; ciphertext copiado para outro tenant ou provider é rejeitado.
- Nenhuma resposta, log, exceção, teste, auditoria ou bundle frontend contém chave em texto puro.
- Usuários sem `ai:configuration`, e sessões administrativas somente leitura, recebem `403` em todas as escritas de configuração.
- A precedência `disabled`, `tenant` e `environment` é coberta, incluindo ausência de fallback silencioso para configuração tenant inválida ou removida.
- OpenAI e Anthropic são testados com `fetch` simulado; a suíte automatizada não chama provedores externos nem usa chaves reais.
- Teste de conexão sem confirmação não chama provider; com confirmação, respeita tarifa, quota, idempotência, limite e auditoria.
- Nome padrão, nome personalizado, validação, isolamento e exibição na interface são testados. O nome personalizado também integra as instruções contextuais enviadas aos provedores.
- A migration `0010` é validada somente contra banco descartável, incluindo schema novo, schema migrado e preservação dos dados anteriores.
- OpenAPI, exemplos de ambiente, documentação de segurança, configuração, operação, status do produto e changelog refletem o comportamento real.

## Consequências

Esta decisão torna a configuração de IA efetivamente multi-tenant e elimina a necessidade de cadastrar chaves BYOK no Railway. Ela aumenta a superfície de segurança: a implementação deverá adicionar decifragem autenticada, seleção de provider por requisição, auditoria específica e testes de isolamento antes de ser considerada pronta para produção.

OpenAI e Anthropic não são declarados funcionais por esta decisão. Eles só serão considerados integrados após implementação, testes com clientes simulados, validação em ambiente descartável e confirmação explícita de configuração por tenant.
