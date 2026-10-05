import type { Database } from "@/integrations/supabase/types";

type Stage = Database["public"]["Enums"]["opportunity_stage"];

const ORDER: Stage[] = ["prospect", "reuniao", "proposta_enviada", "negociacao", "fechado"];

const rank = (s: Stage) => ORDER.indexOf(s);

export type JourneySnapshot = {
  proposalStatus?: string | null;
  hasProposal: boolean;
  contractStatus?: string | null;
  hasContract: boolean;
  deliveriesCount: number;
};

/**
 * Estágio mínimo esperado do pipeline de acordo com o avanço da jornada
 * (proposta → contrato → entregas → relatório).
 */
export const getExpectedStageFromJourney = (journey: JourneySnapshot): Stage | null => {
  if (journey.hasContract || journey.deliveriesCount > 0) return "fechado";
  if (journey.hasProposal) {
    const status = journey.proposalStatus;
    if (status === "aceita") return "fechado";
    if (status === "enviada") return "proposta_enviada";
    return "reuniao";
  }
  return null;
};

/**
 * Retorna o novo estágio caso a jornada esteja adiante do estágio atual.
 * Nunca regride e nunca altera oportunidades perdidas.
 */
export const getStageSyncUpdate = (current: Stage, journey: JourneySnapshot): Stage | null => {
  if (current === "perdido") return null;
  const expected = getExpectedStageFromJourney(journey);
  if (!expected) return null;
  if (rank(expected) <= rank(current)) return null;
  return expected;
};
