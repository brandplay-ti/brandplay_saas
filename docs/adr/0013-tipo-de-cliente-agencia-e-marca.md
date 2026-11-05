# ADR-0013: Tipo de cliente — agência e marca

Status: Accepted

## Contexto

O BrandPlay foi feito para quem **vende** patrocínio: agências e detentores de
direitos (clubes, federações, organizadores) cadastram propriedades, captam
patrocinadores, conduzem o funil (oportunidades, propostas, lead scoring),
fecham contratos e executam as entregas.

Passa a haver um segundo cliente, a **marca**, que **compra** patrocínio. Para
ela não existem a captação e o funil de vendas; o resto é igual. O cliente
escolhe o tipo no cadastro e o confere na contratação; depois, o superadmin
pode mudá-lo em `/admin/clientes`.

O plano (`docs/architecture/plano-visao-de-marca.md`) mostrou que o módulo
`crm` da matriz de permissões (0036) cobre muito mais que o funil
(patrocinadores, cotas, portal do patrocinador e parte de contratos,
propriedades e entregas), e que esconder o funil só na tela deixaria vivos o
formulário de lead do media kit, as notificações e as funções de IA do funil.
As decisões D1–D14 foram fechadas com o usuário em 2026-11-03.

## Decisão

1. **Tipo na organização**: `organizations.client_type` (`agencia` |
   `marca`, padrão `agencia`). Não é claim do JWT nem estado de frontend.
   Um gatilho recusa a troca por `UPDATE` direto. Só duas funções mudam o
   tipo: `corrigir_tipo_de_cliente`, para o owner enquanto a organização
   nunca teve assinatura, com auditoria em `team_audit_log`, e
   `admin_alterar_tipo_de_cliente`, para o superadmin, com motivo obrigatório
   e auditoria em `platform_admin_audit_log`.
2. **Módulo novo `vendas` ("Funil e captação")** na matriz de permissões.
   Oportunidades e filhas, propostas e filhas, lead scores, leads,
   `sponsor_proposal_profiles`, funis, SLAs e probabilidades de estágio saem
   do `crm` para o `vendas`. Na migração, cada papel recebe em `vendas` o
   mesmo acesso e escopo que tinha no `crm`, e nada muda para as agências.
   Elas ganham a opção de separar quem vê o funil de quem cuida da carteira.
3. **Teto por tipo no banco** (`modulo_disponivel`): `vendas` não existe para
   a marca, para nenhum papel nem na sessão de suporte. Ele é aplicado em
   `can_access_module` (alcança as policies e as Edge Functions via
   `exigirModulo`), numa policy restritiva `vendas_tipo_de_cliente` em cada
   tabela do funil (alcança leitura por `is_org_member`, exclusão por
   `has_org_role` e o portal do patrocinador) e num gatilho que recusa criar
   oportunidade, proposta ou lead score na marca, inclusive pelas funções
   `SECURITY DEFINER`.
4. **Media kit e lead**: `is_property_published` exige organização com
   `vendas`. Para a marca, o media kit público e o formulário de lead saem do
   ar sem mexer em `is_published` nem em `public_slug`.
5. **Troca não apaga dado.** Agência → marca esconde o funil e o media kit.
   Marca → agência devolve tudo como estava.
6. **Mesmos planos e limites** para os dois tipos (`billing_plans` não muda).
7. **Patrocinador continua sendo a marca** (ou as marcas do grupo). Na tela
   da marca, "Patrocinadores" vira "Marcas". As propriedades são o que a marca
   patrocina, e as cotas continuam registrando a cota comprada.
8. **Relatório de entregas pelo contrato** (0044), para os dois tipos: a
   marca não tem oportunidade e precisa da prestação de contas.

## Alternativas descartadas

- **Só esconder na tela**: o lead do media kit continuaria criando
  oportunidades por gatilho, e as funções de IA do funil continuariam
  respondendo pela API.
- **Desligar o `crm` para a marca**: derrubaria patrocinadores, cotas, o
  portal do patrocinador e a escrita de contratos e propriedades.
- **Recurso por organização à parte** (`org_tem_recurso`), sem mexer na
  matriz: o custo nas policies é o mesmo, mas cria um segundo mecanismo, e
  as Edge Functions precisariam de outra checagem.
- **Gravar `none` na linha `vendas` da marca**: a volta para agência teria de
  inventar valores, e o administrador da marca poderia religar o funil.

## Consequências

- As policies de ~15 tabelas mudam (0043). Elas são cobertas por
  `supabase/tests/tipo_de_cliente.sql` e pelos testes existentes, que passam
  sem mudança de comportamento para as agências; `permissoes.sql` passa a
  contar 25 linhas na matriz, em vez de 20.
- A fase 2 do plano de equipes (ADR-0012) deve usar o módulo `vendas` em
  `no_escopo` nas tabelas do funil.
- O portal aplica o mesmo teto no `can()` de `useOrganization`, porque o
  menu lê a matriz diretamente. A fronteira continua sendo o banco.
- Os rótulos do financeiro na marca passam de "Recebido / Previsto" para
  "Pago / A pagar" (D6). Telas inteiras do ponto de vista de quem compra
  ficam para quando houver pedido de cliente.
