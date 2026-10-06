// Summarize a contract file (PDF/DOCX) and persist ai_summary
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUMMARY_SYSTEM = `Você é um analista jurídico-comercial. Resuma contratos de patrocínio em português do Brasil de forma estruturada e objetiva.
Use markdown com as seções:
## Partes
## Objeto
## Valor e pagamento
## Vigência e prazos
## Obrigações principais
## Multas e rescisão
## Pontos de atenção

Seja conciso, factual e destaque cláusulas atípicas ou riscos.`;

const CHAT_SYSTEM = `Você é um assistente que responde perguntas sobre o contrato fornecido. Responda em português do Brasil, citando trechos quando útil. Se não houver informação no contrato, diga claramente.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const contractId: string = body.contract_id;
    const mode: "summarize" | "chat" = body.mode ?? "summarize";
    const question: string = body.question ?? "";

    if (!contractId) {
      return new Response(JSON.stringify({ error: "contract_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select("id, title, brand, total_value, start_date, end_date, signatories, notes, file_path, file_name, ai_summary")
      .eq("id", contractId).maybeSingle();
    if (cErr || !contract) {
      return new Response(JSON.stringify({ error: "Contrato não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build text context: clauses + structured fields. (Avoid binary parsing in edge.)
    const { data: clauses } = await supabase
      .from("contract_clauses")
      .select("title, content, position")
      .eq("contract_id", contractId)
      .order("position");

    const { data: assetsRows } = await supabase
      .from("contract_assets")
      .select("name, quantity, unit_value, notes")
      .eq("contract_id", contractId);

    const contextParts: string[] = [];
    contextParts.push(`Título: ${contract.title}`);
    contextParts.push(`Marca: ${contract.brand}`);
    if (contract.total_value) contextParts.push(`Valor total: R$ ${contract.total_value}`);
    if (contract.start_date || contract.end_date) {
      contextParts.push(`Vigência: ${contract.start_date ?? "?"} → ${contract.end_date ?? "?"}`);
    }
    if (contract.signatories) contextParts.push(`Signatários: ${contract.signatories}`);
    if (contract.notes) contextParts.push(`Notas: ${contract.notes}`);
    if (assetsRows?.length) {
      contextParts.push(`Ativos:\n${assetsRows.map((a) => `- ${a.name} x${a.quantity} (R$ ${a.unit_value})${a.notes ? ` — ${a.notes}` : ""}`).join("\n")}`);
    }
    if (clauses?.length) {
      contextParts.push(`Cláusulas:\n${clauses.map((c) => `### ${c.title}\n${c.content ?? ""}`).join("\n\n")}`);
    }

    const contractContext = contextParts.join("\n");

    if (mode === "chat") {
      if (!question) {
        return new Response(JSON.stringify({ error: "question é obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 4096,
          system: CHAT_SYSTEM,
          messages: [
            { role: "user", content: `CONTRATO:\n${contractContext}\n\nRESUMO PRÉVIO:\n${contract.ai_summary ?? "(sem resumo)"}\n\nPERGUNTA: ${question}` },
          ],
        }),
      });
      if (!aiResp.ok) {
        const t = await aiResp.text();
        console.error("chat error:", aiResp.status, t);
        return new Response(JSON.stringify({ error: aiResp.status === 429 ? "Rate limit" : aiResp.status === 402 ? "Créditos esgotados" : "Erro IA" }), {
          status: aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const j = await aiResp.json();
      const answer = j.content?.find((b: any) => b.type === "text")?.text ?? "";
      return new Response(JSON.stringify({ answer }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Summarize
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system: SUMMARY_SYSTEM,
        messages: [
          { role: "user", content: `Resuma este contrato:\n\n${contractContext}` },
        ],
      }),
    });
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("summarize error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: aiResp.status === 429 ? "Rate limit" : aiResp.status === 402 ? "Créditos esgotados" : "Erro IA" }), {
        status: aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const j = await aiResp.json();
    const summary = j.content?.find((b: any) => b.type === "text")?.text ?? "";

    await supabase.from("contracts").update({ ai_summary: summary }).eq("id", contractId);

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("summarize-contract error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
