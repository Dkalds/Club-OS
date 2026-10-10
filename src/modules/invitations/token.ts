import { createHash, randomBytes } from "node:crypto";

/** Un token de invitación y su hash: solo el hash se guarda (`invitations.token_hash`). */
export function createInvitationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}
