import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const estado = vi.hoisted(() => ({ escreve: new Set<string>(), salvas: [] as { id: string }[] }));

vi.mock("@/integrations/supabase/client", () => {
  const ENTREGA = {
    id: "d1", title: "Placa no campo", brand: "Marca Azul", description: null, status: "pendente",
    approval: "pendente", due_date: "2026-12-01", delivered_at: null, notes: "", quantity: 1,
    organization_id: "org-1", property_id: null,
  };
  const ANEXO = { id: "a1", storage_path: "org-1/d1/foto.jpg", file_name: "foto.jpg", mime_type: "image/jpeg", kind: "image", geo: null, taken_at: null, created_at: "2026-11-01T00:00:00Z" };
  function tabela(nome: string) {
    let resultado: { data: unknown; error: unknown } = { data: nome === "deliveries" ? ENTREGA : [ANEXO], error: null };
    const consulta: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get: (_alvo, chave) => {
          if (chave === "then") {
            return (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve(resultado).then(resolve, reject);
          }
          return () => {
            if (chave === "update") resultado = { data: estado.salvas, error: null };
            return consulta;
          };
        },
      },
    );
    return consulta;
  }
  return {
    supabase: {
      from: (nome: string) => tabela(nome),
      storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: { signedUrl: "https://x/foto.jpg" } }), remove: vi.fn() }) },
    },
  };
});

const auth = vi.hoisted(() => ({ user: { id: "user-1" } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ orgId: "org-1", canWrite: (m: string) => estado.escreve.has(m) }),
}));
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => () => Promise.resolve(true) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import FieldDeliveryDetail from "./FieldDeliveryDetail";
import { mensagemSemEdicao, MODULOS_DA_OPERACAO } from "@/lib/permissoes";

const tela = () =>
  render(
    <MemoryRouter initialEntries={["/campo/entregas/d1"]}>
      <Routes>
        <Route path="/campo/entregas/:id" element={<FieldDeliveryDetail />} />
        <Route path="/campo" element={<p>lista do campo</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe("Campo / entrega — somente leitura (BP-29)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.escreve = new Set();
    estado.salvas = [];
  });

  it("quem não edita Entregas nem CRM vê a entrega e os anexos, sem registrar nem anexar", async () => {
    tela();
    expect(await screen.findByText("Placa no campo")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Somente leitura");
    expect(screen.queryByRole("button", { name: /Marcar como entregue/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Câmera/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover" })).not.toBeInTheDocument();
  });

  it("registro que a RLS não aplicou avisa e não sai da tela como se tivesse salvo", async () => {
    estado.escreve = new Set(["operacional"]);
    tela();
    fireEvent.click(await screen.findByRole("button", { name: /Salvar sem concluir/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(mensagemSemEdicao(MODULOS_DA_OPERACAO)));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText("lista do campo")).not.toBeInTheDocument();
  });

  it("registro aplicado confirma e volta para a lista", async () => {
    estado.escreve = new Set(["crm"]);
    estado.salvas = [{ id: "d1" }];
    tela();
    fireEvent.click(await screen.findByRole("button", { name: /Salvar sem concluir/ }));
    expect(await screen.findByText("lista do campo")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Notas salvas");
  });
});
