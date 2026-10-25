# ADR-0008: Superadmin da plataforma

Status: Accepted

## Contexto

Com a cobrança (ADR-0007) no ar, alguém precisa operar o BrandPlay como
negócio: ver quem são os clientes, a situação de cada cobrança e o
faturamento; liberar acesso quando um boleto atrasa; estender um teste; mexer
no catálogo de planos. Até aqui tudo isso era SQL no Studio, sem registro de
quem fez o quê.

O projeto de referência `central-check` resolve com um "superusuário"
(coluna `profiles.superusuario`, migrations 0006, 0026, 0027, 0054 e 0058 de
lá). Três pontos dele não servem aqui:

- **A coluna em `profiles`.** No BrandPlay a policy `profiles_own_write`
  deixa cada usuário editar o próprio perfil. Uma coluna de papel ali seria
  autoconcessão.
- **O superusuário criado por migration.** A 0054 de lá cria a conta com
  senha escrita no arquivo e roda também em produção.
- **"Enxerga tudo".** Lá o superusuário passa por todas as policies (para
  impersonar). Aqui o tenant é a organização (ADR-0002) e os dados de domínio
  dos clientes — patrocinadores, contratos, propostas — não são da plataforma.

## Decisão

1. **Papel em tabela própria**, `platform_admins` (migration `0027`), lido
   por `is_platform_admin()`. Escrita só por `service_role` e pelas funções de
   concessão, que `authenticated` não executa. Revogar preenche `revoked_at`;
   a linha fica como histórico.
2. **Concessão operada à mão, fora das migrations**:
   `platform_admin_grant(email, motivo)` / `platform_admin_revoke(...)`, pelo
   psql (`supabase/tools/conceder-superadmin.sql`) ou pelo SQL Editor. A pessoa
   se cadastra normalmente antes; nenhuma senha é escrita no repositório.
   Superadmin com senha conhecida só existe no seed local.
3. **Menor privilégio.** O superadmin lê:
   - a cobrança de todas as organizações (`billing_accounts`,
     `billing_subscriptions`, `billing_invoices`, `billing_access_grants`),
     por policies `*_platform_admin_read` (`0028`);
   - cadastro da organização, contato do owner e **contagens** de uso, só
     pelas funções `admin_*` (`SECURITY DEFINER`, recusam quem não é
     superadmin com `insufficient_privilege`).

   Não ganha leitura de `organizations` direto nem de nenhuma tabela de
   domínio. Impersonação fica fora do escopo.
4. **O Stripe continua a fonte do financeiro.** O superadmin lê a projeção e
   nunca a edita. Apuração (`0028`, a mesma do central-check): realizado =
   faturas `paga` no mês do pagamento (caixa); MRR = preço do catálogo das
   assinaturas `ativa` e `inadimplente`; `trialing` e `incompleta` fora;
   contratação abandonada (cancelada sem nenhuma fatura paga) não conta como
   cliente nem cancelamento. Crescimento e churn saem dos meses fechados.
5. **Ações administrativas** (`0029` e Edge Function `admin-plans`):
   liberação provisória de acesso (origem `superadmin` em
   `billing_access_grants`, 1–720 h), revogação de liberação, extensão do teste
   (1–90 dias) e gestão do catálogo. Liberação, revogação e extensão exigem
   comentário.
6. **Tudo é auditado** em `platform_admin_audit_log`: quem, quando,
   organização, ação, antes, depois e comentário. Registro imutável pela API
   (sem policy de escrita); é dado da plataforma, então fica fora da policy
   restritiva de cobrança (`0026`) e do teste `(m)`.
7. **Catálogo pela `admin-plans`**: JWT → superadmin ativo → valida → grava
   `billing_plans` → sincroniza o Stripe (`ensurePlanPrice`, compartilhado com
   o checkout). Preço novo cria outro preço no Stripe e arquiva o anterior;
   assinaturas em curso ficam no preço antigo. Plano não é apagado, sai de
   venda (e o produto é arquivado). O plano do teste grátis não pode sair de
   venda. Falha do Stripe não desfaz o banco: a resposta avisa, e
   "Sincronizar" ou o próximo checkout refazem.
8. **Área `/admin` no portal**, fora do layout das organizações (o superadmin
   não precisa ser membro de nenhuma). A guarda da rota é experiência; a
   fronteira é o banco. Sem organização, o login leva direto a `/admin`.

## Consequências

- Uma tabela nova com dado **da plataforma** (não de uma organização) que
  carregue `organization_id` entra na lista de exceções do teste `(m)` de
  `supabase/tests/cobranca.sql`, com o motivo.
- `supabase/tests/superadmin.sql` cobre: concessão só por quem opera o banco;
  autoconcessão impossível; revogação imediata; funções recusam
  não-superadmin e `anon`; superadmin lê a cobrança mas não o domínio; owner
  comum continua sem ler a cobrança de outra organização; liberação e
  extensão auditadas; apuração do faturamento; auditoria imutável.
- Pendências fora do escopo: edição de `billing_settings` (duração do teste,
  plano do teste, prazo da liberação) pela tela — continua por SQL
  (`docs/runbooks/cobranca.md`).

## Atualização (0035)

A sessão de suporte cobre o que esta ADR deixava como impersonação fora de
escopo, com prazo. `admin_abrir_sessao_suporte` (1 a 8 horas, comentário
obrigatório) faz `is_org_member(uuid)` e `has_org_role(uuid, text[])` — quando
o papel exigido inclui `admin` — valerem para aquela organização. Não cria
`organization_members`, não concede `owner` e não abre outra organização.
Policies de domínio não ganham `is_platform_admin()`.

Desconto e isenção (100% por até 12 meses) são cupom recorrente no Stripe,
gravados por `admin-discounts`, com auditoria. Detalhe em
`docs/business/cobranca.md` e `docs/runbooks/superadmin.md`.

## Relacionados

ADR-0002 (tenant), ADR-0007 (cobrança), `docs/architecture/plano-superadmin.md`,
`docs/runbooks/superadmin.md`, `docs/business/cobranca.md`.
