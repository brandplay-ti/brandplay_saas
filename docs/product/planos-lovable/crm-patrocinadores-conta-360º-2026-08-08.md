# CRM Patrocinadores → Conta 360º

Evolução incremental do módulo atual (sem CRM paralelo, sem exclusão de dados).

## Situação atual (levantada no projeto)

- `sponsors` (cadastro-mestre: name, segment, logo_path, website, score, tags, last_contact_at, notes) e `sponsor_crm_profiles` (segment, score, tags, last_contact_at, notes) — campos duplicados. A tela `Sponsors.tsx` já lê do perfil CRM; `SponsorDetail.tsx` e funções de IA ainda misturam as fontes.
- Perfis modulares existentes: `sponsor_crm_profiles`, `sponsor_contract_profiles`, `sponsor_delivery_profiles`, `sponsor_finance_profiles`, `sponsor_proposal_profiles`, `sponsor_portal_profiles`, `sponsor_brandtrack_profiles`.
- Relacionamento: `sponsor_contacts`, `sponsor_interactions` (com next_action/next_action_at), `sponsor_portal_access`, `sponsor_invites`, `sponsor_executive_summaries`.
- Vínculo por ID já existe em `opportunities.sponsor_id`, `proposals.sponsor_id`, `contracts.sponsor_id` — porém **nullable** e hoje 20 de 22 oportunidades estão sem patrocinador. `deliveries` e `installments` não têm `sponsor_id` (usam texto `brand`).
- Portal lê hoje tabelas internas via RLS com `has_sponsor_access`.
- Volume atual: 2 patrocinadores, 22 oportunidades, 2 entregas, 2 interações — migração de baixo risco.

## Ordem de execução proposta

### Fase 1 — Integridade e segurança (primeira entrega)
1. **Fonte única**: `sponsors` vira cadastro-mestre. Adicionar colunas: `trade_name`, `lifecycle` (enum), `priority` (A/B/C), `health` (enum), `owner_user_id` (responsável comercial), `domain`, `tax_id`, `archived_at`, `archived_by`, `archive_reason`, `updated_at`. Backfill a partir de `sponsor_crm_profiles` e das colunas antigas priorizando o valor válido mais recente, sem sobrescrever com vazio. `sponsor_crm_profiles` é mantido (não removido) e passa a espelhar/ler de `sponsors`.
2. **`last_contact_at` derivado** de `sponsor_interactions` via trigger; **próxima ação** derivada da tarefa aberta mais próxima (Fase 4) com fallback nas interações.
3. **Marcas**: nova tabela `sponsor_brands` (org, sponsor, nome, categoria, logo, site, ativo, `brandtrack_brand_id` opcional).
4. **Vínculos**: `deliveries.sponsor_id` e `installments.sponsor_id` (nullable), backfill apenas por contrato/oportunidade/proposta comprovados — nunca por nome. Lista administrativa de pendências via view `crm_unlinked_records`.
5. **Portal seguro**: função `get_portal_sponsor_overview()` SECURITY DEFINER com validação de usuário/organização/vínculo, retornando apenas campos liberados; revisão das políticas que hoje expõem tabelas internas ao portal.
6. **Arquivar/mesclar**: funções `archive_sponsor`, `unarchive_sponsor`, `merge_sponsors` (Owner/Admin, transacional, sem exclusão física) + auditoria em `sponsor_audit_logs`.
7. **Auditoria**: `sponsor_audit_logs` (org, ator, entidade, ação, valores antes/depois, origem manual/auto/ia).

### Fase 2 — Nova lista de patrocinadores
KPIs reais no topo, tabela como visão padrão (cards como alternativa persistida), colunas e filtros combináveis, visualizações salvas, ações em massa e exportação. Importação CSV só entra quando o fluxo completo existir (fica fora desta entrega).

### Fase 3 — Página Conta 360º
`/dashboard/patrocinadores/:id` evolui para abas: Resumo, Relacionamento, Contatos (comitê de decisão), Comercial, Contratos e Financeiro (com gate de permissão), Entregas e Resultados, Portal e Configurações. Drawer atual permanece como prévia.

### Fase 4 — Tarefas e próximas ações
`crm_tasks` (org, sponsor, brand, opportunity, título, tipo, responsável, data, prioridade, status, origem, conclusão). Conclusão gera interação e agenda próxima ação. Botão "Transformar em tarefa" nas recomendações de IA.

### Fase 5 — Automações
Alertas idempotentes (dedupe_key já usado em `notifications`): SLA, proposta sem resposta, inatividade 30/45/60, sem próxima ação, renovação 180/120/90/60, parcela vencida, entrega atrasada, duplicidade. Contrato ativado → conta "Cliente ativo" + auditoria. Renovação cria nova oportunidade vinculada, sem alterar a original. SLAs centralizados na configuração já existente (`pipeline_stage_slas` + tabela de parâmetros CRM).

### Fase 6 — Inteligência comercial
Fit por Conta+Marca+Propriedade (0–100) com fatores verificáveis e lacunas explícitas; resumo executivo com data, período, fontes e dados ausentes; ação "Preparar reunião com IA".

## Notas técnicas

- Todas as novas tabelas: `organization_id`, GRANTs, RLS por `is_org_member`/`can_access_module`, índices em `(organization_id, sponsor_id)`, `created_at/updated_at` com trigger.
- Obrigatoriedade (NOT NULL) de `sponsor_id` só após tratamento dos registros existentes — não entra na Fase 1.
- Nenhuma tabela, coluna ou registro é removido nesta implementação.
- Testes: isolamento entre organizações, portal sem acesso interno, permissões financeiras, arquivamento preserva histórico, mesclagem transacional.
- Sem publicação automática.
