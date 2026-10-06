import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

/**
 * Recusa `npm run dev` apontado para um Supabase que não seja o container
 * local.
 *
 * Desenvolvimento roda contra o stack local — é o que garante que o que se
 * testa aqui é a mesma versão de Postgres, PostgREST e GoTrue que vai rodar em
 * homologação e produção. Apontar para o remoto contorna essa garantia, e ainda
 * põe uma sessão de ambiente publicado numa máquina de trabalho.
 *
 * A checagem vive aqui, e não num `predev` do npm, pela mesma razão que
 * `scripts/checar-build.mjs` não é `prebuild`: o Vite lê `.env.local` por conta
 * própria, e essas variáveis não existem em `process.env`. Dentro do plugin,
 * `loadEnv` entrega o valor que a aplicação vai realmente receber.
 */
function exigirSupabaseLocal(): Plugin {
  return {
    name: 'brandplay:exigir-supabase-local',
    apply: 'serve',
    config(_config, { mode }) {
      const env = loadEnv(mode, path.resolve(__dirname), 'VITE_');
      const url = (env.VITE_PUBLIC_SUPABASE_URL ?? '').trim();

      if (!url || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url)) return;

      throw new Error(
        [
          '',
          `  VITE_PUBLIC_SUPABASE_URL aponta para ${url}.`,
          '',
          '  O ambiente de desenvolvimento roda contra o Supabase local, e nunca',
          '  contra um ambiente publicado. É o que mantém a paridade de versões',
          '  entre o que você testa e o que vai ao ar.',
          '',
          '  Em `portal/.env.local`:',
          '',
          '    VITE_PUBLIC_SUPABASE_URL="http://localhost:8010"',
          '',
          '  Suba o stack com `npm run supabase:up`. A chave anon local sai de',
          '  `docker/supabase/.env` — gere um conjunto novo com',
          '  `npm run supabase:chaves` se ainda não tiver.',
          '',
        ].join('\n'),
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: '::',
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [exigirSupabaseLocal(), react()],
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@tanstack/react-query',
      '@tanstack/query-core',
    ],
  },
}));
