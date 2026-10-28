// Pecas puras do diagnostico de homologacao.
//
// Nada aqui abre rede nem SSH. O comando que fala com a VPS e com o Dockploy
// esta em diagnosticar-ambiente.mjs; esta biblioteca so decide o que e seguro
// mostrar e o que ainda precisa ser executado por uma pessoa.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROTULOS_HOMOLOGACAO = new Set([
  'hml',
  'homolog',
  'homologacao',
  'staging',
  'test',
  'teste',
  'testes',
]);

const ROTULOS_PRODUCAO = new Set(['prod', 'producao', 'production']);

// GET fixos da API do Dokploy. O painel e o mesmo para os dois ambientes; a
// lista impede que um token colado neste comando dispare deploy, stop ou
// escrita de variavel.
const PROCEDIMENTOS_LEITURA = new Set([
  'project.all',
  'compose.one',
  'compose.loadServices',
  'compose.readLogs',
  'application.readLogs',
  'deployment.all',
  'deployment.allByCompose',
  'deployment.readLogs',
  'docker.getStackContainersByAppName',
]);

const CHAVES_IGNORADAS = [
  'DATABASE_URL',
  'SERVICE_ROLE_KEY',
  'POSTGRES_PASSWORD',
  'JWT_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'AI_KEYS_MASTER_KEY',
  'RESEND_API_KEY',
];

const SERVICOS_DE_LOG = ['db', 'auth', 'rest', 'kong', 'functions', 'storage', 'realtime'];

export function lerEnv(texto) {
  const saida = {};
  const ignoradas = [];
  for (const bruta of String(texto).split(/\r?\n/)) {
    const linha = bruta.trim().replace(/^export\s+/, '');
    if (!linha || linha.startsWith('#')) continue;
    const igual = linha.indexOf('=');
    if (igual <= 0) continue;
    const chave = linha.slice(0, igual).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(chave)) continue;
    let valor = linha.slice(igual + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"') && valor.length >= 2) ||
      (valor.startsWith("'") && valor.endsWith("'") && valor.length >= 2)
    ) {
      valor = valor.slice(1, -1);
    }
    if (CHAVES_IGNORADAS.includes(chave)) {
      if (valor) ignoradas.push(chave);
      continue;
    }
    saida[chave] = valor;
  }
  return { env: saida, ignoradas };
}

const APELIDOS = [
  ['SUPABASE_URL', ['VITE_SUPABASE_URL', 'VITE_PUBLIC_SUPABASE_URL']],
  [
    'SUPABASE_ANON_KEY',
    ['VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_PUBLIC_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'],
  ],
  ['PORTAL_URL', ['VITE_PORTAL_URL']],
];

// O arquivo que a pessoa monta no Vite usa outros nomes. Sem AMBIENTE explicito,
// a URL de homologacao basta: producao continua recusada pelo rotulo do host.
export function normalizarEnvDiagnostico(env) {
  const saida = { ...env };
  for (const [destino, fontes] of APELIDOS) {
    if (saida[destino]) continue;
    for (const fonte of fontes) {
      if (saida[fonte]) {
        saida[destino] = saida[fonte];
        break;
      }
    }
  }
  if (!saida.AMBIENTE && saida.SUPABASE_URL) {
    try {
      afirmarUrlDeHomologacao(saida.SUPABASE_URL, 'SUPABASE_URL');
      saida.AMBIENTE = 'homologacao';
    } catch {
      // Host que nao e de homologacao fica sem AMBIENTE para o comando recusar.
    }
  }
  return saida;
}

export function afirmarUrlHttps(urlString, rotulo) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`${rotulo} nao e uma URL`);
  }
  if (url.username || url.password) {
    throw new Error(`${rotulo} nao pode trazer usuario ou senha na URL`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${rotulo} precisa ser https`);
  }
  return url;
}

export function afirmarHostDeHomologacao(hostname) {
  const rotulos = String(hostname).toLowerCase().split('.').filter(Boolean);
  if (rotulos.some((rotulo) => ROTULOS_PRODUCAO.has(rotulo))) {
    throw new Error(`host recusado (${hostname}): rotulo de producao`);
  }
  if (!rotulos.some((rotulo) => ROTULOS_HOMOLOGACAO.has(rotulo))) {
    throw new Error(
      `host recusado (${hostname}): use um host com rotulo hml, homologacao, staging ou teste`,
    );
  }
}

export function afirmarUrlDeHomologacao(urlString, rotulo) {
  const url = afirmarUrlHttps(urlString, rotulo);
  afirmarHostDeHomologacao(url.hostname);
  return url.origin;
}

export function afirmarDestinoSsh(usuario, host) {
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(usuario)) {
    throw new Error('VPS_USER invalido');
  }
  if (
    !/^[A-Za-z0-9.-]{1,253}$/.test(host) ||
    host.startsWith('.') ||
    host.endsWith('.') ||
    host.includes('..')
  ) {
    throw new Error('VPS_HOST invalido');
  }
}

export function afirmarProcedimentoDeLeitura(nome) {
  if (!PROCEDIMENTOS_LEITURA.has(nome)) {
    throw new Error(`procedimento recusado: ${nome}`);
  }
}

export function origemDockploy(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error('DOCKPLOY_URL nao e uma URL');
  }
  if (url.username || url.password) {
    throw new Error('DOCKPLOY_URL nao pode trazer usuario ou senha na URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('DOCKPLOY_URL precisa ser http ou https');
  }
  return { origin: url.origin, emClaro: url.protocol === 'http:' };
}

export function montarUrlDockploy(origem, procedimento, params = {}) {
  afirmarProcedimentoDeLeitura(procedimento);
  const base = origemDockploy(origem);
  const url = new URL(`/api/${procedimento}`, base.origin);
  for (const [chave, valor] of Object.entries(params)) {
    if (valor == null || valor === '') continue;
    if (!/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(chave)) {
      throw new Error('parametro recusado');
    }
    const texto = String(valor);
    if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(texto)) {
      throw new Error('valor de parametro recusado');
    }
    url.searchParams.set(chave, texto);
  }
  return url;
}

export function ocultar(texto, segredos = []) {
  let saida = redigirSegredos(texto);
  for (const segredo of segredos) {
    if (typeof segredo === 'string' && segredo.length >= 8) {
      saida = saida.split(segredo).join('[redigido]');
    }
  }
  return saida;
}

export function redigirSegredos(texto) {
  return String(texto)
    .replace(/postgres(?:ql)?:\/\/[^:\s/]+:[^@\s/]+@/gi, 'postgres://***:***@')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[jwt]')
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+\b/g, '[stripe]')
    .replace(
      /((?:api[_-]?key|secret|password|token|authorization)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi,
      '$1[redigido]',
    );
}

export function listarMigrationsLocais(diretorio) {
  const nomes = readdirSync(diretorio)
    .filter((nome) => nome.endsWith('.sql'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return nomes.map((nome) => {
    const conteudo = readFileSync(join(diretorio, nome));
    return {
      version: nome.slice(0, -'.sql'.length),
      checksum: createHash('sha256').update(conteudo).digest('hex'),
    };
  });
}

export function compararMigrations(locais, remotas) {
  const remotoPorVersao = new Map(remotas.map((item) => [item.version, item.checksum ?? '']));
  const localPorVersao = new Map(locais.map((item) => [item.version, item.checksum ?? '']));
  const pendentes = [];
  const divergentes = [];
  for (const local of locais) {
    if (!remotoPorVersao.has(local.version)) {
      pendentes.push(local.version);
      continue;
    }
    const checksumRemoto = remotoPorVersao.get(local.version) ?? '';
    if (checksumRemoto && local.checksum && checksumRemoto !== local.checksum) {
      divergentes.push(local.version);
    }
  }
  const extras = remotas
    .map((item) => item.version)
    .filter((versao) => versao && !localPorVersao.has(versao));
  return { pendentes, divergentes, extras };
}

export function separarSecoes(texto) {
  const secoes = {};
  let atual = '';
  let buffer = [];
  const gravar = () => {
    if (atual) secoes[atual] = buffer.join('\n').trim();
  };
  for (const linha of String(texto).split(/\r?\n/)) {
    const marca = /^--DIAG:([A-Z]+)\s*$/.exec(linha.trim());
    if (marca) {
      gravar();
      atual = marca[1];
      buffer = [];
      continue;
    }
    buffer.push(linha);
  }
  gravar();
  return secoes;
}

export function montarSinais(secoes) {
  const sinais = {};
  for (const linha of String(secoes.SINAIS ?? '').split(/\r?\n/)) {
    const idx = linha.indexOf('=');
    if (idx <= 0) continue;
    sinais[linha.slice(0, idx).trim()] = linha.slice(idx + 1).trim();
  }
  const gotrue = String(secoes.GOTRUE ?? '')
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .find(Boolean);
  if (gotrue) sinais.gotrue = gotrue;
  const organizations = String(secoes.ORGANIZATIONS ?? '')
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .find(Boolean);
  if (organizations) sinais.organizations = organizations;
  return sinais;
}

export function interpretarMigrations(texto) {
  return String(texto)
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha && linha !== '__sem_tabela__')
    .map((linha) => {
      const [version, checksum = ''] = linha.split('\t');
      return { version: version.trim(), checksum: checksum.trim() };
    })
    .filter((item) => item.version);
}

export function interpretarErros(texto) {
  const linhas = String(texto)
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);
  if (linhas.length === 1 && linhas[0] === '__sem_tabela__') {
    return { ausente: true, itens: [] };
  }
  const itens = linhas.map((linha) => {
    const [quando = '', tabela = '', acao = '', codigo = '', ...resto] = linha.split('\t');
    return {
      quando,
      tabela,
      acao,
      codigo,
      mensagem: redigirSegredos(resto.join('\t')),
    };
  });
  return { ausente: false, itens };
}

export function bancoPronto(sinais) {
  const gotrue = Number(sinais.gotrue);
  return Number.isFinite(gotrue) && gotrue > 0 && sinais.storage === 'true';
}

export function textoDoQueExecutar({ pendentes, divergentes, extras, sinais, totalLocal }) {
  const blocos = [];
  const pronto = bancoPronto(sinais);

  if (!pronto) {
    blocos.push(
      [
        'Nao aplique migration agora.',
        'O GoTrue ainda nao terminou ou storage.buckets ainda nao existe.',
        'Espere os servicos do compose ficarem saudaveis e rode este diagnostico de novo.',
        'O criterio esta em docs/runbooks/primeira-carga.md.',
      ].join(' '),
    );
  }

  if (pendentes.length > 0 && !pronto) {
    blocos.push(
      `Quando o stack estiver pronto, as pendentes desta arvore sao: ${pendentes.join(', ')}.`,
    );
  }

  if (divergentes.length > 0) {
    blocos.push(
      [
        `Checksum diferente em migration ja aplicada: ${divergentes.join(', ')}.`,
        'Nao reaplique esses arquivos. O runner ignora versao que ja esta em migrations.schema_migrations.',
        'A correcao e uma migration nova.',
        'Se a arvore local estiver com CRLF, o hash muda sem o SQL ter mudado: confira com git ls-files --eol supabase/migrations.',
      ].join(' '),
    );
  }

  if (extras.length > 0) {
    blocos.push(
      [
        `O banco tem versoes que nao estao nesta pasta: ${extras.join(', ')}.`,
        'Nao apague nada. Confira se esta maquina esta na branch que voce quer comparar.',
      ].join(' '),
    );
  }

  if (pendentes.length > 0 && pronto) {
    const todas = totalLocal > 0 && pendentes.length === totalLocal;
    blocos.push(
      todas
        ? `Nenhuma migration desta pasta esta aplicada. A primeira carga e o Caminho B de docs/runbooks/primeira-carga.md, depois do backup se o banco ja tiver dado.`
        : `Pendentes em relacao a esta arvore de trabalho: ${pendentes.join(', ')}.`,
    );
    blocos.push(
      [
        'Este comando nao aplicou nada. Quem aplica e o clone na VPS, nao os arquivos daqui.',
        'Atualize esse clone para o commit que contem as pendentes, faca backup (docs/runbooks/backup.md) e rode, na VPS:',
        '',
        '  set -a; . /etc/brandplay/homologacao.env; set +a',
        '  cd "${VPS_APP_DIR:-/opt/brandplay}"',
        '  docker run --rm --network "$SUPABASE_NETWORK" -v "$PWD/supabase:/supabase:ro" -e DATABASE_URL \\',
        '    postgres:17-alpine sh /supabase/tools/migrate.sh --status',
        '',
        'Se o status bater com a lista acima, troque `--status` por nada para aplicar:',
        '',
        '  docker run --rm --network "$SUPABASE_NETWORK" -v "$PWD/supabase:/supabase:ro" \\',
        '    -e DATABASE_URL -e LOCK_TIMEOUT=5s -e STATEMENT_TIMEOUT=5min \\',
        '    postgres:17-alpine sh /supabase/tools/migrate.sh',
      ].join('\n'),
    );
  }

  if (pendentes.length === 0 && divergentes.length === 0 && pronto) {
    blocos.push('Nenhuma migration pendente. Nada de banco para executar.');
  }

  return blocos.join('\n\n');
}

export function extrairServicos(no, contexto = {}, saida = []) {
  if (Array.isArray(no)) {
    for (const item of no) extrairServicos(item, contexto, saida);
    return deduplicarServicos(saida);
  }
  if (!no || typeof no !== 'object') return deduplicarServicos(saida);

  const proximo = { ...contexto };
  if (typeof no.projectId === 'string' && typeof no.name === 'string') {
    proximo.projeto = no.name;
  }
  if (
    typeof no.environmentId === 'string' &&
    typeof no.name === 'string' &&
    no.composeId == null &&
    no.applicationId == null &&
    no.projectId == null
  ) {
    proximo.ambiente = no.name;
  }
  if (typeof no.composeId === 'string') {
    saida.push({
      tipo: 'compose',
      id: no.composeId,
      nome: textoCurto(no.name ?? no.appName ?? no.composeId),
      appName: textoCurto(no.appName ?? ''),
      status: textoCurto(no.composeStatus ?? ''),
      projeto: proximo.projeto ?? '',
      ambiente: proximo.ambiente ?? '',
      hosts: coletarHosts(no),
    });
  }
  if (typeof no.applicationId === 'string') {
    saida.push({
      tipo: 'application',
      id: no.applicationId,
      nome: textoCurto(no.name ?? no.appName ?? no.applicationId),
      appName: textoCurto(no.appName ?? ''),
      status: textoCurto(no.applicationStatus ?? ''),
      projeto: proximo.projeto ?? '',
      ambiente: proximo.ambiente ?? '',
      hosts: coletarHosts(no),
    });
  }
  for (const valor of Object.values(no)) {
    if (valor && typeof valor === 'object') extrairServicos(valor, proximo, saida);
  }
  return deduplicarServicos(saida);
}

function textoCurto(valor) {
  return String(valor ?? '').slice(0, 120);
}

function deduplicarServicos(servicos) {
  const vistos = new Set();
  return servicos.filter((servico) => {
    const chave = `${servico.tipo}:${servico.id}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

function pareceProducao(texto) {
  return /producao|production|(^|[^a-z])prod([^a-z]|$)/.test(texto);
}

function pareceHomologacao(texto) {
  return /(^|[^a-z])hml([^a-z]|$)|homolog|staging|(^|[^a-z])teste?s?([^a-z]|$)/.test(texto);
}

function normalizarHost(valor) {
  const texto = String(valor).trim().toLowerCase();
  if (!texto || /[\s@]/.test(texto)) return '';
  const semProtocolo = texto.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const host = semProtocolo.split('/')[0].split(':')[0];
  return host.includes('.') ? host : '';
}

function coletarHosts(no) {
  const hosts = [];
  const visitar = (valor) => {
    if (Array.isArray(valor)) {
      for (const item of valor) visitar(item);
      return;
    }
    if (!valor || typeof valor !== 'object') return;
    if (typeof valor.host === 'string') hosts.push(normalizarHost(valor.host));
    if (typeof valor.domain === 'string') hosts.push(normalizarHost(valor.domain));
    if (Array.isArray(valor.domains)) visitar(valor.domains);
  };
  visitar(no);
  return [...new Set(hosts.filter(Boolean))].slice(0, 8);
}

export function classificarServico(servico) {
  // Homologacao copia a configuracao de producao (mesmo compose, mesmos nomes
  // de servico, ambiente "production" no painel). O que separa e o host
  // publico: *.teste.* / *.hml.* entra; o host sem esse rotulo fica de fora.
  const hosts = servico.hosts ?? [];
  if (hosts.some((host) => pareceHomologacao(host))) return 'homologacao';
  if (hosts.length > 0) return 'producao';

  const proprio = [servico.nome, servico.appName].filter(Boolean).join(' ').toLowerCase();
  if (pareceProducao(proprio) && !pareceHomologacao(proprio)) return 'producao';
  if (pareceHomologacao(proprio)) return 'homologacao';
  if (pareceHomologacao([servico.ambiente, servico.projeto].filter(Boolean).join(' '))) {
    return 'homologacao';
  }
  return 'outro';
}

export function nomesDeContainer(json) {
  const nomes = new Set();
  const visitar = (no) => {
    if (Array.isArray(no)) {
      for (const item of no) {
        if (typeof item === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,128}$/.test(item)) nomes.add(item);
        else visitar(item);
      }
      return;
    }
    if (typeof no === 'string') {
      if (/^[A-Za-z0-9][A-Za-z0-9_.-]{0,128}$/.test(no)) nomes.add(no);
      return;
    }
    if (!no || typeof no !== 'object') return;
    for (const chave of ['containerId', 'containerName', 'serviceName', 'name', 'Name']) {
      const valor = no[chave];
      if (typeof valor === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,128}$/.test(valor)) {
        nomes.add(valor);
      }
    }
    for (const valor of Object.values(no)) {
      if (valor && typeof valor === 'object') visitar(valor);
    }
  };
  visitar(json);
  return [...nomes];
}

export function nomesComApp(nomes, appName) {
  if (!appName) return nomes;
  return nomes.map((nome) =>
    nome === appName || nome.startsWith(`${appName}-`) ? nome : `${appName}-${nome}-1`,
  );
}

export function escolherContainers(nomes) {
  const preferidos = nomes.filter((nome) =>
    SERVICOS_DE_LOG.some(
      (servico) =>
        nome === servico ||
        nome.endsWith(`-${servico}`) ||
        nome.endsWith(`_${servico}`) ||
        nome.includes(`-${servico}-`),
    ),
  );
  return (preferidos.length > 0 ? preferidos : nomes).slice(0, 8);
}

export function deploymentsComErro(json) {
  const lista = Array.isArray(json) ? json : [];
  return lista
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.deploymentId ?? ''),
      status: String(item.status ?? item.deploymentStatus ?? ''),
      titulo: redigirSegredos(String(item.title ?? '')).slice(0, 120),
      quando: String(item.createdAt ?? ''),
      mensagem: redigirSegredos(String(item.errorMessage ?? '')).slice(0, 200),
    }))
    .filter((item) => /error|failed/i.test(item.status) && /^[A-Za-z0-9_-]{1,80}$/.test(item.id));
}

export function textoDeLog(corpo) {
  const texto = String(corpo ?? '').slice(0, 200_000);
  const aparado = texto.trim();
  if (!aparado) return '';
  if (aparado.startsWith('{') || aparado.startsWith('[')) {
    try {
      const json = JSON.parse(aparado);
      if (typeof json === 'string') return json;
      if (Array.isArray(json)) return json.map((item) => (typeof item === 'string' ? item : '')).join('\n');
      if (typeof json?.logs === 'string') return json.logs;
      if (Array.isArray(json?.logs)) return json.logs.map((item) => (typeof item === 'string' ? item : '')).join('\n');
      if (typeof json?.data === 'string') return json.data;
      if (typeof json?.message === 'string') return json.message;
      return '';
    } catch {
      return texto;
    }
  }
  return texto;
}

export function linhasDeErro(texto, limite = 30) {
  const saida = [];
  for (const linha of redigirSegredos(texto).split(/\r?\n/)) {
    const aparada = linha.trim();
    if (!aparada) continue;
    if (!/error|fatal|panic|exception|unhealthy|emerg|fail/i.test(aparada)) continue;
    saida.push(aparada.slice(0, 240));
    if (saida.length >= limite) break;
  }
  return saida;
}

export function dicasDeLog(linhas) {
  const texto = linhas.join('\n');
  const dicas = [];
  if (/could not find an appropriate entrypoint/i.test(texto)) {
    dicas.push(
      'As Edge Functions subiram sem entrypoint. Republicar o compose de homologacao depois do commit em supabase/functions/. Ver docs/runbooks/primeira-carga.md, secao Edge Functions.',
    );
  }
  if (/relation "storage\.buckets" does not exist/i.test(texto)) {
    dicas.push(
      'storage.buckets ainda nao existe. Espere o servico storage ficar saudavel antes de aplicar migration.',
    );
  }
  return dicas;
}
