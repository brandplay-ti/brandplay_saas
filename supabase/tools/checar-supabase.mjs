// Diz, em uma passada, em que camada um Supabase remoto está quebrado.
//
// Sintoma que traz alguém até aqui: "o portal não conecta". Isso pode ser
// qualquer uma de seis coisas muito diferentes — domínio sem rota no Traefik,
// stack no ar mas Kong recusando a chave, PostgREST vivo com o banco vazio,
// CORS, conteúdo misto — e cada uma tem uma correção distinta, em um lugar
// distinto. O console do navegador mostra só a última: "Failed to fetch".
//
// Este script sobe pela pilha na ordem em que ela quebra, e para na primeira
// camada que não responde. O que ele imprime é o nome do lugar onde mexer.
//
// Uso:
//
//   node supabase/tools/checar-supabase.mjs https://host-do-supabase chave
//   npm run supabase:checar -- https://host-do-supabase chave
//
// Ou por variável de ambiente, para não deixar a chave no histórico do shell:
//
//   SUPABASE_URL=... SUPABASE_KEY=... npm run supabase:checar
//
// Só lê: nenhuma requisição aqui escreve nada. Pode rodar contra produção.

const TEMPO_LIMITE_MS = 15000;

// Canalizar a saída para `head` fecha o pipe no meio da escrita, e o Node
// transforma isso num stack trace de EPIPE que esconde o relatório. Quem fez
// `| head` já viu o que queria.
process.stdout.on('error', (erro) => {
  if (erro.code === 'EPIPE') process.exit(0);
  throw erro;
});

// `sports_properties` é a sonda certa porque é uma das poucas tabelas que
// `anon` pode ler: a policy `sports_properties_public_read` (0005, seção 8)
// libera as propriedades publicadas para o Media Kit público. A maioria das
// tabelas não é legível sem sessão, e um "permission denied" ali não
// distinguiria banco vazio de RLS funcionando.
//
// A contagem é só informativa: num ambiente recém-migrado, sem a importação do
// Lovable, nenhuma propriedade está publicada e zero linhas é o esperado.
//
// É também a tabela que a página pública do Media Kit consulta: se esta leitura
// falha, aquela página falha junto.
const TABELA_SONDA = 'sports_properties';

// Sinalizadores que consomem o argumento seguinte. Filtrar só o que começa com
// `--` deixava o valor do `--portal` cair na lista posicional e virar a chave —
// e o relatório saía dizendo que a chave foi recusada, o que é diagnóstico
// errado sobre um ambiente que estava bem.
const COM_VALOR = ['portal'];

const bruto = process.argv.slice(2);
const argumentos = [];
const sinalizadores = new Map();

for (let i = 0; i < bruto.length; i += 1) {
  const item = bruto[i];
  if (!item.startsWith('--')) {
    argumentos.push(item);
    continue;
  }
  const nome = item.slice(2);
  if (COM_VALOR.includes(nome)) {
    sinalizadores.set(nome, (bruto[i + 1] ?? '').trim().replace(/\/+$/, ''));
    i += 1; // o valor pertence ao sinalizador, e não à lista posicional
  } else {
    sinalizadores.set(nome, true);
  }
}

const sinalizador = (nome) => {
  const valor = sinalizadores.get(nome);
  return typeof valor === 'string' ? valor : '';
};

const url = (argumentos[0] ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const chave = (argumentos[1] ?? process.env.SUPABASE_KEY ?? '').trim();

// `--portal https://…`: confere para onde o portal **publicado** aponta.
const portal = sinalizador('portal') || (process.env.PORTAL_URL ?? '').trim().replace(/\/+$/, '');

const problemas = [];
let falhou = false;

function titulo(texto) {
  console.log(`\n  ${texto}`);
}

function ok(texto) {
  console.log(`    OK     ${texto}`);
}

function aviso(texto) {
  console.log(`    AVISO  ${texto}`);
}

function falha(texto, ondeMexer) {
  falhou = true;
  console.log(`    FALHA  ${texto}`);
  if (ondeMexer) problemas.push(ondeMexer);
}

async function buscar(caminho, { baseUrl, ...opcoes } = {}) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const resposta = await fetch(`${baseUrl ?? url}${caminho}`, {
      ...opcoes,
      signal: controle.signal,
    });
    const corpo = await resposta.text();
    return { resposta, corpo };
  } catch (erro) {
    return { erro };
  } finally {
    clearTimeout(relogio);
  }
}

// O Traefik responde `404 page not found` — em texto puro, sem cabeçalho algum
// do Supabase — quando nenhum router casa com o Host da requisição. É o 404 do
// próprio proxy, não do Kong, e distingui-lo importa: significa que o domínio
// não está publicado, e não que o caminho está errado.
function ehProxySemRota({ resposta, corpo }) {
  if (resposta.status !== 404) return false;
  const tipo = resposta.headers.get('content-type') ?? '';
  return tipo.startsWith('text/plain') && corpo.trim() === '404 page not found';
}

function descreverErroDeRede(erro) {
  const causa = erro?.cause?.code ?? erro?.cause?.message ?? erro?.message ?? String(erro);
  if (erro?.name === 'AbortError') return `sem resposta em ${TEMPO_LIMITE_MS / 1000}s`;
  return causa;
}

// ─── Entrada ─────────────────────────────────────────────────────────

if (!url) {
  console.error(
    [
      '',
      '  Falta a URL do Supabase.',
      '',
      '    node supabase/tools/checar-supabase.mjs https://host chave',
      '',
      '  A URL é a do serviço do Supabase no Dockploy daquele ambiente —',
      '  a mesma que vai em VITE_PUBLIC_SUPABASE_URL.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

if (!/^https?:\/\//i.test(url)) {
  console.error(
    [
      '',
      `  A URL precisa do esquema: "https://${url}" e não "${url}".`,
      '',
      '  O supabase-js valida a URL ao criar o cliente, no carregamento do',
      '  módulo — sem o esquema a aplicação inteira deixa de subir.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(`\n  Alvo: ${url}`);
console.log(
  `  Chave: ${chave ? `${chave.slice(0, 12)}… (${chave.length} caracteres)` : 'não informada'}`,
);

// ─── 0. Para onde o portal publicado aponta ──────────────────────────
//
// A URL do Supabase é embutida no bundle em tempo de build. Quem lê a
// configuração do Dockploy vê o valor de agora; o portal no ar carrega o valor
// de quando foi construído. Enquanto ninguém reconstrói, os dois divergem em
// silêncio.
//
// O sintoma dessa divergência é cruel: o preflight bate num domínio que não
// existe mais, o Traefik devolve 404 sem cabeçalho de CORS, e o navegador
// reporta **"CORS error"**. Quem lê isso vai conferir a configuração de CORS do
// Kong, que está certa, e perde a tarde.
//
// Baixar o bundle e procurar a URL dentro dele responde em uma requisição.

if (portal) {
  titulo('0. Portal publicado');

  const indice = await buscar('/', { baseUrl: portal });

  if (indice.erro) {
    aviso(`não deu para ler ${portal}: ${descreverErroDeRede(indice.erro)}`);
  } else if (!indice.resposta.ok) {
    aviso(`${portal} respondeu ${indice.resposta.status}.`);
  } else {
    const scripts = [...new Set(indice.corpo.match(/\/assets\/[A-Za-z0-9._-]+\.js/g) ?? [])];

    if (scripts.length === 0) {
      aviso('nenhum bundle encontrado no index.html — o portal pode não ter sido construído.');
    } else {
      let achou = false;
      let chaveDoBundle = '';
      const origensVistas = new Set();

      for (const script of scripts.slice(0, 5)) {
        const js = await buscar(script, { baseUrl: portal });
        if (js.erro || !js.resposta.ok) continue;

        if (js.corpo.includes(url)) achou = true;

        chaveDoBundle ||=
          js.corpo.match(/sb_publishable_[A-Za-z0-9_]+/)?.[0] ??
          js.corpo.match(/eyJhbGciOi[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0] ??
          '';

        // Só as origens que parecem de Supabase: o bundle tem dezenas de URLs
        // de documentação e especificação que não interessam aqui.
        for (const origem of js.corpo.match(/https?:\/\/[A-Za-z0-9.-]+/g) ?? []) {
          if (/supabase|sslip|\bdb\./i.test(origem)) origensVistas.add(origem);
        }
      }

      if (achou) {
        ok(`o portal publicado aponta para ${url}.`);
      } else {
        const encontradas = [...origensVistas].filter((o) => o !== url);
        falha(
          `o portal publicado NÃO aponta para ${url}.` +
            (encontradas.length ? ` Ele carrega: ${encontradas.join(', ')}` : ''),
          'O bundle no ar foi construído com outro valor. A URL é embutida em\n' +
            '  tempo de build: corrigir a variável no Dockploy não muda o portal já\n' +
            '  publicado. Corrija o valor e **reconstrua** — reiniciar não basta.',
        );
      }

      // A chave também é embutida no build, e envelhece do mesmo jeito: um
      // redeploy do Supabase que regere as chaves deixa o portal publicado com
      // a anterior. O sintoma é 401 em tudo — signup, login, qualquer leitura —
      // e não diz que a causa é o bundle.
      if (!chaveDoBundle) {
        aviso('nenhuma chave encontrada no bundle.');
      } else {
        const teste = await buscar('/auth/v1/health', { headers: { apikey: chaveDoBundle } });
        if (!teste.erro && teste.resposta.status === 401) {
          falha(
            `a chave embutida no portal é recusada por ${url} (401).`,
            'O portal foi construído com uma chave que este Supabase não aceita\n' +
              '  mais — recriar o serviço ou regerar o `.env` invalida a anterior.\n' +
              '  Pegue a chave pública atual e **reconstrua** o portal.',
          );
        } else if (!teste.erro) {
          ok('a chave embutida no portal é aceita pelo alvo.');
        }
      }
    }
  }
}

// ─── 1. O domínio chega em algum lugar ───────────────────────────────

titulo('1. Domínio, TLS e roteamento');

// Em `localhost` o http é o desenho — o compose de desenvolvimento não tem TLS,
// e o portal local também é http. Avisar ali seria gritar lobo toda vez.
const ehLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url);

if (/^http:\/\//i.test(url) && !ehLocal) {
  aviso('o Supabase está em http, sem TLS.');
  aviso('um portal servido em https terá TODAS as chamadas bloqueadas pelo');
  aviso('navegador como conteúdo misto — e o token de sessão trafega em claro.');
  aviso('habilite HTTPS neste domínio no Dockploy antes de construir o portal.');
}

// A chave vai junto já aqui: dependendo da configuração do Kong, `/auth/v1/health`
// também é uma rota protegida, e sem `apikey` ela responde 401 — o que não diz
// nada sobre a saúde do stack.
const saude = await buscar('/auth/v1/health', {
  headers: chave ? { apikey: chave } : {},
});

// Só a falha deste passo interrompe o script — a do passo 0 não.
let roteamentoQuebrado = true;

if (saude.erro) {
  falha(
    `a requisição não completou: ${descreverErroDeRede(saude.erro)}`,
    'O domínio não resolve, a porta não aceita conexão ou o certificado é inválido.\n' +
      '  Confira no Dockploy se o serviço está no ar e se o domínio é exatamente este —\n' +
      '  ele muda quando o serviço é recriado.',
  );
} else if (ehProxySemRota(saude)) {
  falha(
    'o proxy respondeu, mas nenhuma rota casa com este domínio (404 do Traefik).',
    'O Traefik está no ar e atende o TLS deste domínio, porém não há container\n' +
      '  publicado atrás dele. No Dockploy, no serviço do Supabase deste ambiente:\n' +
      '    - confirme que o stack está *rodando*, e não apenas criado;\n' +
      '    - confirme que o domínio aponta para o serviço `kong`, porta `8000`;\n' +
      '    - se o serviço foi recriado, o domínio gerado mudou — pegue o atual.',
  );
} else if (saude.resposta.ok) {
  roteamentoQuebrado = false;
  ok(`o Supabase respondeu em /auth/v1/health (${saude.resposta.status}).`);
  const nome = (() => {
    try {
      return JSON.parse(saude.corpo)?.name;
    } catch {
      return null;
    }
  })();
  if (nome) ok(`serviço de autenticação: ${nome}.`);
} else if (saude.resposta.status === 401) {
  // 401 vem do Kong, e o Kong só responde se estiver no ar: o roteamento está
  // de pé. O que falta é a chave, e disso trata o passo 2.
  roteamentoQuebrado = false;
  ok('o gateway do Supabase respondeu — o domínio roteia para o stack.');
} else {
  falha(
    `/auth/v1/health respondeu ${saude.resposta.status}.`,
    'O domínio roteia para algum container, mas não para um Supabase saudável.\n' +
      '  Veja os logs do serviço no Dockploy — normalmente é o `kong` no ar com os\n' +
      '  serviços internos ainda subindo, ou apontando para a porta errada.',
  );
}

// Sem rota, nada abaixo pode ser testado: seguir só produziria uma lista de
// falhas que dizem todas a mesma coisa. A checagem do passo 0 é independente —
// o portal pode apontar para o lugar errado com o alvo perfeitamente no ar —,
// então ela não interrompe o resto.
if (roteamentoQuebrado) {
  encerrar();
}

// ─── 2. A chave é aceita ─────────────────────────────────────────────

titulo('2. Chave de API');

if (!chave) {
  aviso('chave não informada — parando aqui. Passe-a para testar autenticação e dados.');
  encerrar();
}

const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}` };

const ajustes = await buscar('/auth/v1/settings', { headers: cabecalhos });

// Com a chave recusada, tudo abaixo responde 401 — e um 401 é indistinguível,
// de fora, de "a tabela está protegida" ou de "a rota não existe". O passo 5
// chegou a reportar `isolamento de pé` contra uma instância que só estava
// negando a chave: um verde falso num check de segurança é pior do que não ter
// o check. Daqui para baixo, cada passo que depende da chave se declara **não
// avaliado** em vez de inventar um diagnóstico.
let chaveAceita = false;

function naoAvaliado(oQue) {
  aviso(`não avaliado: ${oQue} depende da chave, e ela foi recusada no passo 2.`);
}

if (ajustes.erro) {
  falha(`/auth/v1/settings não completou: ${descreverErroDeRede(ajustes.erro)}`);
} else if (ajustes.resposta.status === 401) {
  falha(
    'a chave foi recusada (401).',
    'A chave não pertence a esta instância. Cada Supabase gera a sua a partir do\n' +
      '  próprio JWT_SECRET — recriar o serviço invalida a chave anterior. Pegue a\n' +
      '  chave pública atual no Dockploy deste ambiente.',
  );
} else if (ajustes.resposta.ok) {
  chaveAceita = true;
  ok('a chave foi aceita pelo Kong e pelo serviço de autenticação.');
  try {
    const dados = JSON.parse(ajustes.corpo);
    if (dados.disable_signup === true) {
      aviso('cadastro desabilitado (`disable_signup`): o registro pelo portal vai falhar.');
    }
    if (dados.mailer_autoconfirm === false) {
      aviso('confirmação por e-mail exigida: sem SMTP configurado, ninguém entra.');
    }
    if (dados.external?.email === false) {
      aviso('login por e-mail/senha desabilitado — é o que o portal usa.');
    }
  } catch {
    aviso('a resposta de /auth/v1/settings não é JSON reconhecível.');
  }
} else {
  falha(`/auth/v1/settings respondeu ${ajustes.resposta.status}: ${ajustes.corpo.slice(0, 200)}`);
}

// ─── 3. CORS ─────────────────────────────────────────────────────────
//
// O navegador faz um preflight antes de qualquer chamada com cabeçalho
// customizado — e `apikey` é um. Se ele não passar, nenhuma requisição do
// portal sai, e o console mostra apenas "Failed to fetch": nada que aponte
// para CORS.

titulo('3. CORS (preflight do navegador)');

const preflight = await buscar(`/rest/v1/${TABELA_SONDA}`, {
  method: 'OPTIONS',
  headers: {
    Origin: 'https://portal-exemplo.invalid',
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'apikey,authorization,content-type',
  },
});

if (preflight.erro) {
  falha(`o preflight não completou: ${descreverErroDeRede(preflight.erro)}`);
} else {
  const permitido = preflight.resposta.headers.get('access-control-allow-origin');
  if (permitido) {
    ok(`preflight liberado (access-control-allow-origin: ${permitido}).`);
  } else {
    falha(
      `preflight sem access-control-allow-origin (${preflight.resposta.status}).`,
      'O navegador vai bloquear todas as chamadas do portal, e o console dirá\n' +
        '  apenas "Failed to fetch". Confira a configuração de CORS do Kong no\n' +
        '  serviço do Supabase.',
    );
  }
}

// ─── 4. Banco: schema ───────────────────────────────────────────────────

titulo('4. Banco de dados');

if (!chaveAceita) naoAvaliado('a leitura das tabelas');

const sonda = chaveAceita
  ? await buscar(`/rest/v1/${TABELA_SONDA}?select=*&limit=0`, {
      headers: { ...cabecalhos, Prefer: 'count=exact' },
    })
  : null;

const APLIQUE_AS_MIGRATIONS =
  'O build do portal não roda migrations, e não deve. Aplique-as seguindo\n' +
  '  `docs/runbooks/primeira-carga.md` — pelo SQL Editor do Studio é o caminho\n' +
  '  mais curto (`npm run supabase:bundle` gera os arquivos para colar).';

if (!sonda) {
  // Passo pulado: a chave foi recusada, e o aviso já saiu acima.
} else if (sonda.erro) {
  falha(`a leitura de \`${TABELA_SONDA}\` não completou: ${descreverErroDeRede(sonda.erro)}`);
} else if (
  sonda.resposta.status === 404 ||
  /Could not find the table|does not exist/i.test(sonda.corpo)
) {
  falha(
    `a tabela \`${TABELA_SONDA}\` não existe — as migrations não foram aplicadas.`,
    APLIQUE_AS_MIGRATIONS,
  );
} else if (/42501|permission denied/i.test(sonda.corpo)) {
  // A tabela existe — o Postgres só nega quem lê. O `select` de `anon` vem dos
  // privilégios padrão que a imagem do Supabase concede no schema `public`;
  // sem ele, a tabela foi criada por um papel fora desse arranjo.
  falha(
    `\`${TABELA_SONDA}\` existe, mas \`anon\` não tem \`select\`.`,
    'Os privilégios padrão do schema `public` não chegaram a esta tabela — as\n' +
      '  migrations rodaram com um papel inesperado, ou o schema entrou pela\n' +
      '  metade. Confira com `migrate.sh --status` e\n' +
      '  `docs/runbooks/primeira-carga.md`.',
  );
} else if (!sonda.resposta.ok) {
  falha(`\`${TABELA_SONDA}\` respondeu ${sonda.resposta.status}: ${sonda.corpo.slice(0, 200)}`);
} else {
  const faixa = sonda.resposta.headers.get('content-range') ?? '';
  const total = Number(faixa.split('/')[1]);

  ok(`schema aplicado (\`${TABELA_SONDA}\` existe e é legível).`);
  if (Number.isFinite(total)) {
    console.log(`     ${total} propriedade(s) publicada(s) visíveis para \`anon\`.`);
  }
}

// ─── 5. Isolamento de Tenant ─────────────────────────────────────────
//
// O tenant do BrandPlay é a organização (ADR-0002). Esta é a verificação que
// não pode falhar: um `anon` que lê `organizations` está lendo o dado de todas
// as organizações, com uma chave que vai embutida no bundle do navegador.
//
// As tabelas abaixo não têm policy para `anon` em `0005_rls_policies.sql`. Não
// entram aqui as do Media Kit público (seção 8 da 0005), que expõem de
// propósito o que está publicado.

titulo('5. Isolamento de Tenant');

const TABELAS_PRIVADAS = ['organizations', 'organization_members', 'profiles', 'opportunities'];
let expostas = 0;
let verificadas = 0;

// Sem chave válida, todas as leituras negam por 401 e o passo diria
// `isolamento de pé` sem ter verificado nada.
for (const tabela of chaveAceita ? TABELAS_PRIVADAS : []) {
  const leitura = await buscar(`/rest/v1/${tabela}?select=*&limit=1`, { headers: cabecalhos });

  if (leitura.erro) continue;

  const corpo = leitura.corpo ?? '';

  // Tabela ausente não diz nada sobre isolamento: pode ter outro nome nesta
  // versão do schema. Só conta o que dá para afirmar.
  if (leitura.resposta.status === 404 || /Could not find the table/i.test(corpo)) continue;

  verificadas += 1;

  if (/42501|permission denied/i.test(corpo)) continue;

  if (leitura.resposta.ok && corpo.trim() !== '[]') {
    expostas += 1;
    falha(
      `\`${tabela}\` devolveu dados para \`anon\` — dado de Tenant exposto.`,
      `A chave pública vai embutida no bundle do portal: qualquer visitante lê\n` +
        `  \`${tabela}\`. Confira RLS e grants desta tabela antes de qualquer\n` +
        '  cadastro real — `supabase/migrations/0005_rls_policies.sql` e `SECURITY.md`.',
    );
  }
}

if (!chaveAceita) {
  naoAvaliado('a leitura das tabelas de Tenant');
} else if (verificadas === 0) {
  aviso('nenhuma das tabelas de Tenant conhecidas existe — nada a verificar aqui.');
} else if (expostas === 0) {
  ok(`isolamento de pé: \`anon\` não lê nenhuma das ${verificadas} tabelas de Tenant testadas.`);
}

// ─── 6. Edge Functions ───────────────────────────────────────────────
//
// IA, PDFs, convites e relatórios são Edge Functions. Elas não vêm do build do
// portal nem das migrations: o container do edge-runtime serve o que foi
// assado na imagem dele no deploy do stack.
//
// A sonda é `saude` porque é GET, não escreve nada, não depende de banco nem
// de módulo remoto, e é despachada pelo `main` como qualquer outra — é a mesma
// do healthcheck do container. Um `main` respondendo não prova que as funções
// estão alcançáveis; `saude` respondendo prova.

titulo('6. Edge Functions');

const funcao = await buscar('/functions/v1/saude', { headers: cabecalhos });

const NAO_INICIALIZOU = /InvalidWorkerCreation|appropriate entrypoint|failed to bootstrap/i;

if (funcao.erro) {
  falha(`/functions/v1/saude não completou: ${descreverErroDeRede(funcao.erro)}`);
} else if (NAO_INICIALIZOU.test(funcao.corpo)) {
  falha(
    'o edge-runtime está no ar, mas não acha nenhuma função para executar.',
    'As funções de `supabase/functions/` não estão na imagem do container. Elas\n' +
      '  não viajam com o build do portal nem com as migrations: são assadas por\n' +
      '  `docker/supabase/functions.Dockerfile` no deploy do stack. Ver a seção de\n' +
      '  Edge Functions em `docs/runbooks/primeira-carga.md`.',
  );
} else if (funcao.resposta.status === 404) {
  falha(
    '/functions/v1/ não roteia — o serviço de functions não está publicado.',
    'Confira no Dockploy se o container do edge-runtime está no ar e se o Kong\n' +
      '  tem a rota `/functions/v1`.',
  );
} else if (funcao.resposta.ok) {
  ok('as Edge Functions respondem (`saude` executou).');
} else {
  aviso(
    `\`saude\` respondeu ${funcao.resposta.status}: ${funcao.corpo.slice(0, 160)}`.replace(
      /\s+/g,
      ' ',
    ),
  );
  aviso('o runtime iniciou a função — isto é erro dela, não de implantação.');
}

// ─── 7. Para onde vão os links dos e-mails ───────────────────────────
//
// O link de confirmação de cadastro não é montado pelo portal: quem o monta é o
// GoTrue, a partir do `SITE_URL` dele. Um `SITE_URL` esquecido no padrão manda
// todo mundo para `http://localhost:8080` — e nada falha. O cadastro conclui, o
// e-mail chega, e o link só não leva a lugar nenhum.
//
// `GET /auth/v1/verify` com um token inválido devolve 303 com o destino no
// `Location`, o que revela o `SITE_URL` de fora. Não consome nada: o token é
// inválido de propósito.

titulo('7. Redirecionamento dos e-mails de autenticação');

const origemDe = (endereco) => {
  try {
    return new URL(endereco).origin;
  } catch {
    return null;
  }
};

const destinoDe = async (redirecionarPara) => {
  const consulta = redirecionarPara ? `&redirect_to=${encodeURIComponent(redirecionarPara)}` : '';
  const r = await buscar(`/auth/v1/verify?token=invalido&type=signup${consulta}`, {
    headers: { apikey: chave },
    redirect: 'manual',
  });
  if (r.erro) return null;
  return origemDe((r.resposta.headers.get('location') ?? '').split('#')[0]);
};

// A rota `verify` também passa pelo Kong com `apikey`: chave recusada devolve
// 401 sem `Location`, e o passo acusaria defeito de roteamento onde só há chave
// errada.
const siteUrl = chaveAceita ? await destinoDe() : null;

if (!chaveAceita) {
  naoAvaliado('a sondagem do `SITE_URL`');
} else if (!siteUrl) {
  // Isto era esperado no compose local antigo, que juntava `/verify`,
  // `/callback` e `/authorize` num serviço só apontado para `http://auth:9999/`:
  // com `strip_path: true` não sobrava caminho, e o GoTrue recebia `/`. O
  // `kong.yml` do upstream usa três serviços, cada um com o caminho no `url`,
  // e a unificação do stack trouxe essa correção para o local também.
  //
  // Ou seja: hoje isto é defeito de roteamento em qualquer ambiente, e leva
  // junto a confirmação de e-mail e o callback de OAuth.
  aviso('`/auth/v1/verify` não devolveu redirecionamento.');
  aviso('é defeito de roteamento no gateway: confirmação de e-mail e callback');
  aviso('de OAuth passam por essa rota e também não funcionam.');
} else {
  const siteEhLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/i.test(siteUrl);

  if (siteEhLocal && !ehLocal) {
    falha(
      `os e-mails de autenticação apontam para ${siteUrl}.`,
      'O `SITE_URL` do GoTrue está no padrão de desenvolvimento. Quem se\n' +
        '  cadastra recebe o e-mail e o link não leva a lugar nenhum — e nada\n' +
        '  falha no caminho, porque o cadastro em si funcionou.\n' +
        '  Ajuste `GOTRUE_SITE_URL` no serviço de auth, no Dockploy, para o\n' +
        '  domínio do portal daquele ambiente.',
    );
  } else if (portal && origemDe(portal) !== siteUrl) {
    falha(
      `os e-mails apontam para ${siteUrl}, mas o portal está em ${origemDe(portal)}.`,
      'Ajuste `GOTRUE_SITE_URL` no serviço de auth para o domínio do portal.',
    );
  } else {
    ok(`os e-mails apontam para ${siteUrl}.`);
  }

  // O cadastro passa `emailRedirectTo` explícito (`/onboarding/organizacao`, em
  // `pages/Auth.tsx`; `/portal` no login do patrocinador). Um destino fora da
  // allow list não dá erro: o GoTrue **silenciosamente** usa o `SITE_URL`, e o
  // link do e-mail cai na página errada.
  if (portal) {
    const alvo = `${origemDe(portal)}/onboarding/organizacao`;
    const honrado = await destinoDe(alvo);

    if (honrado === origemDe(portal)) {
      ok('a allow list aceita o domínio do portal (retorno do cadastro incluso).');
    } else if (honrado) {
      falha(
        `\`redirect_to\` para ${alvo} foi ignorado; o GoTrue usou ${honrado}.`,
        'O domínio do portal não está na allow list do GoTrue, e um destino não\n' +
          '  autorizado é descartado **em silêncio**, sem erro. O cadastro passa\n' +
          '  `emailRedirectTo` explícito e cai na página errada.\n' +
          '  Inclua `https://<portal>/**` em `ADDITIONAL_REDIRECT_URLS`.',
      );
    }
  }
}

encerrar();

// ─── Fecho ───────────────────────────────────────────────────────────

function encerrar() {
  if (problemas.length > 0) {
    console.log('\n  ─────────────────────────────────────────────────────────\n');
    console.log('  Onde mexer:\n');
    for (const problema of problemas) {
      console.log(`  - ${problema}\n`);
    }
  } else if (!falhou) {
    console.log('\n  Tudo respondeu. Este Supabase serve o portal.\n');
  }
  process.exit(falhou ? 1 : 0);
}
