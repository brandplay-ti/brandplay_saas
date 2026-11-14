import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { montarGuia, type ContagensDosPassos } from "@/lib/primeirosPassos";
import { PrimeirosPassosWidget } from "./PrimeirosPassosWidget";

const contagens: ContagensDosPassos = {
  kitDeMarca: 1,
  projetos: 1,
  cotas: 0,
  patrocinadores: 0,
  oportunidades: 0,
  propostas: 0,
  contratos: 0,
  entregas: 0,
  membros: 1,
  acessosAoPortal: 0,
};

const renderizar = (onOcultar = vi.fn()) => {
  const guia = montarGuia({ clientType: "agencia", isAdmin: true, can: () => true }, contagens);
  render(
    <MemoryRouter>
      <PrimeirosPassosWidget guia={guia} onOcultar={onOcultar} />
    </MemoryRouter>,
  );
  return onOcultar;
};

describe("PrimeirosPassosWidget", () => {
  it("mostra o progresso só dos passos obrigatórios", () => {
    renderizar();
    expect(screen.getByText("2 de 8 concluídos")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progresso dos primeiros passos" })).toBeInTheDocument();
  });

  it("o próximo passo pendente leva à tela dele, e o feito não tem botão", () => {
    renderizar();
    const passos = within(screen.getByRole("list", { name: "Passos sugeridos" })).getAllByRole("listitem");
    expect(passos[1]).toHaveTextContent("Cadastre seu primeiro projeto (concluído)");
    expect(within(passos[1]).queryByRole("link")).toBeNull();
    expect(within(passos[2]).getByRole("link", { name: /Abrir um projeto/ })).toHaveAttribute(
      "href",
      "/dashboard/propriedades",
    );
  });

  it("separa os opcionais em \"Quando quiser\"", () => {
    renderizar();
    const opcionais = screen.getByRole("list", { name: "Passos opcionais" });
    expect(within(opcionais).getAllByRole("listitem")).toHaveLength(2);
    expect(within(opcionais).getByRole("link", { name: /Ir para Equipe/ })).toHaveAttribute("href", "/dashboard/equipe");
  });

  it("ocultar chama quem guarda a preferência", () => {
    const onOcultar = renderizar();
    fireEvent.click(screen.getByRole("button", { name: /Ocultar guia/ }));
    expect(onOcultar).toHaveBeenCalledTimes(1);
  });
});
