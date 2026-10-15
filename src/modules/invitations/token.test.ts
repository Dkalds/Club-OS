import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createInvitationToken } from "./token";

describe("createInvitationToken", () => {
  it("el hash es el sha256 del token", () => {
    const { token, hash } = createInvitationToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
  });

  it("dos tokens seguidos no coinciden", () => {
    expect(createInvitationToken().token).not.toBe(createInvitationToken().token);
  });
});
