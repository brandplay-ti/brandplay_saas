#!/usr/bin/env node
// Exporta os dados do BrandPlay no Lovable Cloud usando o LOGIN DE UM OWNER
// (caminho sem acesso privilegiado; ver docs/architecture/plano-migracao-dados-lovable-vps.md).
//
// O que faz:
//   1. entra com e-mail/senha do owner (a senha é digitada na hora e não é salva);
//   2. exporta as 71 tabelas de public, paginando pela chave primária, até onde a
//      RLS deixa esse usuário ver (um owner vê a organização inteira);
//   3. baixa os arquivos do Storage referenciados pelas linhas exportadas e os que
//      a listagem dos buckets mostrar;
//   4. monta usuarios.json (membros, papéis, acesso ao portal) cruzando e-mails de
//      convites e do log de auditoria da equipe, e emails-pendentes.csv com quem
//      ficou sem e-mail (as senhas NÃO são exportáveis por este caminho).
//
// Uso (raiz do repositório):
//   node supabase/tools/migracao-lovable/exportar.mjs --env-file .env.lovable
//
// Opções:
//   --env-file <arq>  arquivo com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
//                     (padrão: .env.lovable, não versionado; o antigo .env da
//                     raiz apontava para um projeto antigo do Lovable)
//   --saida <dir>     pasta de saída (padrão: .migracao-lovable/<data-hora>)
//   --sem-arquivos    não baixa o Storage
//   --complementar <dir>  NÃO exporta tabelas: tenta de novo o que ainda falta no
//                     disco (falhas do manifesto + paths das tabelas + listagem
//                     dos buckets com a sessão atual) e atualiza o manifesto.
//                     No Lovable, brandtrack-media e proposals só deixam o próprio
//                     autor do upload ler — "Object not found" é a RLS escondendo
//                     o arquivo. Rode com a sessão de quem enviou, ou com
//                     --service-role se o Lovable Cloud entregar a service role.
//   --relatar         só lista o que falta, agrupado pelo dono (primeira pasta
//                     do path). Não entra no Lovable. Use com --complementar.
//   --service-role    usa a service_role do projeto de origem (bypass de RLS).
//                     A chave é pedida no terminal e não é gravada. Caminho
//                     preferido quando o Lovable Cloud a expõe: baixa tudo
//                     numa tacada, sem precisar da sessão de cada autor.
//   --sessao <arq.json>   entra com uma sessão já aberta no navegador em vez de
//                     e-mail/senha (contas criadas com login social não têm senha).
//                     O arquivo é o valor da chave sb-<projeto>-auth-token do
//                     Local Storage do app logado (JSON com access_token e
//                     refresh_token). É uma credencial: rode na máquina de quem
//                     é dono da sessão, apague o arquivo depois e clique em "Sair"
//                     no app para revogar a sessão.
//
// Credenciais: digitadas no terminal. Para automação local (ex.: testar contra o
// Supabase local com o usuário do seed) aceita EXPORT_EMAIL/EXPORT_PASSWORD e
// EXPORT_SERVICE_ROLE no ambiente; não use variável de ambiente com a senha
// ou a service role reais (ficam no histórico).
//
// A saída contém DADOS REAIS DE CLIENTES (LGPD): fica fora do git
// (.migracao-lovable/ no .gitignore), não deve ser compartilhada e deve ser
// apagada depois da migração.

import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

// Tabela -> colunas da chave primária (ordem estável de paginação).
// Gerado do schema (0001..0019), idêntico ao do Lovable em tabelas e colunas.
const TABELAS = {
  ai_conversations: ["id"],
  ai_messages: ["id"],
  ai_suggestions: ["id"],
  asset_allocations: ["id"],
  asset_photos: ["id"],
  assets: ["id"],
  backend_error_logs: ["id"],
  brandtrack_brands: ["id"],
  brandtrack_detections: ["id"],
  brandtrack_event_brands: ["id"],
  brandtrack_events: ["id"],
  brandtrack_media: ["id"],
  contract_assets: ["id"],
  contract_churn_risk: ["contract_id"],
  contract_clause_templates: ["id"],
  contract_clauses: ["id"],
  contracts: ["id"],
  crm_tasks: ["id"],
  deliveries: ["id"],
  delivery_approval_log: ["id"],
  delivery_attachments: ["id"],
  error_reports: ["id"],
  installments: ["id"],
  lead_scores: ["id"],
  market_benchmarks: ["id"],
  notification_preferences: ["user_id"],
  notifications: ["id"],
  opportunities: ["id"],
  opportunity_activities: ["id"],
  opportunity_audit_logs: ["id"],
  opportunity_comment_attachments: ["id"],
  opportunity_comments: ["id"],
  opportunity_contacts: ["id"],
  organization_invites: ["id"],
  organization_members: ["id"],
  organizations: ["id"],
  pipeline_funnels: ["id"],
  pipeline_stage_slas: ["id"],
  profiles: ["id"],
  property_checklist_items: ["id"],
  property_events: ["id"],
  property_leads: ["id"],
  property_media: ["id"],
  proposal_items: ["id"],
  proposal_versions: ["id"],
  proposals: ["id"],
  sellout_reports: ["id"],
  sponsor_audit_logs: ["id"],
  sponsor_brands: ["id"],
  sponsor_brandtrack_profiles: ["id"],
  sponsor_contacts: ["id"],
  sponsor_contract_profiles: ["id"],
  sponsor_crm_profiles: ["id"],
  sponsor_delivery_profiles: ["id"],
  sponsor_documents: ["id"],
  sponsor_executive_summaries: ["sponsor_id"],
  sponsor_finance_profiles: ["id"],
  sponsor_interactions: ["id"],
  sponsor_invites: ["id"],
  sponsor_portal_access: ["id"],
  sponsor_portal_profiles: ["id"],
  sponsor_proposal_profiles: ["id"],
  sponsors: ["id"],
  sponsorship_tiers: ["id"],
  sports_properties: ["id"],
  team_audit_log: ["id"],
  tier_assets: ["id"],
  tier_sales: ["id"],
  user_dashboard_preferences: ["user_id", "organization_id"],
  user_roles: ["id"],
  user_stage_probabilities: ["user_id", "organization_id", "stage"],
};

// Buckets do Lovable (10) + sponsor-documents (só no self-hosted).
const BUCKETS = [
  "asset-photos", "property-media", "sponsor-logos", "org-logos", "delivery-evidence",
  "contracts", "brandtrack-media", "opportunity-comments", "proposals", "sponsor-interactions",
  "sponsor-documents",
];

// Coluna -> bucket, confirmado no código (supabase.storage.from(...)). Colunas
// *_path fora desta lista são procuradas em todos os buckets.
const COLUNA_BUCKET = {
  "asset_photos.storage_path": "asset-photos",
  "sports_properties.public_cover_path": "asset-photos",
  "property_media.storage_path": "property-media",
  "property_media.thumbnail_path": "property-media",
  "sponsors.logo_path": "sponsor-logos",
  "sponsor_brands.logo_path": "sponsor-logos",
  "organizations.logo_path": "org-logos",
  "delivery_attachments.storage_path": "delivery-evidence",
  "property_checklist_items.evidence_path": "delivery-evidence",
  "contracts.file_path": "contracts",
  "contracts.pdf_path": "contracts",
  "brandtrack_media.storage_path": "brandtrack-media",
  "brandtrack_media.thumbnail_path": "brandtrack-media",
  "brandtrack_detections.evidence_path": "brandtrack-media",
  "opportunity_comment_attachments.storage_path": "opportunity-comments",
  "proposals.pdf_path": "proposals",
  "sponsor_interactions.attachment_url": "sponsor-interactions",
  "sponsor_documents.file_path": "sponsor-documents",
  "brandtrack_brands.logo_path": "sponsor-logos",
};

const PAGINA = 1000;

// ---------------------------------------------------------------- utilidades
function args() {
  const a = process.argv.slice(2);
  const get = (k) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    envFile: get("--env-file") ?? ".env.lovable",
    saida: get("--saida"),
    semArquivos: a.includes("--sem-arquivos"),
    complementar: get("--complementar"),
    relatar: a.includes("--relatar"),
    serviceRole: a.includes("--service-role"),
    sessao: get("--sessao"),
  };
}

async function lerEnv(arquivo) {
  if (!existsSync(arquivo)) throw new Error(`arquivo de ambiente não encontrado: ${arquivo}`);
  const vars = {};
  for (const linha of (await readFile(arquivo, "utf8")).split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vars;
}

function perguntar(texto, oculto = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      rl._writeToOutput = (s) => {
        if (s.includes(texto)) rl.output.write(s);
      };
    }
    rl.question(texto, (r) => {
      rl.close();
      if (oculto) process.stdout.write("\n");
      resolve(r.trim());
    });
  });
}

function caminhoSeguro(base, ...partes) {
  const destino = path.resolve(base, ...partes);
  if (!destino.startsWith(path.resolve(base) + path.sep)) {
    throw new Error(`caminho fora da pasta de saída: ${partes.join("/")}`);
  }
  return destino;
}

// Extrai {bucket, caminho} de um valor de coluna: caminho puro ou URL do Storage.
function refStorage(valor, bucketPadrao) {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const v = valor.trim();
  const m = v.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/);
  if (m) return { bucket: decodeURIComponent(m[1]), caminho: decodeURIComponent(m[2]) };
  if (/^https?:\/\//i.test(v)) return null; // link externo
  return { bucket: bucketPadrao ?? null, caminho: v.replace(/^\/+/, "") };
}

// ---------------------------------------------------------------- exportação
async function exportarTabela(sb, tabela, pk) {
  const linhas = [];
  for (let de = 0; ; de += PAGINA) {
    let q = sb.from(tabela).select("*");
    for (const col of pk) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(de, de + PAGINA - 1);
    if (error) return { linhas, erro: `${error.code ?? ""} ${error.message}`.trim() };
    linhas.push(...data);
    if (data.length < PAGINA) return { linhas, erro: null };
  }
}

async function listarBucket(sb, bucket, prefixo = "", acc = [], profundidade = 0) {
  if (profundidade > 8) return acc;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(prefixo, { limit: 1000, offset });
    if (error || !data) return acc;
    for (const item of data) {
      const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
      if (item.id === null) await listarBucket(sb, bucket, caminho, acc, profundidade + 1); // pasta
      else acc.push(caminho);
    }
    if (data.length < 1000) return acc;
  }
}

function erroTransitorio(msg) {
  return /fetch|network|timeout|ECONNRESET|ETIMEDOUT|503|502|429|temporar/i.test(msg ?? "");
}

async function baixar(sb, bucket, caminho, base) {
  let ultimo = "sem conteúdo";
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    const { data, error } = await sb.storage.from(bucket).download(caminho);
    if (!error && data) {
      const destino = caminhoSeguro(base, bucket, ...caminho.split("/"));
      await mkdir(path.dirname(destino), { recursive: true });
      const buf = Buffer.from(await data.arrayBuffer());
      await writeFile(destino, buf);
      return { ok: true, bytes: buf.length };
    }
    ultimo = error?.message ?? "sem conteúdo";
    if (!erroTransitorio(ultimo) || tentativa === 3) break;
    await new Promise((r) => setTimeout(r, 1000 * tentativa));
  }
  return { ok: false, erro: ultimo };
}

function coletarRefs(dados) {
  const alvo = new Map();
  for (const [tabela, linhas] of Object.entries(dados)) {
    for (const linha of linhas) {
      for (const [col, valor] of Object.entries(linha)) {
        const chaveCol = `${tabela}.${col}`;
        const mapeada = COLUNA_BUCKET[chaveCol];
        if (!mapeada && !/_path$/.test(col)) continue;
        const ref = refStorage(valor, mapeada);
        if (!ref) continue;
        const k = `${ref.bucket ?? "*"}|${ref.caminho}`;
        if (!alvo.has(k)) alvo.set(k, ref);
      }
    }
  }
  return alvo;
}

async function lerDados(saida) {
  const dir = path.join(saida, "dados");
  const dados = {};
  if (!existsSync(dir)) return dados;
  for (const nome of await readdir(dir)) {
    if (nome.endsWith(".json")) dados[nome.slice(0, -5)] = JSON.parse(await readFile(path.join(dir, nome), "utf8"));
  }
  return dados;
}

function arquivoNoDisco(saida, bucket, caminho) {
  if (!bucket || bucket === "(desconhecido)") return false;
  const destino = path.join(saida, "arquivos", bucket, ...caminho.split("/"));
  if (!existsSync(destino)) return false;
  try {
    return statSync(destino).size > 0;
  } catch {
    return false;
  }
}

function donoDoCaminho(caminho, usuarios) {
  const primeiro = caminho.split("/")[0];
  return usuarios.find((u) => u.user_id === primeiro) ?? null;
}

function imprimirPendentes(falhas, usuarios) {
  const grupos = new Map();
  for (const f of falhas) {
    const dono = donoDoCaminho(f.caminho, usuarios);
    const chave = dono?.user_id ?? "(outro)";
    const g = grupos.get(chave) ?? {
      user_id: dono?.user_id ?? null,
      nome: dono?.nome ?? "caminho sem user_id conhecido",
      email: dono?.email ?? null,
      buckets: new Map(),
    };
    g.buckets.set(f.bucket, (g.buckets.get(f.bucket) ?? 0) + 1);
    grupos.set(chave, g);
  }
  console.log(`Pendentes: ${falhas.length}`);
  for (const g of grupos.values()) {
    const quem = g.email ? `${g.nome ?? "?"} <${g.email}>` : (g.nome ?? "desconhecido");
    const porBucket = [...g.buckets.entries()].map(([b, n]) => `${b} ${n}`).join(", ");
    console.log(`  ${quem}: ${[...g.buckets.values()].reduce((a, n) => a + n, 0)} (${porBucket})`);
  }
}

// ---------------------------------------------------------------- autenticação
async function entrar(sb, opt) {
  if (opt.sessao) {
    let s;
    try {
      s = JSON.parse(await readFile(opt.sessao, "utf8"));
    } catch {
      throw new Error(`não consegui ler a sessão em ${opt.sessao} (esperado o JSON da chave sb-<projeto>-auth-token)`);
    }
    const sessao = s.currentSession ?? s; // formatos antigos guardavam em currentSession
    if (!sessao.access_token || !sessao.refresh_token) throw new Error("a sessão precisa ter access_token e refresh_token");
    const { data, error } = await sb.auth.setSession({ access_token: sessao.access_token, refresh_token: sessao.refresh_token });
    if (error || !data?.user) throw new Error(`sessão inválida ou expirada: ${error?.message ?? "sem usuário"} (entre de novo no app e copie outra vez)`);
    return data;
  }
  const email = process.env.EXPORT_EMAIL || (await perguntar("E-mail do owner: "));
  const senha = process.env.EXPORT_PASSWORD || (await perguntar("Senha (não aparece): ", true));
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error || !data?.user) throw new Error(`login falhou: ${error?.message ?? "sem usuário"}`);
  return data;
}

// ---------------------------------------------------------------- complemento de arquivos
async function complementar(sb, saida, eu, { soRelatar = false } = {}) {
  const arqManifesto = path.join(saida, "manifesto.json");
  if (!existsSync(arqManifesto)) throw new Error(`manifesto.json não encontrado em ${saida}`);
  const manifesto = JSON.parse(await readFile(arqManifesto, "utf8"));
  const usuarios = existsSync(path.join(saida, "usuarios.json"))
    ? JSON.parse(await readFile(path.join(saida, "usuarios.json"), "utf8"))
    : [];

  const alvo = coletarRefs(await lerDados(saida));
  for (const f of manifesto.arquivos?.falhas ?? []) {
    const k = `${f.bucket && f.bucket !== "(desconhecido)" ? f.bucket : "*"}|${f.caminho}`;
    if (!alvo.has(k)) alvo.set(k, { bucket: f.bucket === "(desconhecido)" ? null : f.bucket, caminho: f.caminho });
  }

  if (sb) {
    for (const bucket of BUCKETS) {
      for (const caminho of await listarBucket(sb, bucket)) {
        const k = `${bucket}|${caminho}`;
        if (!alvo.has(k)) alvo.set(k, { bucket, caminho });
      }
    }
  }

  const pendentes = [];
  for (const ref of alvo.values()) {
    if (ref.bucket && arquivoNoDisco(saida, ref.bucket, ref.caminho)) continue;
    if (!ref.bucket && BUCKETS.some((b) => arquivoNoDisco(saida, b, ref.caminho))) continue;
    pendentes.push(ref);
  }

  console.log(`Referenciados: ${alvo.size}. Já no disco: ${alvo.size - pendentes.length}. Faltando: ${pendentes.length}`);
  imprimirPendentes(pendentes.map((p) => ({ bucket: p.bucket ?? "(desconhecido)", caminho: p.caminho })), usuarios);
  if (soRelatar || !sb) return;

  const restantes = [];
  let baixados = 0;
  let bytes = 0;
  let i = 0;
  for (const ref of pendentes) {
    i += 1;
    const candidatos = ref.bucket && BUCKETS.includes(ref.bucket) ? [ref.bucket] : BUCKETS;
    let r = null;
    for (const bucket of candidatos) {
      r = await baixar(sb, bucket, ref.caminho, path.join(saida, "arquivos"));
      if (r.ok) break;
    }
    if (r?.ok) {
      baixados += 1;
      bytes += r.bytes;
      if (i % 10 === 0 || i === pendentes.length) console.log(`  ${i} de ${pendentes.length}...`);
    } else {
      restantes.push({ bucket: ref.bucket ?? "(desconhecido)", caminho: ref.caminho, erro: r?.erro });
    }
  }

  manifesto.arquivos.baixados += baixados;
  manifesto.arquivos.bytes += bytes;
  manifesto.arquivos.falhas = restantes;
  manifesto.complementos = [...(manifesto.complementos ?? []), {
    em: new Date().toISOString(), por_user_id: eu, baixados, restantes: restantes.length,
  }];
  await writeFile(arqManifesto, JSON.stringify(manifesto, null, 2));
  console.log(`Baixados agora: ${baixados} (${(bytes / 1048576).toFixed(1)} MB). Ainda pendentes: ${restantes.length}`);
  if (restantes.length) imprimirPendentes(restantes, usuarios);
}

// ---------------------------------------------------------------- principal
async function main() {
  const opt = args();

  if (opt.relatar) {
    const pasta = opt.complementar ?? opt.saida;
    if (!pasta) throw new Error("--relatar precisa de --complementar <pasta da exportação>");
    await complementar(null, path.resolve(pasta), null, { soRelatar: true });
    return;
  }

  const env = await lerEnv(opt.envFile);
  const url = env.VITE_SUPABASE_URL;
  if (!url) throw new Error(`VITE_SUPABASE_URL ausente em ${opt.envFile}`);
  const chave = opt.serviceRole
    ? (process.env.EXPORT_SERVICE_ROLE || (await perguntar("SERVICE_ROLE_KEY do Lovable (não aparece): ", true)))
    : env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!chave) throw new Error(opt.serviceRole
    ? "SERVICE_ROLE_KEY do Lovable não informada"
    : `VITE_SUPABASE_PUBLISHABLE_KEY ausente em ${opt.envFile}`);

  const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
  const saida = path.resolve(opt.complementar ?? opt.saida ?? path.join(".migracao-lovable", carimbo));
  await mkdir(path.join(saida, "dados"), { recursive: true });

  console.log(`Origem: ${new URL(url).host}${opt.serviceRole ? "  (service_role: bypass de RLS)" : ""}`);
  console.log(`Saída:  ${saida}\n`);

  const sb = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: true } });
  let eu = "service_role";
  if (!opt.serviceRole) {
    const login = await entrar(sb, opt);
    eu = login.user.id;
  }

  if (opt.complementar) {
    await complementar(sb, saida, eu);
    if (!opt.serviceRole) await sb.auth.signOut({ scope: "local" });
    return;
  }

  let vinculosQuery = sb
    .from("organization_members")
    .select("organization_id, role, status, organization:organizations(name)");
  if (!opt.serviceRole) vinculosQuery = vinculosQuery.eq("user_id", eu);
  const { data: vinculos } = await vinculosQuery;
  console.log(opt.serviceRole ? "Organizações (service_role, todas):" : "Organizações deste usuário:");
  for (const v of vinculos ?? []) console.log(`  - ${v.organization?.name ?? v.organization_id} (${v.role}, ${v.status})`);
  if (!opt.serviceRole && !(vinculos ?? []).some((v) => ["owner", "admin"].includes(v.role) && v.status === "ativo")) {
    console.warn("\nATENÇÃO: o usuário não é owner/admin ativo; a exportação pode vir incompleta.");
  }
  console.log("");

  const manifesto = {
    origem: new URL(url).host,
    iniciado_em: new Date().toISOString(),
    exportado_por_user_id: eu,
    organizacoes: (vinculos ?? []).map((v) => ({ id: v.organization_id, nome: v.organization?.name, papel: v.role })),
    tabelas: {},
    arquivos: { referenciados: 0, listados: 0, baixados: 0, bytes: 0, falhas: [] },
    avisos: [],
  };

  // 1. tabelas
  const dados = {};
  for (const [tabela, pk] of Object.entries(TABELAS)) {
    const { linhas, erro } = await exportarTabela(sb, tabela, pk);
    dados[tabela] = linhas;
    await writeFile(path.join(saida, "dados", `${tabela}.json`), JSON.stringify(linhas, null, 2));
    manifesto.tabelas[tabela] = { linhas: linhas.length, erro };
    console.log(`${erro ? "ERRO" : "ok  "} ${tabela.padEnd(32)} ${String(linhas.length).padStart(6)}${erro ? `  ${erro}` : ""}`);
  }

  // 2. arquivos
  if (!opt.semArquivos) {
    console.log("\nArquivos do Storage...");
    const alvo = coletarRefs(dados);
    manifesto.arquivos.referenciados = alvo.size;

    for (const bucket of BUCKETS) {
      const listados = await listarBucket(sb, bucket);
      manifesto.arquivos.listados += listados.length;
      for (const caminho of listados) {
        const k = `${bucket}|${caminho}`;
        if (!alvo.has(k)) alvo.set(k, { bucket, caminho });
      }
    }

    const feitos = new Set();
    for (const ref of alvo.values()) {
      const candidatos = ref.bucket ? [ref.bucket] : BUCKETS;
      let resultado = null;
      for (const bucket of candidatos) {
        if (feitos.has(`${bucket}|${ref.caminho}`)) { resultado = { ok: true, bytes: 0, repetido: true }; break; }
        resultado = await baixar(sb, bucket, ref.caminho, path.join(saida, "arquivos"));
        if (resultado.ok) { feitos.add(`${bucket}|${ref.caminho}`); break; }
      }
      if (resultado?.ok) {
        if (!resultado.repetido) {
          manifesto.arquivos.baixados += 1;
          manifesto.arquivos.bytes += resultado.bytes;
        }
      } else {
        manifesto.arquivos.falhas.push({ bucket: ref.bucket ?? "(desconhecido)", caminho: ref.caminho, erro: resultado?.erro });
      }
    }
    console.log(`  referenciados no banco: ${manifesto.arquivos.referenciados}`);
    console.log(`  listados nos buckets:   ${manifesto.arquivos.listados}`);
    console.log(`  baixados:               ${manifesto.arquivos.baixados} (${(manifesto.arquivos.bytes / 1048576).toFixed(1)} MB)`);
    console.log(`  falhas:                 ${manifesto.arquivos.falhas.length}`);
  }

  // 3. usuários
  const emails = new Map();
  if (!opt.serviceRole) {
    const { data: sessao } = await sb.auth.getUser();
    if (sessao?.user?.email) emails.set(eu, sessao.user.email.toLowerCase());
  }
  for (const t of ["organization_invites", "sponsor_invites"]) {
    for (const c of dados[t] ?? []) if (c.accepted_user_id && c.email) emails.set(c.accepted_user_id, c.email.toLowerCase());
  }
  for (const a of dados.team_audit_log ?? []) {
    if (a.target_user_id && a.target_email && !emails.has(a.target_user_id)) emails.set(a.target_user_id, a.target_email.toLowerCase());
  }
  const perfis = new Map((dados.profiles ?? []).map((p) => [p.id, p]));
  const usuarios = new Map();
  const add = (userId, papel) => {
    if (!userId) return;
    const u = usuarios.get(userId) ?? { user_id: userId, nome: perfis.get(userId)?.full_name ?? null, email: emails.get(userId) ?? null, papeis: [] };
    u.papeis.push(papel);
    usuarios.set(userId, u);
  };
  for (const m of dados.organization_members ?? []) add(m.user_id, `membro:${m.role}:${m.status}`);
  for (const s of dados.sponsor_portal_access ?? []) add(s.user_id, `portal:${s.sponsor_id}:${s.status}`);
  const listaUsuarios = [...usuarios.values()];
  await writeFile(path.join(saida, "usuarios.json"), JSON.stringify(listaUsuarios, null, 2));
  const pendentes = listaUsuarios.filter((u) => !u.email);
  const csv = ["user_id;nome;papeis;email", ...pendentes.map((u) => `${u.user_id};${(u.nome ?? "").replace(/;/g, ",")};${u.papeis.join("|")};`)];
  await writeFile(path.join(saida, "emails-pendentes.csv"), csv.join("\n") + "\n");

  // 4. avisos e manifesto
  for (const [t, r] of Object.entries(manifesto.tabelas)) if (r.erro) manifesto.avisos.push(`tabela ${t}: ${r.erro}`);
  if (pendentes.length) manifesto.avisos.push(`${pendentes.length} usuário(s) sem e-mail: preencha emails-pendentes.csv`);
  manifesto.avisos.push("Senhas não são exportáveis por este caminho: os usuários precisarão redefinir a senha.");
  manifesto.avisos.push("Dados pessoais de outros usuários (notificações, conversas de IA, preferências) só vêm os do usuário exportador.");
  manifesto.usuarios = { total: listaUsuarios.length, sem_email: pendentes.length };
  manifesto.concluido_em = new Date().toISOString();
  await writeFile(path.join(saida, "manifesto.json"), JSON.stringify(manifesto, null, 2));

  if (!opt.serviceRole) await sb.auth.signOut({ scope: "local" });

  console.log(`\nUsuários: ${listaUsuarios.length} (sem e-mail: ${pendentes.length})`);
  if (manifesto.arquivos.falhas.length) {
    imprimirPendentes(manifesto.arquivos.falhas, listaUsuarios);
    console.log("Para completar: --complementar <pasta> com a sessão do dono, ou --service-role.");
  }
  console.log("Avisos:");
  for (const a of manifesto.avisos) console.log(`  - ${a}`);
  console.log(`\nConcluído. Manifesto: ${path.join(saida, "manifesto.json")}`);
  console.log("LEMBRETE: a pasta contém dados reais de clientes. Não compartilhe e apague após a migração.");
}

main().catch((e) => {
  console.error(`\nFALHA: ${e.message}`);
  process.exit(1);
});
