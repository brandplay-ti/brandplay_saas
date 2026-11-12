# Runbook — Superadmin da plataforma

Decisão: ADR-0008. Regras de cobrança: `docs/business/cobranca.md`.

O superadmin opera o BrandPlay pela área `/admin` do portal: clientes,
cobrança, faturamento, catálogo de planos, IA e a equipe. Ele **não** vê dados
de domínio dos clientes (patrocinadores, contratos, propostas) sem sessão de
suporte e não precisa ser membro de nenhuma organização.

O **Suporte** (0046) é o segundo papel da equipe: lista os clientes, abre a
ficha, dá baixa em fatura, lança desconto e entra no painel do cliente. Não vê
visão geral, faturamento, planos, IA nem a equipe; não libera acesso, não
estende teste e não troca o tipo de cliente. É cadastrado pelo superadmin na
tela **Equipe** (seção abaixo), não por SQL.

## Conceder

A pessoa cria a conta normalmente pelo portal (`/auth` → Criar conta) e
confirma o e-mail. Depois, quem opera o banco do ambiente concede:

- **Local:**

  ```bash
  npm run supabase:superadmin -- -v email=pessoa@empresa.com -v comentario="Equipe de operação"
  ```

- **Homologação e produção — SQL Editor do Studio** (Caminho A de
  `docs/runbooks/primeira-carga.md`). Confira pela URL que é o ambiente certo:

  ```sql
  select public.platform_admin_grant('pessoa@empresa.com', 'Equipe de operação — pedido de <quem>');
  ```

- **Homologação e produção — psql na VPS** (Caminho B do mesmo runbook): na
  pasta do clone, com o arquivo do ambiente carregado (seção "Execução" de
  lá):

  ```bash
  docker run --rm --network "$SUPABASE_NETWORK" -v "$PWD/supabase:/supabase:ro" postgres:17-alpine \
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /supabase/tools/conceder-superadmin.sql \
    -v email=pessoa@empresa.com -v comentario="Equipe de operação"
  ```

O motivo é obrigatório e fica em `platform_admin_audit_log`. Sem conta com o
e-mail, a função recusa ("a pessoa precisa se cadastrar antes"). Conceder de
novo para quem foi revogado reativa.

Na próxima vez que entrar, a pessoa vê o item **Plataforma → Administração**
no menu. Sem organização, o login leva direto a `/admin`. Se o cadastro criou
uma organização pessoal que ela não usa, pode ficar — não interfere.

## Revogar

```bash
npm run supabase:superadmin:revogar -- -v email=pessoa@empresa.com -v comentario="Saiu da equipe"
```

ou, no SQL Editor:

```sql
select public.platform_admin_revoke('pessoa@empresa.com', 'Saiu da equipe');
```

Vale na hora no banco: a sessão aberta perde o acesso na próxima consulta. A
linha de `platform_admins` fica com `revoked_at` (histórico).

## Suporte (pela tela Equipe)

Em `/admin/equipe` o superadmin:

- **Cadastra suporte**: nome, e-mail, senha temporária e motivo. Sem conta
  com o e-mail, a conta é criada (confirmada, sem organização pessoal) com a
  senha temporária — passe-a à pessoa por um canal seguro. Com conta, ela só
  ganha o perfil e mantém a senha dela.
- **Revoga**: o acesso cai na próxima consulta e a sessão de suporte aberta é
  encerrada.
- **Reativa** quem já foi suporte.

Tudo exige motivo e vai para a auditoria (`suporte_concedido`,
`suporte_revogado`). A tela nunca concede, rebaixa nem revoga superadmin.
Promover um suporte a superadmin é a concessão manual acima
(`platform_admin_grant`).

No seed local: `suporte@brandplay.local` / `brandplay-dev`.

## Quem é superadmin

```sql
select u.email, pa.role, pa.comment, pa.created_at, pa.revoked_at
  from public.platform_admins pa
  join auth.users u on u.id = pa.user_id
 order by pa.created_at;
```

## O que a área `/admin` faz

| Tela | O quê | Por onde |
|---|---|---|
| Visão geral | MRR, recebido no mês, organizações por situação, testes que acabam em 3 dias, boletos aguardando, atrasos | `admin_clientes()`, `admin_faturamento_*` |
| Clientes | Lista com situação (assinante, teste, provisória, sem acesso), plano, uso e MRR | `admin_clientes()` |
| Cliente | Cadastro, owner, cobrança, uso, assinaturas, faturas, liberações e histórico; **liberar acesso**, **revogar liberação**, **estender teste**, **desconto ou isenção**, **dar baixa em fatura**, **ver como admin** | `admin_cliente_detalhe()`, `admin_liberar_acesso()`, `admin_revogar_liberacao()`, `admin_estender_teste()`, Edge Functions `admin-discounts` e `admin-invoices`, `admin_abrir_sessao_suporte()` |
| Planos | Catálogo completo; criar, editar, tirar de venda, sincronizar com o Stripe | Edge Function `admin-plans` |
| Faturamento | Realizado (caixa, mês a mês) e projetado (MRR, crescimento, churn) | `admin_faturamento_realizado()`, `admin_faturamento_projetado()` |
| Equipe | Superadmin e suporte; cadastrar, revogar e reativar suporte | `admin_equipe()`, `admin_equipe_*`, Edge Function `admin-team` |

O Suporte vê só **Clientes** e a ficha do cliente, com desconto, baixa e "ver
como admin". As outras telas e ações voltam para a lista de clientes e as
funções do banco recusam.

## Baixa manual de fatura

Para quando o cliente pagou fora do Stripe (transferência, depósito, Pix
direto). Na ficha, a fatura **em aberto** tem **Dar baixa** (superadmin ou
suporte, com motivo). A fatura é quitada **no Stripe** (`paid_out_of_band`,
metadata `paid_with = manual` e `settled_by`), a assinatura volta a ficar em
dia pelo próprio Stripe e a projeção é regravada. Não há desfazer pela tela:
um estorno é feito no Stripe. Sem `STRIPE_SECRET_KEY` no ambiente a baixa é
recusada.

Liberar acesso, revogar e estender exigem motivo. Os limites são do banco:
liberação de 1 a 720 h (padrão = `billing_settings.provisional_access_hours`),
extensão de 1 a 90 dias, somados ao fim atual do teste ou a agora, o que for
mais tarde. Desconto de 1 a 100% por 1 a 12 meses. 100% isenta a cobrança e
mantém o acesso no prazo (o aviso de teste some). Abaixo de 100%, o cupom só
entra na cobrança. Sessão de suporte de 1 a 8 horas.

## Ver como admin

Na ficha do cliente, **Ver como admin** abre o painel daquela organização com
papel de admin, pelo prazo informado. Uma faixa no painel mostra até quando e
encerra a sessão. Abrir outra sessão encerra a anterior.

A sessão não cria membership. Cobrança no Stripe e convites de equipe
continuam exigindo um membro real. Sem sessão aberta, o dado de domínio segue
inacessível ao superadmin.

## Planos pela tela

- **Preço novo**: o Stripe ganha outro preço e o anterior é arquivado.
  Assinaturas em curso continuam no preço antigo — migrar quem já assina é
  decisão comercial, feita no Stripe, assinatura a assinatura.
- **Limite**: vale na hora. Quem já passou do novo limite mantém o que tem, mas
  não cresce.
- **Fora de venda**: some do catálogo e o produto é arquivado no Stripe; quem
  assina continua. O plano do teste grátis (`billing_settings.trial_plan_id`)
  não sai de venda — troque o plano do teste antes, por SQL.
- **"Stripe não foi atualizado"**: o banco já foi gravado. Use
  **Sincronizar** na linha do plano; o próximo checkout também corrige o preço.
- Sem `STRIPE_SECRET_KEY` no ambiente, o plano é salvo só no banco.

## Auditoria

```sql
select l.created_at, u.email as superadmin, l.action, l.organization_id, l.target_type, l.target_id, l.comment
  from public.platform_admin_audit_log l
  left join auth.users u on u.id = l.admin_user_id
 order by l.created_at desc
 limit 50;
```

`admin_user_id` nulo = ato operado à mão (concessão/revogação). `before` e
`after` guardam o estado antes e depois. O log não tem policy de escrita: nem
o superadmin altera pela API.
