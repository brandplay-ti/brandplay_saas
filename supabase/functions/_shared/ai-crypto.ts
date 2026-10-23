// Cifra das chaves de API de IA guardadas em `ai_credentials` (backlog IA-04,
// docs/architecture/plano-ia-por-cliente.md §3 decisão 5).
//
// A chave do fornecedor nunca chega ao banco em claro: a Edge Function cifra
// com AES-256-GCM (Web Crypto) e grava cifra, IV e a versão da chave mestra.
// Só a Edge Function, com a chave mestra do ambiente, decifra. Backup do
// banco sozinho não expõe chave nenhuma.
//
// Configuração (variáveis do serviço `functions`, nunca `VITE_*`):
//
//   AI_KEYS_MASTER_KEY             chave mestra atual: 32 bytes em base64
//                                  (`npm run supabase:chaves` gera uma local).
//   AI_KEYS_MASTER_KEY_VERSION     versão da atual (padrão 1). Grava-se sempre
//                                  com ela.
//   AI_KEYS_PREVIOUS_MASTER_KEYS   versões antigas, só para decifrar durante
//                                  a rotação: "1:<base64>;2:<base64>".
//
// Amarração ao dono: a cifra leva como dado autenticado (AAD) a organização
// dona da chave, ou "padrao" para a chave da plataforma. Uma linha copiada de
// uma organização para outra no banco não decifra — a credencial de um
// cliente não serve para outro nem por erro de gravação.
//
// Nenhuma mensagem de erro daqui contém chave, chave mestra ou cifra.

export type ErroDeCifraCodigo =
  | "chave_mestra_ausente"
  | "chave_mestra_invalida"
  | "versao_desconhecida"
  | "chave_invalida"
  | "falha_ao_decifrar";

export class ErroDeCifra extends Error {
  constructor(readonly codigo: ErroDeCifraCodigo, mensagem: string) {
    super(mensagem);
    this.name = "ErroDeCifra";
  }
}

/** Chaves mestras disponíveis: a atual (para cifrar) e todas por versão (para decifrar). */
export interface ChavesMestras {
  versaoAtual: number;
  porVersao: Map<number, string>;
}

/** O que vai para `ai_credentials`: key_ciphertext, key_iv, key_version, key_hint. */
export interface ChaveCifrada {
  ciphertext: string;
  iv: string;
  version: number;
  hint: string;
}

/** Dono da chave: id da organização, ou nulo para a chave padrão da plataforma. */
export type DonoDaChave = string | null;

const TAMANHO_CHAVE_MESTRA = 32;
const TAMANHO_IV = 12;
// Abaixo disso o final exibido ("••••1234") revelaria boa parte da chave.
const TAMANHO_MINIMO_CHAVE = 12;
const TAMANHO_FINAL = 4;

function paraBase64(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

function deBase64(texto: string): Uint8Array {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function bytesDaChaveMestra(base64: string, versao: number): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = deBase64(base64.trim());
  } catch {
    throw new ErroDeCifra("chave_mestra_invalida", `Chave mestra de IA versão ${versao} não é base64 válido.`);
  }
  if (bytes.length !== TAMANHO_CHAVE_MESTRA) {
    throw new ErroDeCifra(
      "chave_mestra_invalida",
      `Chave mestra de IA versão ${versao} precisa ter ${TAMANHO_CHAVE_MESTRA} bytes.`,
    );
  }
  return bytes;
}

/** Lê as chaves mestras do ambiente. Valida formato e tamanho de todas. */
export function chavesMestrasDoAmbiente(
  ler: (nome: string) => string | undefined = (nome) => Deno.env.get(nome),
): ChavesMestras {
  const atual = ler("AI_KEYS_MASTER_KEY")?.trim();
  if (!atual) {
    throw new ErroDeCifra("chave_mestra_ausente", "AI_KEYS_MASTER_KEY não configurada.");
  }
  const versaoTexto = ler("AI_KEYS_MASTER_KEY_VERSION")?.trim() || "1";
  const versaoAtual = Number(versaoTexto);
  if (!Number.isInteger(versaoAtual) || versaoAtual < 1) {
    throw new ErroDeCifra("chave_mestra_invalida", "AI_KEYS_MASTER_KEY_VERSION precisa ser um inteiro >= 1.");
  }

  const porVersao = new Map<number, string>();
  for (const item of (ler("AI_KEYS_PREVIOUS_MASTER_KEYS") ?? "").split(";")) {
    if (!item.trim()) continue;
    const separador = item.indexOf(":");
    const versao = Number(item.slice(0, separador).trim());
    if (separador < 1 || !Number.isInteger(versao) || versao < 1) {
      throw new ErroDeCifra(
        "chave_mestra_invalida",
        'AI_KEYS_PREVIOUS_MASTER_KEYS fora do formato "<versão>:<base64>;...".',
      );
    }
    const chave = item.slice(separador + 1).trim();
    bytesDaChaveMestra(chave, versao);
    porVersao.set(versao, chave);
  }
  bytesDaChaveMestra(atual, versaoAtual);
  porVersao.set(versaoAtual, atual);

  return { versaoAtual, porVersao };
}

async function importar(chaves: ChavesMestras, versao: number): Promise<CryptoKey> {
  const base64 = chaves.porVersao.get(versao);
  if (!base64) {
    throw new ErroDeCifra("versao_desconhecida", `Chave mestra de IA versão ${versao} não configurada.`);
  }
  return await crypto.subtle.importKey(
    "raw",
    bytesDaChaveMestra(base64, versao),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function dadoAutenticado(dono: DonoDaChave): Uint8Array {
  return new TextEncoder().encode(`brandplay:ai_credentials:${dono ?? "padrao"}`);
}

/** Últimos caracteres da chave, para tela e auditoria. */
export function finalDaChave(chave: string): string {
  return chave.trim().slice(-TAMANHO_FINAL);
}

/** Cifra a chave do fornecedor para o dono informado, com a chave mestra atual. */
export async function cifrarChave(
  chave: string,
  dono: DonoDaChave,
  chaves: ChavesMestras = chavesMestrasDoAmbiente(),
): Promise<ChaveCifrada> {
  const limpa = chave.trim();
  if (limpa.length < TAMANHO_MINIMO_CHAVE) {
    throw new ErroDeCifra("chave_invalida", "Chave de API curta demais.");
  }
  const iv = crypto.getRandomValues(new Uint8Array(TAMANHO_IV));
  const cifra = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: dadoAutenticado(dono) },
    await importar(chaves, chaves.versaoAtual),
    new TextEncoder().encode(limpa),
  );
  return {
    ciphertext: paraBase64(new Uint8Array(cifra)),
    iv: paraBase64(iv),
    version: chaves.versaoAtual,
    hint: finalDaChave(limpa),
  };
}

/**
 * Decifra uma linha de `ai_credentials`. O dono precisa ser o mesmo da
 * cifragem (a `organization_id` da linha); qualquer divergência, adulteração
 * ou chave mestra errada falha como `falha_ao_decifrar`.
 */
export async function decifrarChave(
  cifrada: { ciphertext: string; iv: string; version: number },
  dono: DonoDaChave,
  chaves: ChavesMestras = chavesMestrasDoAmbiente(),
): Promise<string> {
  const chaveMestra = await importar(chaves, cifrada.version);
  try {
    const claro = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: deBase64(cifrada.iv), additionalData: dadoAutenticado(dono) },
      chaveMestra,
      deBase64(cifrada.ciphertext),
    );
    return new TextDecoder().decode(claro);
  } catch {
    throw new ErroDeCifra("falha_ao_decifrar", "Não foi possível decifrar a chave de IA.");
  }
}
