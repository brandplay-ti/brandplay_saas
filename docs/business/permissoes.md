# Ver e editar um módulo

Fonte das regras de tela para quem só **lê** um módulo da matriz de permissões
(`organization_role_grants`, 0036/0043). A fronteira é a RLS
(`can_access_module(..., true)` nas policies de escrita); a tela só evita
oferecer o que a RLS vai recusar.

## Regra

- **Ver** o módulo (`can(module)`: acesso `read` ou `write`) libera o menu, as
  listas e os detalhes.
- **Criar, alterar e excluir** pedem `write` (`canWrite(module)` em
  `useOrganization`), igual ao `_write = true` de `can_access_module`.
- Quem só lê vê os dados, não vê (ou vê desabilitados) os botões de escrita e
  vê o aviso "Somente leitura" (`components/SomenteLeitura.tsx`).
- Quando a policy aceita mais de um módulo (`crm OR operacional`, `crm OR
  financeiro`), basta editar qualquer um. O aviso cita todos.
- Recusa da RLS (`42501`) vira o aviso de permissão
  (`mensagemDeErroDeGravacao` em `lib/permissoes.ts`), nunca o texto do
  Postgres. `UPDATE`/`DELETE` recusados pela RLS não dão erro, só afetam
  0 linhas: onde a tela anuncia sucesso ou apaga um arquivo depois, ela confere
  as linhas devolvidas (`.select("id")`).
- Edge Function cujo resultado só serve gravado exige escrita no
  `exigirModulo`; a que lê e grava só cache (resumo, benchmark) exige leitura.

Na matriz padrão (0043): comercial edita CRM e Funil; operacional edita
Entregas; financeiro edita Financeiro; owner e admin editam tudo. Os demais
cruzamentos são leitura.

## Onde já vale

A BP-29 entra por módulo. Proposta (Funil) veio na BP-2
(`docs/business/propostas.md`).

### Patrocinadores e CRM (`crm`)

| Tela | Escrita exigida |
|---|---|
| Lista de patrocinadores: nova conta, alteração em lote | `crm` |
| Arquivar, restaurar e mesclar contas | owner/admin (RPC), mesmo com CRM só leitura |
| Conta: ciclo, prioridade, saúde, "Editar dados da conta" (também por `?edit=1`) | `crm` |
| Conta: tarefas, interações, marcas, documentos, acesso ao portal | `crm` |
| Conta: "Gerar renovação" | `vendas` (RPC `create_renewal_opportunity`) |
| Preparação de reunião: virar passo em tarefa | `crm` (gerar a preparação é leitura) |
| Painel: concluir próxima ação | `crm` |
| Relatórios de resultado: criar, editar, publicar, posts, indicadores, fotos | `crm` ou `operacional` (0040) |

Edge Functions do módulo:

- `manage-portal-access` (ativar, convidar, revogar acesso ao portal) exige
  escrita no CRM da organização dona do patrocinador, a mesma regra da RLS de
  `sponsor_portal_access`/`sponsor_invites`. Antes, valia ser o criador do
  patrocinador ou ter o papel global `admin` (`has_role`), que não respeita a
  organização: um membro com CRM de escrita que não criou a conta recebia
  `forbidden`, e o criador que perdeu a escrita continuava podendo convidar.
- `ai-assistant` só oferece ao modelo as ferramentas que gravam
  (`create_sponsor_interaction`, `create_opportunity_activity`) a quem escreve
  no módulo delas (`crm`, `vendas`). Consultar segue com leitura.
- `sponsor-executive-summary`, `ticket-benchmark-ai`, `detect-churn-risk` e
  `generate-sellout-report` continuam com leitura: gravam só cache ou o próprio
  relatório gerado, em tabelas do padrão tenant (`is_org_member`).

### Ainda por fazer

Funil (Pipeline, oportunidade, Lead scoring), Contratos e Financeiro, e
Operacional (entregas, campo, projetos, ativos, BrandTrack), cada um no seu PR.
