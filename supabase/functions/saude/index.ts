// Prova de vida do runtime de Edge Functions.
//
// Existe para o healthcheck do container exercitar o caminho que de fato
// quebra: o `main` ler uma funcao de /home/deno/functions e despachar para
// ela. Responder 200 aqui significa que o diretorio das funcoes estava
// legivel neste instante.
//
// Checar o `main` nao prova isso. Ele e compilado para /var/tmp na subida e
// segue respondendo mesmo depois de o diretorio ficar ilegivel ou desaparecer
// — foi assim que homologacao passou um deploy inteiro devolvendo 500 em toda
// funcao, com o container de pe e nenhum alarme.
//
// O que ela NAO cobre: o worker roda em sandbox sem acesso a disco (toda
// chamada de `Deno.readDir`/`Deno.stat` volta `NotSupported`), entao esta
// funcao nao consegue conferir as vizinhas. Ela e uma amostra — vale porque a
// falha conhecida derruba o diretorio inteiro de uma vez, e nao uma funcao
// isolada.
//
// Sem import remoto, de proposito: um esm.sh fora do ar nao pode virar
// "runtime de funcoes doente". Sem banco e sem Redis, pelo mesmo motivo — a
// saude de cada um deles e checada no servico de cada um.

Deno.serve(
  () =>
    new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
);
