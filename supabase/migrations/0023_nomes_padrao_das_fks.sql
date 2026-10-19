-- 0023_nomes_padrao_das_fks.sql
--
-- Devolve às 4 FKs recriadas na 0014 o nome padrão do Postgres
-- (`<tabela>_<coluna>_fkey`).
--
-- A 0014 trocou o ON DELETE dessas FKs para o do banco de origem e as recriou
-- com o sufixo `_lovable`, só para marcar a origem. Na origem elas eram
-- declaradas inline, sem nome, e por isso já se chamavam
-- `<tabela>_<coluna>_fkey` — o nome que voltam a ter aqui. A definição
-- (colunas, tabela referenciada, ON DELETE) não muda.
--
-- Só renomeia: não toca em dados, não valida linhas de novo. Nenhum código
-- referencia esses nomes (o portal não usa hint de FK nos embeds do PostgREST
-- para essas relações, e a importação de dados lê as FKs pelo catálogo, sem
-- depender do nome); o `types.ts` é regenerado junto.

alter table public.deliveries
  rename constraint deliveries_sponsor_id_fkey_lovable to deliveries_sponsor_id_fkey;

alter table public.installments
  rename constraint installments_sponsor_id_fkey_lovable to installments_sponsor_id_fkey;

alter table public.sellout_reports
  rename constraint sellout_reports_property_id_fkey_lovable to sellout_reports_property_id_fkey;

alter table public.sponsors
  rename constraint sponsors_merged_into_sponsor_id_fkey_lovable to sponsors_merged_into_sponsor_id_fkey;
