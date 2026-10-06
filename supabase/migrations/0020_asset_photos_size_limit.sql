-- 0020_asset_photos_size_limit.sql
-- Aumenta o limite de tamanho do bucket asset-photos de 10 MB para 50 MB.
--
-- O limite de 10 MB foi escolhido na reconstrução (0007), sem base no sistema
-- real: no Lovable o bucket não tinha limite próprio (valia o limite global de
-- 50 MB do Supabase). A importação dos dados reais (2026-10-02) encontrou fotos
-- de ativos de até 17,2 MB, que eram rejeitadas com "The object exceeded the
-- maximum allowed size".

update storage.buckets
set file_size_limit = 52428800
where id = 'asset-photos';
