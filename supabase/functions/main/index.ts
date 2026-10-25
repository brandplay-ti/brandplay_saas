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
//
// Toda rota passa por `_shared/observabilidade.ts`: log `request.inicio` /
// `request.fim` e contador Prometheus. `metricas` responde aqui, no processo
// que acumula os contadores — nao existe diretorio `functions/metricas`.

import { STATUS_CODE } from 'jsr:@std/http/status';
import {
  camposDaRequisicao,
  camposDaResposta,
  chavesDeConsulta,
  funcaoSegura,
  linhaFim,
  linhaInicio,
  metricas,
  responderMetricas,
} from '../_shared/observabilidade.ts';

const JWT_SECRET = Deno.env.get('JWT_SECRET');
const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true';

function encaminhar(req: Request, requestId: string): Request {
  const headers = new Headers(req.headers);
  headers.set('x-request-id', requestId);
  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = req.body;
  return new Request(req.url, init);
}

function marcarResposta(res: Response, requestId: string): Response {
  const headers = new Headers(res.headers);
  headers.set('x-request-id', requestId);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const { pathname } = url;
  const functionName = pathname.split('/').filter(Boolean)[0] ?? '';
  const requestId = crypto.randomUUID();
  const iniciado = performance.now();
  const campos = await camposDaRequisicao(req);
  const consulta = chavesDeConsulta(url);

  const inicio = {
    request_id: requestId,
    funcao: functionName || 'ausente',
    metodo: req.method,
    campos,
    consulta,
  };
  console.log(linhaInicio(inicio));

  const encerrar = async (res: Response, erro?: string) => {
    const duracao = Math.round(performance.now() - iniciado);
    const marcada = marcarResposta(res, requestId);
    const camposSaida = await camposDaResposta(marcada);
    console.log(linhaFim({
      ...inicio,
      status: marcada.status,
      duracao_ms: duracao,
      campos_saida: camposSaida,
      erro,
    }));
    metricas.registrar(inicio.funcao, marcada.status, duracao);
    return marcada;
  };

  if (!functionName || !funcaoSegura(functionName)) {
    return await encerrar(new Response(JSON.stringify({ error: 'missing function name in request' }), {
      status: STATUS_CODE.BadRequest,
      headers: { 'Content-Type': 'application/json' },
    }));
  }

  if (functionName === 'metricas') {
    return await encerrar(responderMetricas(req));
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
    const res = await worker.fetch(encaminhar(req, requestId));
    return await encerrar(res);
  } catch (error) {
    const motivo = String((error as Error)?.message ?? error).slice(0, 300);
    console.error(`erro ao executar a funcao "${functionName}":`, motivo);

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
    return await encerrar(
      new Response(
        JSON.stringify({
          error: 'function not found or failed to boot',
          function: functionName,
          reason: motivo,
        }),
        { status: STATUS_CODE.InternalServerError, headers: { 'Content-Type': 'application/json' } },
      ),
      motivo,
    );
  }
});

// Este despachante NAO verifica JWT: nada aqui le `VERIFY_JWT`, e o compose
// sobe o runtime sem `--verify-jwt`. Cada funcao valida o usuario por conta
// propria (`auth.getUser()`) — e de proposito, ver "Edge Functions" no
// SECURITY.md. As variaveis ficam referenciadas para quem procurar por elas
// chegar aqui.
void JWT_SECRET;
void VERIFY_JWT;
