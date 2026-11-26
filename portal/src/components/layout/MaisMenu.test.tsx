import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { NavModule } from "@/lib/navegacao";

// Fluxo do "Mais" no celular (MOB-01): a BottomNav abre a AppSidebar (gaveta
// do shadcn abaixo de 768px) e a gaveta fecha quando a página muda.
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({
    can: (m: NavModule) => ["crm", "vendas", "operacional", "financeiro", "team"].includes(m),
    clientType: "agencia",
    isAdmin: true,
    loading: false,
  }),
}));
vi.mock("@/hooks/usePlatformAdmin", () => ({ usePlatformRole: () => ({ isPlatformStaff: false }) }));
vi.mock("@/components/admin/ClientSelector", () => ({ ClientSelector: () => null }));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "./BottomNav";

function RotaAtual() {
  return <p data-testid="rota">{useLocation().pathname}</p>;
}

function tela() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <SidebarProvider>
        <AppSidebar />
        <Routes>
          <Route path="*" element={<RotaAtual />} />
        </Routes>
        <BottomNav />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("Mais no celular", () => {
  it("abre o menu completo e fecha ao escolher uma página", async () => {
    tela();
    expect(screen.queryByRole("dialog")).toBeNull();

    const mais = screen.getByRole("button", { name: "Mais" });
    fireEvent.click(mais);

    const gaveta = await screen.findByRole("dialog");
    expect(mais).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(within(gaveta).getByRole("link", { name: "Equipe" }));

    expect(screen.getByTestId("rota")).toHaveTextContent("/dashboard/equipe");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mais).toHaveAttribute("aria-expanded", "false");
  });
});
