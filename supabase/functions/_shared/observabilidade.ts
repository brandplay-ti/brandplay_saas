// Log transacional e métricas das Edge Functions.
//
// O despachante (`main`) chama isto em toda rota: uma linha `request.inicio`,
// outra `request.fim`, e contadores no formato do Prometheus. Função nova não
// reimplementa esse ciclo. Depois de autenticar, chama `logContexto` com o
// usuário e a organização já resolvidos. O corpo não entra no log — só os
// nomes dos campos. Senha, token, documento e o header Authorization ficam de fora.
//
// `metricas` não é uma função em disco. O despachante responde no próprio
// processo, onde os contadores vivem. Sem `EDGE_METRICS_TOKEN` o caminho
// responde 404.

const LIMITE_CORPO = 65_536;
const BALDES_MS = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
const FUNCAO_SEGURA = /^[a-z0-9_-]{1,64}$/;
const CHAVE_SEGURA = /^[A-Za-z0-9_]{1,64}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO = /^[a-z0-9_-]{1,64}$/i;

export function funcaoSegura(nome: string): boolean {
  return FUNCAO_SEGURA.test(nome);
}

export function sanitizarFuncao(nome: string): string {
  return funcaoSegura(nome) ? nome : "invalida";
}

/** Nomes dos campos de um JSON. Valores nunca saem daqui. */
export function chavesDoJson(texto: string): string[] {
  if (!texto || texto.length > LIMITE_CORPO) return ["corpo-acima-de-64kb"];
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    return [];
  }
  if (Array.isArray(valor)) return ["lista"];
  if (!valor || typeof valor !== "object") return [];
  return Object.keys(valor as Record<string, unknown>)
    .filter((chave) => CHAVE_SEGURA.test(chave))
    .slice(0, 40)
    .sort();
}

export async function camposDaRequisicao(req: Request): Promise<string[]> {
  if (req.method === "GET" || req.method === "HEAD") return [];
  const tipo = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!tipo.includes("application/json")) return [];
  try {
    const texto = await req.clone().text();
    return chavesDoJson(texto);
  } catch {
    return [];
  }
}

export async function camposDaResposta(res: Response): Promise<string[]> {
  const tipo = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!tipo.includes("application/json")) return [];
  try {
    const texto = await res.clone().text();
    return chavesDoJson(texto);
  } catch {
    return [];
  }
}

export function chavesDeConsulta(url: URL): string[] {
  return [...url.searchParams.keys()]
    .filter((chave) => CHAVE_SEGURA.test(chave))
    .slice(0, 20)
    .sort();
}

export type EventoInicio = {
  request_id: string;
  funcao: string;
  metodo: string;
  campos: string[];
  consulta: string[];
};

export type EventoFim = EventoInicio & {
  status: number;
  duracao_ms: number;
  campos_saida: string[];
  erro?: string;
};

export function linhaInicio(evento: EventoInicio): string {
  return JSON.stringify({
    evento: "request.inicio",
    request_id: evento.request_id,
    funcao: sanitizarFuncao(evento.funcao),
    metodo: evento.metodo,
    campos: evento.campos,
    consulta: evento.consulta,
  });
}

export function linhaFim(evento: EventoFim): string {
  const linha: Record<string, unknown> = {
    evento: "request.fim",
    request_id: evento.request_id,
    funcao: sanitizarFuncao(evento.funcao),
    metodo: evento.metodo,
    status: evento.status,
    duracao_ms: evento.duracao_ms,
    campos: evento.campos,
    campos_saida: evento.campos_saida,
    consulta: evento.consulta,
  };
  if (evento.erro) linha.erro = evento.erro.slice(0, 200);
  return JSON.stringify(linha);
}

/** Compara o token do scrape sem curto-circuitar no primeiro byte diferente. */
export function tokensIguais(recebido: string, esperado: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(recebido);
  const b = encoder.encode(esperado);
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

type Acumulado = {
  porStatus: Map<number, number>;
  baldes: number[];
  somaMs: number;
  total: number;
};

export class MetricasEdge {
  private readonly series = new Map<string, Acumulado>();

  registrar(funcao: string, status: number, duracaoMs: number): void {
    const nome = sanitizarFuncao(funcao);
    const codigo = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
    const duracao = Number.isFinite(duracaoMs) && duracaoMs >= 0 ? duracaoMs : 0;
    let serie = this.series.get(nome);
    if (!serie) {
      serie = {
        porStatus: new Map(),
        baldes: new Array(BALDES_MS.length + 1).fill(0),
        somaMs: 0,
        total: 0,
      };
      this.series.set(nome, serie);
    }
    serie.porStatus.set(codigo, (serie.porStatus.get(codigo) ?? 0) + 1);
    serie.somaMs += duracao;
    serie.total += 1;
    BALDES_MS.forEach((teto, indice) => {
      if (duracao <= teto) serie!.baldes[indice] += 1;
    });
    serie.baldes[BALDES_MS.length] += 1;
  }

  prometheus(): string {
    const linhas = [
      "# HELP brandplay_edge_requests_total Requests recebidas pelo despachante das Edge Functions.",
      "# TYPE brandplay_edge_requests_total counter",
    ];
    const nomes = [...this.series.keys()].sort();
    for (const nome of nomes) {
      const serie = this.series.get(nome)!;
      for (const status of [...serie.porStatus.keys()].sort((a, b) => a - b)) {
        linhas.push(
          `brandplay_edge_requests_total{funcao="${nome}",status="${status}"} ${serie.porStatus.get(status)}`,
        );
      }
    }
    linhas.push(
      "# HELP brandplay_edge_request_duration_ms Duração do despacho até a resposta, em milissegundos.",
      "# TYPE brandplay_edge_request_duration_ms histogram",
    );
    for (const nome of nomes) {
      const serie = this.series.get(nome)!;
      BALDES_MS.forEach((teto, indice) => {
        linhas.push(
          `brandplay_edge_request_duration_ms_bucket{funcao="${nome}",le="${teto}"} ${serie.baldes[indice]}`,
        );
      });
      linhas.push(
        `brandplay_edge_request_duration_ms_bucket{funcao="${nome}",le="+Inf"} ${serie.baldes[BALDES_MS.length]}`,
        `brandplay_edge_request_duration_ms_sum{funcao="${nome}"} ${Math.round(serie.somaMs)}`,
        `brandplay_edge_request_duration_ms_count{funcao="${nome}"} ${serie.total}`,
      );
    }
    return `${linhas.join("\n")}\n`;
  }
}

export const metricas = new MetricasEdge();

export function responderMetricas(
  req: Request,
  destino: MetricasEdge = metricas,
  tokenEsperado?: string,
): Response {
  const esperado = tokenEsperado ?? Deno.env.get("EDGE_METRICS_TOKEN") ?? "";
  if (!esperado) {
    return new Response(JSON.stringify({ error: "métricas desligadas" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "use GET" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!tokensIguais(token, esperado)) {
    return new Response(JSON.stringify({ error: "não autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(destino.prometheus(), {
    status: 200,
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}

const escreverPadrao = (linha: string) => console.log(linha);

/** Depois do JWT validado. Ignora o que não for uuid ou código curto. */
export function logContexto(
  req: Request,
  dados: { user_id?: string | null; organization_id?: string | null; code?: string | null },
  escrever: (linha: string) => void = escreverPadrao,
): void {
  const linha: Record<string, string> = {
    evento: "request.contexto",
    request_id: req.headers.get("x-request-id") ?? "",
  };
  if (dados.user_id && UUID.test(dados.user_id)) linha.user_id = dados.user_id;
  if (dados.organization_id && UUID.test(dados.organization_id)) {
    linha.organization_id = dados.organization_id;
  }
  if (dados.code && CODIGO.test(dados.code)) linha.code = dados.code;
  escrever(JSON.stringify(linha));
}
