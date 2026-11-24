import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const estado = vi.hoisted(() => ({
  apagados: [] as { id: string }[],
  remover: vi.fn(() => Promise.resolve({ data: null, error: null })),
}));

vi.mock("@/integrations/supabase/client", () => {
  function tabela() {
    let resultado: { data: unknown; error: unknown } = {
      data: [{ id: "d1", title: "Briefing 2027", category: "briefing", description: null, journey_stage: "prospeccao", file_path: "org-1/sp-1/a.pdf", file_name: "a.pdf", file_type: "application/pdf", file_size: 1000, ai_enabled: true, created_at: "2026-11-01T00:00:00Z" }],
      error: null,
    };
    const consulta: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get: (_alvo, chave) => {
          if (chave === "then") {
            return (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve(resultado).then(resolve, reject);
          }
          return () => {
            // A RLS recusa o DELETE sem erro: volta só o que foi apagado de fato.
            if (chave === "delete") resultado = { data: estado.apagados, error: null };
            return consulta;
          };
        },
      },
    );
    return consulta;
  }
  return {
    supabase: {
      from: () => tabela(),
      storage: { from: () => ({ remove: estado.remover, upload: vi.fn(), createSignedUrl: vi.fn() }) },
      auth: { getUser: vi.fn() },
    },
  };
});

vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => () => Promise.resolve(true) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { SponsorDocumentsPanel } from "./SponsorDocumentsPanel";
import { mensagemSemEdicao } from "@/lib/permissoes";

describe("SponsorDocumentsPanel — somente leitura (BP-29)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.apagados = [];
  });

  it("quem só lê vê e baixa os arquivos, sem enviar nem excluir", async () => {
    render(<SponsorDocumentsPanel sponsorId="sp-1" organizationId="org-1" editable={false} />);
    expect(await screen.findByText("Briefing 2027")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Somente leitura");
    expect(screen.getByRole("button", { name: "Baixar arquivo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enviar arquivo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir arquivo" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Usar na IA" })).toBeDisabled();
  });

  it("exclusão que a RLS não aplicou não apaga o arquivo do storage", async () => {
    render(<SponsorDocumentsPanel sponsorId="sp-1" organizationId="org-1" editable />);
    fireEvent.click(await screen.findByRole("button", { name: "Excluir arquivo" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro ao excluir", { description: mensagemSemEdicao("crm") }));
    expect(estado.remover).not.toHaveBeenCalled();
  });

  it("exclusão aplicada apaga também o arquivo", async () => {
    estado.apagados = [{ id: "d1" }];
    render(<SponsorDocumentsPanel sponsorId="sp-1" organizationId="org-1" editable />);
    fireEvent.click(await screen.findByRole("button", { name: "Excluir arquivo" }));
    await waitFor(() => expect(estado.remover).toHaveBeenCalledWith(["org-1/sp-1/a.pdf"]));
    expect(toast.success).toHaveBeenCalledWith("Arquivo excluído");
  });
});
