// Equipe da plataforma (ADR-0008, 0046): papel de quem chama e validação das
// entradas das Edge Functions `admin-team` e `admin-invoices`.
//
// O papel vem de `platform_admins` para o usuário do JWT — nunca do corpo.
// As funções SQL repetem a checagem: este módulo não é a fronteira.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type PapelDaPlataforma = "superadmin" | "suporte";

/** Papel ativo do usuário na equipe da plataforma, ou null. */
export async function papelNaPlataforma(db: SupabaseClient, userId: string): Promise<PapelDaPlataforma | null> {
  const { data, error } = await db
    .from("platform_admins")
    .select("role")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const papel = (data as { role?: string } | null)?.role;
  return papel === "superadmin" || papel === "suporte" ? papel : null;
}

export class EntradaInvalida extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntradaInvalida";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const SENHA_MINIMA = 8;

export function validarMotivo(valor: unknown): string {
  if (typeof valor !== "string" || valor.trim().length < 3) {
    throw new EntradaInvalida("Informe o motivo (ao menos 3 caracteres).");
  }
  return valor.trim().slice(0, 500);
}

export function validarUuid(valor: unknown, mensagem: string): string {
  if (typeof valor !== "string" || !UUID.test(valor)) throw new EntradaInvalida(mensagem);
  return valor;
}

export interface NovoSuporte {
  email: string;
  nome: string;
  senha: string;
  motivo: string;
}

/** Cadastro de Suporte: e-mail, nome, senha temporária e motivo. */
export function validarNovoSuporte(corpo: {
  email?: unknown;
  full_name?: unknown;
  password?: unknown;
  comment?: unknown;
}): NovoSuporte {
  const email = typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254) throw new EntradaInvalida("E-mail inválido.");

  const nome = typeof corpo.full_name === "string" ? corpo.full_name.trim() : "";
  if (nome.length < 2 || nome.length > 120) throw new EntradaInvalida("Informe o nome (2 a 120 caracteres).");

  const senha = typeof corpo.password === "string" ? corpo.password : "";
  if (senha.length < SENHA_MINIMA || senha.length > 72) {
    throw new EntradaInvalida(`A senha temporária precisa de ${SENHA_MINIMA} a 72 caracteres.`);
  }

  return { email, nome, senha, motivo: validarMotivo(corpo.comment) };
}

/** Erro do GoTrue para e-mail que já tem conta. */
export function contaJaExiste(erro: { status?: number; code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  if (erro.code === "email_exists" || erro.code === "user_already_exists") return true;
  return erro.status === 422 && /already/i.test(erro.message ?? "");
}
