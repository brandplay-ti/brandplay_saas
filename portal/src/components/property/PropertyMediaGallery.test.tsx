import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const estado = vi.hoisted(() => ({
  escreve: new Set<string>(),
  apagadas: [] as { id: string }[],
  remover: vi.fn(() => Promise.resolve({ data: null, error: null })),
}));

vi.mock("@/integrations/supabase/client", () => {
  const MIDIA = { id: "m1", property_id: "p1", owner_id: "u1", media_type: "photo", storage_path: "p1/foto.jpg", external_url: null, thumbnail_url: null, caption: "Torcida", position: 0, is_cover: false };
  function tabela() {
    let resultado: { data: unknown; error: unknown } = { data: [MIDIA], error: null };
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
            if (chave === "delete") resultado = { data: estado.apagadas, error: null };
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
      storage: { from: () => ({ remove: estado.remover, getPublicUrl: () => ({ data: { publicUrl: "https://x/foto.jpg" } }), upload: vi.fn() }) },
    },
  };
});
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ orgId: "org-1", canWrite: (m: string) => estado.escreve.has(m) }),
}));
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => () => Promise.resolve(true) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import PropertyMediaGallery from "./PropertyMediaGallery";

describe("Galeria do projeto — somente leitura (BP-29)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.escreve = new Set();
    estado.apagadas = [];
  });

  it("quem não edita CRM nem Entregas vê as mídias sem enviar, excluir nem mudar legenda", async () => {
    render(<PropertyMediaGallery propertyId="p1" ownerId="u1" />);
    expect(await screen.findByRole("textbox", { name: "Legenda" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Somente leitura");
    expect(screen.queryByText("Enviar arquivos")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir mídia" })).not.toBeInTheDocument();
  });

  it("exclusão que a RLS não aplicou não apaga o arquivo do storage", async () => {
    estado.escreve = new Set(["operacional"]);
    render(<PropertyMediaGallery propertyId="p1" ownerId="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Excluir mídia" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(estado.remover).not.toHaveBeenCalled();
  });

  it("exclusão aplicada apaga também o arquivo", async () => {
    estado.escreve = new Set(["crm"]);
    estado.apagadas = [{ id: "m1" }];
    render(<PropertyMediaGallery propertyId="p1" ownerId="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Excluir mídia" }));
    await waitFor(() => expect(estado.remover).toHaveBeenCalledWith(["p1/foto.jpg"]));
  });
});
