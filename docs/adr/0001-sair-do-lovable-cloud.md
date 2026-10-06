# ADR-0001: Sair do Lovable Cloud

Status: Accepted

## Contexto

O BrandPlay nasceu no Lovable Cloud, uma plataforma de geração de aplicações
de baixo código que provisiona automaticamente um projeto Supabase remoto e
um gateway de IA proprietário. Isso trouxe velocidade inicial, mas criou
vários pontos de acoplamento incompatíveis com operar o produto como um SaaS
independente:

- **Gateway de IA proprietário.** Todas as Edge Functions de IA
  (`ai-assistant`, `score-leads`, `generate-proposal-ai`,
  `sponsor-executive-summary`, entre outras) chamavam um gateway do Lovable
  autenticado por `LOVABLE_API_KEY`, em vez de falar diretamente com um
  provedor de LLM. Isso amarra o roadmap de IA do produto à disponibilidade,
  aos preços e aos modelos que o Lovable decide expor.
- **Domínio hackeado.** A aplicação rodava sob um subdomínio `.lovable.app`,
  sem controle real sobre DNS, certificados ou infraestrutura de borda.
- **Schema só existente remotamente.** Não havia `supabase/migrations/`
  versionadas no repositório — o schema só existia no projeto Supabase remoto
  do Lovable Cloud, sem `supabase db pull` possível a partir deste ambiente de
  trabalho. Qualquer alteração de banco feita pela plataforma não ficava
  documentada nem revisável via Pull Request.
- **Sem controle de versão do banco.** Consequência direta do ponto anterior:
  não era possível saber com certeza, a partir do repositório, qual schema
  estava rodando em produção.

Nenhum desses pontos é resolvível permanecendo na plataforma — todos exigem
sair do modelo gerenciado do Lovable Cloud para uma infraestrutura própria.

## Decisão

Migrar o BrandPlay para:

- **Supabase self-hosted**, rodando via Docker (`docker/supabase/`), com o
  schema reconstruído e versionado em `supabase/migrations/` (ver ADR-0004
  para como essa reconstrução foi feita, já que não havia acesso ao remoto
  para `supabase db pull`).
- **VPS própria**, hospedando o Supabase self-hosted e o frontend.
- **Anthropic API direta** para as funcionalidades de IA, no lugar do gateway
  do Lovable (ver ADR-0003).

O compose Docker (`docker/supabase/docker-compose.yml`) e a convenção de um
único arquivo servindo local/homologação/produção (distinguidos só pelo
`.env`) replicam o padrão já validado no projeto de referência
`central-check`, que passou pela mesma migração antes.

## Consequências

Positivas:

- Controle total sobre schema, infraestrutura e custos de IA.
- Nenhuma dependência de disponibilidade do Lovable Cloud.
- Schema versionado e revisável via Pull Request, a partir de agora.
- Domínio e certificados próprios, sem depender de `.lovable.app`.

Negativas:

- A equipe passa a ser responsável por backup, upgrade, monitoramento e
  segurança do Supabase self-hosted — antes delegado à plataforma.
- O schema reconstruído (ADR-0004) foi inferido a partir de
  `src/integrations/supabase/types.ts`, não de um dump real do banco remoto:
  existe risco de divergência que precisa ser validado antes de considerar a
  migração de dados concluída (ver `supabase/migrations/SCHEMA_NOTES.md`).
- ~30 funções de negócio (RPCs) do banco remoto ainda não foram reconstruídas
  neste schema — são um gap conhecido, fora do escopo desta ADR.

## Relacionadas

- ADR-0002 (modelo de tenant)
- ADR-0003 (IA via Anthropic)
- ADR-0004 (schema por inferência)
- `supabase/migrations/SCHEMA_NOTES.md`
- `docker/supabase/README.md`
