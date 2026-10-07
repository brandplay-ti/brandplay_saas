// Gera `portal/src/integrations/supabase/types.ts` a partir do schema do
// Supabase LOCAL.
//
//   npm run supabase:types
//
// ─── Por que isto existe ─────────────────────────────────────────────
//
// O `types.ts` era gerado pelo Lovable a partir do banco DELE. Com o schema
// versionado em `supabase/migrations/`, a fonte de verdade passou a ser este
// repositório: depois de uma migration, regenere o arquivo para o frontend
// enxergar a mudança — e o `type-check` acusar quem usa coluna que deixou de
// existir.
//
// O gerador é o `postgres-meta` do próprio stack (o mesmo que o Studio usa),
// alcançado pela rota `/pg/` do Kong com a service role. Nada é instalado e
// não depende do Supabase CLI. Lê porta e chave de `docker/supabase/.env`; a
// chave nunca é impressa.
//
// Rode com o stack de pé e as migrations aplicadas
// (`npm run supabase:up && npm run supabase:migrate`).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// `--env <arquivo>` aponta para outro `.env` do stack (ex.: um stack de
// validação isolado); o padrão é o do ambiente local.
const iEnv = process.argv.indexOf('--env');
const arquivoEnv = iEnv > -1 ? resolve(process.argv[iEnv + 1]) : join(raiz, 'docker', 'supabase', '.env');
const destino = join(raiz, 'portal', 'src', 'integrations', 'supabase', 'types.ts');

let env;
try {
  env = Object.fromEntries(
    readFileSync(arquivoEnv, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
  );
} catch {
  console.error(`erro: ${arquivoEnv} não existe. Ver docker/supabase/README.md.`);
  process.exit(2);
}

const porta = env.KONG_HTTP_PORT_HOST || '8000';
const chave = env.SERVICE_ROLE_KEY;
if (!chave) {
  console.error('erro: SERVICE_ROLE_KEY vazia em docker/supabase/.env.');
  process.exit(2);
}

const url = `http://localhost:${porta}/pg/generators/typescript?included_schemas=public&detect_one_to_one_relationships=true`;

let resposta;
try {
  resposta = await fetch(url, { headers: { apikey: chave, Authorization: `Bearer ${chave}` } });
} catch (erro) {
  console.error(`erro: o Kong não respondeu em localhost:${porta} (${erro.cause?.code ?? erro.message}).`);
  console.error('Suba o stack com `npm run supabase:up`.');
  process.exit(1);
}

const corpo = await resposta.text();
if (!resposta.ok || !corpo.includes('export type Database')) {
  console.error(`erro: o gerador respondeu ${resposta.status}: ${corpo.slice(0, 200)}`);
  process.exit(1);
}

const cabecalho = `// Gerado por supabase/tools/gerar-types.mjs a partir de supabase/migrations/.
// Não edite: aplique a migration e rode \`npm run supabase:types\`.

`;
writeFileSync(destino, cabecalho + corpo.replace(/\r\n/g, '\n'), 'utf8');

const tabelas = (corpo.match(/\n {6}[a-z_0-9]+: \{\n {8}Row: \{/g) ?? []).length;
console.log(`types.ts gerado: ${tabelas} tabelas e views — ${destino.replace(raiz, '.').replace(/\\/g, '/')}`);
