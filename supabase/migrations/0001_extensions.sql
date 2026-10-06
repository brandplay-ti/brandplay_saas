-- 0001_extensions.sql
-- Extensões necessárias para o schema reconstruído do BrandPlay.
--
-- Contexto: este schema foi reconstruído a partir de
-- src/integrations/supabase/types.ts (projeto originalmente rodando em
-- Supabase/Lovable Cloud gerenciado, sem acesso a `supabase db pull`).
-- Ver supabase/migrations/SCHEMA_NOTES.md para a lista completa de
-- suposições assumidas nessa reconstrução.

-- gen_random_uuid() para todas as PKs uuid.
-- Em Postgres 13+ gen_random_uuid() já vem em pgcrypto; em Supabase/self-hosted
-- moderno também está disponível nativamente via "pgcrypto" ou já embutida no
-- core (Postgres 15+). Habilitamos pgcrypto explicitamente para garantir
-- compatibilidade em qualquer Postgres self-hosted >= 13.
create extension if not exists pgcrypto with schema public;

-- pg_trgm: usado para busca textual (ILIKE / similarity) em campos como
-- sponsors.name, sports_properties.name, opportunities.brand, etc.
-- A aplicação frontend faz filtros com `.ilike()` no Supabase client em várias
-- telas (Sponsors, Properties, Opportunities) — pg_trgm permite indexar essas
-- buscas com GIN/GIST no futuro. Não é estritamente obrigatório para o schema
-- funcionar, mas é essencial para performance dessas buscas em produção.
create extension if not exists pg_trgm with schema public;

-- unaccent: útil para busca "acento-insensível" em nomes de patrocinadores,
-- propriedades, marcas (dados em português). Opcional, mas de baixo custo.
create extension if not exists unaccent with schema public;
