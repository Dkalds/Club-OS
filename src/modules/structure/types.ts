import type { ClubContext } from "@/modules/tenancy/queries";

// La estructura del club tal como la ve y la cambia su dirección en Gestión: temporadas,
// categorías, equipos y personas. Lo que ve quien entrena («mis equipos») es de `@/modules/team`.

export type OrgRole = ClubContext["membership"]["role"];

export type StaffRole = "head_coach" | "assistant";

/** Una temporada. Las fechas son días de calendario (`YYYY-MM-DD`), sin hora ni zona. */
export type SeasonSummary = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
};

/** Un equipo en la lista de su temporada. */
export type SeasonTeam = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categorySort: number;
  players: number;
  staff: number;
};

export type SeasonDetail = SeasonSummary & { teams: SeasonTeam[] };

/** Una categoría. `ageBand` es `U12`; `inUse`, si algún equipo la lleva (entonces no se borra). */
export type Category = {
  id: string;
  name: string;
  ageBand: string;
  sort: number;
  inUse: boolean;
};

export type AdminStaffMember = {
  personId: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
};

/** Un jugador de la plantilla. De un menor, solo el año de nacimiento. */
export type AdminPlayer = {
  personId: string;
  firstName: string;
  lastName: string;
  birthYear: number | null;
  jerseyNumber: number | null;
  position: string | null;
};

/** Un equipo en Gestión, de la temporada que sea. */
export type AdminTeam = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  season: SeasonSummary;
  staff: AdminStaffMember[];
  players: AdminPlayer[];
};

/** Una persona en la lista de Gestión, con los equipos de la temporada actual en los que está. */
export type PersonSummary = {
  id: string;
  firstName: string;
  lastName: string;
  birthYear: number | null;
  archived: boolean;
  teams: string[];
};

/** Un equipo de una persona: de qué temporada es y qué hace en él. */
export type PersonTeam = {
  teamId: string;
  teamName: string;
  seasonName: string;
  isCurrent: boolean;
  as: "player" | StaffRole;
};

/** Una persona con sus equipos de cualquier temporada y, si tiene cuenta activa, su rol. */
export type PersonDetail = {
  id: string;
  firstName: string;
  lastName: string;
  birthYear: number | null;
  archived: boolean;
  teams: PersonTeam[];
  access: OrgRole | null;
};
