import { describe, expect, it } from "vitest";
import {
  canManageBilling,
  daysLeft,
  describeStatus,
  formatCents,
  parsePlanLimitError,
  planLimitMessage,
  usageLabel,
  usagePercent,
  type BillingStatus,
} from "./billing";

const agora = new Date("2026-10-07T12:00:00Z");

function status(parcial: Partial<BillingStatus>): BillingStatus {
  return {
    organization_id: "org",
    access: true,
    source: "trial",
    trial_ends_at: "2026-10-21T12:00:00Z",
    has_customer: false,
    plan: { id: "pro", name: "Pro", price_cents: 149000, max_properties: null, max_users: 10 },
    subscription: null,
    usage: { properties: 0, users_active: 1, invites_pending: 0 },
    ...parcial,
  };
}

describe("formatCents", () => {
  it("formata centavos em reais e trata nulo como sob consulta", () => {
    expect(formatCents(149000)).toMatch(/1\.490,00/);
    expect(formatCents(null)).toBe("Sob consulta");
  });
});

describe("daysLeft", () => {
  it("arredonda para cima e nunca fica negativo", () => {
    expect(daysLeft("2026-10-21T12:00:00Z", agora)).toBe(14);
    expect(daysLeft("2026-10-07T12:00:01Z", agora)).toBe(1);
    expect(daysLeft("2026-10-01T00:00:00Z", agora)).toBe(0);
    expect(daysLeft(null, agora)).toBe(0);
  });
});

describe("canManageBilling", () => {
  it("só owner e admin", () => {
    expect(canManageBilling("owner")).toBe(true);
    expect(canManageBilling("admin")).toBe(true);
    expect(canManageBilling("financeiro")).toBe(false);
    expect(canManageBilling(null)).toBe(false);
  });
});

describe("describeStatus", () => {
  it("teste grátis com os dias restantes, em alerta nos últimos 3", () => {
    expect(describeStatus(status({}), agora)).toMatchObject({ label: "Teste grátis", tone: "ok" });
    const fim = describeStatus(status({ trial_ends_at: "2026-10-09T12:00:00Z" }), agora);
    expect(fim).toMatchObject({ label: "Teste grátis", tone: "warn" });
    expect(fim.detail).toContain("2 dias restantes");
  });

  it("assinatura ativa e cancelamento agendado", () => {
    const sub = { plan_id: "pro", payment_method: "cartao" as const, current_period_end: "2026-11-07T12:00:00Z" };
    expect(
      describeStatus(status({ source: "subscription", subscription: { ...sub, status: "ativa", cancel_at_period_end: false } }), agora),
    ).toMatchObject({ label: "Assinatura ativa", tone: "ok" });
    expect(
      describeStatus(status({ source: "subscription", subscription: { ...sub, status: "ativa", cancel_at_period_end: true } }), agora),
    ).toMatchObject({ label: "Cancelamento agendado", tone: "warn" });
  });

  it("boleto aguardando compensação durante o teste avisa do prazo", () => {
    const resumo = describeStatus(
      status({
        subscription: { plan_id: "pro", status: "incompleta", payment_method: "boleto", current_period_end: null, cancel_at_period_end: false },
      }),
      agora,
    );
    expect(resumo).toMatchObject({ label: "Aguardando pagamento", tone: "warn" });
    expect(resumo.detail).toContain("Teste grátis");
  });

  it("sem assinatura e com o teste vencido", () => {
    expect(describeStatus(status({ access: false, source: "none", plan: null }), agora)).toMatchObject({
      label: "Sem plano ativo",
      tone: "danger",
    });
  });
});

describe("parsePlanLimitError", () => {
  it("lê o erro do PostgREST com hint e plano sugerido", () => {
    const erro = parsePlanLimitError({
      code: "23514",
      message: "Limite de propriedades do plano Starter atingido (3 de 3).",
      details: "pro",
      hint: "limite_plano:propriedades",
    });
    expect(erro).toEqual({
      resource: "propriedades",
      suggestedPlanId: "pro",
      message: "Limite de propriedades do plano Starter atingido (3 de 3).",
    });
  });

  it("lê o corpo de erro da Edge Function", () => {
    expect(parsePlanLimitError({ error: "Limite de usuários", hint: "limite_plano:usuarios", details: "" })).toEqual({
      resource: "usuarios",
      suggestedPlanId: null,
      message: "Limite de usuários",
    });
  });

  it("ignora erro que não é de limite", () => {
    expect(parsePlanLimitError({ message: "duplicate key", hint: null })).toBeNull();
    expect(parsePlanLimitError({ hint: "limite_plano:desconhecido" })).toBeNull();
    expect(parsePlanLimitError("texto")).toBeNull();
    expect(parsePlanLimitError(null)).toBeNull();
  });
});

describe("planLimitMessage", () => {
  it("aponta o plano sugerido, ou o comercial quando não há", () => {
    const base = { resource: "usuarios" as const, message: "Limite atingido." };
    expect(planLimitMessage({ ...base, suggestedPlanId: "pro" }, "Pro")).toContain("O plano Pro comporta");
    expect(planLimitMessage({ ...base, suggestedPlanId: null })).toContain("time comercial");
    expect(planLimitMessage({ resource: "sem_plano", suggestedPlanId: null, message: "x" })).toContain("teste grátis acabou");
  });
});

describe("uso", () => {
  it("rótulo e percentual com e sem teto", () => {
    expect(usageLabel(2, 3, "propriedades")).toBe("2 de 3 propriedades");
    expect(usageLabel(7, null, "propriedades")).toBe("7 propriedades (sem limite)");
    expect(usagePercent(2, 4)).toBe(50);
    expect(usagePercent(5, 4)).toBe(100);
    expect(usagePercent(5, null)).toBeNull();
  });
});
