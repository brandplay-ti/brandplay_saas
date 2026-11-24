// Estado dos envios de mídia guardado no navegador (BP-7.07, RNF1): o que é
// preciso para retomar depois de recarregar a página. Só identificadores e a
// impressão do arquivo; o arquivo em si o navegador não guarda, e a pessoa
// escolhe de novo. O servidor continua sendo a fonte do que já subiu
// (`listar_partes`): isto aqui só evita começar do zero.

export type StatusDoEnvio = "na_fila" | "enviando" | "pausado" | "interrompido" | "concluido" | "erro";

export type EnvioSalvo = {
  id: string;
  organizationId: string;
  propertyId: string;
  mediaId: string;
  objetoId: string | null;
  parteBytes: number | null;
  variante: string;
  mime: string | null;
  nome: string;
  tamanho: number;
  impressao: string;
  status: StatusDoEnvio;
  enviados: number;
  erro: string | null;
};

export const chaveDosEnvios = (userId: string) => `brandplay:envios-midia:${userId}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS: readonly StatusDoEnvio[] = ["na_fila", "enviando", "pausado", "interrompido", "concluido", "erro"];

/** Só o que ainda pode continuar vai para o navegador. */
export const ehRetomavel = (s: StatusDoEnvio) => s !== "concluido";

function lerUm(v: unknown): EnvioSalvo | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  const texto = (x: unknown) => (typeof x === "string" ? x : null);
  const id = texto(e.id);
  const organizationId = texto(e.organizationId);
  const propertyId = texto(e.propertyId);
  const mediaId = texto(e.mediaId);
  const objetoId = e.objetoId === null ? null : texto(e.objetoId);
  const nome = texto(e.nome);
  const impressao = texto(e.impressao);
  const variante = texto(e.variante);
  const status = texto(e.status) as StatusDoEnvio | null;
  const tamanho = typeof e.tamanho === "number" && Number.isSafeInteger(e.tamanho) && e.tamanho >= 0 ? e.tamanho : null;
  const parteBytes =
    e.parteBytes === null ? null : typeof e.parteBytes === "number" && Number.isSafeInteger(e.parteBytes) && e.parteBytes > 0 ? e.parteBytes : undefined;
  if (!id || !nome || !impressao || !variante || tamanho === null || parteBytes === undefined) return null;
  if (![organizationId, propertyId, mediaId].every((x) => x && UUID.test(x))) return null;
  if (objetoId !== null && !(objetoId && UUID.test(objetoId))) return null;
  if (!status || !STATUS.includes(status) || !ehRetomavel(status)) return null;
  return {
    id,
    organizationId: organizationId!,
    propertyId: propertyId!,
    mediaId: mediaId!,
    objetoId,
    parteBytes,
    variante,
    mime: texto(e.mime),
    nome,
    tamanho,
    impressao,
    // Recarregou: o arquivo ficou para trás. Até ele ser escolhido de novo, o envio está interrompido.
    status: "interrompido",
    enviados: typeof e.enviados === "number" && e.enviados >= 0 ? Math.min(e.enviados, tamanho) : 0,
    erro: null,
  };
}

/** Lê os envios salvos, descartando o que estiver corrompido ou não for mais retomável. */
export function lerEnviosSalvos(bruto: string | null): EnvioSalvo[] {
  if (!bruto) return [];
  try {
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return lista.map(lerUm).filter((e): e is EnvioSalvo => e !== null);
  } catch {
    return [];
  }
}

export function serializarEnvios(envios: EnvioSalvo[]): string {
  return JSON.stringify(envios.filter((e) => ehRetomavel(e.status)));
}
