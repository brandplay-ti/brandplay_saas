import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  afirmarDestinoSsh,
  afirmarProcedimentoDeLeitura,
  afirmarUrlDeHomologacao,
  origemDockploy,
  bancoPronto,
  classificarServico,
  compararMigrations,
  dicasDeLog,
  deploymentsComErro,
  escolherContainers,
  nomesComApp,
  nomesDeContainer,
  extrairServicos,
  interpretarErros,
  interpretarMigrations,
  lerEnv,
  normalizarEnvDiagnostico,
  linhasDeErro,
  listarMigrationsLocais,
  montarSinais,
  montarUrlDockploy,
  ocultar,
  separarSecoes,
  textoDeLog,
  textoDoQueExecutar,
} from './relatorio.mjs';

const SCRIPT = fileURLToPath(new URL('./consulta-homologacao.sh', import.meta.url));

test('recusa producao e aceita homologacao', () => {
  assert.equal(afirmarUrlDeHomologacao('https://api.hml.exemplo.com', 'SUPABASE_URL'), 'https://api.hml.exemplo.com');
  assert.equal(afirmarUrlDeHomologacao('https://teste.exemplo.com/auth', 'SUPABASE_URL'), 'https://teste.exemplo.com');
  assert.throws(() => afirmarUrlDeHomologacao('https://api.exemplo.com', 'SUPABASE_URL'), /rotulo/);
  assert.throws(() => afirmarUrlDeHomologacao('https://api.producao.exemplo.com', 'SUPABASE_URL'), /producao/);
  assert.throws(() => afirmarUrlDeHomologacao('http://api.hml.exemplo.com', 'SUPABASE_URL'), /https/);
  assert.throws(() => afirmarUrlDeHomologacao('https://user:senha@api.hml.exemplo.com', 'SUPABASE_URL'), /senha/);
  assert.throws(() => afirmarUrlDeHomologacao('https://localhost:8010', 'SUPABASE_URL'), /rotulo/);
});

test('ssh so aceita usuario e host simples', () => {
  assert.doesNotThrow(() => afirmarDestinoSsh('deploy', '10.0.0.8'));
  assert.throws(() => afirmarDestinoSsh('deploy;rm', '10.0.0.8'), /VPS_USER/);
  assert.throws(() => afirmarDestinoSsh('deploy', 'host;comando'), /VPS_HOST/);
});

test('aceita os nomes do Vite e assume homologacao pelo host', () => {
  const env = normalizarEnvDiagnostico({
    VITE_SUPABASE_URL: 'https://db.teste.exemplo.com',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJanon',
  });
  assert.equal(env.AMBIENTE, 'homologacao');
  assert.equal(env.SUPABASE_URL, 'https://db.teste.exemplo.com');
  assert.equal(env.SUPABASE_ANON_KEY, 'eyJanon');
  const producao = normalizarEnvDiagnostico({
    VITE_SUPABASE_URL: 'https://api.producao.exemplo.com',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJanon',
  });
  assert.equal(producao.AMBIENTE, undefined);
  const explicito = normalizarEnvDiagnostico({
    AMBIENTE: 'producao',
    SUPABASE_URL: 'https://api.hml.exemplo.com',
  });
  assert.equal(explicito.AMBIENTE, 'producao');
});

test('ignora segredo de banco colado no arquivo local', () => {
  const lido = lerEnv(`
AMBIENTE=homologacao
SUPABASE_URL=https://api.hml.exemplo.com
DATABASE_URL=postgres://supabase_admin:segredo@db:5432/postgres
SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb
export SUPABASE_ANON_KEY="anon-publica"
`);
  assert.equal(lido.env.AMBIENTE, 'homologacao');
  assert.equal(lido.env.SUPABASE_ANON_KEY, 'anon-publica');
  assert.equal(lido.env.DATABASE_URL, undefined);
  assert.equal(lido.env.SERVICE_ROLE_KEY, undefined);
  assert.deepEqual(lido.ignoradas.sort(), ['DATABASE_URL', 'SERVICE_ROLE_KEY']);
});

test('comparacao de migrations nao trata checksum vazio como divergencia', () => {
  const locais = [
    { version: '0001_a', checksum: 'aaa' },
    { version: '0002_b', checksum: 'bbb' },
    { version: '0003_c', checksum: 'ccc' },
  ];
  const remotas = [
    { version: '0001_a', checksum: 'aaa' },
    { version: '0002_b', checksum: '' },
    { version: '0099_so_la', checksum: 'zzz' },
  ];
  assert.deepEqual(compararMigrations(locais, remotas), {
    pendentes: ['0003_c'],
    divergentes: [],
    extras: ['0099_so_la'],
  });
  assert.deepEqual(
    compararMigrations([{ version: '0001_a', checksum: 'nova' }], [{ version: '0001_a', checksum: 'velha' }]),
    { pendentes: [], divergentes: ['0001_a'], extras: [] },
  );
});

test('checksum local e o sha256 do arquivo', () => {
  const diretorio = mkdtempSync(join(tmpdir(), 'brandplay-migrations-'));
  writeFileSync(join(diretorio, '0002_b.sql'), 'select 2;\n');
  writeFileSync(join(diretorio, '0001_a.sql'), 'select 1;\n');
  const lista = listarMigrationsLocais(diretorio);
  assert.deepEqual(
    lista.map((item) => item.version),
    ['0001_a', '0002_b'],
  );
  assert.equal(lista[0].checksum, createHash('sha256').update('select 1;\n').digest('hex'));
});

test('banco sem GoTrue nao recebe comando de aplicar', () => {
  const texto = textoDoQueExecutar({
    pendentes: ['0001_tabelas'],
    divergentes: [],
    extras: [],
    sinais: { gotrue: 'ausente', storage: 'false' },
    totalLocal: 3,
  });
  assert.match(texto, /Nao aplique migration agora/);
  assert.match(texto, /0001_tabelas/);
  assert.doesNotMatch(texto, /migrate\.sh/);
  assert.doesNotMatch(texto, /postgres:\/\//);
  assert.equal(bancoPronto({ gotrue: '76', storage: 'true' }), true);
  assert.equal(bancoPronto({ gotrue: '0', storage: 'true' }), false);
});

test('comando sugerido nao leva senha e pede status antes de aplicar', () => {
  const texto = textoDoQueExecutar({
    pendentes: ['0039_isencao'],
    divergentes: ['0008_fn'],
    extras: [],
    sinais: { gotrue: '76', storage: 'true' },
    totalLocal: 40,
  });
  assert.match(texto, /homologacao\.env/);
  assert.match(texto, /migrate\.sh --status/);
  assert.match(texto, /Nao reaplique/);
  assert.doesNotMatch(texto, /postgres:\/\/|senha|PASSWORD/i);
});

test('script remoto so le homologacao', () => {
  const script = readFileSync(SCRIPT, 'utf8');
  assert.equal(script.includes('\r'), false);
  assert.match(script, /default_transaction_read_only = on/);
  assert.match(script, /\/etc\/brandplay\/homologacao\.env/);
  assert.match(script, /\*teste\*/);
  assert.doesNotMatch(script, /producao\.env/);
  assert.doesNotMatch(script, /migrate\.sh/);
  assert.doesNotMatch(script, /\b(insert|update|delete|drop|truncate|alter|grant|revoke)\b/i);
});

test('secoes e erros do banco', () => {
  const secoes = separarSecoes(`
--DIAG:SINAIS
storage=true
migrations_table=true
--DIAG:MIGRATIONS
0001_a\taaa
__sem_tabela__
--DIAG:GOTRUE
76
--DIAG:ERROS
2026-10-25T12:00Z\tcontracts\tinsert\t42501\ttoken=segredo
`);
  assert.equal(montarSinais(secoes).gotrue, '76');
  assert.equal(montarSinais(secoes).storage, 'true');
  assert.equal(interpretarMigrations(secoes.MIGRATIONS).length, 1);
  const erros = interpretarErros(secoes.ERROS);
  assert.equal(erros.itens[0].mensagem, 'token=[redigido]');
  assert.equal(erros.itens[0].tabela, 'contracts');
});

test('dockploy so monta GET de leitura e esconde segredo no log', () => {
  assert.throws(() => afirmarProcedimentoDeLeitura('compose.deploy'), /recusado/);
  const url = montarUrlDockploy('https://painel.exemplo.com', 'compose.readLogs', {
    composeId: 'compose_hml',
    containerId: 'db',
    tail: '200',
  });
  assert.equal(url.pathname, '/api/compose.readLogs');
  assert.equal(url.searchParams.get('containerId'), 'db');
  assert.equal(origemDockploy('http://10.0.0.5:3000').emClaro, true);
  assert.equal(origemDockploy('https://painel.exemplo.com').emClaro, false);
  assert.throws(() => montarUrlDockploy('https://painel.exemplo.com', 'compose.readLogs', { containerId: 'a b' }), /recusado/);
  const log = linhasDeErro('ok\nFATAL postgres://supabase_admin:segredo@db:5432/postgres\n');
  assert.equal(log.length, 1);
  assert.match(log[0], /postgres:\/\/\*\*\*:\*\*\*@/);
  assert.doesNotMatch(log[0], /segredo/);
  assert.match(ocultar('chave eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.assinatura', []), /\[jwt\]/);
});

test('servicos de producao nao entram na leitura', () => {
  const servicos = extrairServicos({
    projectId: 'p1',
    name: 'brandplay',
    env: 'SERVICE_ROLE_KEY=super-segredo',
    environments: [
      {
        environmentId: 'e1',
        name: 'homologacao',
        compose: [
          {
            composeId: 'c1',
            name: 'supabase',
            appName: 'supabase',
            composeStatus: 'done',
            domains: [{ host: 'db.teste.exemplo.com' }],
          },
        ],
        applications: [{ applicationId: 'a1', name: 'portal-hml', applicationStatus: 'running' }],
      },
      {
        environmentId: 'e2',
        name: 'producao',
        compose: [{ composeId: 'c2', name: 'supabase-producao', composeStatus: 'error' }],
      },
    ],
  });
  assert.equal(JSON.stringify(servicos).includes('super-segredo'), false);
  const classes = Object.fromEntries(servicos.map((servico) => [servico.id, classificarServico(servico)]));
  assert.equal(classes.c1, 'homologacao');
  assert.deepEqual(servicos.find((servico) => servico.id === 'c1').hosts, ['db.teste.exemplo.com']);
  assert.equal(classes.a1, 'homologacao');
  assert.equal(classes.c2, 'producao');
  assert.equal(
    classificarServico({ nome: 'supabase-hml', appName: 'supabase-hml', ambiente: 'production', projeto: 'brandplay' }),
    'homologacao',
  );
  assert.equal(
    classificarServico({ nome: 'supabase-producao', appName: '', ambiente: 'homologacao', projeto: 'brandplay' }),
    'producao',
  );
  assert.equal(
    classificarServico({
      nome: 'supabase',
      appName: 'supabase',
      ambiente: 'production',
      hosts: ['db.teste.exemplo.com'],
    }),
    'homologacao',
  );
  assert.equal(
    classificarServico({
      nome: 'supabase',
      appName: 'supabase',
      ambiente: 'production',
      hosts: ['db.exemplo.com'],
    }),
    'producao',
  );
  assert.equal(
    classificarServico({ nome: 'supabase', appName: 'supabase', ambiente: 'production' }),
    'outro',
  );
  assert.deepEqual(nomesDeContainer(['studio', 'kong', 'auth', 'db', 'functions']), ['studio', 'kong', 'auth', 'db', 'functions']);
  assert.deepEqual(nomesComApp(['db', 'projeto-db-1'], 'projeto'), ['projeto-db-1', 'projeto-db-1']);
  assert.deepEqual(escolherContainers(['studio', 'brandplay-hml-db-1', 'brandplay-hml-functions-1', 'imgproxy']), [
    'brandplay-hml-db-1',
    'brandplay-hml-functions-1',
  ]);
});

test('deploy com erro e dica de entrypoint', () => {
  const erros = deploymentsComErro([
    { deploymentId: 'd1', status: 'done', title: 'ok' },
    { deploymentId: 'd2', status: 'error', title: 'build', errorMessage: 'password=abc', createdAt: '2026-10-25' },
  ]);
  assert.equal(erros.length, 1);
  assert.equal(erros[0].mensagem, 'password=[redigido]');
  assert.equal(
    dicasDeLog(['could not find an appropriate entrypoint']).length,
    1,
  );
  assert.equal(textoDeLog(JSON.stringify({ logs: 'FATAL boom' })), 'FATAL boom');
  assert.equal(textoDeLog(JSON.stringify({ logs: ['ok', 'FATAL boom'] })), 'ok\nFATAL boom');
  assert.equal(textoDeLog(JSON.stringify({ env: 'SECRET=x' })), '');
});
