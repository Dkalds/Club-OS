/** Estado derivado para pintar la lista: la base solo guarda las tres fechas. */
export type InvitationStatus = "pending" | "expired" | "accepted" | "cancelled";

export type Invitation = {
  id: string;
  email: string;
  role: "admin" | "coach";
  teamId: string | null;
  teamName: string | null;
  staffRole: "head_coach" | "assistant" | null;
  personId: string | null;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
};
