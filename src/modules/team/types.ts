/** Un equipo de «mis equipos»: siempre de la temporada actual. */
export type TeamSummary = {
  id: string;
  name: string;
  categoryName: string;
  seasonName: string;
};

/** Un jugador de la plantilla. Sin año de nacimiento: la ficha no lo enseña. */
export type TeamPlayer = {
  personId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  position: string | null;
};

export type TeamStaffMember = {
  personId: string;
  firstName: string;
  lastName: string;
  role: "head_coach" | "assistant";
};

export type TeamDetail = TeamSummary & {
  players: TeamPlayer[];
  staff: TeamStaffMember[];
};
