import { describe, expect, it } from "vitest";
import {
  auditActionLabel,
  centsToInput,
  filterClients,
  formatMonth,
  formatPercent,
  parseFeatures,
  parseLimit,
  parseReais,
  stripeSyncNotice,
  summarizeClients,
  type AdminClient,
} from "./platformAdmin";

const AGORA = new Date("2026-10-15T12:00:00Z");

function cliente(parcial: Partial<AdminClient>): AdminClient {
  return {
    organization_id: "org",
    name: "Org",
    created_at: "2026-01-01T00:00:00Z",
    owner_name: null,
    owner_email: null,
    access_source: "trial",
    plan_id: "pro",
    plan_name: "Pro",
    subscription_status: null,
    payment_method: null,
    trial_ends_at: null,
    current_period_end: null,
    cancel_at_period_end: false,
    provisional_expires_at: null,
    mrr_cents: 0,
    properties: 0,
    users_active: 1,
    invites_pending: 0,
    open_invoices: 0,
    last_paid_at: null,
    ...parcial,
  };
}

describe("filterClients", () => {
  const lista = [
    cliente({ organization_id: "1", name: "Federação Paulista", owner_email: "ana@fpf.com", access_source: "subscription", plan_id: "starter" }),
    cliente({ organization_id: "2", name: "Clube Atlético", owner_name: "João Souza", access_source: "trial", plan_id: "pro" }),
    cliente({ organization_id: "3", name: "Liga Norte", access_source: "none", plan_id: null }),
  ];
  const todos = { search: "", source: "todas" as const, planId: "todos" };

  it("busca por nome da organização sem diferenciar acento e caixa", () => {
    expect(filterClients(lista, { ...todos, search: "federacao" }).map((c) => c.organization_id)).toEqual(["1"]);
  });

  it("busca pelo nome e pelo e-mail do owner", () => {
    expect(filterClients(lista, { ...todos, search: "joão" }).map((c) => c.organization_id)).toEqual(["2"]);
    expect(filterClients(lista, { ...todos, search: "ANA@FPF" }).map((c) => c.organization_id)).toEqual(["1"]);
  });

  it("filtra por situação e por plano vigente", () => {
    expect(filterClients(lista, { ...todos, source: "none" }).map((c) => c.organization_id)).toEqual(["3"]);
    expect(filterClients(lista, { ...todos, planId: "pro" }).map((c) => c.organization_id)).toEqual(["2"]);
  });
});

describe("summarizeClients", () => {
  it("conta por situação, atrasos e testes que acabam em breve", () => {
    const resumo = summarizeClients(
      [
        cliente({ organization_id: "a", access_source: "subscription", subscription_status: "inadimplente" }),
        cliente({ organization_id: "b", access_source: "trial", trial_ends_at: "2026-10-17T12:00:00Z" }),
        cliente({ organization_id: "c", access_source: "trial", trial_ends_at: "2026-10-30T12:00:00Z" }),
        cliente({ organization_id: "d", access_source: "none", subscription_status: "incompleta" }),
        cliente({ organization_id: "e", access_source: "none" }),
        cliente({ organization_id: "f", access_source: "exemption", trial_ends_at: "2026-10-17T12:00:00Z" }),
      ],
      3,
      AGORA,
    );
    expect(resumo.total).toBe(6);
    expect(resumo.bySource).toEqual({ subscription: 1, exemption: 1, trial: 2, provisional: 0, none: 2 });
    expect(resumo.delinquent).toBe(1);
    expect(resumo.trialsEndingSoon.map((c) => c.organization_id)).toEqual(["b"]);
    expect(resumo.awaitingPayment.map((c) => c.organization_id)).toEqual(["d"]);
  });

  it("teste já vencido não conta como terminando em breve", () => {
    const resumo = summarizeClients(
      [cliente({ access_source: "trial", trial_ends_at: "2026-10-14T12:00:00Z" })],
      3,
      AGORA,
    );
    expect(resumo.trialsEndingSoon).toEqual([]);
  });
});

describe("parseReais", () => {
  it("aceita reais com e sem centavos e separador de milhar", () => {
    expect(parseReais("490")).toBe(49000);
    expect(parseReais("490,5")).toBe(49050);
    expect(parseReais("1.490,90")).toBe(149090);
    expect(parseReais("R$ 59,00")).toBe(5900);
  });

  it("vazio é sob consulta; texto inválido é NaN", () => {
    expect(parseReais("  ")).toBeNull();
    expect(parseReais("49.0")).toBeNaN();
    expect(parseReais("abc")).toBeNaN();
    expect(parseReais("1,999")).toBeNaN();
  });

  it("ida e volta com centsToInput", () => {
    expect(parseReais(centsToInput(149000))).toBe(149000);
    expect(centsToInput(null)).toBe("");
  });
});

describe("parseLimit e parseFeatures", () => {
  it("limite vazio é sem teto; só inteiros", () => {
    expect(parseLimit("")).toBeNull();
    expect(parseLimit("10")).toBe(10);
    expect(parseLimit("1.5")).toBeNaN();
  });

  it("recursos um por linha, sem linhas vazias", () => {
    expect(parseFeatures("Pipeline\n\n  Propostas  \r\nPortal")).toEqual(["Pipeline", "Propostas", "Portal"]);
  });
});

describe("formatação", () => {
  it("mês abreviado sem depender do fuso", () => {
    expect(formatMonth("2026-10-01")).toBe("out/26");
    expect(formatMonth("2027-01-01")).toBe("jan/27");
  });

  it("taxa em porcentagem com uma casa", () => {
    expect(formatPercent(0.0523)).toBe("5,2%");
    expect(formatPercent(0)).toBe("0,0%");
  });

  it("ação de auditoria desconhecida aparece como veio", () => {
    expect(auditActionLabel("acesso_liberado")).toBe("Acesso liberado");
    expect(auditActionLabel("outra_coisa")).toBe("outra_coisa");
  });
});

describe("stripeSyncNotice", () => {
  it("avisa falha e ambiente sem Stripe; sincronizado não avisa", () => {
    expect(stripeSyncNotice({ status: "falhou", message: "x" })).toEqual({ tone: "warning", text: "x" });
    expect(stripeSyncNotice({ status: "nao_configurado" })?.tone).toBe("info");
    expect(stripeSyncNotice({ status: "sincronizado" })).toBeNull();
    expect(stripeSyncNotice({ status: "inalterado" })).toBeNull();
  });
});
