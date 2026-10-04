// Biblioteca de ejercicios del seed: el contenido de cada club (`ARCANGEL_DRILLS`,
// `DEMO_DRILLS`) y los constructores PUROS que lo convierten en filas. Sin base de datos ni
// red: `data.ts` los llama dentro de `buildSeedData` y `run.ts` solo escribe lo que sale.
//
// Todo es ficticio y genérico. Los ejercicios no llevan diagrama: `diagram_media_id` se
// queda a null, porque un diagrama tiene que estar en la carpeta de Storage de su ejercicio.

import type { TablesInsert } from "@/lib/database.types";
import type { FocusSlug, WithId } from "./data";
import { seedId, slugify } from "./ids";

// ── Tipos ────────────────────────────────────────────────────────────────────────────

export type SeedDrillPoint = { text: string; key?: true };
export type SeedDrillVariant = { title: string; description: string };

export type SeedDrill = {
  // Título en minúsculas, sin tildes y con `-` (`bloqueo-de-rebote`): de ella salen los ids.
  key: string;
  title: string;
  // [mínima, máxima]: «12+» es [12, null] (edad máxima abierta) y «8–12» es [8, 12].
  age: [min: number, max: number | null];
  players: [min: number, max: number];
  minutes: [min: number, max: number];
  // Se resuelven en el club por `slug` (focos y principios) y por `number` (Standards).
  focus: FocusSlug[];
  principles: string[];
  standards: number[];
  equipment: string[];
  objective: string;
  setupMd: string;
  points: SeedDrillPoint[];
  variants?: SeedDrillVariant[];
  // Email de una cuenta del seed. `run.ts` lo cambia por `created_by` con el id de Auth.
  author: string;
  status: "published" | "draft";
};

// `search` es una columna generada, `updated_at` la fija el trigger y `created_at` su valor
// por defecto: ninguna va en las filas del seed.
export type SeedDrillRow = Omit<
  TablesInsert<"drills">,
  "id" | "created_by" | "created_at" | "updated_at" | "search"
> & {
  id: string;
  author_email: string;
};

export type DrillRows = {
  drills: SeedDrillRow[];
  drill_coaching_points: WithId<TablesInsert<"drill_coaching_points">>[];
  drill_variants: WithId<TablesInsert<"drill_variants">>[];
  drill_focus_areas: TablesInsert<"drill_focus_areas">[];
  drill_principles: TablesInsert<"drill_principles">[];
  drill_standards: TablesInsert<"drill_standards">[];
};

// Lo que un club ya define y a lo que sus ejercicios se enlazan.
export type DrillRefs = {
  orgSlug: string;
  organizationId: string;
  focusAreas: { id: string; slug: string }[];
  principles: { id: string; slug: string }[];
  standards: { id: string; number: number }[];
};

// ── Contenido ────────────────────────────────────────────────────────────────────────

type DrillInput = Omit<SeedDrill, "key" | "status"> & { status?: SeedDrill["status"] };

// La clave sale del título y el estado por defecto es publicado: solo se escribe lo que
// cambia de un ejercicio a otro.
const define = ({ status = "published", ...input }: DrillInput): SeedDrill => ({
  ...input,
  key: slugify(input.title),
  status,
});

const RAUL = "raul@arcangel.test";
const IRENE = "irene@arcangel.test";
const MARTA = "marta@demo.test";

// Los 18 ejercicios de Arcángel, en el orden en que los numera el plan de la fase. Los
// principios son los focos que son principio del club (transición, defensa, rebote y
// ataque), más «ataque» en los números 10 y 17. «outlet» solo aparece en el 1: la búsqueda
// de los e2e lo encuentra a él y a nadie más.
export const ARCANGEL_DRILLS: SeedDrill[] = [
  define({
    title: "Rebote + outlet",
    age: [12, null],
    players: [6, 12],
    minutes: [10, 15],
    focus: ["rebote", "transicion"],
    principles: ["rebote", "transicion"],
    standards: [3, 4, 5],
    equipment: ["Balones", "Conos", "Petos"],
    objective: "Asegurar el rebote defensivo y convertirlo inmediatamente en ventaja ofensiva.",
    setupMd:
      "Tirador en la esquina, reboteador en la zona y dos exteriores abiertos; el rebote sale en outlet y se ataca en 3 calles.",
    points: [
      { text: "Rebote con dos manos", key: true },
      { text: "Primera mirada hacia delante", key: true },
      { text: "Outlet rápido", key: true },
      { text: "Abrir carriles" },
      { text: "Correr" },
    ],
    variants: [
      {
        title: "Con defensor en el outlet",
        description: "Un defensor presiona al jugador que recibe para que decida más rápido.",
      },
      {
        title: "Tras tiro libre",
        description:
          "El rebote llega de un tiro libre fallado, con los jugadores ya colocados en los carriles.",
      },
    ],
    author: RAUL,
  }),
  define({
    title: "3 calles",
    age: [10, null],
    players: [9, 15],
    minutes: [10, 10],
    focus: ["transicion", "tecnica"],
    principles: ["transicion"],
    standards: [4, 5],
    equipment: ["Balones"],
    objective: "Atacar la canasta contraria en tres calles, con el balón siempre hacia delante.",
    setupMd:
      "Tres filas en la línea de fondo: el del centro conduce y los dos laterales corren abiertos. Al acabar, los tres vuelven en sentido contrario.",
    points: [
      { text: "Laterales abiertos, pegados a la línea", key: true },
      { text: "Pasa antes de llegar a la zona", key: true },
      { text: "Mira al compañero que corre" },
      { text: "Finaliza con control y sin frenar" },
    ],
    author: RAUL,
  }),
  define({
    title: "3x2 continuo",
    age: [12, null],
    players: [8, 12],
    minutes: [12, 20],
    focus: ["transicion", "ataque"],
    principles: ["transicion", "ataque"],
    standards: [2, 4, 5],
    equipment: ["Balones", "Petos"],
    objective:
      "Resolver con acierto el tres contra dos y, al cambiar de lado, defender en inferioridad.",
    setupMd:
      "Tres atacantes contra dos defensores en media pista. Al terminar la jugada, los dos defensores atacan el otro aro junto a un compañero que entra.",
    points: [
      { text: "Ataca el espacio libre antes de pasar", key: true },
      { text: "El tercer atacante llega por el lado contrario al balón", key: true },
      { text: "Defiende de dos en dos: uno al balón y otro en ayuda" },
      { text: "Corre sin pausa entre jugadas" },
    ],
    author: RAUL,
  }),
  define({
    title: "2x2 presión",
    age: [12, null],
    players: [8, 12],
    minutes: [12, 15],
    focus: ["defensa"],
    principles: ["defensa"],
    standards: [2, 3],
    equipment: ["Balones", "Petos"],
    objective: "Presionar al balón en dos contra dos hasta forzar un mal pase o un tiro difícil.",
    setupMd:
      "Dos parejas en media pista; el ataque tiene ocho segundos para tirar. Tras cada posesión se cambian los papeles.",
    points: [
      { text: "Presiona al balón con las manos activas", key: true },
      { text: "Ayuda y recupera sin dejar libre a tu hombre", key: true },
      { text: "Comunica cada ayuda en voz alta" },
      { text: "Termina la posesión con el rebote" },
    ],
    variants: [
      {
        title: "Toda la pista",
        description:
          "La presión empieza en el fondo y las parejas defienden hasta que el balón cruza la línea contraria.",
      },
    ],
    author: RAUL,
  }),
  define({
    title: "1x1 toda pista",
    age: [12, null],
    players: [4, 12],
    minutes: [10, 15],
    focus: ["defensa", "tecnica"],
    principles: ["defensa"],
    standards: [2],
    equipment: ["Balones", "Conos"],
    objective: "Defender al balón de canasta a canasta sin perder la posición.",
    setupMd:
      "Una pareja por carril: el atacante conduce hasta la canasta contraria y el defensor lo acompaña entre conos. Al llegar se cambian los papeles.",
    points: [
      { text: "Cadera baja y pies activos", key: true },
      { text: "Obliga al atacante a ir hacia la banda", key: true },
      { text: "Mantén la distancia de un brazo" },
      { text: "Reacciona al cambio de ritmo sin cruzar los pies" },
    ],
    author: RAUL,
  }),
  define({
    title: "Movilidad + rueda de pases",
    age: [8, null],
    players: [8, 16],
    minutes: [8, 12],
    focus: ["tecnica"],
    principles: [],
    standards: [],
    equipment: ["Balones", "Conos"],
    objective: "Activar el cuerpo con movilidad y coger ritmo de pase antes del trabajo principal.",
    setupMd:
      "Grupos de cuatro en un cuadrado marcado con conos. Pasan y siguen su pase, con una serie de movilidad entre rondas.",
    points: [
      { text: "Recibe con las manos listas", key: true },
      { text: "Pasa y sigue tu pase" },
      { text: "Mueve brazos y caderas entre series" },
    ],
    author: RAUL,
  }),
  define({
    title: "Desplazamientos defensivos",
    age: [8, null],
    players: [4, 16],
    minutes: [8, 10],
    focus: ["defensa"],
    principles: ["defensa"],
    standards: [2],
    equipment: ["Conos"],
    objective: "Mejorar los desplazamientos laterales y hacia atrás en posición defensiva.",
    setupMd:
      "Filas en la línea de fondo que recorren la pista en zigzag entre conos. Deslizan sin cruzar los pies y cambian de dirección en cada cono.",
    points: [
      { text: "Cadera baja y espalda recta", key: true },
      { text: "Desliza sin juntar ni cruzar los pies", key: true },
      { text: "Cambia de dirección con el pie exterior" },
      { text: "Brazos abiertos y manos activas" },
    ],
    author: RAUL,
  }),
  define({
    title: "Bloqueo de rebote",
    age: [10, null],
    players: [6, 12],
    minutes: [10, 12],
    focus: ["rebote"],
    principles: ["rebote"],
    standards: [3],
    equipment: ["Balones"],
    objective: "Bloquear al rival antes de ir a por el balón para asegurar el rebote defensivo.",
    setupMd:
      "Un tirador, un defensor y un atacante por canasta. Tras el tiro, el defensor localiza al rival, lo bloquea y busca el balón.",
    points: [
      { text: "Localiza a tu hombre antes del tiro", key: true },
      { text: "Bloquea con el cuerpo y busca el balón", key: true },
      { text: "Salta con las dos manos arriba" },
      { text: "Protege el balón con los codos abiertos" },
    ],
    // El único borrador del seed: lo ven su autora y los admins, y nadie más.
    author: IRENE,
    status: "draft",
  }),
  define({
    title: "3x3 a 5 puntos",
    age: [12, null],
    players: [6, 12],
    minutes: [15, 20],
    focus: ["ataque", "defensa"],
    principles: ["ataque", "defensa"],
    standards: [2, 3],
    equipment: ["Balones", "Petos"],
    objective:
      "Competir en tres contra tres hasta cinco puntos, defendiendo cada posesión hasta el rebote.",
    setupMd:
      "Dos equipos de tres en media pista. Cada canasta vale un punto y quien defiende y rebota pasa a atacar.",
    points: [
      { text: "Defiende cada posesión hasta coger el rebote", key: true },
      { text: "Mueve el balón antes de tirar", key: true },
      { text: "Conoce el marcador y ajusta tu juego" },
      { text: "Anima al compañero tras un error" },
    ],
    author: RAUL,
  }),
  define({
    title: "Tiro tras bote",
    age: [10, null],
    players: [4, 12],
    minutes: [10, 15],
    focus: ["tiro", "tecnica"],
    principles: ["ataque"],
    standards: [],
    equipment: ["Balones", "Conos"],
    objective: "Tirar en equilibrio después de un bote, con la misma mecánica en cada intento.",
    setupMd:
      "Parejas por canasta: uno pasa y el otro tira. El tirador bota hacia un cono, se detiene y lanza.",
    points: [
      { text: "Frena en dos tiempos antes de tirar", key: true },
      { text: "Pies y hombros hacia el aro", key: true },
      { text: "Termina el gesto con la muñeca relajada" },
      { text: "Rebota tu tiro y cambia el papel" },
    ],
    author: RAUL,
  }),
  define({
    title: "Pase y corte",
    age: [10, null],
    players: [6, 12],
    minutes: [10, 15],
    focus: ["ataque", "tecnica"],
    principles: ["ataque"],
    standards: [4],
    equipment: ["Balones"],
    objective: "Pasar y cortar hacia la canasta para generar ventajas con el balón en movimiento.",
    setupMd:
      "Tres filas: ala, base y alero. Quien pasa corta hacia el aro y ocupa el sitio vacío; después el balón vuelve al exterior.",
    points: [
      { text: "Pasa y corta sin esperar", key: true },
      { text: "Corta en diagonal y con las manos listas", key: true },
      { text: "Recibe con los pies hacia el aro" },
      { text: "Ocupa el sitio de quien acaba de cortar" },
    ],
    author: RAUL,
  }),
  define({
    title: "Contraataque 2x1",
    age: [10, null],
    players: [6, 12],
    minutes: [10, 15],
    focus: ["transicion"],
    principles: ["transicion"],
    standards: [4, 5],
    equipment: ["Balones"],
    objective: "Terminar con éxito un dos contra uno después de recuperar el balón.",
    setupMd:
      "Dos atacantes salen de medio campo contra un defensor que protege la canasta. Al terminar, el defensor pasa a atacar con otro compañero.",
    points: [
      { text: "Corre abierto y mira al compañero", key: true },
      { text: "Atrae al defensor antes de pasar", key: true },
      { text: "Pasa en el momento justo y finaliza" },
      { text: "Vuelve a defender al terminar" },
    ],
    author: RAUL,
  }),
  define({
    title: "Rebote ofensivo",
    age: [12, null],
    players: [6, 12],
    minutes: [10, 15],
    focus: ["rebote", "ataque"],
    principles: ["rebote", "ataque"],
    standards: [2, 3],
    equipment: ["Balones"],
    objective: "Atacar el rebote tras un tiro fallado para conseguir segundas oportunidades.",
    setupMd:
      "Tres atacantes y tres defensores cerca del aro. Un tirador lanza, todos pelean por el balón y quien lo coge intenta anotar de inmediato.",
    points: [
      { text: "Busca posición antes de que el balón toque el aro", key: true },
      { text: "Salta a por el balón con las dos manos", key: true },
      { text: "Anota rápido tras el rebote" },
      { text: "Sigue el tiro hasta el final" },
    ],
    author: RAUL,
  }),
  define({
    title: "Bote y control",
    age: [8, 12],
    players: [4, 12],
    minutes: [10, 15],
    focus: ["tecnica"],
    principles: [],
    standards: [],
    equipment: ["Balones", "Conos"],
    objective: "Controlar el bote con las dos manos y la cabeza levantada.",
    setupMd:
      "Cada jugador recorre un circuito de conos con su balón, con botes de control, cambios de mano y paradas.",
    points: [
      { text: "Cabeza levantada mientras botas", key: true },
      { text: "Bota con la yema de los dedos", key: true },
      { text: "Usa las dos manos por igual" },
      { text: "Protege el balón con el cuerpo" },
    ],
    author: RAUL,
  }),
  define({
    title: "Defensa individual",
    age: [10, null],
    players: [6, 12],
    minutes: [10, 15],
    focus: ["defensa"],
    principles: ["defensa"],
    standards: [2],
    equipment: ["Balones", "Petos"],
    objective: "Defender uno contra uno con buena posición y sin cometer faltas.",
    setupMd:
      "Parejas en media pista con petos de dos colores. El atacante intenta superar al defensor y tirar, y se cambian los papeles tras cada posesión.",
    points: [
      { text: "Mantente entre el balón y la canasta", key: true },
      { text: "Muévete con los pies, no con las manos", key: true },
      { text: "Cierra el paso hacia el centro" },
      { text: "Acaba la posesión con el rebote" },
    ],
    author: RAUL,
  }),
  define({
    title: "Movilidad dinámica",
    age: [8, null],
    players: [4, 16],
    minutes: [8, 10],
    focus: ["tecnica"],
    principles: [],
    standards: [],
    equipment: ["Conos"],
    objective: "Calentar las articulaciones y activar el cuerpo con movimientos controlados.",
    setupMd:
      "Dos filas con conos cada diez pasos. Recorren la pista con elevaciones de rodillas, zancadas y giros de cadera.",
    points: [
      { text: "Mueve los brazos con amplitud", key: true },
      { text: "Mantén un ritmo constante" },
      { text: "Apoya el pie con control" },
    ],
    author: RAUL,
  }),
  define({
    title: "Rueda de entradas",
    age: [8, null],
    players: [6, 16],
    minutes: [8, 12],
    focus: ["tecnica", "tiro"],
    principles: ["ataque"],
    standards: [],
    equipment: ["Balones"],
    objective: "Practicar la entrada a canasta por los dos lados en una rueda continua.",
    setupMd:
      "Dos filas, una de pasadores y otra de entradas. Quien entra recibe, da dos pasos y finaliza; después rebota y pasa a la otra fila.",
    points: [
      { text: "Dos pasos largos y salto hacia arriba", key: true },
      { text: "Alterna entradas por la derecha y por la izquierda", key: true },
      { text: "Mira el aro desde el primer paso" },
      { text: "Coge tu rebote y vuelve a la fila" },
    ],
    author: RAUL,
  }),
  define({
    title: "4x4 transición",
    age: [12, null],
    players: [8, 12],
    minutes: [15, 20],
    focus: ["transicion", "defensa"],
    principles: ["transicion", "defensa"],
    standards: [2, 4, 5],
    equipment: ["Balones", "Petos"],
    objective:
      "Reaccionar a cada cambio de posesión y decidir rápido en la transición entre defensa y ataque.",
    setupMd:
      "Dos equipos de cuatro en toda la pista. Tras cada canasta o recuperación se cambian los papeles sin parar el juego.",
    points: [
      { text: "Primera mirada hacia delante al recuperar", key: true },
      { text: "Corre por las calles abiertas", key: true },
      { text: "Defiende en cuanto pierdes el balón" },
      { text: "Comunica quién cubre al balón" },
    ],
    variants: [
      {
        title: "Con comodín",
        description:
          "Un jugador extra juega siempre con el equipo que ataca y crea superioridad numérica.",
      },
    ],
    author: RAUL,
  }),
];

// Club Demo no tiene principios de juego en su metodología, así que sus ejercicios no
// enlazan ninguno.
export const DEMO_DRILLS: SeedDrill[] = [
  define({
    title: "Defensa individual",
    age: [14, null],
    players: [6, 12],
    minutes: [10, 15],
    focus: ["defensa"],
    principles: [],
    standards: [1],
    equipment: ["Balones"],
    objective:
      "Defender al balón en uno contra uno con buena posición y pedir ayuda cuando haga falta.",
    setupMd:
      "Parejas en media pista con un tercer jugador como ayuda. El atacante intenta superar al defensor y se cambian los papeles tras cada posesión.",
    points: [
      { text: "Posición baja y manos activas", key: true },
      { text: "Pide ayuda en voz alta", key: true },
      { text: "Ayuda sin dejar libre a tu hombre" },
      { text: "Recupera tu posición al acabar la ayuda" },
    ],
    author: MARTA,
  }),
  define({
    title: "Tiro en carrera",
    age: [12, null],
    players: [4, 12],
    minutes: [10, 10],
    focus: ["tiro"],
    principles: [],
    standards: [],
    equipment: ["Balones"],
    objective: "Tirar en carrera después de recibir con el balón en movimiento.",
    setupMd:
      "Dos filas en el ala: el jugador recibe en carrera, da dos pasos y tira. Después rebota y cambia de fila.",
    points: [
      { text: "Recibe con los pies hacia el aro", key: true },
      { text: "Dos pasos antes del tiro", key: true },
      { text: "Sigue el balón con la vista" },
      { text: "Cambia de fila al terminar" },
    ],
    author: MARTA,
  }),
];

// ── Constructores ────────────────────────────────────────────────────────────────────

/** Id de un ejercicio del seed: el club y la clave de su título. */
export function drillId(orgSlug: string, key: string): string {
  return seedId(orgSlug, `drill:${key}`);
}

/**
 * Id del ejercicio de un club por su título exacto. Con él `buildSeedData` enlaza los ítems
 * de las sesiones: solo vale el título tal cual, y solo los ejercicios de ese club.
 */
export function drillIdsByTitle(orgSlug: string, drills: SeedDrill[]): Map<string, string> {
  return new Map(drills.map((drill) => [drill.title, drillId(orgSlug, drill.key)]));
}

// El id de lo que un ejercicio enlaza, o un error que dice qué falta y en qué club: un seed
// con un enlace roto no debe seguir en silencio.
function resolved(id: string | undefined, what: string, ref: string | number, orgSlug: string): string {
  if (id === undefined) throw new Error(`Seed: no existe ${what} "${ref}" en ${orgSlug}`);
  return id;
}

/**
 * Las filas de la biblioteca de un club: ejercicios, puntos de coaching, variantes y sus
 * vínculos con focos, principios y Standards. Focos y principios se buscan por `slug` y los
 * Standards por `number` entre los que el club ya define (`refs`).
 *
 * `sort` de puntos y variantes empieza en 0, como `save_drill`. Los ids salen de la clave
 * del ejercicio y de la posición, así que cambiar el texto de un punto lo actualiza y quitar
 * uno por el final deja uno de más que `run.ts` borra.
 */
export function buildDrillRows(drills: SeedDrill[], refs: DrillRefs): DrillRows {
  const { orgSlug, organizationId } = refs;
  const focusId = (slug: string) =>
    resolved(refs.focusAreas.find((f) => f.slug === slug)?.id, "el foco", slug, orgSlug);
  const principleId = (slug: string) =>
    resolved(refs.principles.find((p) => p.slug === slug)?.id, "el principio", slug, orgSlug);
  const standardId = (number: number) =>
    resolved(refs.standards.find((s) => s.number === number)?.id, "el Standard", number, orgSlug);

  const rows: DrillRows = {
    drills: [],
    drill_coaching_points: [],
    drill_variants: [],
    drill_focus_areas: [],
    drill_principles: [],
    drill_standards: [],
  };

  for (const drill of drills) {
    const id = drillId(orgSlug, drill.key);
    rows.drills.push({
      id,
      organization_id: organizationId,
      title: drill.title,
      summary: null,
      objective: drill.objective,
      setup_md: drill.setupMd,
      min_players: drill.players[0],
      max_players: drill.players[1],
      min_minutes: drill.minutes[0],
      max_minutes: drill.minutes[1],
      min_age: drill.age[0],
      max_age: drill.age[1],
      equipment: drill.equipment,
      diagram_media_id: null,
      video_url: null,
      status: drill.status,
      author_email: drill.author,
    });

    drill.points.forEach((point, index) => {
      rows.drill_coaching_points.push({
        id: seedId(orgSlug, `drill:${drill.key}:point:${index}`),
        organization_id: organizationId,
        drill_id: id,
        text: point.text,
        is_key: point.key === true,
        sort: index,
      });
    });

    (drill.variants ?? []).forEach((variant, index) => {
      rows.drill_variants.push({
        id: seedId(orgSlug, `drill:${drill.key}:variant:${index}`),
        organization_id: organizationId,
        drill_id: id,
        title: variant.title,
        description: variant.description,
        sort: index,
      });
    });

    for (const slug of drill.focus) {
      rows.drill_focus_areas.push({
        organization_id: organizationId,
        drill_id: id,
        focus_area_id: focusId(slug),
      });
    }
    for (const slug of drill.principles) {
      rows.drill_principles.push({
        organization_id: organizationId,
        drill_id: id,
        principle_id: principleId(slug),
      });
    }
    for (const number of drill.standards) {
      rows.drill_standards.push({
        organization_id: organizationId,
        drill_id: id,
        standard_id: standardId(number),
      });
    }
  }

  return rows;
}
