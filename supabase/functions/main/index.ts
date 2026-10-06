// Main service do supabase/edge-runtime: recebe todas as requisicoes de
// /functions/v1/<nome> e despacha para a funcao correspondente montada em
// /home/deno/functions/<nome>.
//
// Mora aqui, e nao em docker/, porque o compose monta `supabase/functions`
// inteiro em /home/deno/functions e sobe com
// `--main-service /home/deno/functions/main`. O mesmo arquivo serve o ambiente
// local e os hospedados — que e o ponto da unificacao do stack.
//
// Ele nao e uma funcao de negocio: chamar /functions/v1/main nao faz sentido.
// E o despachante que torna as demais alcancaveis.

import { STATUS_CODE } from 'jsr:@std/http/status';

const JWT_SECRET = Deno.env.get('JWT_SECRET');
const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true';

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const { pathname } = url;
  const functionName = pathname.split('/').filter(Boolean)[0];

  if (!functionName) {
    return new Response(JSON.stringify({ error: 'missing function name in request' }), {
      status: STATUS_CODE.BadRequest,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const servicePath = `/home/deno/functions/${functionName}`;

  const createWorker = async () => {
    const memoryLimitMb = 150;
    const workerTimeoutMs = 5 * 60 * 1000;
    const noModuleCache = false;
    const envVarsObj = Deno.env.toObject();
    const envVars = Object.entries(envVarsObj);

    return await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb,
      workerTimeoutMs,
      noModuleCache,
      envVars,
      forceInstallExtensions: true,
    });
  };

  try {
    const worker = await createWorker();
    return await worker.fetch(req);
  } catch (error) {
    console.error(`erro ao executar a funcao "${functionName}":`, error);

    // O motivo vai na resposta, e nao so no log.
    //
    // Antes daqui saia apenas "function not found or failed to boot", e as
    // causas possiveis sao muito diferentes entre si — diretorio nao montado,
    // modulo remoto inalcancavel, erro de sintaxe, limite de memoria. Sem o
    // motivo, diagnosticar exigia acesso ao log do container, que quem ve o
    // erro no navegador normalmente nao tem.
    //
    // E stack de infraestrutura self-hosted, e a mensagem vem do runtime, nao
    // de dado de usuario.
    return new Response(
      JSON.stringify({
        error: 'function not found or failed to boot',
        function: functionName,
        reason: String((error as Error)?.message ?? error).slice(0, 300),
      }),
      { status: STATUS_CODE.InternalServerError, headers: { 'Content-Type': 'application/json' } },
    );
  }
});

// Referenciado apenas para deixar explicito o contrato de verificacao de JWT,
// que hoje e feito pelo proprio runtime via flag --verify-jwt.
void JWT_SECRET;
void VERIFY_JWT;
