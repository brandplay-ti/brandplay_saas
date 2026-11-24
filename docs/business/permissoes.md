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

### Funil e captação (`vendas`)

| Tela | Escrita exigida |
|---|---|
| Pipeline: nova oportunidade, arrastar entre estágios, trocar estágio na lista compacta, marcar perda, excluir | `vendas` |
| Pipeline: trocar responsável da oportunidade e da próxima tarefa | `vendas` |
| Pipeline: "Priorizar meu dia" | sugerir é leitura; "Criar tarefas" pede `vendas` |
| Pipeline: funis e SLAs | owner/admin (policies `*_admin_*`) |
| Pipeline: probabilidades por estágio | do próprio usuário (`user_stage_probabilities_own`) |
| Oportunidade: campos, contatos, atividades, timeline, excluir, avançar jornada, gerar proposta | `vendas` |
| Oportunidade: converter em contrato | `vendas` e (`crm` ou `financeiro`), porque também grava o contrato |
| Oportunidade: "Novo" patrocinador | `crm` |
| Oportunidade: sincronizar estágio com a jornada | só para quem edita; para quem só lê, nada é gravado |
| Próximos passos (IA): virar atividade | `vendas`; virar item de checklist, `operacional` ou `crm` |
| Lead scoring: "Gerar / Atualizar com IA" | `vendas` (a `score-leads` exige escrita) |
| Calendário: concluir e mudar data | o módulo da origem: tarefa `crm`, atividade `vendas`, checklist `operacional` ou `crm` |

Lacuna conhecida, sem mudança de banco nesta tarefa: `opportunity_contacts`
ainda está no padrão tenant da 0005 (`is_org_member`, qualquer membro grava).
A tela já segue `vendas`; levar a policy para o padrão 7 é uma migration à parte.

Edge Functions do módulo: `score-leads`, `generate-proposal-ai` e
`generate-proposal-wizard` exigem escrita; `suggest-next-steps`,
`prepare-meeting-ai` e `estimate-activation-values` só leem.

### Contratos (`crm` ou `financeiro`) e Financeiro (`financeiro`)

| Tela | Escrita exigida |
|---|---|
| Contratos: novo contrato, editar, mudar status, marcar como assinado | `crm` ou `financeiro` (`MODULOS_DO_CONTRATO`) |
| Contrato: anexar e remover arquivo, cláusulas, gerar estrutura, ativos, valor fechado | `crm` ou `financeiro` |
| Contrato: "Salvar como padrão" das cláusulas | owner/admin (`contract_clause_templates_admin_write`) |
| Contrato: excluir | owner/admin (`contracts_admin_delete`) |
| Contrato: gerar PDF, Word, relatório de entregas, baixar, resumo por IA | leitura |
| Proposta e oportunidade: converter em contrato | `vendas` e (`crm` ou `financeiro`) |
| Financeiro: dar baixa e reabrir parcela | `financeiro` |

O status calculado do contrato (ativo, vencendo, encerrado) e a cláusula de
dados cadastrais só são regravados ao abrir a tela por quem edita; quem só lê
vê o valor calculado.

"Oportunidade vinculada", no editar contrato, segue com `can("vendas")`: o
campo lista oportunidades (leitura), e vincular grava só no contrato; a etapa
da oportunidade muda pelo gatilho `tg_contract_sync_opportunity_stage`, que é
`SECURITY DEFINER`.

Excluir contrato e remover arquivo gravam primeiro a linha e só depois apagam
o arquivo: antes, o arquivo saía do storage mesmo quando a RLS recusava a
exclusão (que é de owner/admin), e o contrato ficava sem o PDF.

Lacuna conhecida, sem mudança de banco nesta tarefa: a policy do bucket
`contracts` (`contracts_bucket_org`, 0007) aceita qualquer membro da
organização, inclusive para apagar. A tela já segue a regra do contrato;
restringir o storage é uma migration à parte.

Edge Functions do módulo: `summarize-contract` continua com leitura (grava o
resumo só se a RLS deixar e devolve `saved: false` para quem só lê);
`generate-contract-pdf` e `generate-delivery-report` são exportação.

### Ainda por fazer

Operacional (entregas, campo, projetos, ativos, BrandTrack), no próximo PR.
