// Deriva ANON_KEY/SERVICE_ROLE_KEY a partir de um JWT_SECRET que JA EXISTE
// num ambiente — sem gerar um secret novo.
//
// ─── Por que isto existe ─────────────────────────────────────────────
//
// `gerar-chaves-locais.mjs` sorteia um JWT_SECRET novo e as chaves dele: serve
// para montar um ambiente do zero. Aqui o problema e o oposto — confirmar (ou
// corrigir) se a ANON_KEY/SERVICE_ROLE_KEY hoje configuradas num ambiente
// batem com o JWT_SECRET que o Kong/PostgREST desse mesmo ambiente usa para
// verificar assinatura. Reaproveitar chaves de outro ambiente (ou trocar o
// JWT_SECRET sem regerar as duas) produz exatamente esse sintoma: a Edge
// Function autentica o usuario normalmente (isso passa pelo GoTrue), mas toda
// chamada que usa a service role para falar com o PostgREST falha com
// "No suitable key or wrong key type" / "None of the keys was able to decode
// the JWT".
//
// ─── Uso ─────────────────────────────────────────────────────────────
//
//   JWT_SECRET=<segredo-do-ambiente> node supabase/tools/gerar-chave-de-papel.mjs
//
// O segredo entra so pela variavel de ambiente e nunca e escrito em disco nem
// impresso de volta — so as chaves derivadas saem no stdout, para comparar
// com o que esta configurado no Dockploy (ou colar por cima, se estiver
// divergente).
//
// Isto NAO rotaciona o JWT_SECRET. Trocar o segredo em si invalida sessoes de
// usuario ja emitidas pelo GoTrue e URLs assinadas do Storage — use isto so
// para conferir/corrigir as chaves derivadas de um segredo que ja esta em uso.

import { createHmac } from 'node:crypto';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error('Defina JWT_SECRET no ambiente antes de rodar este script.');
  console.error('Uso: JWT_SECRET=<segredo-do-ambiente> node supabase/tools/gerar-chave-de-papel.mjs');
  process.exit(1);
}

// Mesma data de expiracao usada em gerar-chaves-locais.mjs: distante o
// suficiente para nao expirar, ainda assim uma data — uma chave sem `exp` e
// uma chave eterna.
const EXPIRA_EM = Math.floor(new Date('2035-01-01T00:00:00Z').getTime() / 1000);

const base64url = (entrada) =>
  Buffer.from(entrada)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

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

const emitidoEm = Math.floor(Date.now() / 1000);
const chaveDePapel = (role) =>
  assinar({ iss: 'supabase', role, iat: emitidoEm, exp: EXPIRA_EM }, jwtSecret);

console.log(
  [
    '',
    '  Chaves derivadas do JWT_SECRET informado. Compare com o que esta',
    '  configurado no Dockploy para este ambiente — se ANON_KEY ou',
    '  SERVICE_ROLE_KEY estiverem diferentes do que segue, e essa a causa de',
    '  "No suitable key or wrong key type" / "None of the keys was able to',
    '  decode the JWT".',
    '',
    `  ANON_KEY=${chaveDePapel('anon')}`,
    `  SERVICE_ROLE_KEY=${chaveDePapel('service_role')}`,
    '',
    '  Sem par de chaves EC configurado, ANON_KEY_ASYMMETRIC e',
    '  SERVICE_ROLE_KEY_ASYMMETRIC recebem os mesmos valores acima.',
    '',
  ].join('\n'),
);
