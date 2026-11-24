import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const estado = vi.hoisted(() => ({ escreve: new Set<string>() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(() => Promise.resolve({
        data: { steps: [{ title: "Ligar para o diretor", description: "Retomar a conversa", activity_type: "ligacao", priority: "alta", due_in_days: 2 }] },
        error: null,
      })),
    },
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ orgId: "org-1", canWrite: (m: string) => estado.escreve.has(m) }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { NextStepsAI } from "./NextStepsAI";

const sugerir = async () => {
  render(<NextStepsAI context="opportunity" targetId="op-1" opportunityId="op-1" ownerId="user-1" propertyId="proj-1" />);
  fireEvent.click(screen.getByRole("button", { name: /Sugerir/ }));
  expect(await screen.findByText("Ligar para o diretor")).toBeInTheDocument();
};

describe("NextStepsAI — somente leitura (BP-29)", () => {
  beforeEach(() => {
    estado.escreve = new Set();
  });

  it("quem só lê recebe as sugestões sem virar atividade nem checklist", async () => {
    await sugerir();
    expect(screen.queryByRole("button", { name: /Criar atividade/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Adicionar ao checklist/ })).not.toBeInTheDocument();
  });

  it("cada ação segue o módulo da tabela: atividade pede vendas, checklist pede operacional ou crm", async () => {
    estado.escreve = new Set(["vendas"]);
    await sugerir();
    expect(screen.getByRole("button", { name: /Criar atividade/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Adicionar ao checklist/ })).not.toBeInTheDocument();
  });

  it("quem edita Entregas adiciona ao checklist", async () => {
    estado.escreve = new Set(["operacional"]);
    await sugerir();
    expect(screen.queryByRole("button", { name: /Criar atividade/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar ao checklist/ })).toBeInTheDocument();
  });
});
