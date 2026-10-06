import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Detection = {
  brand_name: string;
  exposure_type: "uniforme" | "placa" | "backdrop" | "led" | "transmissao" | "outro";
  screen_percentage: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  confidence: number;
};

type ExpectedBrand = {
  id: string;
  brand_id: string | null;
  sponsor_id: string | null;
  display_name: string;
  aliases: string[];
  sponsor_status: string;
  priority: number;
  logo_path: string | null;
};

type ReviewLearning = {
  brand_name: string;
  corrected_brand_name: string | null;
  exposure_type: string;
  corrected_exposure_type: string | null;
  review_status: "aprovada" | "corrigida" | "rejeitada";
  review_notes: string | null;
  confidence: number;
  screen_percentage: number;
};

const normalizeBrand = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));

const EXPECTED_CONFIDENCE_THRESHOLD = 0.35;
const UNEXPECTED_CONFIDENCE_THRESHOLD = 0.68;
const MIN_SCREEN_PERCENTAGE = 0.05;

const dataUrlToBytes = (dataUrl: string) => {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? "image/jpeg";
  const binary = atob(b64 ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
};

const bytesToDataUrl = (bytes: Uint8Array, mime: string) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
};

// Splits a "data:<mime>;base64,<data>" URL into its media type and base64 payload,
// as required by Anthropic's image content block (source.type === "base64").
const dataUrlToBase64Source = (dataUrl: string) => {
  const [meta, b64] = dataUrl.split(",");
  const mediaType = meta.match(/data:(.*?);base64/)?.[1] ?? "image/jpeg";
  return { media_type: mediaType, data: b64 ?? "" };
};

const fetchStorageDataUrl = async (admin: ReturnType<typeof createClient>, bucket: string, path: string) => {
  const { data: signed } = await admin.storage.from(bucket).createSignedUrl(path, 600);
  if (!signed?.signedUrl) return null;
  const response = await fetch(signed.signedUrl);
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytesToDataUrl(bytes, response.headers.get("content-type") ?? "image/png");
};

const exposureWeights: Record<string, number> = {
  transmissao: 1.25,
  led: 1.18,
  backdrop: 1.12,
  placa: 1.08,
  uniforme: 1,
  outro: 0.86,
};

const calculateBes = (d: Detection, screenPercentage: number, confidence: number, matchedExpected?: ExpectedBrand) => {
  const x = clamp(d.position_x);
  const y = clamp(d.position_y);
  const w = clamp(d.width);
  const h = clamp(d.height);
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const centerDist = Math.sqrt(Math.pow(centerX - 0.5, 2) + Math.pow(centerY - 0.5, 2));
  const positionFactor = Math.max(0.55, 1 - centerDist * 0.85);
  const sizeFactor = Math.min(1.35, Math.sqrt(Math.max(screenPercentage, 0) / 12));
  const exposureFactor = exposureWeights[d.exposure_type] ?? exposureWeights.outro;
  const statusFactor = matchedExpected?.sponsor_status === "patrocinador" ? 1.08 : matchedExpected?.sponsor_status === "concorrente" ? 1.05 : 1;
  return Math.round(Math.min(150, 100 * confidence * sizeFactor * positionFactor * exposureFactor * statusFactor));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let mediaIdForFailure: string | undefined;

  try {
    const body = await req.json();
    const { media_id, frame_data_url, timestamp = 0, frame_index = 0, total_frames = 1, finalize = true } = body;
    mediaIdForFailure = media_id;
    if (!media_id) throw new Error("media_id required");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) throw new Error("Unauthorized");
    const userId = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: media, error: mErr } = await admin
      .from("brandtrack_media")
      .select("*")
      .eq("id", media_id)
      .single();
    if (mErr || !media) throw new Error("Media not found");

    // Authorization: caller must be the owner OR an active member of the media's organization.
    // We re-check via the user client so RLS is enforced (defense-in-depth on top of explicit check).
    if (media.owner_id !== userId) {
      const { data: accessible } = await userClient
        .from("brandtrack_media")
        .select("id")
        .eq("id", media_id)
        .maybeSingle();
      if (!accessible) throw new Error("Forbidden");
    }


    await admin.from("brandtrack_media").update({ status: "processing", progress: Math.max(10, Math.round((frame_index / Math.max(total_frames, 1)) * 90)) }).eq("id", media_id);

    if (frame_index === 0) {
      await admin.from("brandtrack_detections").delete().eq("media_id", media_id);
    }

    let dataUrl = frame_data_url as string | undefined;
    if (media.media_type === "video" && !dataUrl) throw new Error("frame_data_url required for video analysis");
    if (!dataUrl) {
      const { data: signed } = await admin.storage
        .from("brandtrack-media")
        .createSignedUrl(media.storage_path, 600);
      if (!signed?.signedUrl) throw new Error("Could not sign URL");

      const imgRes = await fetch(signed.signedUrl);
      const imgBuf = new Uint8Array(await imgRes.arrayBuffer());
      let binary = "";
      for (let i = 0; i < imgBuf.length; i++) binary += String.fromCharCode(imgBuf[i]);
      const b64 = btoa(binary);
      const mime = imgRes.headers.get("content-type") ?? "image/jpeg";
      dataUrl = `data:${mime};base64,${b64}`;
    }

    await admin.from("brandtrack_media").update({ progress: 50 }).eq("id", media_id);

    const { data: expectedRows } = media.event_id
      ? await admin
          .from("brandtrack_event_brands")
          .select("id,brand_id,sponsor_id,display_name,aliases,sponsor_status,priority")
          .eq("event_id", media.event_id)
          .eq("is_active", true)
          .order("priority", { ascending: false })
      : { data: [] };
    const expectedBase = (expectedRows ?? []) as Omit<ExpectedBrand, "logo_path">[];
    const brandIds = expectedBase.map((brand) => brand.brand_id).filter(Boolean) as string[];
    const sponsorIds = expectedBase.map((brand) => brand.sponsor_id).filter(Boolean) as string[];
    const [{ data: brandRefs }, { data: sponsorRefs }] = await Promise.all([
      brandIds.length ? admin.from("brandtrack_brands").select("id,logo_path").in("id", brandIds) : Promise.resolve({ data: [] }),
      sponsorIds.length ? admin.from("sponsors").select("id,logo_path").in("id", sponsorIds) : Promise.resolve({ data: [] }),
    ]);
    const brandLogoMap = new Map((brandRefs ?? []).map((brand: { id: string; logo_path: string | null }) => [brand.id, brand.logo_path]));
    const sponsorLogoMap = new Map((sponsorRefs ?? []).map((sponsor: { id: string; logo_path: string | null }) => [sponsor.id, sponsor.logo_path]));
    const expectedBrands: ExpectedBrand[] = expectedBase.map((brand) => ({
      ...brand,
      logo_path: (brand.brand_id ? brandLogoMap.get(brand.brand_id) : null) ?? (brand.sponsor_id ? sponsorLogoMap.get(brand.sponsor_id) : null) ?? null,
    }));
    const expectedContext = expectedBrands.length
      ? expectedBrands
          .map((b) => `- ${b.display_name} | aliases: ${(b.aliases ?? []).join(", ") || "nenhum"} | status: ${b.sponsor_status} | prioridade: ${b.priority}`)
          .join("\n")
      : "Nenhuma marca esperada cadastrada para este evento.";

    const { data: reviewRows } = await admin
      .from("brandtrack_detections")
      .select("brand_name,corrected_brand_name,exposure_type,corrected_exposure_type,review_status,review_notes,confidence,screen_percentage")
      .eq("organization_id", media.organization_id)
      .in("review_status", ["aprovada", "corrigida", "rejeitada"])
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .limit(24);

    const learningRows: ReviewLearning[] = reviewRows ?? [];
    const positiveLearning = learningRows
      .filter((row) => row.review_status === "aprovada" || row.review_status === "corrigida")
      .slice(0, 12)
      .map((row) => `- ${row.brand_name}${row.corrected_brand_name ? ` → ${row.corrected_brand_name}` : ""} | tipo: ${row.exposure_type}${row.corrected_exposure_type ? ` → ${row.corrected_exposure_type}` : ""} | confiança ${(Number(row.confidence) * 100).toFixed(0)}% | tela ${Number(row.screen_percentage).toFixed(2)}%${row.review_notes ? ` | nota: ${row.review_notes}` : ""}`)
      .join("\n") || "Nenhuma revisão positiva ainda.";
    const negativeLearning = learningRows
      .filter((row) => row.review_status === "rejeitada")
      .slice(0, 8)
      .map((row) => `- Falso positivo: ${row.brand_name} | tipo sugerido: ${row.exposure_type} | confiança ${(Number(row.confidence) * 100).toFixed(0)}% | tela ${Number(row.screen_percentage).toFixed(2)}%${row.review_notes ? ` | motivo: ${row.review_notes}` : ""}`)
      .join("\n") || "Nenhuma rejeição revisada ainda.";
    const rejectedBrandNames = new Set(
      learningRows
        .filter((row) => row.review_status === "rejeitada")
        .map((row) => normalizeBrand(row.brand_name))
    );
    const correctedBrandMap = new Map<string, string>();
    learningRows
      .filter((row) => row.review_status === "corrigida" && row.corrected_brand_name)
      .forEach((row) => correctedBrandMap.set(normalizeBrand(row.brand_name), row.corrected_brand_name!));

    const logoReferences = (
      await Promise.all(
        expectedBrands
          .filter((brand) => Boolean(brand.logo_path))
          .slice(0, 8)
          .map(async (brand) => ({
            name: brand.display_name,
            dataUrl: await fetchStorageDataUrl(admin, "sponsor-logos", brand.logo_path!),
          }))
      )
    ).filter((item): item is { name: string; dataUrl: string } => Boolean(item.dataUrl));
    const logoReferenceContext = logoReferences.length
      ? logoReferences.map((logo, index) => `${index + 1}. ${logo.name}`).join("\n")
      : "Nenhum logo de referência disponível.";
    const promptContent = [
      { type: "text", text: `${media.media_type === "video" ? `Analise este frame-chave do vídeo no timestamp ${Number(timestamp).toFixed(1)}s` : "Analise esta imagem"} e detecte as marcas visíveis.\n\nMarcas esperadas do evento para contexto e normalização:\n${expectedContext}\n\nLogos de referência disponíveis:\n${logoReferenceContext}\n\nAprendizado por revisões humanas aprovadas/corrigidas:\n${positiveLearning}\n\nPadrões rejeitados como falsos positivos:\n${negativeLearning}\n\nRegras de precisão:\n1. Compare a imagem/frame com os logos de referência, mas reporte apenas quando houver evidência visual na mídia analisada.\n2. Se uma marca visível corresponder a uma marca esperada, alias ou logo de referência, retorne o nome oficial exatamente como listado.\n3. Use revisões corrigidas para normalizar nomes e tipos de exposição semelhantes.\n4. Evite repetir padrões rejeitados como falsos positivos, principalmente quando a evidência visual for parecida ou fraca.\n5. Para marcas inesperadas, só reporte quando houver logotipo/texto claro e alta confiança.\n6. Não reporte marcas por cor, setor, uniforme genérico, suposição de patrocínio ou contexto do evento.\n7. Evite duplicar variações da mesma marca no mesmo frame.` },
      ...logoReferences.flatMap((logo) => [
        { type: "text", text: `Logo de referência: ${logo.name}` },
        { type: "image", source: { type: "base64", ...dataUrlToBase64Source(logo.dataUrl) } },
      ]),
      { type: "text", text: "Imagem/frame a analisar:" },
      { type: "image", source: { type: "base64", ...dataUrlToBase64Source(dataUrl) } },
    ];

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
        system:
          "Você é um analista conservador de exposição de marcas em mídias esportivas. Identifique apenas marcas/logotipos/textos comerciais realmente visíveis. Use marcas esperadas e aliases somente para desambiguação visual, nunca para inventar presença. Para cada marca, estime: tipo de exposição (uniforme, placa, backdrop, led, transmissao ou outro), bounding box relativa (x,y,width,height de 0 a 1), porcentagem aproximada da tela ocupada (0-100), e confiança (0-1). Se a evidência visual for fraca, omita a detecção. Se não houver marcas visíveis, retorne array vazio.",
        messages: [
          {
            role: "user",
            content: promptContent,
          },
        ],
        tools: [
          {
            name: "report_brand_detections",
            description: "Reporta as marcas detectadas na imagem.",
            input_schema: {
              type: "object",
              properties: {
                detections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      brand_name: { type: "string" },
                      exposure_type: {
                        type: "string",
                        enum: ["uniforme", "placa", "backdrop", "led", "transmissao", "outro"],
                      },
                      screen_percentage: { type: "number" },
                      position_x: { type: "number" },
                      position_y: { type: "number" },
                      width: { type: "number" },
                      height: { type: "number" },
                      confidence: { type: "number" },
                    },
                    required: [
                      "brand_name",
                      "exposure_type",
                      "screen_percentage",
                      "position_x",
                      "position_y",
                      "width",
                      "height",
                      "confidence",
                    ],
                    additionalProperties: false,
                  },
                },
              },
              required: ["detections"],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: { type: "tool", name: "report_brand_detections" },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      if (aiResp.status === 429) throw new Error("Limite de requisições à IA atingido. Tente novamente em instantes.");
      if (aiResp.status === 402) throw new Error("Créditos da IA esgotados. Adicione créditos em Configurações.");
      throw new Error(`AI error: ${errText}`);
    }

    const aiJson = await aiResp.json();
    const toolUse = aiJson?.content?.find((b: any) => b.type === "tool_use");
    const args = toolUse ? toolUse.input : { detections: [] };
    const detections: Detection[] = args.detections ?? [];

    await admin.from("brandtrack_media").update({ progress: 80 }).eq("id", media_id);

    let evidencePath: string | null = media.media_type === "image" ? media.storage_path : null;
    if (media.media_type === "video" && dataUrl) {
      const { bytes, mime } = dataUrlToBytes(dataUrl);
      evidencePath = `${media.owner_id}/evidence/${media_id}-${Math.round(Number(timestamp) * 10)}.jpg`;
      const { error: evidenceError } = await admin.storage
        .from("brandtrack-media")
        .upload(evidencePath, bytes, { contentType: mime, upsert: true });
      if (evidenceError) {
        console.warn("Could not store frame evidence", evidenceError.message);
        evidencePath = null;
      }
    }

    // Lookup existing brands by name (per org)
    const { data: existingBrands } = await admin
      .from("brandtrack_brands")
      .select("id, name")
      .eq("organization_id", media.organization_id);
    const brandMap = new Map<string, string>();
    (existingBrands ?? []).forEach((b: { name: string; id: string }) => brandMap.set(normalizeBrand(b.name), b.id));
    const expectedMap = new Map<string, ExpectedBrand>();
    expectedBrands.forEach((b) => {
      expectedMap.set(normalizeBrand(b.display_name), b);
      (b.aliases ?? []).forEach((alias) => expectedMap.set(normalizeBrand(alias), b));
      if (b.brand_id) brandMap.set(normalizeBrand(b.display_name), b.brand_id);
    });

    const rows = [];
    for (const d of detections) {
      const learnedCorrection = correctedBrandMap.get(normalizeBrand(d.brand_name));
      const learnedName = learnedCorrection ?? d.brand_name;
      const matchedExpected = expectedMap.get(normalizeBrand(learnedName));
      const confidence = clamp(d.confidence);
      const screenPercentage = Math.max(0, Math.min(100, Number(d.screen_percentage) || 0));
      const normalizedDetected = normalizeBrand(d.brand_name);
      const learnedRejected = rejectedBrandNames.has(normalizedDetected) && !matchedExpected;
      const unexpectedThreshold = learnedRejected ? Math.max(UNEXPECTED_CONFIDENCE_THRESHOLD, 0.82) : UNEXPECTED_CONFIDENCE_THRESHOLD;
      if (screenPercentage < MIN_SCREEN_PERCENTAGE) continue;
      if (matchedExpected && confidence < EXPECTED_CONFIDENCE_THRESHOLD) continue;
      if (!matchedExpected && confidence < unexpectedThreshold) continue;
      const officialName = matchedExpected?.display_name ?? learnedName;
      let brand_id = matchedExpected?.brand_id ?? brandMap.get(normalizeBrand(officialName));
      if (!brand_id) {
        const { data: newBrand } = await admin
          .from("brandtrack_brands")
          .insert({
            owner_id: media.owner_id,
            organization_id: media.organization_id,
            name: officialName,
            color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`,
          })
          .select("id")
          .single();
        if (newBrand) {
          brand_id = newBrand.id;
          brandMap.set(normalizeBrand(officialName), newBrand.id);
        }
      }

      const bes = calculateBes(d, screenPercentage, confidence, matchedExpected);

      rows.push({
        owner_id: media.owner_id,
        organization_id: media.organization_id,
        media_id,
        brand_id,
        brand_name: officialName,
        exposure_type: d.exposure_type,
        start_time: Number(timestamp) || 0,
        end_time: media.media_type === "video" ? (Number(timestamp) || 0) + 2 : 1,
        duration: media.media_type === "video" ? 2 : 1,
        screen_percentage: screenPercentage,
        position_x: clamp(d.position_x),
        position_y: clamp(d.position_y),
        width: clamp(d.width),
        height: clamp(d.height),
        confidence,
        bes_score: bes,
        evidence_path: evidencePath,
        review_status: "pendente",
      });
    }

    if (rows.length > 0) {
      await admin.from("brandtrack_detections").insert(rows);
    }

    if (finalize) {
      const finalDuration = media.media_type === "video"
        ? Math.max((Number(timestamp) || 0) + 2, media.duration_seconds ?? 0)
        : media.duration_seconds;
      await admin.from("brandtrack_media").update({
        status: "completed",
        progress: 100,
        processed_at: new Date().toISOString(),
        duration_seconds: finalDuration,
        error_message: null,
      }).eq("id", media_id);
    }

    return new Response(JSON.stringify({ ok: true, detections: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brandtrack-detect-image error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    try {
      if (mediaIdForFailure) {
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await admin
          .from("brandtrack_media")
          .update({ status: "failed", error_message: msg })
          .eq("id", mediaIdForFailure);
      }
    } catch {
      // Best-effort failure update only.
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
