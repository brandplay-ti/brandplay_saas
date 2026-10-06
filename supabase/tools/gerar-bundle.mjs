// Gera SQL colavel no editor do Supabase Studio.
//
//   node supabase/tools/gerar-bundle.mjs
//   node supabase/tools/gerar-bundle.mjs --desde 0021   (so as pendentes)
//
// Por que existe: no Dockploy, homologacao e producao sao servicos
// instanciados por la, e o caminho mais direto para carregar o banco e o SQL
// Editor do Studio. Mas o editor e um cliente de SQL, e nao o `psql`: nao ha
// como executar `tools/migrate.sh`, que e shell.
//
// Este gerador achata as migrations em SQL puro:
//
//   bundle/01-migrations.sql   as migrations em ordem, cada uma na propria
//                              transacao, com o mesmo registro de versao que
//                              o `migrate.sh` grava
//   bundle/pendentes.sql       idem, so a partir de `--desde <versao>`
//
// O registro de versao e o ponto importante: depois de aplicar pelo Studio, o
// `migrate.sh` reconhece tudo como aplicado e os proximos deploys seguem pelo
// caminho normal. Sem isso, a proxima migration tentaria recriar o schema
// inteiro.
//
// Ao contrario do central-check, nao ha `02-configuracao.sql`: o BrandPlay nao
// tem catalogo de configuracao fora das migrations. Os dados de um ambiente
// hospedado vem da importacao do Lovable (supabase/tools/migracao-lovable).
//
// O bundle e derivado — nao vai para o repositorio. Regenere quando precisar.

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const saida = join(raiz, 'bundle');
mkdirSync(saida, { recursive: true });

const kb = (texto) => `${Math.round(Buffer.byteLength(texto) / 1024)} KB`;

// ─── `--desde`, para banco JA migrado ────────────────────────────────
//
// O `01-migrations.sql` e para banco novo: ele aborta se ja houver migration
// aplicada, porque reaplicar tudo por cima recriaria schema existente.
//
// Num ambiente que ja roda, o caminho normal e o `migrate.sh`. Quando ele nao
// esta ao alcance — sem SSH, sem o workflow de deploy configurado, e sobrando
// o SQL Editor do Studio —, `--desde <versao>` gera `bundle/pendentes.sql` com
// as migrations daquela versao em diante, com o mesmo registro de versao.
//
// A versao inicial e escolhida por quem chama, e nao adivinhada: quem sabe o
// que falta e o banco alvo.
const argDesde = process.argv.indexOf('--desde');
const desde = argDesde === -1 ? null : process.argv[argDesde + 1];

if (argDesde !== -1 && !desde) {
  console.error('erro: --desde exige uma versao, por exemplo: --desde 0021');
  process.exit(2);
}

const todas = readdirSync(join(raiz, 'migrations'))
  .filter((n) => n.endsWith('.sql'))
  .sort();

// Compara pelo nome do arquivo, que e o que ordena as migrations no projeto
// inteiro. Aceita tanto o prefixo (`0021`) quanto o nome completo.
const arquivos = desde ? todas.filter((n) => n >= desde) : todas;

if (desde && arquivos.length === 0) {
  console.error(`erro: nenhuma migration a partir de "${desde}".`);
  process.exit(2);
}

// O checksum tem de bater com o `sha256sum` do arquivo que o `migrate.sh`
// calcula, senao o historico diverge entre quem aplicou pelo Studio e quem
// aplicou pelo runner. Ler como Buffer garante os mesmos bytes; o
// `.gitattributes` garante que sao LF em qualquer sistema.
const partes = arquivos.map((nome) => {
  const bruto = readFileSync(join(raiz, 'migrations', nome));
  const versao = nome.replace(/\.sql$/, '');
  const checksum = createHash('sha256').update(bruto).digest('hex');

  return [
    `-- ${'═'.repeat(68)}`,
    `-- ${versao}`,
    `-- ${'═'.repeat(68)}`,
    'begin;',
    "select pg_advisory_xact_lock(hashtext('brandplay-migrations'));",
    '',
    bruto.toString('utf8').trimEnd(),
    '',
    `insert into migrations.schema_migrations (version, checksum)`,
    `values ('${versao}', '${checksum}');`,
    'commit;',
    '',
  ].join('\n');
});

// Papel: o SQL Editor do Studio conecta como `postgres`, que no Supabase nao e
// superusuario nem membro de `supabase_admin`. Por isso o bundle nao tenta
// `set role supabase_admin`: falharia. Se o editor recusar alguma migration
// por privilegio, aplique pelo runner (Caminho B de
// docs/runbooks/primeira-carga.md), que conecta como `supabase_admin`.

const controle = `create schema if not exists migrations;

create table if not exists migrations.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now(),
  checksum    text
);
`;

const preambulo = `-- Migrations do BrandPlay, achatadas para o SQL Editor.
--
-- Gerado por supabase/tools/gerar-bundle.mjs. Nao edite: regenere.
--
-- ${arquivos.length} migrations, cada uma na propria transacao. Se uma falhar,
-- ela nao entra, as anteriores permanecem aplicadas e registradas, e da para
-- retomar do ponto exato — o mesmo comportamento do runner.
--
-- Destinado a banco NOVO. A guarda abaixo aborta se ja houver migration
-- aplicada: reaplicar este arquivo por cima recriaria schema existente.
-- Para um banco ja migrado, use supabase/tools/migrate.sh.

${controle}
do $guarda$
begin
  if exists (select 1 from migrations.schema_migrations) then
    raise exception
      'Este banco ja tem % migration(s) aplicada(s). Use supabase/tools/migrate.sh para aplicar so as pendentes.',
      (select count(*) from migrations.schema_migrations);
  end if;
end
$guarda$;

-- ─── O GoTrue e o Storage precisam ter terminado ANTES daqui ─────────
--
-- 0003_tables.sql cria foreign keys de varias tabelas (profiles,
-- organizations, organization_members, ...) para 'auth.users'. Varias
-- migrations do GoTrue alteram essa tabela — e uma FK externa bloqueia a
-- alteracao. Aplicar este arquivo antes de ele terminar para o GoTrue no meio,
-- e o sintoma so aparece no cadastro: 'Database error finding user'.
--
-- 0007_storage_buckets.sql insere em 'storage.buckets', tabela criada pelo
-- servico storage-api no bootstrap dele, e nao pela imagem do Postgres.
--
-- O numero corresponde ao GoTrue pinado no compose (v2.189.0). Ao trocar a
-- imagem, confira o valor junto.
do $stack$
declare
  v_aplicadas int;
begin
  if to_regclass('auth.schema_migrations') is null then
    raise exception
      'O schema auth nao existe. Suba o stack e espere o servico auth ficar saudavel antes de migrar.';
  end if;

  select count(*) into v_aplicadas from auth.schema_migrations;

  if v_aplicadas < 76 then
    raise exception
      'O GoTrue aplicou apenas % das 76 migrations dele. Aplicar agora o deixaria travado pelas foreign keys para auth.users. Espere o servico auth terminar (ou veja o log dele) e rode de novo.',
      v_aplicadas;
  end if;

  if to_regclass('storage.buckets') is null then
    raise exception
      'storage.buckets nao existe. Espere o servico storage ficar saudavel antes de migrar.';
  end if;
end
$stack$;

`;

const preambuloPendentes = `-- Migrations pendentes do BrandPlay, achatadas para o SQL Editor.
--
-- Gerado por supabase/tools/gerar-bundle.mjs --desde ${desde}. Nao edite: regenere.
--
-- ${arquivos.length} migration(s), de ${arquivos[0].replace(/\.sql$/, '')} em diante, cada
-- uma na propria transacao. Se uma falhar, ela nao entra, as anteriores
-- permanecem aplicadas e registradas, e da para retomar do ponto exato.
--
-- Ao contrario do 01-migrations.sql, este arquivo e para banco JA migrado e
-- nao tem guarda contra banco populado: quem escolheu o ponto de partida foi
-- quem chamou. Confira antes pela lista do proprio banco:
--
--   select version from migrations.schema_migrations order by version;
--
-- Reaplicar uma migration ja registrada falha no insert final, pela chave
-- primaria — a transacao inteira volta atras e nada entra duas vezes.

${controle}
`;

if (desde) {
  const pendentes = preambuloPendentes + partes.join('\n');
  writeFileSync(join(saida, 'pendentes.sql'), pendentes, 'utf8');
  console.log(`bundle/pendentes.sql        ${arquivos.length} migration(s), ${kb(pendentes)}`);
  console.log(`                            ${arquivos[0]} ate ${arquivos[arquivos.length - 1]}`);
  process.exit(0);
}

const bundleMigrations = preambulo + partes.join('\n');
writeFileSync(join(saida, '01-migrations.sql'), bundleMigrations, 'utf8');

console.log(`bundle/01-migrations.sql    ${arquivos.length} migrations, ${kb(bundleMigrations)}`);
