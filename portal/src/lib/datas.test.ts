import { describe, expect, it } from "vitest";
import { dataLocal } from "./datas";

describe("dataLocal", () => {
  it("lê data pura como meia-noite local, sem voltar um dia", () => {
    const d = dataLocal("2026-11-02");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(0);
  });

  it("mantém timestamps completos como new Date", () => {
    const iso = "2026-11-02T15:30:00.000Z";
    expect(dataLocal(iso).getTime()).toBe(new Date(iso).getTime());
  });

  it("aceita Date e número", () => {
    const agora = new Date();
    expect(dataLocal(agora).getTime()).toBe(agora.getTime());
    expect(dataLocal(0).getTime()).toBe(0);
  });

  it("valor ausente se comporta como new Date", () => {
    expect(dataLocal(null).getTime()).toBe(new Date(null as unknown as string).getTime());
    expect(Number.isNaN(dataLocal(undefined).getTime())).toBe(true);
  });
});
