// Detecção de marcas numa imagem ou num frame de vídeo do BrandTrack (IA-21).
//
// A organização é a da mídia, lida sob RLS; marcas esperadas, revisões,
// marcas e detecções ficam nela. A chamada vai pela camada no nível `visao`
// (se o modelo da chave da organização não tem visão, a camada usa a chave
// padrão — decisão Q4 do plano).
//
// Antes, tudo passava pela service role: o acesso era conferido só para
// quem não era o dono da mídia, e as marcas esperadas e logos eram lidos sem
// filtro de organização. Agora as consultas, gravações e o storage usam o
// client do usuário (RLS e policies do bucket); a service role fica só com a
// camada. A falha só marca a mídia depois de o acesso ser confirmado, e a
// mensagem gravada é a do usuário, nunca o corpo do erro do fornecedor.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { gerar } from "../_shared/ai/camada.ts";
import { ErroDeIA } from "../_shared/ai/erros.ts";
import {
  autenticar,
  CORS,
  dependenciasDaCamada,
  ErroDaRequisicao,
  exigirModulo,
  json,
  respostaDeFalha,
  uuidDoCorpo,
} from "../_shared/ai/funcao.ts";
import type { EsquemaJson, ParteDoConteudo } from "../_shared/ai/tipos.ts";

const FUNCIONALIDADE = "brandtrack-detect-image";

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

const TIPOS_DE_EXPOSICAO = ["uniforme", "placa", "backdrop", "led", "transmissao", "outro"] as const;

const ESQUEMA: EsquemaJson = {
  type: "object",
  properties: {
    detections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          brand_name: { type: "string" },
          exposure_type: { type: "string", enum: [...TIPOS_DE_EXPOSICAO] },
          screen_percentage: { type: "number" },
          position_x: { type: "number" },
          position_y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          confidence: { type: "number" },
        },
        required: ["brand_name", "exposure_type", "screen_percentage", "position_x", "position_y", "width", "height", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["detections"],
  additionalProperties: false,
};

const SISTEMA =
  "Você é um analista conservador de exposição de marcas em mídias esportivas. Identifique apenas marcas/logotipos/textos comerciais realmente visíveis. Use marcas esperadas e aliases somente para desambiguação visual, nunca para inventar presença. Para cada marca, estime: tipo de exposição (uniforme, placa, backdrop, led, transmissao ou outro), bounding box relativa (x,y,width,height de 0 a 1), porcentagem aproximada da tela ocupada (0-100), e confiança (0-1). Se a evidência visual for fraca, omita a detecção. Se não houver marcas visíveis, retorne array vazio.";

const normalizeBrand = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));

const EXPECTED_CONFIDENCE_THRESHOLD = 0.35;
const UNEXPECTED_CONFIDENCE_THRESHOLD = 0.68;
const MIN_SCREEN_PERCENTAGE = 0.05;

/** Frame enviado pelo portal (canvas.toDataURL); o limite folga sobre um JPEG de 1280px. */
const FRAME_VALIDO = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_FRAME = 8 * 1024 * 1024;

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

const mimeDeImagem = (tipo: string | null | undefined, padrao: string) => (tipo && tipo.startsWith("image/") ? tipo : padrao);

/** Logo de referência do bucket público `sponsor-logos`; sem logo, segue sem ele. */
const logoComoDataUrl = async (cliente: SupabaseClient, path: string) => {
  const { data } = cliente.storage.from("sponsor-logos").getPublicUrl(path);
  const response = await fetch(data.publicUrl).catch(() => null);
  if (!response?.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytesToDataUrl(bytes, mimeDeImagem(response.headers.get("content-type"), "image/png"));
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

/** Mensagem gravada em `brandtrack_media.error_message`: a do usuário, nunca detalhe técnico. */
function mensagemDeFalha(e: unknown): string {
  if (e instanceof ErroDeIA) return e.mensagemAoUsuario;
  if (e instanceof ErroDaRequisicao) return e.message;
  return "Não foi possível analisar a mídia. Tente novamente.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // Só depois de confirmar o acesso a mídia pode ser marcada como falha.
  let falhaEm: { cliente: SupabaseClient; mediaId: string; org: string } | null = null;

  try {
    const { usuario, cliente } = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));
    const mediaId = uuidDoCorpo(corpo, "media_id");
    const timestamp = Math.max(0, Number(corpo?.timestamp) || 0);
    const frameIndex = Math.max(0, Math.round(Number(corpo?.frame_index) || 0));
    const totalFrames = Math.max(1, Math.round(Number(corpo?.total_frames) || 1));
    const finalize = corpo?.finalize !== false;
    const frame = typeof corpo?.frame_data_url === "string" && corpo.frame_data_url ? corpo.frame_data_url : null;
    if (frame && (frame.length > MAX_FRAME || !FRAME_VALIDO.test(frame))) {
      throw new ErroDaRequisicao(400, "frame_data_url inválido");
    }

    const { data: media } = await cliente
      .from("brandtrack_media")
      .select("id, organization_id, owner_id, media_type, storage_path, event_id, duration_seconds")
      .eq("id", mediaId)
      .maybeSingle();
    if (!media?.organization_id) throw new ErroDaRequisicao(404, "Mídia não encontrada");
    const org: string = media.organization_id;
    await exigirModulo(cliente, usuario.id, org, "operacional");
    falhaEm = { cliente, mediaId, org };

    const atualizarMidia = async (campos: Record<string, unknown>) => {
      const { error } = await cliente.from("brandtrack_media").update(campos).eq("id", mediaId).eq("organization_id", org);
      if (error) console.error(`${FUNCIONALIDADE}: status da mídia não gravado (${error.code ?? "?"})`);
    };

    await atualizarMidia({ status: "processing", progress: Math.max(10, Math.round((frameIndex / totalFrames) * 90)) });

    if (frameIndex === 0) {
      await cliente.from("brandtrack_detections").delete().eq("media_id", mediaId).eq("organization_id", org);
    }

    let dataUrl = frame;
    if (media.media_type === "video" && !dataUrl) throw new ErroDaRequisicao(400, "frame_data_url obrigatório para vídeo");
    if (!dataUrl) {
      if (!media.storage_path) throw new ErroDaRequisicao(404, "Arquivo da mídia não encontrado");
      const { data: arquivo, error } = await cliente.storage.from("brandtrack-media").download(media.storage_path);
      if (error || !arquivo) throw new ErroDaRequisicao(404, "Arquivo da mídia não encontrado");
      dataUrl = bytesToDataUrl(new Uint8Array(await arquivo.arrayBuffer()), mimeDeImagem(arquivo.type, "image/jpeg"));
    }

    await atualizarMidia({ progress: 50 });

    const { data: expectedRows } = media.event_id
      ? await cliente
        .from("brandtrack_event_brands")
        .select("id,brand_id,sponsor_id,display_name,aliases,sponsor_status,priority")
        .eq("event_id", media.event_id)
        .eq("organization_id", org)
        .eq("is_active", true)
        .order("priority", { ascending: false })
      : { data: [] };
    const expectedBase = (expectedRows ?? []) as Omit<ExpectedBrand, "logo_path">[];
    const brandIds = expectedBase.map((brand) => brand.brand_id).filter(Boolean) as string[];
    const sponsorIds = expectedBase.map((brand) => brand.sponsor_id).filter(Boolean) as string[];
    const [{ data: brandRefs }, { data: sponsorRefs }] = await Promise.all([
      brandIds.length
        ? cliente.from("brandtrack_brands").select("id,logo_path").in("id", brandIds).eq("organization_id", org)
        : Promise.resolve({ data: [] }),
      sponsorIds.length
        ? cliente.from("sponsors").select("id,logo_path").in("id", sponsorIds).eq("organization_id", org)
        : Promise.resolve({ data: [] }),
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

    const { data: reviewRows } = await cliente
      .from("brandtrack_detections")
      .select("brand_name,corrected_brand_name,exposure_type,corrected_exposure_type,review_status,review_notes,confidence,screen_percentage")
      .eq("organization_id", org)
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
        .map((row) => normalizeBrand(row.brand_name)),
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
          .map(async (brand) => ({ name: brand.display_name, dataUrl: await logoComoDataUrl(cliente, brand.logo_path!) })),
      )
    ).filter((item): item is { name: string; dataUrl: string } => Boolean(item.dataUrl));
    const logoReferenceContext = logoReferences.length
      ? logoReferences.map((logo, index) => `${index + 1}. ${logo.name}`).join("\n")
      : "Nenhum logo de referência disponível.";

    const conteudo: ParteDoConteudo[] = [
      { tipo: "texto", texto: `${media.media_type === "video" ? `Analise este frame-chave do vídeo no timestamp ${timestamp.toFixed(1)}s` : "Analise esta imagem"} e detecte as marcas visíveis.\n\nMarcas esperadas do evento para contexto e normalização:\n${expectedContext}\n\nLogos de referência disponíveis:\n${logoReferenceContext}\n\nAprendizado por revisões humanas aprovadas/corrigidas:\n${positiveLearning}\n\nPadrões rejeitados como falsos positivos:\n${negativeLearning}\n\nRegras de precisão:\n1. Compare a imagem/frame com os logos de referência, mas reporte apenas quando houver evidência visual na mídia analisada.\n2. Se uma marca visível corresponder a uma marca esperada, alias ou logo de referência, retorne o nome oficial exatamente como listado.\n3. Use revisões corrigidas para normalizar nomes e tipos de exposição semelhantes.\n4. Evite repetir padrões rejeitados como falsos positivos, principalmente quando a evidência visual for parecida ou fraca.\n5. Para marcas inesperadas, só reporte quando houver logotipo/texto claro e alta confiança.\n6. Não reporte marcas por cor, setor, uniforme genérico, suposição de patrocínio ou contexto do evento.\n7. Evite duplicar variações da mesma marca no mesmo frame.` },
      ...logoReferences.flatMap((logo): ParteDoConteudo[] => [
        { tipo: "texto", texto: `Logo de referência: ${logo.name}` },
        { tipo: "imagem", dataUrl: logo.dataUrl },
      ]),
      { tipo: "texto", texto: "Imagem/frame a analisar:" },
      { tipo: "imagem", dataUrl },
    ];

    const resposta = await gerar({ organizacaoId: org, usuarioId: usuario.id }, {
      funcionalidade: FUNCIONALIDADE,
      nivel: "visao",
      sistema: SISTEMA,
      mensagens: [{ papel: "usuario", conteudo }],
      json: { nome: "deteccoes_de_marca", esquema: ESQUEMA },
      maxTokens: 4096,
    }, dependenciasDaCamada());
    const detections: Detection[] = (Array.isArray(resposta.json?.detections) ? resposta.json.detections as Detection[] : [])
      .filter((d) => typeof d?.brand_name === "string" && d.brand_name.trim())
      .map((d) => ({ ...d, exposure_type: TIPOS_DE_EXPOSICAO.includes(d.exposure_type) ? d.exposure_type : "outro" }));

    await atualizarMidia({ progress: 80 });

    let evidencePath: string | null = media.media_type === "image" ? media.storage_path : null;
    if (media.media_type === "video" && dataUrl) {
      // Na pasta de quem analisa: a policy do bucket só deixa gravar na própria.
      const { bytes, mime } = dataUrlToBytes(dataUrl);
      evidencePath = `${usuario.id}/evidence/${mediaId}-${Math.round(timestamp * 10)}.jpg`;
      const { error: evidenceError } = await cliente.storage
        .from("brandtrack-media")
        .upload(evidencePath, bytes, { contentType: mime, upsert: true });
      if (evidenceError) {
        console.warn(`${FUNCIONALIDADE}: evidência do frame não gravada`);
        evidencePath = null;
      }
    }

    // Marcas já cadastradas na organização, por nome.
    const { data: existingBrands } = await cliente
      .from("brandtrack_brands")
      .select("id, name")
      .eq("organization_id", org);
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
        const { data: newBrand } = await cliente
          .from("brandtrack_brands")
          .insert({
            owner_id: media.owner_id,
            organization_id: org,
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
        organization_id: org,
        media_id: mediaId,
        brand_id,
        brand_name: officialName,
        exposure_type: d.exposure_type,
        start_time: timestamp,
        end_time: media.media_type === "video" ? timestamp + 2 : 1,
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
      const { error } = await cliente.from("brandtrack_detections").insert(rows);
      if (error) throw new Error(`brandtrack_detections: gravação falhou (${error.code ?? "?"})`);
    }

    if (finalize) {
      const finalDuration = media.media_type === "video"
        ? Math.max(timestamp + 2, media.duration_seconds ?? 0)
        : media.duration_seconds;
      await atualizarMidia({
        status: "completed",
        progress: 100,
        processed_at: new Date().toISOString(),
        duration_seconds: finalDuration,
        error_message: null,
      });
    }

    return json({ ok: true, detections: rows.length });
  } catch (e) {
    if (falhaEm) {
      const { cliente, mediaId, org } = falhaEm;
      await cliente
        .from("brandtrack_media")
        .update({ status: "failed", error_message: mensagemDeFalha(e) })
        .eq("id", mediaId)
        .eq("organization_id", org)
        .then(() => undefined, () => undefined);
    }
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
