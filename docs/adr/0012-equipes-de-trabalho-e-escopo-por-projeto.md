# ADR-0012: Equipes de trabalho e escopo por projeto dentro da organização

Status: Accepted

## Contexto

Organizações maiores (clubes com várias modalidades, agências que cuidam de
mais de uma propriedade) querem separar quem trabalha em quais projetos: a
equipe comercial de um evento não deve ver os negócios de outro. Hoje todo
membro ativo vê o que o papel libera na matriz de 0036
(`organization_role_grants`), e o único recorte é por módulo (CRM,
operacional, financeiro), não por projeto.

A ADR-0002 fixou a organização como tenant e a "organização ativa" como
estado de frontend. O pedido é um recorte **dentro** do tenant. As opções,
os padrões de mercado (HubSpot, Pipedrive, Salesforce, GitHub, IAM de nuvem)
e as decisões D1–D12 estão em `docs/architecture/plano-equipes.md`, fechadas
com o usuário em 2026-11-01.

## Decisão

1. **A organização continua sendo o tenant.** Equipe de trabalho é
   sub-escopo dentro dela, e nada atravessa organizações. Equipe, membro da
   equipe e projeto vinculado são da mesma organização por chave
   estrangeira composta `(organization_id, id)`; o `organization_id` das
   tabelas de vínculo vem da equipe, por gatilho, e o valor do cliente é
   descartado.
2. **Projeto é a propriedade (`sports_properties`)**, com subprojetos por
   `parent_property_id`. Não há entidade "projeto" nova (D1).
3. **A equipe recebe projetos e o membro herda.** `work_teams`,
   `work_team_members` e `work_team_properties`, com relação N:N entre
   equipe e projeto (D3). O vínculo tem acesso de leitura ou edição e pode
   incluir os subprojetos. Quem está em várias equipes vê a união: nenhum
   vínculo nega acesso dado por outro.
4. **O administrador monta a estrutura (D12).** Dono e administrador veem
   todas as propriedades, criam propriedades, subprojetos e equipes, e
   vinculam membros e projetos às equipes. Membro em escopo equipe não cria
   propriedade nem muda `parent_property_id`. O líder de equipe só adiciona
   e remove, na própria equipe, quem já é membro da organização (D9).
5. **Escopo por papel e módulo, opt-in.** `organization_role_grants` ganha
   `scope` (`organizacao` | `equipe`), com padrão `organizacao`, que é o
   comportamento de hoje. Dono e administrador ficam travados em
   `organizacao`. "Meus registros" fica para depois (D6).
6. **A regra vive na RLS.** Funções `SECURITY DEFINER` estáveis
   (`projetos_visiveis`, `no_escopo`) entram nas policies do padrão 7 junto
   com `can_access_module`, como `billing_blocked_orgs` já faz. Tabelas
   filhas seguem o pai por subconsulta. Sem serviço externo de autorização.
7. **Patrocinador** é visível quando está na carteira de uma equipe do
   usuário (`work_team_sponsors`, N:N) ou quando tem negócio num projeto
   visível (D5, D7). Continua havendo um cadastro por organização.
8. **Usuário que já tem conta entra só por convite aceito** (fase 0,
   `0041`): nunca há busca na base da plataforma, e a resposta é igual com
   ou sem conta.

## Consequências

- Organização que não mexe no escopo não percebe mudança: `seguranca.sql`,
  `cobranca.sql` e `relatorios.sql` precisam continuar passando sem
  alteração.
- Na fase 2 mudam as policies de ~30 tabelas e de `sports_properties`. Um
  erro vaza ou esconde dado; por isso a fase entra com
  `supabase/tests/equipes.sql` e homologação com uma organização real em
  escopo equipe.
- A RLS não cobre `service_role` nem RPC `SECURITY DEFINER`: Edge Functions
  de domínio, RPCs que recebem id, agregados, storage de contratos e
  notificações aplicam o escopo à mão (plano, seção 7.6). Escopo nos
  negócios e no patrocinador vão juntos para produção (fases 2 e 3).
- A visibilidade da propriedade é a união entre módulos: um papel com algum
  módulo em escopo organização continua vendo todas as propriedades. Isolar
  um papel exige pôr todos os módulos dele em "Minhas equipes".
- Papel em escopo equipe sem equipe nenhuma não vê nada; a tela avisa o
  administrador antes de salvar.
- Quando a fase 2 for publicada, `CLAUDE.md` (seção 6) e
  `.claude/rules/supabase.md` ganham o padrão de escopo por equipe.
- Equipes são recurso de plano pago (D10, `max_teams`); quais planos e
  quantas equipes ficam em `docs/business/cobranca.md` na fase 4.

## Alternativas descartadas

- **Uma organização por equipe**: perde a visão consolidada e duplica
  patrocinador e cobrança.
- **Coluna `team_id` em cada registro** (estilo HubSpot): `team_id` em ~40
  tabelas e reatribuição de registros quando alguém muda de equipe, num
  produto em que o trabalho já é organizado por propriedade.
- **Serviço externo de autorização (OpenFGA, SpiceDB)**: tira a decisão da
  RLS, que é a fronteira de segurança do projeto, e cria mais um serviço
  para operar.
- **"Equipe ativa" escolhida na tela**, como a organização ativa: o escopo
  é calculado no banco; escolher na tela seria autorizar no frontend.
