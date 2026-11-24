import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const estado = vi.hoisted(() => ({ escreve: new Set<string>() }));

vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ orgId: "org-1", can: () => true, canWrite: (m: string) => estado.escreve.has(m) }),
}));
vi.mock("@/hooks/useRelatorios", () => ({
  useRelatorios: () => ({ data: [], isLoading: false }),
  useApoioDoRelatorio: () => ({ data: { propriedades: [], patrocinadores: [], contratos: [] } }),
  useCriarRelatorio: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import RelatoriosDeResultado from "./RelatoriosDeResultado";
import { mensagemSemEdicao } from "@/lib/permissoes";

const tela = () => render(<MemoryRouter><RelatoriosDeResultado /></MemoryRouter>);

describe("Relatórios de resultado — somente leitura (BP-29)", () => {
  beforeEach(() => {
    estado.escreve = new Set();
  });

  it("quem não edita CRM nem Entregas não cria relatório e vê o aviso dos dois módulos", () => {
    tela();
    expect(screen.getByRole("status")).toHaveTextContent(mensagemSemEdicao(["crm", "operacional"]));
    expect(screen.queryByRole("button", { name: /Novo relatório/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Criar o primeiro/ })).not.toBeInTheDocument();
  });

  it.each(["crm", "operacional"])("escrever em %s basta para criar (policy crm OR operacional)", (modulo) => {
    estado.escreve = new Set([modulo]);
    tela();
    expect(screen.getByRole("button", { name: /Novo relatório/ })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
