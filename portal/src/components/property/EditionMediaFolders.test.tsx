import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Supabase falso: devolve as linhas da tabela pedida e registra as escritas.
type Escrita = { tabela: string; tipo: "insert" | "update"; valores: unknown; filtros: unknown[][] };
const escritas: Escrita[] = [];
let linhas: Record<string, unknown[]> = {};

function consulta(tabela: string) {
  let escrita: Escrita | null = null;
  const q: Record<string, unknown> = {};
  for (const metodo of ["select", "order", "eq", "in"]) {
    q[metodo] = (...args: unknown[]) => {
      if (escrita && metodo !== "select") escrita.filtros.push([metodo, ...args]);
      return q;
    };
  }
  q.insert = (valores: unknown) => {
    escrita = { tabela, tipo: "insert", valores, filtros: [] };
    escritas.push(escrita);
    return q;
  };
  q.update = (valores: unknown) => {
    escrita = { tabela, tipo: "update", valores, filtros: [] };
    escritas.push(escrita);
    return q;
  };
  q.then = (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) =>
    Promise.resolve(escrita ? { data: [{ id: "x" }], error: null } : { data: linhas[tabela] ?? [], error: null }).then(ok, falha);
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (tabela: string) => consulta(tabela) },
}));
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ orgId: "org-teste" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ConfirmProvider } from "@/hooks/useConfirm";
import EditionMediaFolders from "./EditionMediaFolders";

const EDICAO = "94000000-0000-4000-8000-000000000026";

function montar(podeEditar = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </QueryClientProvider>
  );
  return render(
    <EditionMediaFolders propertyId={EDICAO} trilha={["Cliente X", "Copa do Mundo", "Copa 2026"]} podeEditar={podeEditar} />,
    { wrapper: Wrapper },
  );
}

beforeEach(() => {
  escritas.length = 0;
  try {
    localStorage.clear();
  } catch {
    /* sem storage */
  }
  linhas = {
    edition_folders: [
      { id: "j1", name: "Jogo 1", parent_folder_id: null, archived_at: null, created_at: "2026-11-01" },
      { id: "cam", name: "Câmera 1", parent_folder_id: "j1", archived_at: null, created_at: "2026-11-01" },
      { id: "velha", name: "Antiga", parent_folder_id: null, archived_at: "2026-11-02", created_at: "2026-11-01" },
    ],
    edition_media: [
      {
        id: "m1",
        folder_id: "j1",
        kind: "video",
        file_name: "gol.mp4",
        status: "aguardando_envio",
        declared_size_bytes: 2_000_000_000,
        archived_at: null,
        created_at: "2026-11-01",
      },
      {
        id: "m2",
        folder_id: null,
        kind: "foto",
        file_name: "capa.jpg",
        status: "pronto",
        declared_size_bytes: null,
        archived_at: null,
        created_at: "2026-11-01",
      },
    ],
  };
});

describe("EditionMediaFolders", () => {
  it("mostra a trilha com os nomes, as pastas ativas e os arquivos da raiz", async () => {
    montar();
    expect(await screen.findByText("Jogo 1")).toBeInTheDocument();
    expect(screen.getByText("Cliente X")).toBeInTheDocument();
    expect(screen.getByText("Copa do Mundo")).toBeInTheDocument();
    expect(screen.getByText("Copa 2026")).toBeInTheDocument();
    expect(screen.getByText("capa.jpg")).toBeInTheDocument();
    expect(screen.getByText("Pronto")).toBeInTheDocument();
    // Jogo 1 tem uma subpasta e um arquivo.
    expect(screen.getByText("2 itens")).toBeInTheDocument();
    expect(screen.queryByText("Antiga")).not.toBeInTheDocument();
    expect(screen.queryByText("gol.mp4")).not.toBeInTheDocument();
  });

  it("entra na pasta e volta pela trilha", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /^Jogo 1/ }));
    expect(screen.getByText("gol.mp4")).toBeInTheDocument();
    expect(screen.getByText("Câmera 1")).toBeInTheDocument();
    expect(screen.queryByText("capa.jpg")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Material" }));
    expect(screen.getByText("capa.jpg")).toBeInTheDocument();
  });

  it("mostra as arquivadas quando o filtro está ligado", async () => {
    montar();
    await screen.findByText("Jogo 1");
    fireEvent.click(screen.getByRole("switch", { name: "Mostrar arquivados" }));
    expect(screen.getByText("Antiga")).toBeInTheDocument();
    expect(screen.getByText("Arquivada")).toBeInTheDocument();
  });

  it("recusa nome repetido e cria a pasta dentro da pasta aberta", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /^Jogo 1/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Nova pasta/ })[0]);
    const dialogo = await screen.findByRole("dialog");
    const campo = within(dialogo).getByLabelText("Nome");
    fireEvent.change(campo, { target: { value: "câmera 1" } });
    expect(within(dialogo).getByText("Já existe uma pasta com esse nome aqui.")).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Criar pasta" })).toBeDisabled();

    fireEvent.change(campo, { target: { value: "Câmera 2" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Criar pasta" }));
    await waitFor(() => expect(escritas).toHaveLength(1));
    expect(escritas[0]).toMatchObject({
      tabela: "edition_folders",
      tipo: "insert",
      valores: {
        property_id: EDICAO,
        parent_folder_id: "j1",
        name: "Câmera 2",
        // A organização real vem do gatilho; o portal manda o uuid nulo.
        organization_id: "00000000-0000-0000-0000-000000000000",
      },
    });
  });

  it("sem permissão não mostra as ações", async () => {
    montar(false);
    await screen.findByText("Jogo 1");
    expect(screen.queryByRole("button", { name: /Nova pasta/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ações da pasta/ })).not.toBeInTheDocument();
  });
});
