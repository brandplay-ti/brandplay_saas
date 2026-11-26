import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { NavModule } from "@/lib/navegacao";

const setOpenMobile = vi.fn();
let modulos: NavModule[] = [];
let tipo: "agencia" | "marca" = "agencia";

vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({
    can: (m: NavModule) => modulos.includes(m),
    clientType: tipo,
    isAdmin: false,
    loading: false,
  }),
}));
vi.mock("@/hooks/usePlatformAdmin", () => ({ usePlatformRole: () => ({ isPlatformStaff: false }) }));
vi.mock("@/components/ui/sidebar", () => ({ useSidebar: () => ({ openMobile: false, setOpenMobile }) }));

import { BottomNav } from "./BottomNav";

function tela(rota: string) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

const rotulos = () =>
  screen
    .getAllByRole("listitem")
    .map((li) => li.textContent?.trim());

describe("BottomNav", () => {
  beforeEach(() => {
    setOpenMobile.mockClear();
    modulos = ["crm", "vendas", "operacional", "financeiro", "team"];
    tipo = "agencia";
  });

  it("mostra os quatro atalhos da agência e o Mais", () => {
    tela("/dashboard");
    expect(rotulos()).toEqual(["Início", "Pipeline", "Entregas", "Agenda", "Mais"]);
  });

  it("marca a página atual com aria-current", () => {
    tela("/dashboard/pipeline");
    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Início" })).not.toHaveAttribute("aria-current");
  });

  it("marca a página de detalhe pelo atalho da lista", () => {
    tela("/dashboard/entregas/abc");
    expect(screen.getByRole("link", { name: "Entregas" })).toHaveAttribute("aria-current", "page");
  });

  it("página fora dos atalhos: nenhum atalho aceso", () => {
    tela("/dashboard/equipe");
    expect(screen.queryAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page")).toEqual([]);
  });

  it("o Mais abre o menu completo", () => {
    tela("/dashboard");
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    expect(setOpenMobile).toHaveBeenCalledWith(true);
  });

  it("marca: Contratos no lugar do Pipeline", () => {
    tipo = "marca";
    tela("/dashboard");
    expect(rotulos()).toEqual(["Início", "Contratos", "Entregas", "Agenda", "Mais"]);
    expect(screen.queryByRole("link", { name: "Pipeline" })).toBeNull();
  });
});
