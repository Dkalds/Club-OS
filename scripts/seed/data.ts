// Datos del seed: dos clubes ficticios (CB Arcángel y Club Demo) y un usuario sin club.
//
// `buildSeedData` es PURO: no toca la red ni la base de datos. Devuelve, ordenadas, las
// filas de cada tabla ya listas para `upsert`, con ids deterministas (`seedId`) y las
// horas de los eventos calculadas con `seedSchedule(now, tz)`. `run.ts` solo escribe.
//
// Todo es ficticio. De una persona solo se guarda el año de nacimiento. Los nombres y
// valores de club viven aquí, en `scripts/`; nunca en `src/`.

import type { TablesInsert } from "@/lib/database.types";
import { type SeedSchedule, type SlotIso, seedSchedule, slotOnSameDay } from "./dates";
import { seedId } from "./ids";

export { seedId };

// ── Tipos de salida ──────────────────────────────────────────────────────────────────

type WithId<T extends { id?: string }> = Omit<T, "id"> & { id: string };

// La membresía se describe por email: el `user_id` solo existe cuando `run.ts` ha creado o
// encontrado el usuario de Auth.
export type SeedMembership = Omit<TablesInsert<"memberships">, "id" | "user_id" | "person_id"> & {
  id: string;
  email: string;
  person_id: string;
};

export type SeedData = {
  users: { email: string }[];
  organizations: WithId<TablesInsert<"organizations">>[];
  organization_branding: TablesInsert<"organization_branding">[];
  people: WithId<TablesInsert<"people">>[];
  memberships: SeedMembership[];
  seasons: WithId<TablesInsert<"seasons">>[];
  categories: WithId<TablesInsert<"categories">>[];
  teams: WithId<TablesInsert<"teams">>[];
  team_staff: TablesInsert<"team_staff">[];
  team_players: TablesInsert<"team_players">[];
  focus_areas: WithId<TablesInsert<"focus_areas">>[];
  events: WithId<TablesInsert<"events">>[];
  games: TablesInsert<"games">[];
  practice_plans: WithId<TablesInsert<"practice_plans">>[];
  practice_items: WithId<TablesInsert<"practice_items">>[];
  way_sections: WithId<TablesInsert<"way_sections">>[];
  club_values: WithId<TablesInsert<"club_values">>[];
  game_principles: WithId<TablesInsert<"game_principles">>[];
  principle_points: WithId<TablesInsert<"principle_points">>[];
  standards: WithId<TablesInsert<"standards">>[];
};

// ── Definiciones ─────────────────────────────────────────────────────────────────────

export type FocusSlug = "tecnica" | "transicion" | "tiro" | "defensa" | "rebote" | "ataque";

// Mismos seis focos en los dos clubes: son el vocabulario de trabajo de cualquier club.
const FOCUS_AREAS: { slug: FocusSlug; name: string }[] = [
  { slug: "tecnica", name: "Técnica" },
  { slug: "transicion", name: "Transición" },
  { slug: "tiro", name: "Tiro" },
  { slug: "defensa", name: "Defensa" },
  { slug: "rebote", name: "Rebote" },
  { slug: "ataque", name: "Ataque" },
];

export type StaffDef = { key: string; firstName: string; lastName: string };
export type PlayerDef = { firstName: string; lastName: string; number: number; position: string | null };
export type ItemDef = { phase: string; title: string; minutes: number };
export type SlotOf = (schedule: SeedSchedule, tz: string) => SlotIso;

export type SessionDef = {
  // Posición dentro del calendario (`upcoming-0`, `past-2`…): forma parte del id, así que
  // un nuevo seed mueve la sesión de fecha en vez de crear otra.
  slotKey: string;
  slot: SlotOf;
  done: boolean;
  title: string;
  focus: FocusSlug;
  secondaryFocus: FocusSlug | null;
  location: string;
  items: ItemDef[];
};

export type GameDef = {
  slotKey: string;
  slot: SlotOf;
  location: string;
  opponent: string;
  competition: string;
  homeAway: "home" | "away";
};

export type TeamDef = {
  key: string;
  name: string;
  categoryKey: string;
  playersBirthYear: number;
  staff: { personKey: string; role: "head_coach" | "assistant" }[];
  players: PlayerDef[];
  sessions: SessionDef[];
  game: GameDef | null;
};

export type SectionKind = "text" | "values" | "principles" | "standards";

// Metodología de un club (The Way). Aquí solo va el contenido: el número de sección y de
// Standard, el orden y el slug salen de la posición en la lista y del título, y todo se
// escribe publicado (ver `addMethodology`).
export type SectionDef = {
  title: string;
  summary: string | null;
  bodyMd: string;
  contentKind: SectionKind;
};
export type ValueDef = { code: string; title: string | null; description: string };
export type PrincipleDef = { title: string; summary: string | null; points: string[] };
export type StandardDef = { title: string; description: string };
export type MethodologyDef = {
  sections: SectionDef[];
  values: ValueDef[];
  principles: PrincipleDef[];
  standards: StandardDef[];
};

export type ClubDef = {
  slug: string;
  name: string;
  timezone: string;
  branding: Omit<TablesInsert<"organization_branding">, "organization_id">;
  staff: StaffDef[];
  members: { email: string; personKey: string; role: "admin" | "coach" }[];
  categories: { key: string; name: string; ageBand: string; sort: number }[];
  teams: TeamDef[];
  methodology: MethodologyDef;
};

const SEASON = { key: "2026-27", name: "2026/27", startsOn: "2026-09-01", endsOn: "2027-06-30" };

const upcomingSlot =
  (index: number): SlotOf =>
  (schedule) =>
    schedule.upcoming[index];
const pastSlot =
  (index: number): SlotOf =>
  (schedule) =>
    schedule.past[index];
const gameSlot: SlotOf = (schedule) => schedule.game;
// El mismo día que `upcoming[0]`, a otra hora local.
const sameDayAsNext =
  (start: string, end: string): SlotOf =>
  (schedule, tz) =>
    slotOnSameDay(schedule.upcoming[0], tz, start, end);

// Las sesiones pasadas comparten esqueleto (activación, bloque principal, competición):
// 10 + 35 + 25 = 70 min. Solo importa que existan con título, estado y algo de contenido.
function pastSession(
  index: number,
  title: string,
  focus: FocusSlug,
  secondaryFocus: FocusSlug,
  items: [warmUp: string, main: ItemDef, game: string],
): SessionDef {
  return {
    slotKey: `past-${index}`,
    slot: pastSlot(index),
    done: true,
    title,
    focus,
    secondaryFocus,
    location: "Pabellón 2",
    items: [
      { phase: "Activación", title: items[0], minutes: 10 },
      items[1],
      { phase: "Competición", title: items[2], minutes: 25 },
    ],
  };
}

const ALEVIN_A: TeamDef = {
  key: "alevin-a",
  name: "Alevín A",
  categoryKey: "alevin",
  playersBirthYear: 2015,
  staff: [
    { personKey: "alex", role: "head_coach" },
    { personKey: "irene", role: "assistant" },
  ],
  players: [
    { number: 4, firstName: "Hugo", lastName: "Serrano", position: "Base" },
    { number: 5, firstName: "Saúl", lastName: "Méndez", position: "Escolta" },
    { number: 6, firstName: "Adrián", lastName: "Toledo", position: "Alero" },
    { number: 7, firstName: "Leo", lastName: "Ortega", position: "Base" },
    { number: 8, firstName: "Bruno", lastName: "Pardo", position: "Escolta" },
    { number: 9, firstName: "Marco", lastName: "Vidal", position: "Alero" },
    { number: 10, firstName: "Gael", lastName: "Ferrer", position: "Alero" },
    { number: 11, firstName: "Unai", lastName: "Robles", position: "Ala-pívot" },
    { number: 12, firstName: "Iker", lastName: "Navas", position: "Ala-pívot" },
    { number: 13, firstName: "Óscar", lastName: "Vega", position: "Pívot" },
    { number: 14, firstName: "Teo", lastName: "Marín", position: "Base" },
    { number: 15, firstName: "Pablo", lastName: "Rey", position: "Pívot" },
  ],
  sessions: [
    {
      slotKey: "upcoming-0",
      slot: upcomingSlot(0),
      done: false,
      title: "Transición + rebote defensivo",
      focus: "transicion",
      secondaryFocus: "rebote",
      location: "Pabellón 2",
      items: [
        { phase: "Activación", title: "Movilidad + rueda de pases", minutes: 10 },
        { phase: "Técnica", title: "3 calles", minutes: 15 },
        { phase: "Rebote", title: "Rebote + outlet", minutes: 15 },
        { phase: "Transición", title: "3x2 continuo", minutes: 20 },
        { phase: "Competición", title: "2x2 presión", minutes: 15 },
      ],
    },
    {
      slotKey: "upcoming-1",
      slot: upcomingSlot(1),
      done: false,
      title: "Defensa presionante",
      focus: "defensa",
      secondaryFocus: "rebote",
      location: "Pabellón 2",
      items: [
        { phase: "Activación", title: "Juegos de pies y reacción", minutes: 10 },
        { phase: "Técnica", title: "Deslizamientos defensivos", minutes: 15 },
        { phase: "Defensa", title: "Ayuda y recuperación 3x3", minutes: 15 },
        { phase: "Defensa", title: "Presión al balón en medio campo", minutes: 15 },
        { phase: "Rebote", title: "Bloqueo y rebote 3x3", minutes: 10 },
        { phase: "Competición", title: "4x4 con puntos por parada", minutes: 10 },
      ],
    },
    pastSession(0, "Tiro tras bote", "tiro", "tecnica", [
      "Calentamiento con balón",
      { phase: "Tiro", title: "Tiro tras bote en parada", minutes: 35 },
      "Concurso de tiro por equipos",
    ]),
    pastSession(1, "Pase y corte", "ataque", "tecnica", [
      "Rueda de pases en movimiento",
      { phase: "Ataque", title: "Pase y corte 3x0", minutes: 35 },
      "3x3 con regla de corte",
    ]),
    pastSession(2, "Contraataque 2x1", "transicion", "ataque", [
      "Calentamiento con balón",
      { phase: "Transición", title: "Contraataque 2x1 y 3x2", minutes: 35 },
      "5x5 con puntos por contraataque",
    ]),
    pastSession(3, "Rebote ofensivo", "rebote", "tiro", [
      "Calentamiento con balón",
      { phase: "Rebote", title: "Bloqueo y rebote ofensivo 3x3", minutes: 35 },
      "5x5 con punto extra por rebote ofensivo",
    ]),
  ],
  game: {
    slotKey: "game",
    slot: gameSlot,
    location: "Pabellón 1",
    opponent: "CB Ribera",
    competition: "Liga Alevín",
    homeAway: "home",
  },
};

const BENJAMIN_A: TeamDef = {
  key: "benjamin-a",
  name: "Benjamín A",
  categoryKey: "benjamin",
  playersBirthYear: 2017,
  staff: [{ personKey: "nora", role: "head_coach" }],
  players: [
    { number: 3, firstName: "Mario", lastName: "Ibáñez", position: null },
    { number: 6, firstName: "Lucas", lastName: "Peña", position: null },
    { number: 9, firstName: "Eric", lastName: "Soto", position: null },
  ],
  sessions: [
    {
      slotKey: "upcoming-0",
      slot: sameDayAsNext("17:00", "18:00"),
      done: false,
      title: "Bote y control",
      focus: "tecnica",
      secondaryFocus: null,
      location: "Pabellón 1",
      items: [
        { phase: "Activación", title: "Juegos de bote libre", minutes: 10 },
        { phase: "Técnica", title: "Bote en estático y en movimiento", minutes: 15 },
        { phase: "Técnica", title: "Cambios de mano en circuito", minutes: 20 },
        { phase: "Competición", title: "Carrera de bote por equipos", minutes: 15 },
      ],
    },
  ],
  game: null,
};

const INFANTIL_A: TeamDef = {
  key: "infantil-a",
  name: "Infantil A",
  categoryKey: "infantil",
  playersBirthYear: 2013,
  staff: [{ personKey: "marta", role: "head_coach" }],
  players: [
    { number: 5, firstName: "Álvaro", lastName: "Demo", position: null },
    { number: 8, firstName: "Biel", lastName: "Demo", position: null },
    { number: 11, firstName: "Carla", lastName: "Demo", position: null },
  ],
  sessions: [
    {
      slotKey: "upcoming-0",
      slot: upcomingSlot(0),
      done: false,
      title: "Defensa individual",
      focus: "defensa",
      secondaryFocus: "tecnica",
      location: "Pabellón 1",
      items: [
        { phase: "Activación", title: "Movilidad y juegos de pies", minutes: 10 },
        { phase: "Técnica", title: "Posición defensiva y deslizamientos", minutes: 15 },
        { phase: "Defensa", title: "1x1 en medio campo", minutes: 20 },
        { phase: "Defensa", title: "Ayuda y recuperación 2x2", minutes: 15 },
        { phase: "Competición", title: "3x3 con puntos por parada", minutes: 15 },
      ],
    },
  ],
  game: null,
};

const markdown = (...lines: string[]): string => lines.join("\n");

// Los valores de Arcángel van sin título: solo código y descripción. «Defensa» y «Rebote»
// no llevan puntos y «Ataque» no lleva resumen: son los casos vacíos que la interfaz y la
// gestión tienen que pintar bien.
const ARCANGEL_METHODOLOGY: MethodologyDef = {
  sections: [
    {
      title: "Nuestra cultura",
      summary: "Lo que nos une dentro y fuera de la pista.",
      bodyMd: "",
      contentKind: "values",
    },
    {
      title: "El jugador Arcángel",
      summary: "Qué esperamos de cada jugador.",
      bodyMd: markdown(
        "Queremos jugadores que **compiten**, **aprenden** y **ayudan** al equipo.",
        "",
        "### Lo que esperamos",
        "",
        "- Llega puntual.",
        "- Escucha y lo vuelve a intentar.",
        "- Anima desde el banquillo.",
      ),
      contentKind: "text",
    },
    {
      title: "Cómo jugamos",
      summary: "Nuestros principios de juego.",
      bodyMd: "",
      contentKind: "principles",
    },
    {
      title: "Cómo entrenamos",
      summary: "Cómo son nuestras sesiones.",
      bodyMd: markdown(
        "Entrenamos como competimos: **intensidad** y pocas paradas.",
        "",
        "### Una sesión tipo",
        "",
        "1. Activación.",
        "2. Técnica.",
        "3. Táctica.",
        "4. Competición.",
      ),
      contentKind: "text",
    },
    {
      title: "Cómo competimos",
      summary: "Lo que exigimos en cada partido.",
      bodyMd: "",
      contentKind: "standards",
    },
  ],
  values: [
    { code: "TEAM FIRST", title: null, description: "El equipo está por delante del individuo." },
    { code: "EFFORT", title: null, description: "El esfuerzo no es negociable." },
    {
      code: "RESPECT",
      title: null,
      description: "Respeto a compañeros, entrenadores, rivales, árbitros y mesa.",
    },
  ],
  principles: [
    { title: "Defensa", summary: "Defensa arriba y presionante.", points: [] },
    {
      title: "Transición",
      summary: "Nuestra primera opción es correr.",
      points: ["El balón busca al jugador más adelantado."],
    },
    {
      title: "Rebote",
      summary: "La posesión defensiva termina cuando controlamos el balón.",
      points: [],
    },
    {
      title: "Ataque",
      summary: null,
      points: ["Espacios", "Pase", "1x1", "2x2", "Pasar y cortar", "Toma de decisiones"],
    },
  ],
  standards: [
    { title: "TEAM FIRST", description: "Celebramos el pase extra y la ayuda." },
    { title: "EFFORT IS NON-NEGOTIABLE", description: "En cada posesión, en cada ejercicio." },
    { title: "FINISH THE POSSESSION", description: "La defensa acaba cuando cogemos el rebote." },
    {
      title: "FIRST LOOK FORWARD",
      description: "Al recuperar, la primera mirada va hacia delante.",
    },
    { title: "RUN WIDE", description: "En transición corremos por las calles laterales." },
  ],
};

// Club Demo solo tiene una sección de texto y sus Standards: sin valores ni principios.
const CLUB_DEMO_METHODOLOGY: MethodologyDef = {
  sections: [
    {
      title: "Quiénes somos",
      summary: "Nuestra manera de entender el baloncesto.",
      bodyMd: "Somos un club de barrio que **forma personas**.",
      contentKind: "text",
    },
    { title: "Nuestros Standards", summary: null, bodyMd: "", contentKind: "standards" },
  ],
  values: [],
  principles: [],
  standards: [
    { title: "DEFENDER JUNTOS", description: "Nadie defiende solo." },
    {
      title: "COMPARTIR EL BALÓN",
      description: "El mejor tiro es el del compañero liberado.",
    },
  ],
};

// Los fixtures de los dos clubes se exportan por nombre: las fases siguientes los importan
// (y extienden con sus propias tablas) en vez de volver a escribir los datos del club.
export const ARCANGEL: ClubDef = {
  slug: "arcangel",
  name: "CB Arcángel",
  timezone: "Europe/Madrid",
  branding: {
    display_name: "Arcángel",
    wordmark_sub: "Basketball",
    short_name: "CBA",
    way_name: "The Arcángel Way",
    tagline: "One club. One identity. One way.",
    color_accent: "#c9a45c",
    color_accent_pressed: "#b38e48",
    color_on_accent: "#0a0a0b",
    color_accent_soft: "#2b2517",
    terminology: { way: "The Way", standards: "Arcángel Standards" },
  },
  staff: [
    { key: "raul", firstName: "Raúl", lastName: "Campos" },
    { key: "alex", firstName: "Álex", lastName: "Prieto" },
    { key: "irene", firstName: "Irene", lastName: "Soler" },
    { key: "nora", firstName: "Nora", lastName: "Gil" },
  ],
  members: [
    { email: "raul@arcangel.test", personKey: "raul", role: "admin" },
    { email: "alex@arcangel.test", personKey: "alex", role: "coach" },
    { email: "irene@arcangel.test", personKey: "irene", role: "coach" },
    { email: "nora@arcangel.test", personKey: "nora", role: "coach" },
  ],
  categories: [
    { key: "benjamin", name: "Benjamín", ageBand: "U10", sort: 10 },
    { key: "alevin", name: "Alevín", ageBand: "U12", sort: 20 },
  ],
  teams: [ALEVIN_A, BENJAMIN_A],
  methodology: ARCANGEL_METHODOLOGY,
};

export const CLUB_DEMO: ClubDef = {
  slug: "club-demo",
  name: "Club Demo",
  timezone: "Europe/Madrid",
  branding: {
    display_name: "Club Demo",
    wordmark_sub: "Baloncesto",
    short_name: "CDM",
    way_name: "The Demo Way",
    tagline: null,
    color_accent: "#3fb8af",
    color_accent_pressed: "#34998f",
    color_on_accent: "#0a0a0b",
    color_accent_soft: "#10282a",
    terminology: { way: "Nuestra forma" },
  },
  staff: [{ key: "marta", firstName: "Marta", lastName: "Ruiz" }],
  members: [{ email: "marta@demo.test", personKey: "marta", role: "coach" }],
  categories: [{ key: "infantil", name: "Infantil", ageBand: "U14", sort: 10 }],
  teams: [INFANTIL_A],
  methodology: CLUB_DEMO_METHODOLOGY,
};

const CLUBS: ClubDef[] = [ARCANGEL, CLUB_DEMO];

// Cuenta válida de Auth que no pertenece a ningún club: para probar el estado vacío.
const USERS_WITHOUT_CLUB = ["sin.club@clubos.test"];

// ── Construcción ─────────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function emptySeedData(): SeedData {
  return {
    users: [],
    organizations: [],
    organization_branding: [],
    people: [],
    memberships: [],
    seasons: [],
    categories: [],
    teams: [],
    team_staff: [],
    team_players: [],
    focus_areas: [],
    events: [],
    games: [],
    practice_plans: [],
    practice_items: [],
    way_sections: [],
    club_values: [],
    game_principles: [],
    principle_points: [],
    standards: [],
  };
}

// La metodología se escribe toda publicada. `number` y `sort` son la posición (desde 1) en
// la lista del fixture y el slug sale del título. Los ids salen de la clave de cada fila
// (slug, código, número, y el slug del principio más la posición para sus puntos): cambiar
// el texto de una fila la actualiza en un nuevo `pnpm seed` en vez de duplicarla.
function addMethodology(
  data: SeedData,
  organizationId: string,
  id: (key: string) => string,
  methodology: MethodologyDef,
): void {
  methodology.sections.forEach((section, index) => {
    const slug = slugify(section.title);
    data.way_sections.push({
      id: id(`way:${slug}`),
      organization_id: organizationId,
      number: index + 1,
      slug,
      title: section.title,
      summary: section.summary,
      body_md: section.bodyMd,
      content_kind: section.contentKind,
      status: "published",
      sort: index + 1,
    });
  });

  methodology.values.forEach((value, index) => {
    data.club_values.push({
      id: id(`value:${value.code}`),
      organization_id: organizationId,
      code: value.code,
      title: value.title,
      description: value.description,
      status: "published",
      sort: index + 1,
    });
  });

  methodology.principles.forEach((principle, index) => {
    const slug = slugify(principle.title);
    const principleId = id(`principle:${slug}`);
    data.game_principles.push({
      id: principleId,
      organization_id: organizationId,
      slug,
      title: principle.title,
      summary: principle.summary,
      status: "published",
      sort: index + 1,
    });
    principle.points.forEach((text, pointIndex) => {
      data.principle_points.push({
        id: id(`point:${slug}:${pointIndex + 1}`),
        organization_id: organizationId,
        principle_id: principleId,
        text,
        sort: pointIndex + 1,
      });
    });
  });

  methodology.standards.forEach((standard, index) => {
    data.standards.push({
      id: id(`standard:${index + 1}`),
      organization_id: organizationId,
      number: index + 1,
      title: standard.title,
      description: standard.description,
      status: "published",
      sort: index + 1,
    });
  });
}

function addClub(data: SeedData, club: ClubDef, now: Date): void {
  const id = (key: string) => seedId(club.slug, key);
  const organizationId = id("organization");
  const schedule = seedSchedule(now, club.timezone);
  const seasonId = id(`season:${SEASON.key}`);

  data.organizations.push({
    id: organizationId,
    slug: club.slug,
    name: club.name,
    timezone: club.timezone,
    status: "active",
  });
  data.organization_branding.push({ organization_id: organizationId, ...club.branding });

  data.seasons.push({
    id: seasonId,
    organization_id: organizationId,
    name: SEASON.name,
    starts_on: SEASON.startsOn,
    ends_on: SEASON.endsOn,
    is_current: true,
  });

  for (const category of club.categories) {
    data.categories.push({
      id: id(`category:${category.key}`),
      organization_id: organizationId,
      name: category.name,
      age_band: category.ageBand,
      sort: category.sort,
    });
  }

  const focusId = (slug: FocusSlug) => id(`focus:${slug}`);
  FOCUS_AREAS.forEach((focus, index) => {
    data.focus_areas.push({
      id: focusId(focus.slug),
      organization_id: organizationId,
      slug: focus.slug,
      name: focus.name,
      sort: (index + 1) * 10,
    });
  });

  // Personas con cuenta o en el cuerpo técnico: adultos, sin año de nacimiento.
  const staffPersonId = (personKey: string) => id(`person:${personKey}`);
  for (const person of club.staff) {
    data.people.push({
      id: staffPersonId(person.key),
      organization_id: organizationId,
      first_name: person.firstName,
      last_name: person.lastName,
      birth_year: null,
    });
  }

  for (const member of club.members) {
    data.memberships.push({
      id: id(`membership:${member.personKey}`),
      email: member.email,
      organization_id: organizationId,
      role: member.role,
      person_id: staffPersonId(member.personKey),
      status: "active",
    });
  }

  for (const team of club.teams) {
    const teamId = id(`team:${team.key}`);
    data.teams.push({
      id: teamId,
      organization_id: organizationId,
      season_id: seasonId,
      category_id: id(`category:${team.categoryKey}`),
      name: team.name,
    });

    for (const staff of team.staff) {
      data.team_staff.push({
        organization_id: organizationId,
        team_id: teamId,
        person_id: staffPersonId(staff.personKey),
        staff_role: staff.role,
      });
    }

    for (const player of team.players) {
      const personId = id(`person:${team.key}:${slugify(`${player.firstName} ${player.lastName}`)}`);
      data.people.push({
        id: personId,
        organization_id: organizationId,
        first_name: player.firstName,
        last_name: player.lastName,
        birth_year: team.playersBirthYear,
      });
      data.team_players.push({
        organization_id: organizationId,
        team_id: teamId,
        person_id: personId,
        jersey_number: player.number,
        position: player.position,
      });
    }

    for (const session of team.sessions) {
      const slot = session.slot(schedule, club.timezone);
      const eventId = id(`event:${team.key}:${session.slotKey}`);
      const planId = id(`plan:${team.key}:${session.slotKey}`);

      data.events.push({
        id: eventId,
        organization_id: organizationId,
        team_id: teamId,
        kind: "practice",
        starts_at: slot.startsAt,
        ends_at: slot.endsAt,
        location: session.location,
        status: session.done ? "done" : "scheduled",
      });

      // R13: el equipo del plan es siempre el de su evento; el esquema no lo garantiza.
      data.practice_plans.push({
        id: planId,
        organization_id: organizationId,
        team_id: teamId,
        event_id: eventId,
        title: session.title,
        primary_focus_id: focusId(session.focus),
        secondary_focus_id: session.secondaryFocus === null ? null : focusId(session.secondaryFocus),
        notes: null,
        is_template: false,
        status: session.done ? "done" : "ready",
      });

      session.items.forEach((item, index) => {
        const sort = index + 1;
        data.practice_items.push({
          id: id(`item:${team.key}:${session.slotKey}:${sort}`),
          organization_id: organizationId,
          plan_id: planId,
          sort,
          phase: item.phase,
          drill_id: null,
          title_override: item.title,
          minutes: item.minutes,
          notes: null,
        });
      });
    }

    if (team.game !== null) {
      const slot = team.game.slot(schedule, club.timezone);
      const eventId = id(`event:${team.key}:${team.game.slotKey}`);
      data.events.push({
        id: eventId,
        organization_id: organizationId,
        team_id: teamId,
        kind: "game",
        starts_at: slot.startsAt,
        ends_at: slot.endsAt,
        location: team.game.location,
        status: "scheduled",
      });
      data.games.push({
        event_id: eventId,
        organization_id: organizationId,
        opponent_name: team.game.opponent,
        competition_name: team.game.competition,
        home_away: team.game.homeAway,
      });
    }
  }

  addMethodology(data, organizationId, id, club.methodology);
}

/** Todas las filas del seed para el instante `now`. Pura y determinista. */
export function buildSeedData(now: Date): SeedData {
  const data = emptySeedData();
  for (const club of CLUBS) addClub(data, club, now);
  data.users = [
    ...data.memberships.map((membership) => ({ email: membership.email })),
    ...USERS_WITHOUT_CLUB.map((email) => ({ email })),
  ];
  return data;
}
