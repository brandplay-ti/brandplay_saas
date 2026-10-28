// Diagnostico somente leitura de homologacao, a partir da maquina local.
//
// Nao aponta o portal para o Supabase publicado — isso abriria escrita com a
// sessao de um usuario, e o Vite recusa esse modo de proposito. Aqui a senha
// do Postgres nao sai da VPS: o SSH so envia consulta-homologacao.sh, que
// abre a sessao com default_transaction_read_only. O Dockploy entra so com
// GET, e so em servico cujo nome e de homologacao.
//
//   npm run supabase:diagnosticar
//
// Credenciais em .env.homologacao (gitignored). Modelo: .env.homologacao.example.
// Nada neste comando aplica migration, dispara deploy ou escreve no banco.

import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  afirmarDestinoSsh,
  afirmarUrlDeHomologacao,
  bancoPronto,
  classificarServico,
  compararMigrations,
  deploymentsComErro,
  dicasDeLog,
  escolherContainers,
  extrairServicos,
  interpretarErros,
  interpretarMigrations,
  lerEnv,
  linhasDeErro,
  normalizarEnvDiagnostico,
  listarMigrationsLocais,
  montarSinais,
  montarUrlDockploy,
  origemDockploy,
  nomesComApp,
  nomesDeContainer,
  ocultar,
  separarSecoes,
  textoDeLog,
  textoDoQueExecutar,
} from './diagnostico/relatorio.mjs';

const ENV_PADRAO = fileURLToPath(new URL('../../.env.homologacao', import.meta.url));
const DIR_MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));
const CHECAR = fileURLToPath(new URL('./checar-supabase.mjs', import.meta.url));
const SCRIPT_BANCO = fileURLToPath(new URL('./diagnostico/consulta-homologacao.sh', import.meta.url));

process.stdout.on('error', (erro) => {
  if (erro.code === 'EPIPE') process.exit(0);
  throw erro;
});

function titulo(texto) {
  console.log(`\n  ${texto}`);
}

function ok(texto) {
  console.log(`    OK     ${texto}`);
}

function aviso(texto) {
  console.log(`    AVISO  ${texto}`);
}

function falha(texto) {
  console.log(`    FALHA  ${texto}`);
}

function ajuda() {
  console.log(`
  Diagnostico de homologacao, somente leitura.

    npm run supabase:diagnosticar
    npm run supabase:diagnosticar -- --env .env.homologacao

  Copie .env.homologacao.example para .env.homologacao e preencha.
  O arquivo fica de fora do Git. Nao coloque senha de banco nele.

  O relatorio diz o que executar. Quem executa e voce, na VPS
  (docs/runbooks/diagnostico-homologacao.md).
`);
}

function argumentos(argv) {
  let env = ENV_PADRAO;
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--ajuda' || item === '--help' || item === '-h') return { ajuda: true };
    if (item === '--env') {
      env = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    throw new Error(`argumento desconhecido: ${item}`);
  }
  return { ajuda: false, env };
}

function executar(comando, args, { entrada, timeoutMs }) {
  return new Promise((resolve) => {
    const filho = spawn(comando, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const anexar = (atual, pedaco) => {
      const texto = pedaco.toString('utf8');
      return atual.length >= 1_000_000 ? atual : atual + texto;
    };
    filho.stdout.on('data', (pedaco) => {
      stdout = anexar(stdout, pedaco);
    });
    filho.stderr.on('data', (pedaco) => {
      stderr = anexar(stderr, pedaco);
    });
    const relogio = setTimeout(() => filho.kill(), timeoutMs);
    filho.on('error', (erro) => {
      clearTimeout(relogio);
      resolve({ codigo: 1, stdout, stderr: erro.message });
    });
    filho.on('close', (codigo) => {
      clearTimeout(relogio);
      resolve({ codigo: codigo ?? 1, stdout, stderr });
    });
    filho.stdin.end(entrada ?? '');
  });
}

function herdar(comando, args, env) {
  return new Promise((resolve) => {
    const filho = spawn(comando, args, { env, windowsHide: true, stdio: 'inherit' });
    filho.on('error', () => resolve(1));
    filho.on('close', (codigo) => resolve(codigo ?? 1));
  });
}

async function lerDockploy(origem, chave, procedimento, params) {
  const url = montarUrlDockploy(origem, procedimento, params);
  const resposta = await fetch(url, {
    method: 'GET',
    headers: { 'x-api-key': chave, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  const corpo = (await resposta.text()).slice(0, 500_000);
  return { status: resposta.status, corpo };
}

function mensagemCurta(corpo) {
  try {
    const json = JSON.parse(corpo);
    if (typeof json?.message === 'string') return ocultar(json.message).slice(0, 200);
  } catch {
    // corpo que nao e JSON fica de fora: pode ser log com variavel de ambiente
  }
  return '';
}

async function diagnosticarApi(env) {
  if (!env.SUPABASE_URL) {
    titulo('API publica');
    aviso('SUPABASE_URL ausente. A checagem HTTP foi pulada.');
    return false;
  }
  const origem = afirmarUrlDeHomologacao(env.SUPABASE_URL, 'SUPABASE_URL');
  if (env.PORTAL_URL) afirmarUrlDeHomologacao(env.PORTAL_URL, 'PORTAL_URL');
  titulo('API publica');
  const codigo = await herdar(process.execPath, [CHECAR], {
    ...process.env,
    SUPABASE_URL: origem,
    SUPABASE_KEY: env.SUPABASE_ANON_KEY ?? '',
    PORTAL_URL: env.PORTAL_URL ?? '',
  });
  if (codigo !== 0) falha('a checagem da API nao fechou limpa. O detalhe esta acima.');
  return codigo !== 0;
}

async function diagnosticarBanco(env, locais, segredos) {
  titulo('Banco (SSH, sessao somente leitura)');
  if (!env.VPS_HOST && !env.VPS_USER) {
    aviso('VPS_HOST ausente. A comparacao de migrations foi pulada.');
    return { falhou: false, conclusao: '' };
  }
  afirmarDestinoSsh(env.VPS_USER ?? '', env.VPS_HOST ?? '');
  if (env.VPS_SSH_KEY && !existsSync(env.VPS_SSH_KEY)) {
    throw new Error('VPS_SSH_KEY nao existe neste caminho');
  }

  const args = [
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'ConnectTimeout=15',
  ];
  if (env.VPS_SSH_KEY) args.push('-i', env.VPS_SSH_KEY, '-o', 'IdentitiesOnly=yes');
  args.push(`${env.VPS_USER}@${env.VPS_HOST}`, 'bash', '--noprofile', '--norc', '-se');

  const script = readFileSync(SCRIPT_BANCO, 'utf8').replace(/\r\n/g, '\n');
  const resultado = await executar('ssh', args, { entrada: script, timeoutMs: 90_000 });
  const stdout = ocultar(resultado.stdout, segredos);
  const stderr = ocultar(resultado.stderr, segredos);

  if (resultado.codigo !== 0) {
    falha(`SSH ou a consulta no banco falhou (codigo ${resultado.codigo}).`);
    if (stderr.trim()) console.log(stderr.trim().split(/\r?\n/).map((linha) => `           ${linha}`).join('\n'));
    if (/ENOENT|not found|nao e reconhecido/i.test(stderr)) {
      aviso('O cliente ssh nao esta no PATH. No Windows, o recurso e OpenSSH Client.');
    }
    return { falhou: true, conclusao: '' };
  }

  const secoes = separarSecoes(stdout);
  const sinais = montarSinais(secoes);
  const remotas = interpretarMigrations(secoes.MIGRATIONS ?? '');
  const comparacao = compararMigrations(locais, remotas);
  const erros = interpretarErros(secoes.ERROS ?? '');

  ok(
    `GoTrue ${sinais.gotrue ?? 'desconhecido'} migration(s) interna(s); storage.buckets ${
      sinais.storage === 'true' ? 'existe' : 'ausente'
    }; organizacoes ${sinais.organizations ?? 'desconhecido'}.`,
  );
  ok(`${remotas.length} migration(s) aplicada(s) no banco, ${locais.length} nesta pasta.`);

  if (comparacao.pendentes.length === 0) ok('nenhuma migration pendente nesta arvore.');
  else falha(`pendentes: ${comparacao.pendentes.join(', ')}`);
  if (comparacao.divergentes.length > 0) {
    falha(`checksum diferente: ${comparacao.divergentes.join(', ')}`);
  }
  if (comparacao.extras.length > 0) aviso(`so no banco: ${comparacao.extras.join(', ')}`);
  if (!bancoPronto(sinais)) {
    aviso('stack ainda nao esta pronto para migration. Nada sera sugerido para aplicar.');
  }

  if (erros.ausente) aviso('backend_error_logs ainda nao existe.');
  else if (erros.itens.length === 0) ok('nenhum erro recente em backend_error_logs.');
  else {
    falha(`${erros.itens.length} erro(s) recente(s) em backend_error_logs.`);
    for (const item of erros.itens) {
      console.log(
        `           ${item.quando}  ${item.tabela}  ${item.acao}  ${item.codigo}  ${item.mensagem}`,
      );
    }
  }

  return {
    falhou: false,
    conclusao: textoDoQueExecutar({
      pendentes: comparacao.pendentes,
      divergentes: comparacao.divergentes,
      extras: comparacao.extras,
      sinais,
      totalLocal: locais.length,
    }),
  };
}

function imprimirLinhas(rotulo, resposta, dicas) {
  if (resposta.status < 200 || resposta.status >= 300) {
    aviso(`logs de ${rotulo} responderam ${resposta.status}. ${mensagemCurta(resposta.corpo)}`);
    return;
  }
  const linhas = linhasDeErro(textoDeLog(resposta.corpo));
  if (linhas.length === 0) {
    ok(`${rotulo}: nenhuma linha de erro nas ultimas entradas`);
    return;
  }
  falha(`${rotulo}: ${linhas.length} linha(s) de erro`);
  for (const linha of linhas.slice(0, 15)) console.log(`           ${linha}`);
  dicas.push(...dicasDeLog(linhas));
}

async function logsComRetry(origem, chave, procedimento, params) {
  const comJanela = await lerDockploy(origem, chave, procedimento, { ...params, tail: '200', since: '24h' });
  if (comJanela.status !== 400) return comJanela;
  return lerDockploy(origem, chave, procedimento, { ...params, tail: '200' });
}

async function lerErrosDoServico(origem, chave, servico, dicas, segredos) {
  try {
    if (servico.tipo === 'application') {
      const logs = await logsComRetry(origem, chave, 'application.readLogs', {
        applicationId: servico.id,
      });
      imprimirLinhas(servico.nome, logs, dicas);
      const deploys = await lerDockploy(origem, chave, 'deployment.all', { applicationId: servico.id });
      await imprimirDeployComErro(origem, chave, servico.nome, deploys, dicas);
      return;
    }

    const deploys = await lerDockploy(origem, chave, 'deployment.allByCompose', { composeId: servico.id });
    await imprimirDeployComErro(origem, chave, servico.nome, deploys, dicas);

    let appName = servico.appName;
    const detalhe = await lerDockploy(origem, chave, 'compose.one', { composeId: servico.id });
    if (detalhe.status >= 200 && detalhe.status < 300) {
      try {
        const json = JSON.parse(detalhe.corpo);
        if (typeof json.appName === 'string') appName = json.appName;
      } catch {
        appName = servico.appName;
      }
    }

    let nomes = [];
    const servicos = await lerDockploy(origem, chave, 'compose.loadServices', { composeId: servico.id });
    if (servicos.status >= 200 && servicos.status < 300) {
      try {
        nomes = nomesDeContainer(JSON.parse(servicos.corpo));
      } catch {
        nomes = [];
      }
    }
    nomes = nomesComApp(nomes, appName);
    const escolhidos = escolherContainers(nomes);
    if (escolhidos.length === 0) {
      aviso(`${servico.nome}: nenhum container identificado para ler log.`);
      return;
    }
    for (const containerId of escolhidos) {
      const logs = await logsComRetry(origem, chave, 'compose.readLogs', {
        composeId: servico.id,
        containerId,
      });
      imprimirLinhas(`${servico.nome}/${containerId}`, logs, dicas);
    }
  } catch (erro) {
    aviso(`logs de ${servico.nome}: ${ocultar(erro.message, segredos)}`);
  }
}

async function imprimirDeployComErro(origem, chave, nome, resposta, dicas) {
  if (resposta.status < 200 || resposta.status >= 300) {
    aviso(`deploys de ${nome} responderam ${resposta.status}.`);
    return;
  }
  let json;
  try {
    json = JSON.parse(resposta.corpo);
  } catch {
    aviso(`deploys de ${nome} nao vieram em JSON.`);
    return;
  }
  const erros = deploymentsComErro(json).sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0));
  if (erros.length === 0) {
    ok(`${nome}: nenhum deploy com status de erro na lista.`);
    return;
  }
  const recente = erros[0];
  falha(`${nome}: deploy ${recente.quando || recente.id} status ${recente.status}. ${recente.titulo}`);
  if (recente.mensagem) console.log(`           ${recente.mensagem}`);
  dicas.push(
    `O deploy de ${nome} falhou. Republicar e uma acao no Dockploy ou no workflow Deploy (VPS). Este comando nao dispara deploy.`,
  );
  const logs = await lerDockploy(origem, chave, 'deployment.readLogs', {
    deploymentId: recente.id,
    tail: '80',
  });
  imprimirLinhas(`${nome}/deploy`, logs, dicas);
}

function servicoPedido(servico, env) {
  const filtraCompose = Boolean(env.DOCKPLOY_COMPOSE_ID);
  const filtraAplicacao = Boolean(env.DOCKPLOY_APPLICATION_ID);
  if (!filtraCompose && !filtraAplicacao) return true;
  if (servico.tipo === 'compose') return filtraCompose && servico.id === env.DOCKPLOY_COMPOSE_ID;
  if (servico.tipo === 'application') return filtraAplicacao && servico.id === env.DOCKPLOY_APPLICATION_ID;
  return false;
}

async function diagnosticarDockploy(env, segredos) {
  titulo('Dockploy');
  if (!env.DOCKPLOY_URL && !env.DOCKPLOY_API_KEY) {
    aviso('Dockploy nao configurado. Defina DOCKPLOY_URL e DOCKPLOY_API_KEY para ler logs.');
    return { falhou: false, dicas: [] };
  }
  if (!env.DOCKPLOY_URL || !env.DOCKPLOY_API_KEY) {
    falha('DOCKPLOY_URL e DOCKPLOY_API_KEY precisam vir juntos.');
    return { falhou: true, dicas: [] };
  }

  const painel = origemDockploy(env.DOCKPLOY_URL);
  const origem = painel.origin;
  if (painel.emClaro) {
    aviso('O painel esta em HTTP. A chave da API segue sem criptografia nesse trecho.');
  }
  let lista;
  try {
    const resposta = await lerDockploy(origem, env.DOCKPLOY_API_KEY, 'project.all');
    if (resposta.status === 401 || resposta.status === 403) {
      falha('a chave do Dockploy foi recusada.');
      return { falhou: true, dicas: [] };
    }
    if (resposta.status < 200 || resposta.status >= 300) {
      falha(`project.all respondeu ${resposta.status}. ${mensagemCurta(resposta.corpo)}`);
      return { falhou: true, dicas: [] };
    }
    lista = extrairServicos(JSON.parse(resposta.corpo));
  } catch (erro) {
    falha(ocultar(erro.message, segredos));
    return { falhou: true, dicas: [] };
  }

  for (const [variavel, tipo] of [
    ['DOCKPLOY_COMPOSE_ID', 'compose'],
    ['DOCKPLOY_APPLICATION_ID', 'application'],
  ]) {
    const id = env[variavel];
    if (!id) continue;
    const achado = lista.find((servico) => servico.tipo === tipo && servico.id === id);
    if (!achado) {
      falha(`${variavel} nao esta na conta, ou a API nao devolveu esse id.`);
      return { falhou: true, dicas: [] };
    }
    if (classificarServico(achado) !== 'homologacao') {
      falha(`${achado.nome} nao e homologacao. Log de producao nao e lido por este comando.`);
      return { falhou: true, dicas: [] };
    }
  }

  const dicas = [];
  let algum = false;
  for (const servico of lista) {
    if (!servicoPedido(servico, env)) continue;

    const classe = classificarServico(servico);
    if (classe === 'producao') {
      console.log(`    ignorado  ${servico.nome}  ${servico.tipo}  producao`);
      continue;
    }
    if (classe !== 'homologacao') {
      console.log(`    ignorado  ${servico.nome}  ${servico.tipo}  sem rotulo de homologacao`);
      continue;
    }
    algum = true;
    const status = servico.status || 'sem status';
    if (/error|failed/i.test(status)) falha(`${servico.nome}  ${servico.tipo}  ${status}`);
    else ok(`${servico.nome}  ${servico.tipo}  ${status}`);
    await lerErrosDoServico(origem, env.DOCKPLOY_API_KEY, servico, dicas, segredos);
  }

  if (!algum) aviso('nenhum servico de homologacao para ler. Producao fica de fora.');
  return { falhou: false, dicas };
}

async function main() {
  const opcoes = argumentos(process.argv.slice(2));
  if (opcoes.ajuda) {
    ajuda();
    return 0;
  }
  if (!opcoes.env || !existsSync(opcoes.env)) {
    console.error(`\n  Falta ${opcoes.env || '.env.homologacao'}.`);
    ajuda();
    return 2;
  }

  const lido = lerEnv(readFileSync(opcoes.env, 'utf8'));
  const env = normalizarEnvDiagnostico(lido.env);
  if (env.AMBIENTE !== 'homologacao') {
    console.error(
      [
        '',
        '  Este comando so fala com homologacao.',
        '  Coloque AMBIENTE=homologacao em .env.homologacao, ou uma URL cujo',
        '  host tenha rotulo hml, homologacao, staging ou teste.',
        '  SUPABASE_URL tambem e aceito como VITE_SUPABASE_URL.',
        '  A chave anon tambem e aceita como VITE_SUPABASE_PUBLISHABLE_KEY.',
        '',
      ].join('\n'),
    );
    return 2;
  }
  if (!env.SUPABASE_URL && !env.VPS_HOST && !env.DOCKPLOY_URL) {
    console.error('\n  Nada para consultar. Preencha a API, o SSH ou o Dockploy em .env.homologacao.\n');
    return 2;
  }

  console.log('\n  Diagnostico de homologacao. Somente leitura: nao aplica migration nem dispara deploy.');
  for (const chave of lido.ignoradas) {
    aviso(`${chave} estava no arquivo local e foi ignorada. Segredo de banco fica na VPS.`);
  }

  const segredos = [env.SUPABASE_ANON_KEY, env.DOCKPLOY_API_KEY].filter(Boolean);
  const locais = listarMigrationsLocais(DIR_MIGRATIONS);
  let falhou = false;

  try {
    if (await diagnosticarApi(env)) falhou = true;
  } catch (erro) {
    titulo('API publica');
    falha(ocultar(erro.message, segredos));
    falhou = true;
  }

  let conclusao = '';
  try {
    const banco = await diagnosticarBanco(env, locais, segredos);
    if (banco.falhou) falhou = true;
    conclusao = banco.conclusao;
  } catch (erro) {
    falha(ocultar(erro.message, segredos));
    falhou = true;
  }

  let dicas = [];
  try {
    const dockploy = await diagnosticarDockploy(env, segredos);
    if (dockploy.falhou) falhou = true;
    dicas = dockploy.dicas;
  } catch (erro) {
    falha(ocultar(erro.message, segredos));
    falhou = true;
  }

  titulo('O que executar');
  if (conclusao) console.log(conclusao.split('\n').map((linha) => (linha ? `  ${linha}` : '')).join('\n'));
  else aviso('Sem leitura do banco, nao ha lista de migration para aplicar.');
  const dicasUnicas = [...new Set(dicas)];
  for (const dica of dicasUnicas) console.log(`\n  ${dica}`);
  if (!conclusao && dicasUnicas.length === 0 && !falhou) {
    ok('Nada alem do que ja foi impresso acima.');
  }
  console.log('');
  return falhou ? 1 : 0;
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((erro) => {
    console.error(`\n  ${ocultar(erro?.message ?? String(erro))}\n`);
    process.exit(1);
  });
