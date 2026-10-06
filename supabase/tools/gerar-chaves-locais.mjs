// Gera o conjunto de segredos do Supabase local, coerente entre si.
//
// ─── Por que isto existe ─────────────────────────────────────────────
//
// `ANON_KEY` e `SERVICE_ROLE_KEY` não são valores avulsos: são JWTs assinados
// com o `JWT_SECRET`. Trocar o segredo sem regerar os dois produz um stack em
// que nada autentica, com erro que não menciona nenhum dos três.
//
// O caminho de menor esforço, diante disso, é copiar as chaves de homologação
// para a máquina de desenvolvimento. Aí o ambiente local passa a aceitar a
// chave de um ambiente publicado, e um `.env` esquecido num commit vaza acesso
// real. Um comando que produz um conjunto novo e coerente remove o incentivo.
//
// ─── Uso ─────────────────────────────────────────────────────────────
//
//   npm run supabase:chaves
//
// Ele imprime; quem cola é você. Nada aqui escreve em `.env` — sobrescrever um
// arquivo de segredos por engano é caro demais para valer a conveniência.
//
// Depois de trocar, o volume do Postgres precisa ser recriado: as senhas dos
// papéis internos são gravadas na inicialização.
//
//   npm run supabase:reset && npm run supabase:up

import { createHmac, randomBytes, randomUUID } from 'node:crypto';

// Distante o suficiente para não expirar durante o desenvolvimento, e ainda
// assim uma data — uma chave sem `exp` é uma chave eterna.
const EXPIRA_EM = Math.floor(new Date('2035-01-01T00:00:00Z').getTime() / 1000);

const base64url = (entrada) =>
  Buffer.from(entrada)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

const aleatorio = (bytes) => randomBytes(bytes).toString('base64url').slice(0, bytes);

// JWT HS256 no formato que o GoTrue, o PostgREST e o Storage esperam.
function assinar(payload, segredo) {
  const cabecalho = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const corpo = base64url(JSON.stringify(payload));
  const assinatura = createHmac('sha256', segredo)
    .update(`${cabecalho}.${corpo}`)
    .digest('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return `${cabecalho}.${corpo}.${assinatura}`;
}

const jwtSecret = aleatorio(40);
const emitidoEm = Math.floor(Date.now() / 1000);

const chaveDePapel = (role) =>
  assinar({ iss: 'supabase', role, iat: emitidoEm, exp: EXPIRA_EM }, jwtSecret);

const anon = chaveDePapel('anon');
const serviceRole = chaveDePapel('service_role');

// As chaves opacas `sb_` são traduzidas pelo `kong-entrypoint.sh` para o JWT
// correspondente, via expressão Lua. Quando as duas ficam vazias, o Kong opera
// no modo legado e repassa o `apikey` como veio. Preenchê-las reproduz o
// arranjo dos ambientes hospedados, onde as duas formas funcionam.
const publishable = `sb_publishable_${randomBytes(16).toString('hex')}`;
const secret = `sb_secret_${randomBytes(16).toString('hex')}`;

const valores = {
  JWT_SECRET: jwtSecret,
  ANON_KEY: anon,
  SERVICE_ROLE_KEY: serviceRole,
  // Sem par de chaves EC configurado, o upstream espelha os JWTs simétricos
  // nestes campos — é o que homologação faz.
  ANON_KEY_ASYMMETRIC: anon,
  SERVICE_ROLE_KEY_ASYMMETRIC: serviceRole,
  SUPABASE_PUBLISHABLE_KEY: publishable,
  SUPABASE_SECRET_KEY: secret,
  POSTGRES_PASSWORD: aleatorio(32),
  DASHBOARD_PASSWORD: aleatorio(32),
  SECRET_KEY_BASE: aleatorio(64),
  VAULT_ENC_KEY: aleatorio(32),
  PG_META_CRYPTO_KEY: aleatorio(32),
  REALTIME_DB_ENC_KEY: aleatorio(16),
  POOLER_TENANT_ID: randomUUID(),
};

// `--env`: só as atribuições, sem a prosa. É o que o CI acrescenta ao `.env`
// gerado a partir do `.env.example` — um parser de dotenv não engole texto
// solto, e filtrar a saída no workflow esconderia a intenção.
if (process.argv.includes('--env')) {
  console.log(
    Object.entries(valores)
      .map(([nome, valor]) => `${nome}=${valor}`)
      .join('\n'),
  );
  process.exit(0);
}

console.log(
  [
    '',
    '  Segredos do Supabase LOCAL. Cole em `docker/supabase/.env`.',
    '',
    '  Estes valores são exclusivos de desenvolvimento. Reaproveitá-los em',
    '  homologação ou produção anula o isolamento entre os ambientes — e a',
    '  recíproca é pior: trazer a chave de um ambiente publicado para cá põe',
    '  acesso real numa máquina de trabalho.',
    '',
    '  Depois de colar: `npm run supabase:reset && npm run supabase:up`.',
    '  As senhas dos papéis internos só são gravadas na criação do volume.',
    '',
    '  ─────────────────────────────────────────────────────────────────',
    '',
    ...Object.entries(valores).map(([nome, valor]) => `${nome}=${valor}`),
    '',
  ].join('\n'),
);
