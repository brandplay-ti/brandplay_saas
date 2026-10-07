import { beforeEach, describe, expect, it, vi } from "vitest";

const inMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ in: inMock }) }) },
}));

import { withProfileNames } from "./profileNames";

describe("withProfileNames", () => {
  beforeEach(() => inMock.mockReset());

  it("anexa o nome do perfil no mesmo formato do embed do PostgREST", async () => {
    inMock.mockResolvedValue({ data: [{ id: "u1", full_name: "Ana" }] });
    const r = await withProfileNames([{ user_id: "u1", id: "a" }]);
    expect(r).toEqual([{ user_id: "u1", id: "a", profiles: { full_name: "Ana" } }]);
  });

  it("consulta cada usuário uma vez e marca ausentes como null", async () => {
    inMock.mockResolvedValue({ data: [{ id: "u1", full_name: "Ana" }] });
    const r = await withProfileNames([{ user_id: "u1" }, { user_id: "u1" }, { user_id: "u2" }]);
    expect(inMock).toHaveBeenCalledWith("id", ["u1", "u2"]);
    expect(r.map((x) => x.profiles)).toEqual([{ full_name: "Ana" }, { full_name: "Ana" }, null]);
  });

  it("não consulta o banco quando não há user_id", async () => {
    const r = await withProfileNames([{ user_id: null }]);
    expect(inMock).not.toHaveBeenCalled();
    expect(r).toEqual([{ user_id: null, profiles: null }]);
  });
});
