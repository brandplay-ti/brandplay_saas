#!/usr/bin/env node
// Importa no Supabase self-hosted uma exportação feita por exportar.mjs
// (ver docs/architecture/plano-migracao-dados-lovable-vps.md, seção 3).
//
// O que faz:
//   1. monta o SQL da carga, numa transação, com triggers desligados
//      (session_replication_role = replica) para não duplicar parcelas,
//      entregas, interações e auditoria:
//        - recusa a carga se um e-mail da exportação já existir no destino com
//          outro id (banco não resetado: o usuário seria pulado em silêncio);
//        - usuários de usuarios.json em auth.users/auth.identities, com os
//          MESMOS ids e senha aleatória inutilizável (cada um redefine a senha);
//        - as tabelas de public; "on conflict do nothing" torna a carga
//          reexecutável;
//        - usuários-fantasma inativos para ids referenciados nos dados mas
//          ausentes da lista (ex.: pessoas removidas da organização), para não
//          quebrar FKs nem o histórico;
//        - validação de TODAS as FKs de public (linhas órfãs abortam a carga,
//          salvo --permitir-orfaos) e conferência da contagem por tabela;
//      e o executa via psql dentro do container do Postgres (padrão) ou só o
//      grava para colar no SQL Editor do Studio (--gerar-sql);
//   2. envia os arquivos de arquivos/<bucket>/... para o Storage com a
//      service_role (upsert), mantendo bucket e caminho e o content-type pela
//      extensão.
//
// Uso (raiz do repositório):
//
//   Stack local (psql via docker exec + Storage):
//     node supabase/tools/migracao-lovable/importar.mjs --pasta .migracao-lovable/<data-hora>
//
//   Ambiente hospedado, sem SSH (ver docs/runbooks/primeira-carga.md):
//     1. banco: gera os arquivos e cola cada um, em ordem, no SQL Editor do Studio
//          node supabase/tools/migracao-lovable/importar.mjs --pasta <dir> --gerar-sql
//     2. Storage: envia os arquivos pela API pública do ambiente
//          node supabase/tools/migracao-lovable/importar.mjs --pasta <dir> --so-arquivos --url https://teste.db.brandplay.com.br
//        (a service_role é pedida no terminal e não é gravada)
//
// Opções:
//   --pasta <dir>         pasta da exportação (obrigatório)
//   --container <nome>    container do Postgres (padrão: brandplay-supabase-db-1)
//   --gerar-sql           NÃO executa nada: grava o SQL em <pasta>/studio-<data-hora>/,
//                         dividido em partes de até --limite-kb, para colar no SQL
//                         Editor do Studio (que conecta como `postgres`). Cada parte
//                         é uma transação; a última valida FKs e confere as contagens.
//   --limite-kb <n>       tamanho máximo de cada parte do --gerar-sql, medido como o
//                         Studio recebe (padrão: 900; o Studio recusa acima de 1024)
//   --so-arquivos         não toca no banco: só envia o Storage
//   --url <url>           URL pública do Supabase de destino para o Storage (padrão:
//                         VITE_PUBLIC_SUPABASE_URL de --env-file). Com --url e sem
//                         --service-env, a service_role é pedida no terminal.
//   --env-file <arq>      de onde ler VITE_PUBLIC_SUPABASE_URL do destino (padrão: portal/.env.local)
//   --service-env <arq>   de onde ler SERVICE_ROLE_KEY do destino (padrão: docker/supabase/.env)
//   --sim                 não pede confirmação ao enviar arquivos para host que não é local
//   --ensaio              executa tudo e faz ROLLBACK no fim (não grava nada; não envia arquivos)
//   --sem-arquivos        não envia o Storage
//   --permitir-orfaos     não aborta se houver linhas órfãs (só relata)
//   --anular-orfaos       em FKs de coluna única e anulável, mantém a linha e anula a
//                         referência a registro que não existe mais na origem (o
//                         Lovable não tinha várias das FKs do schema reconstruído);
//                         cada caso é relatado. Órfãos em coluna obrigatória abortam.

import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
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
    serviceEnv: get("--service-env"),
    url: get("--url"),
    gerarSql: a.includes("--gerar-sql"),
    limiteKb: Number(get("--limite-kb") ?? 900),
    soArquivos: a.includes("--so-arquivos"),
    sim: a.includes("--sim"),
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

function perguntar(texto, oculto = false) {
  // entrada já encerrada (ex.: stdin sem terminal): não há resposta a esperar
  if (process.stdin.readableEnded) return Promise.resolve("");
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      rl._writeToOutput = (s) => {
        if (s.includes(texto)) rl.output.write(s);
      };
    }
    let respondeu = false;
    rl.question(texto, (r) => {
      respondeu = true;
      rl.close();
      if (oculto) process.stdout.write("\n");
      resolve(r.trim());
    });
    // entrada encerrada sem resposta (ex.: stdin sem terminal): resposta vazia
    rl.on("close", () => {
      if (!respondeu) resolve("");
    });
  });
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

// ---------------------------------------------------------------- SQL da carga
//
// O mesmo SQL serve ao psql e ao SQL Editor do Studio: nada de meta-comando do
// psql, e o resultado sai de um SELECT final sobre uma tabela temporária (o
// Studio não mostra RAISE NOTICE). A tabela some no fim da transação.

const ABRIR = `begin;
set local session_replication_role = replica;
create temp table importacao_relatorio (
  ordem serial, item text, tabela text, exportado bigint, resultado bigint, detalhe text
) on commit drop;`;

const RELATORIO = "select item, tabela, exportado, resultado, detalhe from importacao_relatorio order by ordem;";

function sqlUsuarios(usuarios) {
  const lista = usuarios.filter((u) => u.email).map((u) => ({ user_id: u.user_id, email: u.email.toLowerCase(), nome: u.nome ?? "" }));
  if (!lista.length) return [];
  const json = `${literal(JSON.stringify(lista))}::json`;
  const origem = `json_to_recordset(${json}) as x(user_id uuid, email text, nome text)`;
  return [
    // E-mail já cadastrado com outro id: o insert seria pulado em silêncio e os
    // dados desse usuário ficariam apontando para um fantasma. Banco precisa de reset.
    `do $guarda$
declare _n int; _exemplos text;
begin
  select count(*), string_agg(u.email, ', ' order by u.email)
    into _n, _exemplos
    from auth.users u join ${origem} on lower(u.email) = x.email and u.id <> x.user_id;
  if _n > 0 then
    raise exception 'carga abortada: % e-mail(s) da exportação já existem no destino com outro id (%). Resete o banco de destino ou remova esses usuários antes de importar.', _n, _exemplos;
  end if;
end $guarda$;`,
    `with ins as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
  select '00000000-0000-0000-0000-000000000000', x.user_id, 'authenticated', 'authenticated', x.email,
         crypt(gen_random_uuid()::text, gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         jsonb_build_object('full_name', x.nome, 'migrado_do_lovable', true),
         now(), now(), '', '', '', ''
    from ${origem}
  on conflict do nothing
  returning 1)
insert into importacao_relatorio (item, tabela, exportado, resultado)
select 'usuarios', 'auth.users', ${lista.length}, count(*) from ins;`,
    `insert into auth.identities (user_id, provider_id, identity_data, provider, created_at, updated_at)
select x.user_id, x.user_id::text, jsonb_build_object('sub', x.user_id::text, 'email', x.email, 'email_verified', true), 'email', now(), now()
  from ${origem}
 where exists (select 1 from auth.users u where u.id = x.user_id)
on conflict do nothing;`,
  ];
}

// Peso de um trecho de SQL como ele viaja até o Studio: dentro de um corpo JSON,
// em que cada aspas dos dados vira \" — o Studio recusa corpo acima de 1 MB.
const peso = (texto) => Buffer.byteLength(JSON.stringify(texto));

// Divide as linhas da tabela em blocos cujo SQL cabe em `limite` bytes.
function sqlTabela(tabela, linhas, limite) {
  const t = ident(tabela);
  const montar = (bloco) => `with ins as (insert into public.${t} select * from json_populate_recordset(null::public.${t}, ${literal(JSON.stringify(bloco))}::json) on conflict do nothing returning 1)
insert into importacao_relatorio (item, tabela, exportado, resultado) select 'tabela', '${t}', ${bloco.length}, count(*) from ins;`;
  const folga = 400; // texto fixo do comando
  const blocos = [];
  let atual = [];
  let tamanho = 0;
  for (const linha of linhas) {
    const n = peso(JSON.stringify(linha)) + 1;
    if (atual.length && tamanho + n + folga > limite) {
      blocos.push(atual);
      atual = [];
      tamanho = 0;
    }
    atual.push(linha);
    tamanho += n;
  }
  if (atual.length) blocos.push(atual);
  return blocos.map(montar);
}

function sqlFinal(dados, usuarios, opt) {
  const L = [];

  // usuários-fantasma para ids referenciados e ausentes
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
  insert into importacao_relatorio (item, resultado) values ('fantasmas', total);
end $fantasmas$;`);

  // validação de FKs (com triggers desligados nada foi checado na carga)
  L.push(`do $fks$
declare r record; q text; n bigint; total bigint := 0; lista text := '';
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
      insert into importacao_relatorio (item, tabela, resultado, detalhe) values ('anulados', r.filho::text, n, r.cols_f[1]);
      n := 0;
    end if;
    if n > 0 then
      insert into importacao_relatorio (item, tabela, resultado, detalhe) values ('orfaos', r.filho::text, n, r.conname);
      lista := lista || format(' %s.%s=%s', r.filho, r.conname, n);
      total := total + n;
    end if;
  end loop;
  if total > 0 and ${opt.permitirOrfaos ? "false" : "true"} then
    raise exception 'carga abortada: % linha(s) órfã(s):% (use --permitir-orfaos para só relatar, ou --anular-orfaos)', total, lista;
  end if;
end $fks$;`);

  // conferência: o que ficou no destino x o que foi exportado
  const conf = Object.entries(dados)
    .filter(([, linhas]) => linhas.length)
    .map(([t, linhas]) => `select 'conferencia', '${ident(t)}', ${linhas.length}::bigint, (select count(*) from public.${ident(t)})`);
  const ids = usuarios.filter((u) => u.email).map((u) => u.user_id);
  if (ids.length) conf.unshift(`select 'conferencia', 'auth.users', ${ids.length}::bigint, (select count(*) from auth.users where id = any(${literal(`{${ids.join(",")}}`)}::uuid[]))`);
  if (conf.length) L.push(`insert into importacao_relatorio (item, tabela, exportado, resultado)\n${conf.join("\nunion all\n")};`);
  return L;
}

// Agrupa os comandos em partes (transações) de até `limite` bytes de peso. Os
// usuários vêm primeiro, porque a guarda de e-mail precisa rodar antes de tudo;
// a validação fica sempre na última parte, depois de todos os dados.
function montarPartes(dados, usuarios, opt, limite) {
  const fim = opt.ensaio ? "rollback;" : "commit;";
  const fixo = peso(ABRIR + RELATORIO + fim) + 1024; // + cabeçalho de comentários
  const comandos = [...sqlUsuarios(usuarios)];
  for (const [tabela, linhas] of Object.entries(dados)) {
    if (linhas.length) comandos.push(...sqlTabela(tabela, linhas, limite - fixo));
  }
  const finais = sqlFinal(dados, usuarios, opt);

  const partes = [];
  let atual = [];
  let tamanho = fixo;
  const fechar = () => {
    if (atual.length) partes.push(atual);
    atual = [];
    tamanho = fixo;
  };
  for (const c of comandos) {
    const n = peso(c) + 2;
    if (atual.length && tamanho + n > limite) fechar();
    atual.push(c);
    tamanho += n;
  }
  const nFinais = finais.reduce((s, c) => s + peso(c) + 2, 0);
  if (atual.length && tamanho + nFinais > limite) fechar();
  atual.push(...finais);
  fechar();
  return partes.map((cmds) => [ABRIR, ...cmds, "set local session_replication_role = origin;", RELATORIO, fim].join("\n\n") + "\n");
}

function lerRelatorio(texto) {
  const itens = [];
  for (const l of texto.split(/\r?\n/)) {
    const m = l.match(/^(usuarios|tabela|fantasmas|anulados|orfaos|conferencia)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$/);
    if (m) itens.push({ item: m[1], tabela: m[2], exportado: m[3] === "" ? null : +m[3], resultado: m[4] === "" ? null : +m[4], detalhe: m[5] });
  }
  return itens;
}

function imprimirRelatorio(itens, usuarios) {
  console.log("Tabela                             exportado  inserido");
  let esperado = 0;
  let inserido = 0;
  for (const r of itens.filter((i) => i.item === "tabela" || i.item === "usuarios")) {
    esperado += r.exportado;
    inserido += r.resultado;
    console.log(`${r.tabela.padEnd(34)} ${String(r.exportado).padStart(9)} ${String(r.resultado).padStart(9)}${r.exportado !== r.resultado ? "  (já existiam / conflito)" : ""}`);
  }
  const fant = itens.find((i) => i.item === "fantasmas");
  const orf = itens.filter((i) => i.item === "orfaos").map((i) => `${i.tabela}|${i.detalhe}|${i.resultado}`);
  const anul = itens.filter((i) => i.item === "anulados").map((i) => `${i.tabela}|${i.detalhe}|${i.resultado}`);
  const divergentes = itens.filter((i) => i.item === "conferencia" && i.exportado !== i.resultado);
  console.log(`\nLinhas: exportadas ${esperado}, inseridas ${inserido}`);
  console.log(`Usuários: ${usuarios.filter((u) => u.email).length} criados/mantidos, ${fant ? fant.resultado : 0} fantasma(s)`);
  console.log(`Linhas órfãs: ${orf.length ? orf.join("; ") : "nenhuma"}`);
  if (anul.length) console.log(`Referências anuladas (registro inexistente na origem): ${anul.join("; ")}`);
  console.log(`Conferência no destino: ${divergentes.length ? divergentes.map((d) => `${d.tabela} exportado ${d.exportado}, no destino ${d.resultado}`).join("; ") : "todas as tabelas batem"}`);
}

// ---------------------------------------------------------------- Storage

const TIPOS = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  svg: "image/svg+xml", avif: "image/avif", heic: "image/heic", bmp: "image/bmp", ico: "image/x-icon",
  pdf: "application/pdf", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/x-m4v",
  mp3: "audio/mpeg", wav: "audio/wav", csv: "text/csv", txt: "text/plain", json: "application/json",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip", html: "text/html",
};

// Sem contentType o supabase-js envia text/plain, e PDFs e imagens chegariam
// com o tipo errado.
function tipoPorExtensao(caminho) {
  const ext = path.extname(caminho).slice(1).toLowerCase();
  return TIPOS[ext] ?? "application/octet-stream";
}

const ehLocal = (host) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || /\.(localhost|test)(:\d+)?$/.test(host);

async function enviarArquivos(pasta, opt) {
  const base = path.join(pasta, "arquivos");
  if (!existsSync(base)) {
    console.log("\nSem pasta arquivos/ na exportação: nada a enviar ao Storage.");
    return true;
  }
  let urlDestino = opt.url;
  if (!urlDestino) {
    const env = await lerEnv(opt.envFile);
    urlDestino = env.VITE_PUBLIC_SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  }
  if (!urlDestino) throw new Error(`URL do destino não encontrada (use --url ou VITE_PUBLIC_SUPABASE_URL em ${opt.envFile})`);
  const host = new URL(urlDestino).host;

  let chave;
  if (opt.url && !opt.serviceEnv) {
    chave = await perguntar(`SERVICE_ROLE_KEY de ${host} (não aparece): `, true);
  } else {
    chave = (await lerEnv(opt.serviceEnv ?? "docker/supabase/.env")).SERVICE_ROLE_KEY;
  }
  if (!chave) throw new Error("SERVICE_ROLE_KEY do destino não informada");

  const todos = await listarArquivos(base);
  console.log(`\nStorage: ${todos.length} arquivo(s) para ${urlDestino}`);
  if (!ehLocal(host) && !opt.sim) {
    const conf = await perguntar(`Destino não é local. Digite "${host}" para confirmar: `);
    if (conf !== host) throw new Error("envio cancelado: confirmação não confere");
  }

  const sb = createClient(urlDestino, chave, { auth: { persistSession: false } });
  let ok = 0;
  const falhas = [];
  for (const rel of todos) {
    const [bucket, ...resto] = rel.split("/");
    const caminho = resto.join("/");
    const corpo = await readFile(path.join(base, rel));
    let erro = null;
    for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
      const { error } = await sb.storage.from(bucket).upload(caminho, corpo, { upsert: true, contentType: tipoPorExtensao(caminho) });
      erro = error;
      // erro de rede ou 5xx: tenta de novo; recusa (4xx) não muda tentando
      const status = Number(error?.statusCode ?? error?.status ?? 0);
      if (!error || (status >= 400 && status < 500)) break;
    }
    if (erro) falhas.push(`${bucket}/${caminho}: ${erro.message}`);
    else ok += 1;
    if ((ok + falhas.length) % 50 === 0) console.log(`  ${ok + falhas.length} de ${todos.length}...`);
  }
  console.log(`Arquivos enviados ao Storage: ${ok} de ${todos.length}`);
  for (const f of falhas.slice(0, 20)) console.log(`  falha: ${f}`);
  if (falhas.length > 20) console.log(`  ... e mais ${falhas.length - 20}`);
  return falhas.length === 0;
}

// ---------------------------------------------------------------- principal

async function main() {
  const opt = args();
  if (!opt.pasta) throw new Error("informe --pasta <pasta da exportação>");
  if (opt.gerarSql && opt.soArquivos) throw new Error("--gerar-sql e --so-arquivos são etapas separadas: rode uma de cada vez");
  if (!(opt.limiteKb >= 50)) throw new Error("--limite-kb precisa ser pelo menos 50");
  const pasta = path.resolve(opt.pasta);
  const manifesto = JSON.parse(await readFile(path.join(pasta, "manifesto.json"), "utf8"));
  console.log(`Exportação: ${manifesto.origem} em ${manifesto.iniciado_em}`);

  if (opt.soArquivos) {
    const tudoOk = await enviarArquivos(pasta, opt);
    if (!tudoOk) process.exitCode = 1;
    return;
  }

  const usuarios = JSON.parse(await readFile(path.join(pasta, "usuarios.json"), "utf8"));
  const dados = {};
  for (const f of (await readdir(path.join(pasta, "dados"))).sort()) {
    if (f.endsWith(".json")) dados[f.slice(0, -5)] = JSON.parse(await readFile(path.join(pasta, "dados", f), "utf8"));
  }

  const semEmail = usuarios.filter((u) => !u.email);
  if (semEmail.length) console.warn(`ATENÇÃO: ${semEmail.length} usuário(s) sem e-mail viram usuário-fantasma inativo (complete emails-pendentes.csv/usuarios.json para criá-los de verdade).\n`);

  if (opt.gerarSql) {
    const partes = montarPartes(dados, usuarios, opt, opt.limiteKb * 1024);
    if (opt.ensaio && partes.length > 1) {
      throw new Error(`o ensaio precisa caber numa parte só (cada parte desfaz a anterior), e ficou com ${partes.length}. Aumente --limite-kb ou ensaie direto em homologação, resetando o banco depois.`);
    }
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(pasta, `studio-${carimbo}`);
    await mkdir(dir, { recursive: true });
    const total = String(partes.length).padStart(2, "0");
    for (const [i, sql] of partes.entries()) {
      const n = String(i + 1).padStart(2, "0");
      const cabecalho = `-- Importação do Lovable — parte ${n} de ${total}${opt.ensaio ? " (ENSAIO: termina em rollback)" : ""}
-- Gerado por supabase/tools/migracao-lovable/importar.mjs a partir de ${manifesto.origem} (${manifesto.iniciado_em}).
-- Cole o arquivo INTEIRO no SQL Editor do Studio e execute; as partes vão em ordem.
-- Cada parte é uma transação: em erro, nada dela fica gravado e dá para executá-la de novo.
-- CONTÉM DADOS PESSOAIS (LGPD): não compartilhe e apague depois da importação.\n\n`;
      await writeFile(path.join(dir, `parte-${n}-de-${total}.sql`), cabecalho + sql);
      console.log(`  parte-${n}-de-${total}.sql  ${(peso(cabecalho + sql) / 1024).toFixed(0).padStart(6)} KB`);
    }
    console.log(`\nSQL gravado em ${dir}`);
    console.log("Cole cada parte, em ordem, no SQL Editor do Studio do ambiente. O resultado de cada uma é o relatório da carga;");
    console.log("a última valida as FKs e traz a conferência (exportado x no destino) de todas as tabelas.");
    console.log("Depois: --so-arquivos --url <url do ambiente> para o Storage.");
    return;
  }

  console.log(`Destino:    container ${opt.container}${opt.ensaio ? "  (ENSAIO: rollback no fim)" : ""}\n`);

  // 1. banco
  const [sql] = montarPartes(dados, usuarios, opt, Number.MAX_SAFE_INTEGER);
  const arquivoSql = path.join(pasta, `importacao-${Date.now()}.sql`);
  await writeFile(arquivoSql, sql);
  let saida;
  try {
    saida = await psql(opt.container, arquivoSql);
  } finally {
    await writeFile(arquivoSql, "-- removido após a execução (continha os dados)\n");
  }
  imprimirRelatorio(lerRelatorio(saida.out), usuarios);

  // 2. arquivos
  let tudoOk = true;
  if (!opt.semArquivos && !opt.ensaio) tudoOk = await enviarArquivos(pasta, opt);

  console.log(opt.ensaio ? "\nENSAIO concluído: nada foi gravado." : "\nImportação concluída.");
  console.log("Os usuários migrados precisam redefinir a senha (fluxo \"esqueci minha senha\").");
  if (!tudoOk) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\nFALHA: ${e.message}`);
  process.exit(1);
});
