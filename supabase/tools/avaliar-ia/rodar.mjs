#!/usr/bin/env node
/**
 * IA-22 — avaliação rápida de fornecedores (conexão + smoke opcional de funções).
 * Só leitura/chamadas de teste; relatório local em saida/.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(__dir, '../../..');
const envPath = path.join(raiz, 'docker/supabase/.env');

const FORNECEDORES = [
  { id: 'gemini', env: 'AVALIAR_IA_GEMINI_KEY' },
  { id: 'openai', env: 'AVALIAR_IA_OPENAI_KEY' },
  { id: 'anthropic', env: 'AVALIAR_IA_ANTHROPIC_KEY' },
];

const MODELOS = {
  gemini: { rapido: 'gemini-3.5-flash-lite', padrao: 'gemini-3.6-flash', visao: 'gemini-3.6-flash' },
  openai: { rapido: 'gpt-5.4-mini', padrao: 'gpt-5.4-mini', visao: 'gpt-5.4-mini' },
  anthropic: { rapido: 'claude-haiku-5-5', padrao: 'claude-sonnet-5-5', visao: 'claude-sonnet-5-5' },
};

async function carregarEnv() {
  const map = { ...process.env };
  if (!existsSync(envPath)) return map;
  const texto = await readFile(envPath, 'utf8');
  for (const linha of texto.split(/\r?\n/)) {
    const t = linha.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in map) || !map[k]) map[k] = v;
  }
  return map;
}

function chaveDoFornecedor(env, id) {
  const direta = env[`AVALIAR_IA_${id.toUpperCase()}_KEY`]?.trim();
  if (direta) return direta;
  if (env.AI_DEFAULT_PROVIDER === id && env.AI_DEFAULT_API_KEY?.trim()) {
    return env.AI_DEFAULT_API_KEY.trim();
  }
  return '';
}

async function login(env, email, password) {
  const base = (env.API_EXTERNAL_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = env.ANON_KEY?.trim();
  if (!base || !anon) throw new Error('Defina API_EXTERNAL_URL e ANON_KEY no .env local.');
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Login falhou (${email}): ${body.error_description || body.msg || res.status}`);
  return { base, anon, token: body.access_token };
}

async function testarAdminAi(sessao, provider, apiKey) {
  const modelos = MODELOS[provider];
  const t0 = Date.now();
  const res = await fetch(`${sessao.base}/functions/v1/admin-ai`, {
    method: 'POST',
    headers: {
      apikey: sessao.anon,
      Authorization: `Bearer ${sessao.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'testar',
      provider,
      api_key: apiKey,
      model_rapido: modelos.rapido,
      model_padrao: modelos.padrao,
      model_visao: modelos.visao,
    }),
  });
  const ms = Date.now() - t0;
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && !data.error, ms, data };
}

async function invocarFuncao(sessao, nome, body) {
  const t0 = Date.now();
  const res = await fetch(`${sessao.base}/functions/v1/${nome}`, {
    method: 'POST',
    headers: {
      apikey: sessao.anon,
      Authorization: `Bearer ${sessao.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  const codigo = data?.codigo ?? data?.error?.codigo;
  return { ok: res.ok && !data?.error, ms, status: res.status, codigo, error: data?.error };
}

const SMOKE_FUNCOES = [
  {
    nome: 'prepare-meeting-ai',
    body: (orgId) => ({
      organization_id: orgId,
      sponsor_id: null,
      opportunity_id: null,
      notes: 'Reunião de alinhamento comercial (smoke IA-22).',
    }),
  },
];

async function main() {
  const comFuncoes = process.argv.includes('--funcoes');
  const env = await carregarEnv();
  const linhas = [`# Relatório IA-22 — ${new Date().toISOString()}`, ''];

  const superSessao = await login(env, 'superadmin@brandplay.local', 'brandplay-dev');
  linhas.push('## Teste de conexão (admin-ai / testar)', '');

  for (const f of FORNECEDORES) {
    const key = chaveDoFornecedor(env, f.id);
    if (!key) {
      linhas.push(`- **${f.id}**: chave não configurada — pulado`);
      continue;
    }
    try {
      const r = await testarAdminAi(superSessao, f.id, key);
      linhas.push(
        `- **${f.id}**: ${r.ok ? 'OK' : 'FALHA'} — ${r.ms} ms${r.data?.error ? ` — ${r.data.error}` : ''}`,
      );
    } catch (e) {
      linhas.push(`- **${f.id}**: erro — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (comFuncoes) {
    linhas.push('', '## Smoke de funções (owner + organização seed)', '');
    const ownerSessao = await login(env, 'owner@brandplay.local', 'brandplay-dev');
    const orgRes = await fetch(
      `${ownerSessao.base}/rest/v1/organizations?select=id&limit=1`,
      { headers: { apikey: ownerSessao.anon, Authorization: `Bearer ${ownerSessao.token}` } },
    );
    const orgs = await orgRes.json();
    const orgId = orgs?.[0]?.id;
    if (!orgId) {
      linhas.push('_Organização do seed não encontrada._');
    } else {
      for (const fn of SMOKE_FUNCOES) {
        const r = await invocarFuncao(ownerSessao, fn.nome, fn.body(orgId));
        linhas.push(
          `- **${fn.nome}**: ${r.ok ? 'OK' : 'FALHA'} — HTTP ${r.status}, ${r.ms} ms` +
            (r.codigo ? `, codigo \`${r.codigo}\`` : '') +
            (r.error ? ` — ${typeof r.error === 'string' ? r.error : JSON.stringify(r.error)}` : ''),
        );
      }
    }
  }

  linhas.push('', '---', '_Gerado por supabase/tools/avaliar-ia/rodar.mjs_');
  const saidaDir = path.join(__dir, 'saida');
  await mkdir(saidaDir, { recursive: true });
  const arquivo = path.join(saidaDir, `relatorio-${Date.now()}.md`);
  await writeFile(arquivo, linhas.join('\n'), 'utf8');
  console.log(linhas.join('\n'));
  console.log(`\nRelatório salvo em: ${arquivo}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
