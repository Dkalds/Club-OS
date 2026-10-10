import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { acceptPendingInvitations } from "./accept";

describe("acceptPendingInvitations", () => {
  it("devuelve los slugs de los clubes nuevos", async () => {
    mocks.createClient.mockResolvedValue({ rpc: async () => ({ data: ["club-a"], error: null }) });

    expect(await acceptPendingInvitations()).toEqual(["club-a"]);
  });

  it("sin invitaciones pendientes, una lista vacía: no es un error", async () => {
    mocks.createClient.mockResolvedValue({ rpc: async () => ({ data: [], error: null }) });

    expect(await acceptPendingInvitations()).toEqual([]);
  });

  it("un fallo se registra y no interrumpe la entrada", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: async () => ({ data: null, error: { code: "XX000", message: "boom" } }),
    });

    expect(await acceptPendingInvitations()).toEqual([]);
    expect(mocks.logError).toHaveBeenCalledWith("invitations.accept", { code: "XX000", message: "boom" });
  });
});
