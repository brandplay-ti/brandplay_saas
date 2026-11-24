import { describe, expect, it } from "vitest";
import { getOpportunityStageChecklistIssues } from "./opportunityStageChecklist";

const completa = { stage: "reuniao" as const, property_id: "prop-1", value: 50000, pendingActivities: 1 };

describe("checklist de mudança de etapa", () => {
  it("deixa passar de reunião para proposta enviada sem patrocinador", () => {
    const semPatrocinador = { ...completa, sponsor_id: null };
    expect(getOpportunityStageChecklistIssues(semPatrocinador, "proposta_enviada")).toEqual([]);
  });

  it("continua exigindo valor, projeto e próxima atividade", () => {
    const vazia = { ...completa, property_id: null, value: 0, pendingActivities: 0 };
    expect(getOpportunityStageChecklistIssues(vazia, "proposta_enviada")).toEqual([
      "valor preenchido",
      "projeto selecionado",
      "próxima atividade criada",
    ]);
  });

  it("não cobra nada nas outras passagens", () => {
    const vazia = { ...completa, stage: "prospect" as const, property_id: null, value: null, pendingActivities: 0 };
    expect(getOpportunityStageChecklistIssues(vazia, "reuniao")).toEqual([]);
  });
});
