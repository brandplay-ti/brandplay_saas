// Histórico do assistente (`ai_messages`) no formato neutro da camada
// (backlog IA-20).
//
// Gravação: cada linha guarda o papel e o texto; a resposta do assistente
// que chamou ferramentas guarda as chamadas em `tool_calls` como
// `ChamadaDeFerramenta[]` (id, nome, argumentos e, quando há, a assinatura
// do fornecedor); cada resultado é uma linha `tool` com `tool_call_id` e
// `tool_name`. Nada disso depende do fornecedor que respondeu.
//
// Leitura: `tool_calls` pode estar em três formatos, conforme a época em que
// a conversa foi gravada —
//
//   - neutro: `{ id, nome, argumentos }` (desta camada em diante);
//   - Anthropic: o `content` cru da resposta, com blocos `tool_use` e `text`
//     (MIGRATION_NOTES.md, migração Lovable → Anthropic);
//   - OpenAI: `{ id, type: "function", function: { name, arguments } }`
//     (conversas do tempo do gateway do Lovable).
//
// Todos viram `Mensagem[]`. A janela do histórico pode começar no meio de um
// turno e uma execução interrompida pode deixar chamada sem resultado: a
// conversão descarta o que os fornecedores recusariam (resultado sem a
// chamada, chamada sem resultado, histórico que não começa pelo usuário).

import type { ChamadaDeFerramenta, Mensagem, ResultadoDeFerramenta } from "./tipos.ts";

/** As colunas de `ai_messages` que o histórico usa. */
export interface LinhaDoHistorico {
  role: string;
  content: string | null;
  tool_calls: unknown;
  tool_call_id: string | null;
  tool_name: string | null;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

function argumentosDoTexto(texto: unknown): Record<string, unknown> {
  if (typeof texto !== "string" || !texto.trim()) return {};
  try {
    const valor = JSON.parse(texto);
    return ehObjeto(valor) ? valor : {};
  } catch {
    return {};
  }
}

/** Uma chamada gravada, em qualquer dos três formatos; nulo para o que não é chamada (ex.: bloco `text`). */
function chamadaGravada(bruta: unknown): ChamadaDeFerramenta | null {
  if (!ehObjeto(bruta) || typeof bruta.id !== "string" || !bruta.id) return null;
  if (typeof bruta.nome === "string") {
    return {
      id: bruta.id,
      nome: bruta.nome,
      argumentos: ehObjeto(bruta.argumentos) ? bruta.argumentos : {},
      ...(typeof bruta.assinatura === "string" && bruta.assinatura ? { assinatura: bruta.assinatura } : {}),
    };
  }
  if (bruta.type === "tool_use" && typeof bruta.name === "string") {
    return { id: bruta.id, nome: bruta.name, argumentos: ehObjeto(bruta.input) ? bruta.input : {} };
  }
  if (ehObjeto(bruta.function) && typeof bruta.function.name === "string") {
    return { id: bruta.id, nome: bruta.function.name, argumentos: argumentosDoTexto(bruta.function.arguments) };
  }
  return null;
}

export function chamadasGravadas(toolCalls: unknown): ChamadaDeFerramenta[] {
  return Array.isArray(toolCalls)
    ? toolCalls.map(chamadaGravada).filter((c): c is ChamadaDeFerramenta => c !== null)
    : [];
}

/** O que vai para `ai_messages.tool_calls`: as chamadas no formato neutro, sem nada a mais. */
export function chamadasParaGravar(chamadas: ChamadaDeFerramenta[]): ChamadaDeFerramenta[] {
  return chamadas.map(({ id, nome, argumentos, assinatura }) => ({ id, nome, argumentos, ...(assinatura ? { assinatura } : {}) }));
}

type Bruta =
  | { papel: "usuario"; texto: string }
  | { papel: "assistente"; texto: string; chamadas: ChamadaDeFerramenta[] }
  | { papel: "resultados"; resultados: { idChamada: string; nome: string | null; conteudo: string }[] };

/** Linhas de `ai_messages`, em ordem cronológica, como mensagens da camada. */
export function mensagensDoHistorico(linhas: LinhaDoHistorico[]): Mensagem[] {
  // 1. Cada linha no formato neutro; resultados seguidos viram um só turno.
  const brutas: Bruta[] = [];
  for (const l of linhas) {
    const texto = l.content ?? "";
    if (l.role === "user") {
      if (texto.trim()) brutas.push({ papel: "usuario", texto });
    } else if (l.role === "assistant") {
      brutas.push({ papel: "assistente", texto, chamadas: chamadasGravadas(l.tool_calls) });
    } else if (l.role === "tool" && l.tool_call_id) {
      const resultado = { idChamada: l.tool_call_id, nome: l.tool_name, conteudo: texto };
      const ultima = brutas[brutas.length - 1];
      if (ultima?.papel === "resultados") ultima.resultados.push(resultado);
      else brutas.push({ papel: "resultados", resultados: [resultado] });
    }
    // `system` e papéis desconhecidos não voltam: o sistema vem da função.
  }

  // 2. Só pares completos: cada chamada com o seu resultado logo depois.
  const saida: Mensagem[] = [];
  for (let i = 0; i < brutas.length; i++) {
    const m = brutas[i];
    if (m.papel === "usuario") {
      saida.push({ papel: "usuario", conteudo: m.texto });
      continue;
    }
    if (m.papel === "resultados") continue; // sem a chamada logo antes: descartado

    const seguinte = brutas[i + 1];
    const respondidas = new Map(
      (seguinte?.papel === "resultados" ? seguinte.resultados : []).map((r) => [r.idChamada, r]),
    );
    const chamadas = m.chamadas.filter((c) => respondidas.has(c.id));
    const texto = m.texto.trim() ? m.texto : undefined;
    if (!texto && chamadas.length === 0) continue;
    saida.push({ papel: "assistente", ...(texto ? { texto } : {}), ...(chamadas.length ? { chamadas } : {}) });
    if (chamadas.length) {
      const resultados: ResultadoDeFerramenta[] = chamadas.map((c) => {
        const r = respondidas.get(c.id)!;
        return { idChamada: c.id, nome: r.nome ?? c.nome, conteudo: r.conteudo };
      });
      saida.push({ papel: "resultados", resultados });
      i++; // os resultados já foram usados
    }
  }

  // 3. A conversa começa pelo usuário (exigência dos fornecedores e da camada).
  const inicio = saida.findIndex((m) => m.papel === "usuario");
  return inicio < 0 ? [] : saida.slice(inicio);
}
