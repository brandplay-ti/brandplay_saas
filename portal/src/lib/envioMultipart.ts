// Motor do envio de mídia pelo navegador (BP-7.07, D4, RF2, RNF1). O arquivo
// sobe em partes, direto para o R2, por URLs que a Edge Function `midia-r2`
// assina (BP-7.05). Este módulo não conhece React nem Supabase: recebe a API
// e o envio de cada parte por parâmetro, o que deixa a retomada, as
// retentativas e a ordem das partes testáveis sem rede.

const MiB = 1024 * 1024;

/** Parte padrão de 64 MiB (BP-7, seção 6.3): bem abaixo do teto de escritas do R2. */
export const PARTE_PADRAO = 64 * MiB;
/** Mínimo do S3/R2 para toda parte que não é a última. */
export const PARTE_MINIMA = 5 * MiB;
export const MAX_PARTES = 10_000;

/** Tamanho de parte para o arquivo: 64 MiB, ou o necessário para caber em 10.000 partes. */
export function tamanhoDaParte(totalBytes: number, base = PARTE_PADRAO): number {
  const minimo = Math.ceil(totalBytes / MAX_PARTES / MiB) * MiB;
  return Math.max(base, PARTE_MINIMA, minimo);
}

export type Fatia = { numero: number; inicio: number; fim: number };

/** Partes do arquivo, numeradas a partir de 1. Arquivo vazio vira uma parte vazia. */
export function fatiar(totalBytes: number, parteBytes: number): Fatia[] {
  if (totalBytes <= 0) return [{ numero: 1, inicio: 0, fim: 0 }];
  const fatias: Fatia[] = [];
  for (let inicio = 0, numero = 1; inicio < totalBytes; inicio += parteBytes, numero++) {
    fatias.push({ numero, inicio, fim: Math.min(totalBytes, inicio + parteBytes) });
  }
  return fatias;
}

export type ParteNoServidor = { numero: number; etag: string; tamanho: number };

/** Chamadas à Edge Function `midia-r2`. */
export interface ApiDeEnvio {
  iniciar(p: { mediaId: string; variante: string; mime: string | null }): Promise<{ objetoId: string }>;
  assinarPartes(objetoId: string, partes: number[]): Promise<Array<{ numero: number; url: string }>>;
  listarPartes(objetoId: string): Promise<ParteNoServidor[]>;
  concluir(objetoId: string, partes: Array<{ numero: number; etag: string }>): Promise<{ tamanhoBytes: number }>;
  abortar(objetoId: string): Promise<void>;
}

/** Erro de uma parte. `status` 403 é URL vencida: o motor assina de novo. */
export class ErroDeParte extends Error {
  constructor(readonly status: number, mensagem: string) {
    super(mensagem);
  }
}

/** Envia uma parte e devolve o ETag que o armazenamento respondeu. */
export type EnviarParte = (
  url: string,
  corpo: Blob,
  aoProgredir: (bytesDaParte: number) => void,
  sinal: AbortSignal,
) => Promise<string>;

export type OpcoesDeEnvio = {
  arquivo: Blob;
  mediaId: string;
  variante: string;
  mime: string | null;
  api: ApiDeEnvio;
  enviarParte: EnviarParte;
  /** Envio já começado (retomada depois de recarregar): pula o `iniciar`. */
  objetoId?: string | null;
  /** Tamanho de parte usado quando o envio começou; numa retomada precisa ser o mesmo. */
  parteBytes?: number;
  /** Partes em paralelo. */
  paralelo?: number;
  /** Tentativas por parte antes de desistir. */
  tentativas?: number;
  sinal?: AbortSignal;
  /** Chamado assim que o servidor cria o envio: é o que se guarda para retomar. */
  aoIniciar?: (p: { objetoId: string; parteBytes: number }) => void;
  aoProgresso?: (enviados: number, total: number) => void;
  /** Espera entre tentativas (injetável nos testes). */
  esperar?: (ms: number) => Promise<void>;
};

export class EnvioCancelado extends Error {
  constructor() {
    super("Envio pausado.");
  }
}

const esperarPadrao = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Envia o arquivo inteiro e conclui. Numa retomada, pergunta ao servidor quais
 * partes já estão lá (com o tamanho certo) e manda só as outras. Interrompido
 * pelo `sinal`, para sem abortar no servidor: o envio continua retomável.
 */
export async function enviarArquivo(o: OpcoesDeEnvio): Promise<{ objetoId: string; tamanhoBytes: number }> {
  const total = o.arquivo.size;
  const parteBytes = o.parteBytes ?? tamanhoDaParte(total);
  const fatias = fatiar(total, parteBytes);
  if (fatias.length > MAX_PARTES) throw new Error("Arquivo grande demais para o envio em partes.");
  const paralelo = Math.max(1, o.paralelo ?? 4);
  const tentativas = Math.max(1, o.tentativas ?? 4);
  const esperar = o.esperar ?? esperarPadrao;
  // Sinal interno: pausa de quem chamou OU falha definitiva de uma parte. Na
  // falha, as outras partes em voo param em vez de seguir subindo sozinhas.
  const interno = new AbortController();
  const repassar = () => interno.abort();
  if (o.sinal?.aborted) interno.abort();
  o.sinal?.addEventListener("abort", repassar, { once: true });
  const sinal = interno.signal;
  const checarCancelado = () => {
    if (sinal.aborted) throw new EnvioCancelado();
  };

  try {
    return await executar();
  } finally {
    o.sinal?.removeEventListener("abort", repassar);
  }

  async function executar(): Promise<{ objetoId: string; tamanhoBytes: number }> {
  checarCancelado();
  let objetoId = o.objetoId ?? null;
  const prontas = new Map<number, string>();
  if (objetoId) {
    const noServidor = await o.api.listarPartes(objetoId);
    for (const p of noServidor) {
      const fatia = fatias[p.numero - 1];
      // Parte com tamanho diferente do esperado é refeita.
      if (fatia && p.tamanho === fatia.fim - fatia.inicio) prontas.set(p.numero, p.etag);
    }
  } else {
    objetoId = (await o.api.iniciar({ mediaId: o.mediaId, variante: o.variante, mime: o.mime })).objetoId;
  }
  o.aoIniciar?.({ objetoId, parteBytes });

  const progresso = new Map<number, number>();
  for (const f of fatias) if (prontas.has(f.numero)) progresso.set(f.numero, f.fim - f.inicio);
  const avisar = () => {
    let enviados = 0;
    for (const b of progresso.values()) enviados += b;
    o.aoProgresso?.(Math.min(enviados, total), total);
  };
  avisar();

  const pendentes = fatias.filter((f) => !prontas.has(f.numero));
  const urls = new Map<number, string>();
  // Lotes pequenos: a URL vale 15 minutos, e uma fila longa de partes de 64 MiB
  // numa conexão de evento passaria disso antes de chegar ao fim do lote.
  const tamanhoDoLote = paralelo * 2;

  const assinar = async (numeros: number[]) => {
    checarCancelado();
    for (const { numero, url } of await o.api.assinarPartes(objetoId!, numeros)) urls.set(numero, url);
  };

  const enviarFatia = async (fatia: Fatia) => {
    for (let tentativa = 1; ; tentativa++) {
      checarCancelado();
      if (!urls.has(fatia.numero)) await assinar([fatia.numero]);
      try {
        const etag = await o.enviarParte(
          urls.get(fatia.numero)!,
          o.arquivo.slice(fatia.inicio, fatia.fim),
          (bytes) => {
            progresso.set(fatia.numero, bytes);
            avisar();
          },
          sinal,
        );
        prontas.set(fatia.numero, etag);
        progresso.set(fatia.numero, fatia.fim - fatia.inicio);
        avisar();
        return;
      } catch (erro) {
        if (sinal.aborted) throw new EnvioCancelado();
        progresso.delete(fatia.numero);
        avisar();
        // URL vencida ou assinatura recusada: assina de novo na próxima volta.
        if (erro instanceof ErroDeParte && erro.status === 403) urls.delete(fatia.numero);
        if (tentativa >= tentativas) throw erro;
        await esperar(Math.min(30_000, 1_000 * 2 ** (tentativa - 1)));
      }
    }
  };

  for (let i = 0; i < pendentes.length; i += tamanhoDoLote) {
    const lote = pendentes.slice(i, i + tamanhoDoLote);
    await assinar(lote.map((f) => f.numero));
    let proxima = 0;
    const trabalhadores = Array.from({ length: Math.min(paralelo, lote.length) }, async () => {
      while (proxima < lote.length) {
        const fatia = lote[proxima++];
        await enviarFatia(fatia);
      }
    });
    try {
      await Promise.all(trabalhadores);
    } catch (erro) {
      // Pausa de quem chamou continua sendo pausa; falha de parte para as outras.
      const pausado = o.sinal?.aborted === true;
      interno.abort();
      await Promise.allSettled(trabalhadores);
      throw pausado ? new EnvioCancelado() : erro;
    }
  }

  checarCancelado();
  const partes = fatias.map((f) => ({ numero: f.numero, etag: prontas.get(f.numero)! }));
  const { tamanhoBytes } = await o.api.concluir(objetoId, partes);
  return { objetoId, tamanhoBytes };
  }
}

/**
 * Envio de uma parte pelo XMLHttpRequest, que, ao contrário do `fetch`,
 * informa o progresso do upload. O ETag só é legível se o bucket expuser o
 * header no CORS (docs/runbooks/armazenamento-r2.md).
 */
export const enviarParteXhr: EnviarParte = (url, corpo, aoProgredir, sinal) =>
  new Promise((resolver, rejeitar) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => aoProgredir(e.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolver(etag);
      else if (xhr.status >= 200 && xhr.status < 300) {
        rejeitar(new ErroDeParte(0, "O armazenamento não expôs o ETag (CORS do bucket)."));
      } else rejeitar(new ErroDeParte(xhr.status, `Parte recusada (${xhr.status}).`));
    };
    xhr.onerror = () => rejeitar(new ErroDeParte(0, "Falha de rede no envio da parte."));
    xhr.ontimeout = () => rejeitar(new ErroDeParte(0, "Tempo esgotado no envio da parte."));
    const abortar = () => xhr.abort();
    xhr.onabort = () => rejeitar(new EnvioCancelado());
    if (sinal.aborted) {
      rejeitar(new EnvioCancelado());
      return;
    }
    sinal.addEventListener("abort", abortar, { once: true });
    xhr.onloadend = () => sinal.removeEventListener("abort", abortar);
    xhr.send(corpo);
  });

/** Identidade do arquivo para reconhecer o mesmo arquivo escolhido de novo depois de recarregar. */
export function impressaoDoArquivo(a: { name: string; size: number; lastModified: number }): string {
  return `${a.name}::${a.size}::${a.lastModified}`;
}

/** Tipo da mídia pelo MIME ou, sem ele, pela extensão. `null` quando não é vídeo nem foto. */
export function tipoDaMidia(a: { name: string; type: string }): "video" | "foto" | null {
  if (a.type.startsWith("video/")) return "video";
  if (a.type.startsWith("image/")) return "foto";
  const ext = a.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (["mp4", "mov", "mxf", "mts", "m2ts", "mkv", "avi", "webm", "braw", "r3d", "insv", "lrv"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "webp", "heic", "heif", "tif", "tiff", "dng", "cr2", "cr3", "nef", "arw"].includes(ext)) return "foto";
  return null;
}

/** MIME que o banco aceita (0049) ou `null`. */
export function mimeAceito(tipo: string): string | null {
  const t = tipo.trim().toLowerCase();
  return /^[a-z]+\/[a-z0-9.+-]{1,100}$/.test(t) ? t : null;
}

/** Nome que o banco aceita: até 255 caracteres, sem caractere de controle. */
export function erroNoNomeDoArquivo(nome: string): string | null {
  if (!nome) return "Arquivo sem nome.";
  if (nome.length > 255) return "Nome do arquivo com mais de 255 caracteres.";
  // eslint-disable-next-line no-control-regex -- recusa caractere de controle, como o banco
  if (/[\u0000-\u001f\u007f]/.test(nome)) return "Nome do arquivo com caractere inválido.";
  return null;
}
