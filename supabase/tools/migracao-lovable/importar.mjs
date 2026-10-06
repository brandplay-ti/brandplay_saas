#!/usr/bin/env node
// Importa no Supabase self-hosted uma exportação feita por exportar.mjs
// (ver docs/architecture/plano-migracao-dados-lovable-vps.md, seção 3).
//
// O que faz:
//   1. gera um SQL com toda a carga (fica dentro da pasta da exportação, pois
//      contém os dados) e o executa via psql dentro do container do Postgres,
//      numa transação única:
//        - usuários de usuarios.json em auth.users/auth.identities, com os
//          MESMOS ids e senha aleatória inutilizável (cada um redefine a senha);
//        - as tabelas de public, com triggers desligados
//          (session_replication_role = replica) para não duplicar parcelas,
//          entregas, interações e auditoria; "on conflict do nothing" torna a
//          carga reexecutável;
//        - usuários-fantasma inativos para ids referenciados nos dados mas
//          ausentes da lista (ex.: pessoas removidas da organização), para não
//          quebrar FKs nem o histórico;
//        - validação de TODAS as FKs de public (linhas órfãs abortam a carga,
//          salvo --permitir-orfaos) e contagem por tabela;
//   2. envia os arquivos de arquivos/<bucket>/... para o Storage com a
//      service_role (upsert), mantendo bucket e caminho.
//
// Uso (raiz do repositório, stack local de pé):
//   node supabase/tools/migracao-lovable/importar.mjs --pasta .migracao-lovable/<data-hora>
//
// Opções:
//   --pasta <dir>         pasta da exportação (obrigatório)
//   --container <nome>    container do Postgres (padrão: brandplay-supabase-db-1)
//   --env-file <arq>      de onde ler VITE_PUBLIC_SUPABASE_URL do destino (padrão: portal/.env.local)
//   --service-env <arq>   de onde ler SERVICE_ROLE_KEY do destino (padrão: docker/supabase/.env)
//   --ensaio              executa tudo e faz ROLLBACK no fim (não grava nada; não envia arquivos)
//   --sem-arquivos        não envia o Storage
//   --permitir-orfaos     não aborta se houver linhas órfãs (só relata)
//   --anular-orfaos       em FKs de coluna única e anulável, mantém a linha e anula a
//                         referência a registro que não existe mais na origem (o
//                         Lovable não tinha várias das FKs do schema reconstruído);
//                         cada caso é relatado. Órfãos em coluna obrigatória abortam.

import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

function args() {
  const a = process.argv.slice(2);
  const get = (k) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    pasta: get("--pasta"),
    container: get("--container") ?? "brandplay-supabase-db-1",
    envFile: get("--env-file") ?? "portal/.env.local",
    serviceEnv: get("--service-env") ?? "docker/supabase/.env",
    ensaio: a.includes("--ensaio"),
    semArquivos: a.includes("--sem-arquivos"),
    permitirOrfaos: a.includes("--permitir-orfaos"),
    anularOrfaos: a.includes("--anular-orfaos"),
  };
}

async function lerEnv(arquivo) {
  if (!existsSync(arquivo)) throw new Error(`arquivo de ambiente não encontrado: ${arquivo}`);
  const vars = {};
  for (const linha of (await readFile(arquivo, "utf8")).split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vars;
}

const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`identificador inválido: ${s}`);
  return s;
};

function literal(texto) {
  // dollar-quote com marcador aleatório que não aparece no conteúdo
  let tag;
  do tag = `m${randomBytes(6).toString("hex")}`; while (texto.includes(`$${tag}$`));
  return `$${tag}$${texto}$${tag}$`;
}

function psql(container, arquivoSql) {
  return new Promise((resolve, reject) => {
    const p = spawn("docker", ["exec", "-i", container, "psql", "-U", "supabase_admin", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-At", "-q"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve({ out, err }) : reject(new Error(`psql saiu com ${code}:\n${err.trim().split("\n").slice(-15).join("\n")}`))));
    createReadStream(arquivoSql).pipe(p.stdin);
  });
}

async function listarArquivos(base, rel = "") {
  const saida = [];
  for (const nome of await readdir(path.join(base, rel))) {
    const r = rel ? `${rel}/${nome}` : nome;
    if ((await stat(path.join(base, r))).isDirectory()) saida.push(...(await listarArquivos(base, r)));
    else saida.push(r);
  }
  return saida;
}

function montarSql(dados, usuarios, opt) {
  const L = [];
  L.push("\\set QUIET on", "begin;", "set local session_replication_role = replica;");

  // 1. usuários conhecidos (mesmo id; senha aleatória inutilizável)
  for (const u of usuarios) {
    if (!u.email) continue;
    const meta = JSON.stringify({ full_name: u.nome ?? "", migrado_do_lovable: true });
    L.push(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '${u.user_id}', 'authenticated', 'authenticated', ${literal(u.email)}, crypt(gen_random_uuid()::text, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, ${literal(meta)}::jsonb, now(), now(), '', '', '', '')
on conflict do nothing;`);
    L.push(`insert into auth.identities (user_id, provider_id, identity_data, provider, created_at, updated_at)
values ('${u.user_id}', '${u.user_id}', jsonb_build_object('sub', '${u.user_id}', 'email', ${literal(u.email)}, 'email_verified', true), 'email', now(), now())
on conflict do nothing;`);
  }

  // 2. tabelas de public
  for (const [tabela, linhas] of Object.entries(dados)) {
    if (!linhas.length) continue;
    const t = ident(tabela);
    L.push(`with ins as (insert into public.${t} select * from json_populate_recordset(null::public.${t}, ${literal(JSON.stringify(linhas))}::json) on conflict do nothing returning 1)
select 'RESULTADO|${t}|${linhas.length}|' || count(*) from ins;`);
  }

  // 3. usuários-fantasma para ids referenciados e ausentes
  L.push(`do $fantasmas$
declare r record; n int := 0; total int := 0;
begin
  for r in
    select c.conrelid::regclass as tab, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
      and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
  loop
    execute format($q$
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, banned_until, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
      select '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated',
             'usuario-removido-' || left(x.id::text, 8) || '@migracao.invalid', '',
             '{"provider":"email","providers":["email"]}'::jsonb,
             '{"full_name":"Usuário removido (migração)","migracao_placeholder":true}'::jsonb,
             'infinity', now(), now(), '', '', '', ''
      from (select distinct %I as id from %s where %I is not null) x
      where not exists (select 1 from auth.users u where u.id = x.id)$q$, r.col, r.tab, r.col);
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  raise notice 'FANTASMAS|%', total;
end $fantasmas$;`);

  // 4. validação de FKs (com triggers desligados nada foi checado na carga)
  L.push(`do $fks$
declare r record; q text; n bigint; total bigint := 0;
begin
  for r in
    select c.conname, c.conrelid::regclass as filho, c.confrelid::regclass as pai,
           (select array_agg(attname order by k.i) from unnest(c.conkey) with ordinality k(attnum, i) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols_f,
           (select array_agg(attname order by k.i) from unnest(c.confkey) with ordinality k(attnum, i) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as cols_p
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
  loop
    q := format('select count(*) from %s f where %s and not exists (select 1 from %s p where %s)',
      r.filho,
      (select string_agg(format('f.%I is not null', x), ' and ') from unnest(r.cols_f) x),
      r.pai,
      (select string_agg(format('p.%I = f.%I', r.cols_p[i], r.cols_f[i]), ' and ') from generate_subscripts(r.cols_f, 1) i));
    execute q into n;
    if n > 0 and ${opt.anularOrfaos ? "true" : "false"} and array_length(r.cols_f, 1) = 1
       and not (select attnotnull from pg_attribute where attrelid = r.filho and attname = r.cols_f[1]) then
      -- referência a registro que não existe mais na origem (o Lovable não tinha esta FK):
      -- mantém a linha e anula só a referência
      execute format('update %s f set %I = null where f.%I is not null and not exists (select 1 from %s p where p.%I = f.%I)',
        r.filho, r.cols_f[1], r.cols_f[1], r.pai, r.cols_p[1], r.cols_f[1]);
      raise notice 'ANULADOS|%|%|%', r.filho, r.cols_f[1], n;
      n := 0;
    end if;
    if n > 0 then
      raise notice 'ORFAOS|%|%|%', r.filho, r.conname, n;
      total := total + n;
    end if;
  end loop;
  raise notice 'ORFAOS_TOTAL|%', total;
  if total > 0 and ${opt.permitirOrfaos ? "false" : "true"} then
    raise exception 'carga abortada: % linha(s) órfã(s) (use --permitir-orfaos para só relatar)', total;
  end if;
end $fks$;`);

  L.push("set local session_replication_role = origin;");
  L.push(opt.ensaio ? "rollback;" : "commit;");
  return L.join("\n\n") + "\n";
}

async function main() {
  const opt = args();
  if (!opt.pasta) throw new Error("informe --pasta <pasta da exportação>");
  const pasta = path.resolve(opt.pasta);
  const manifesto = JSON.parse(await readFile(path.join(pasta, "manifesto.json"), "utf8"));
  const usuarios = JSON.parse(await readFile(path.join(pasta, "usuarios.json"), "utf8"));
  const dados = {};
  for (const f of await readdir(path.join(pasta, "dados"))) {
    if (f.endsWith(".json")) dados[f.slice(0, -5)] = JSON.parse(await readFile(path.join(pasta, "dados", f), "utf8"));
  }

  console.log(`Exportação: ${manifesto.origem} em ${manifesto.iniciado_em}`);
  console.log(`Destino:    container ${opt.container}${opt.ensaio ? "  (ENSAIO: rollback no fim)" : ""}\n`);

  const semEmail = usuarios.filter((u) => !u.email);
  if (semEmail.length) console.warn(`ATENÇÃO: ${semEmail.length} usuário(s) sem e-mail viram usuário-fantasma inativo (complete emails-pendentes.csv/usuarios.json para criá-los de verdade).\n`);

  // 1. banco
  const arquivoSql = path.join(pasta, `importacao-${Date.now()}.sql`);
  await writeFile(arquivoSql, montarSql(dados, usuarios, opt));
  let saida;
  try {
    saida = await psql(opt.container, arquivoSql);
  } finally {
    await writeFile(arquivoSql, "-- removido após a execução (continha os dados)\n");
  }

  const linhas = (saida.out + "\n" + saida.err).split(/\r?\n/);
  let esperado = 0;
  let inserido = 0;
  console.log("Tabela                             exportado  inserido");
  for (const l of linhas) {
    const m = l.match(/RESULTADO\|(\w+)\|(\d+)\|(\d+)/);
    if (!m) continue;
    esperado += +m[2];
    inserido += +m[3];
    console.log(`${m[1].padEnd(34)} ${m[2].padStart(9)} ${m[3].padStart(9)}${m[2] !== m[3] ? "  (já existiam / conflito)" : ""}`);
  }
  const fant = linhas.map((l) => l.match(/FANTASMAS\|(\d+)/)).find(Boolean);
  const orf = linhas.filter((l) => /ORFAOS\|/.test(l)).map((l) => l.replace(/.*ORFAOS\|/, ""));
  const anul = linhas.filter((l) => /ANULADOS\|/.test(l)).map((l) => l.replace(/.*ANULADOS\|/, ""));
  console.log(`\nLinhas: exportadas ${esperado}, inseridas ${inserido}`);
  console.log(`Usuários: ${usuarios.filter((u) => u.email).length} criados/mantidos, ${fant ? fant[1] : 0} fantasma(s)`);
  console.log(`Linhas órfãs: ${orf.length ? orf.join("; ") : "nenhuma"}`);
  if (anul.length) console.log(`Referências anuladas (registro inexistente na origem): ${anul.join("; ")}`);

  // 2. arquivos
  if (!opt.semArquivos && !opt.ensaio && existsSync(path.join(pasta, "arquivos"))) {
    const envDestino = await lerEnv(opt.envFile);
    const envServico = await lerEnv(opt.serviceEnv);
    const urlDestino = envDestino.VITE_PUBLIC_SUPABASE_URL ?? envDestino.VITE_SUPABASE_URL;
    if (!urlDestino || !envServico.SERVICE_ROLE_KEY) throw new Error("VITE_PUBLIC_SUPABASE_URL/SERVICE_ROLE_KEY do destino não encontrados");
    const sb = createClient(urlDestino, envServico.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const base = path.join(pasta, "arquivos");
    const todos = await listarArquivos(base);
    let ok = 0;
    const falhas = [];
    for (const rel of todos) {
      const [bucket, ...resto] = rel.split("/");
      const caminho = resto.join("/");
      const corpo = await readFile(path.join(base, rel));
      const { error } = await sb.storage.from(bucket).upload(caminho, corpo, { upsert: true });
      if (error) falhas.push(`${bucket}/${caminho}: ${error.message}`);
      else ok += 1;
    }
    console.log(`\nArquivos enviados ao Storage: ${ok} de ${todos.length}`);
    for (const f of falhas.slice(0, 20)) console.log(`  falha: ${f}`);
  }

  console.log(opt.ensaio ? "\nENSAIO concluído: nada foi gravado." : "\nImportação concluída.");
  console.log("Os usuários migrados precisam redefinir a senha (fluxo \"esqueci minha senha\").");
}

main().catch((e) => {
  console.error(`\nFALHA: ${e.message}`);
  process.exit(1);
});
