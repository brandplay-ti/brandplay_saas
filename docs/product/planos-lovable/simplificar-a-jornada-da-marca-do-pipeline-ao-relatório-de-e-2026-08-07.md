# Simplificar a jornada da marca: do pipeline ao relatório de entrega

## Contexto
Hoje a jornada é dividida em telas isoladas (Pipeline → Propostas → Contratos → Entregas → BrandTrack → Relatórios). Cada passagem de etapa exige recriação manual de dados (marca, valor, ativos, datas) e navegação entre módulos. Isso gera retrabalho, inconsistência e oportunidades paradas.

## Objetivo
Transformar o processo em uma **jornada contínua e automática**, onde o usuário avança de uma etapa para outra com os dados já copiados e as próximas ações sugeridas, sem perder contexto.

## Mudanças propostas

### 1. Propagação automática de dados entre etapas
Criar conversões que carreguem itens, datas e vínculos do registro anterior, eliminando digitação repetida.

- **Oportunidade → Proposta**: ao converter, copiar o `tier` da oportunidade como `proposal_items` (nome, quantidade, valor unitário). Caso não exista tier, sugerir itens padrão da propriedade.
- **Proposta → Contrato**: ao aceitar uma proposta, copiar `proposal_items` como `contract_assets` e vincular `converted_opportunity_id` / `converted_proposal_id`.
- **Contrato → Entregas**: quando o contrato mudar para `ativo`, gerar automaticamente `deliveries` a partir dos `contract_assets`, com `due_date` proporcional entre `start_date` e `end_date` e vínculo `opportunity_id` / `contract_id`.

### 2. Botão principal "Avançar jornada" no drawer
No drawer da oportunidade (e depois no contrato), mostrar um botão único de próximo passo que cria o registro seguinte já preenchido:

- Prospect/Reunião/Proposta/Negociação → "Gerar proposta".
- Proposta gerada → "Ver proposta".
- Proposta aceita → "Gerar contrato".
- Contrato ativo → "Ver entregas".
- Entregas aprovadas → "Gerar relatório de entrega".

O usuário nunca precisa navegar pelo menu para continuar o processo.

### 3. Reduzir atrito dos campos obrigatórios
Atualmente a conversão exige sponsor, propriedade, valor, responsável, itens/ativos e data prevista. Isso bloqueia o usuário cedo demais.

- Tornar obrigatório apenas **marca + valor** para criar a oportunidade.
- Converter os demais campos em alertas inteligentes ("Complete para avançar mais rápido") em vez de bloqueios rígidos, exceto na hora de gerar contrato/relatório final.
- Pre-encher responsável com o usuário logado e data prevista com base no SLA do funil.

### 4. Jornada visual unificada
Adicionar uma aba **"Jornada"** no drawer da oportunidade mostrando o status de cada etapa em uma linha do tempo:

- Oportunidade (estágio atual)
- Proposta (status / número)
- Contrato (status / valor)
- Entregas (quantas concluídas / total)
- Relatório de entrega (gerado / pendente)

Cada etapa clicável leva diretamente ao respectivo registro ou cria o próximo.

### 5. Relatório de entrega automático
Criar um relatório de entrega vinculado a uma oportunidade/contrato que consolde:

- Entregas aprovadas com datas, ativos e valor.
- Evidências do BrandTrack associadas à mesma marca/propriedade/contrato.
- Gerar PDF pronto para o patrocinador a partir de um clique.

### 6. Automação de acompanhamento
Quando o usuário mover uma oportunidade de estágio, o sistema deve:

- Sugerir a próxima atividade automaticamente (já existe IA, mas hoje é manual).
- Oferecer um botão "Criar próxima atividade" com um clique a partir do card/drawer.
- Enviar notificação interna quando uma oportunidade avançar para "Proposta enviada" ou "Fechado".

## Técnico
- Novas funções utilitárias: `convertOpportunityToProposal`, `acceptProposalToContract`, `activateContractToDeliveries`.
- Migrations para garantir que `proposal_items`, `contract_assets` e `deliveries` copiem `organization_id` e validem o vínculo com o registro pai (evitar duplicação e desvinculação).
- Atualizar `OpportunityDrawer.tsx` para o botão de avanço e a aba de jornada.
- Atualizar `Proposals.tsx` e `Contracts.tsx` para expor ações de conversão rápida.
- Novo Edge Function `generate-delivery-report` (ou reaproveitar `brandtrack-report`) para consolidar entregas + evidências em PDF.
- Atualizar políticas de RLS para garantir que a cópia de itens entre registros mantenha `organization_id`.

## Critérios de sucesso
- Usuário cria uma oportunidade e, em até 3 cliques, gera uma proposta com itens preenchidos.
- Proposta aceita gera contrato com ativos e parcelas sem redigitação.
- Contrato ativo gera entregas automaticamente.
- Relatório de entrega é gerado em um clique a partir da oportunidade ou contrato.
- Redução do número de telas visitadas para fechar uma marca de 5 para 2.
