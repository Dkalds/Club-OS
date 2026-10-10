import { MAX_MINUTES, MINUTES_STEP } from "./limits";

// La propuesta de entrenamiento: con la duración y los objetivos de una sesión, lo que se sabe
// de su equipo y los ejercicios de la biblioteca, arma un borrador de sesión. Son reglas, no IA:
// con los mismos datos sale siempre lo mismo, y no escribe nada (lo que propone llega al
// constructor como cambios sin guardar).
//
// No conoce los objetivos de ningún club (regla 3): recibe los de la sesión y los de cada
// ejercicio y solo los compara por su slug. Las dos fases con nombre propio son de
// `DEFAULT_PHASES`, las que el constructor ya propone.

/** Un objetivo de trabajo, como lo llevan la sesión y los ejercicios. */
export type ProposalFocus = { slug: string; name: string };

/** Lo que la propuesta mira de un ejercicio de la biblioteca. */
export type ProposalDrill = {
  id: string;
  title: string;
  minAge: number;
  maxAge: number | null;
  minPlayers: number;
  maxPlayers: number;
  minMinutes: number;
  maxMinutes: number;
  focus: ProposalFocus[];
  /** Cuántos de sus puntos de corrección son clave. */
  keyPoints: number;
  variants: number;
};

/**
 * Lo que hace falta para proponer. `minutes` es la franja de la sesión. `age` es la edad de la
 * categoría del equipo y `players`, cuántos jugadores tiene; `null` si no se sabe, y entonces
 * no se filtra por ello. `recentDrillIds` son los ejercicios de las últimas sesiones del equipo.
 */
export type ProposalInput = {
  minutes: number;
  age: number | null;
  players: number | null;
  primaryFocus: ProposalFocus | null;
  secondaryFocus: ProposalFocus | null;
  drills: readonly ProposalDrill[];
  recentDrillIds: readonly string[];
};

/** Un ítem propuesto. `hint` dice por qué está ahí; no se guarda. */
export type ProposedItem = {
  drillId: string;
  title: string;
  phase: string | null;
  minutes: number;
  hint: string;
};

/** La propuesta y los minutos de la franja que no ha podido cubrir. */
export type Proposal = { items: ProposedItem[]; uncoveredMinutes: number };

const WARMUP_PHASE = "Activación";
const GAME_PHASE = "Competición";

/** Por debajo de esto, la sesión lleva un solo ejercicio del objetivo principal. */
const TWO_MAIN_FROM_MINUTES = 60;

type SlotKind = "warmup" | "main" | "main2" | "secondary" | "game";

/** La parte de la franja de cada hueco. Con dos del principal, se reparten su 45 %. */
const SHARE: Record<SlotKind, number> = {
  warmup: 0.15,
  main: 0.45,
  main2: 0.225,
  secondary: 0.2,
  game: 0.2,
};

function shareOf(kind: SlotKind, slots: readonly Filled[]): number {
  const split = kind === "main" && slots.some((slot) => slot.kind === "main2");
  return split ? SHARE.main2 : SHARE[kind];
}

/** En qué orden se eligen los ejercicios: primero los que piden un objetivo. */
const PICK_ORDER: readonly SlotKind[] = ["main", "main2", "secondary", "game", "warmup"];
/** El orden de la sesión. */
const SESSION_ORDER: readonly SlotKind[] = ["warmup", "main", "main2", "secondary", "game"];
/** A quién se le dan los minutos que faltan, por turnos; los que sobran se quitan al revés. */
const GROW_ORDER: readonly SlotKind[] = ["main", "main2", "secondary", "game", "warmup"];
/** Qué hueco se quita cuando ni con los mínimos caben todos. El principal, nunca. */
const DROP_ORDER: readonly SlotKind[] = ["secondary", "game", "main2", "warmup"];

/** Los ejercicios que como mucho lleva una propuesta. */
const MAX_PROPOSED_ITEMS = 8;

type Slot = { kind: SlotKind; phase: string | null; focus: ProposalFocus | null };
type Filled = Slot & { drill: ProposalDrill };
/** Un ejercicio más para la franja que los huecos no llenan; va detrás del hueco de `after`. */
type Extra = { after: "main" | "secondary"; phase: string | null; drill: ProposalDrill; minutes: number };

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "es") || (a < b ? -1 : a > b ? 1 : 0);
}

function byTitle(a: ProposalDrill, b: ProposalDrill): number {
  return compareText(a.title, b.title) || compareText(a.id, b.id);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Por qué está un ejercicio en la propuesta: «Transición · 2 puntos clave · 1 variante». */
export function proposalHint(drill: ProposalDrill): string {
  const parts: string[] = [];
  if (drill.focus.length > 0) parts.push(drill.focus.map((focus) => focus.name).join(", "));
  if (drill.keyPoints > 0) parts.push(plural(drill.keyPoints, "punto clave", "puntos clave"));
  if (drill.variants > 0) parts.push(plural(drill.variants, "variante", "variantes"));
  return parts.join(" · ");
}

function hasFocus(drill: ProposalDrill, focus: ProposalFocus): boolean {
  return drill.focus.some((candidate) => candidate.slug === focus.slug);
}

/**
 * Los objetivos de los ejercicios, del que más ejercicios tiene al que menos: de aquí salen el
 * principal y el secundario de una sesión que no los trae.
 */
function rankFocus(drills: readonly ProposalDrill[]): ProposalFocus[] {
  const counts = new Map<string, { focus: ProposalFocus; count: number }>();
  for (const drill of drills) {
    for (const focus of drill.focus) {
      const entry = counts.get(focus.slug) ?? { focus, count: 0 };
      entry.count += 1;
      counts.set(focus.slug, entry);
    }
  }
  return [...counts.values()]
    .sort(
      (a, b) =>
        b.count - a.count || compareText(a.focus.name, b.focus.name) || compareText(a.focus.slug, b.focus.slug),
    )
    .map((entry) => entry.focus);
}

/** Los huecos de la sesión, en su orden. */
function slotsFor(minutes: number, primary: ProposalFocus | null, secondary: ProposalFocus | null): Slot[] {
  const twoMain = minutes >= TWO_MAIN_FROM_MINUTES;
  const mainPhase = primary?.name ?? null;
  const slots: Slot[] = [
    { kind: "warmup", phase: WARMUP_PHASE, focus: null },
    { kind: "main", phase: mainPhase, focus: primary },
  ];
  if (twoMain) slots.push({ kind: "main2", phase: mainPhase, focus: primary });
  slots.push(
    { kind: "secondary", phase: (secondary ?? primary)?.name ?? null, focus: secondary ?? primary },
    { kind: "game", phase: GAME_PHASE, focus: null },
  );
  return slots;
}

/** Cómo ordena cada hueco a sus candidatos: el más corto, el que más jugadores admite o por título. */
function comparatorFor(kind: SlotKind): (a: ProposalDrill, b: ProposalDrill) => number {
  if (kind === "warmup") return (a, b) => a.minMinutes - b.minMinutes || byTitle(a, b);
  if (kind === "game") return (a, b) => b.maxPlayers - a.maxPlayers || byTitle(a, b);
  return byTitle;
}

/**
 * El ejercicio de un hueco, relajando por este orden: se admite lo usado hace poco, se deja de
 * mirar el número de jugadores y, por último, vale cualquier objetivo. `null` si ni así.
 */
function pick(
  slot: Slot,
  pool: readonly ProposalDrill[],
  players: number | null,
  recent: ReadonlySet<string>,
): ProposalDrill | null {
  const onFocus = (drill: ProposalDrill) => slot.focus === null || hasFocus(drill, slot.focus);
  const fits = (drill: ProposalDrill) =>
    players === null || (drill.minPlayers <= players && players <= drill.maxPlayers);
  const fresh = (drill: ProposalDrill) => !recent.has(drill.id);

  const ladder: Array<(drill: ProposalDrill) => boolean> = [
    (drill) => onFocus(drill) && fits(drill) && fresh(drill),
    (drill) => onFocus(drill) && fits(drill),
    onFocus,
    () => true,
  ];
  const compare = comparatorFor(slot.kind);

  for (const accepts of ladder) {
    const [best] = pool.filter(accepts).sort(compare);
    if (best) return best;
  }
  return null;
}

/** El rango de minutos de un ejercicio en pasos de cinco. Nunca vacío: `low` manda. */
function bounds(drill: ProposalDrill): { low: number; high: number } {
  const low = Math.max(MINUTES_STEP, Math.ceil(drill.minMinutes / MINUTES_STEP) * MINUTES_STEP);
  const high = Math.floor(Math.min(drill.maxMinutes, MAX_MINUTES) / MINUTES_STEP) * MINUTES_STEP;
  return { low, high: Math.max(low, high) };
}

/**
 * Los minutos de cada hueco: su parte de la franja, de cinco en cinco y dentro del rango de su
 * ejercicio; lo que falta se da por turnos del principal hacia fuera y lo que sobra se quita al
 * revés, mientras alguno admita.
 */
function allocate(slots: readonly Filled[], minutes: number): Map<SlotKind, number> {
  const shares = slots.reduce((sum, slot) => sum + shareOf(slot.kind, slots), 0);
  const allocated = new Map<SlotKind, number>();
  const range = new Map(slots.map((slot) => [slot.kind, bounds(slot.drill)]));

  for (const slot of slots) {
    const { low, high } = range.get(slot.kind) ?? { low: MINUTES_STEP, high: MINUTES_STEP };
    const share =
      Math.round((minutes * shareOf(slot.kind, slots)) / shares / MINUTES_STEP) * MINUTES_STEP;
    allocated.set(slot.kind, Math.min(high, Math.max(low, share)));
  }

  const total = () => [...allocated.values()].reduce((sum, value) => sum + value, 0);
  const present = (order: readonly SlotKind[]) => order.filter((kind) => allocated.has(kind));

  /** Una vuelta dando (o quitando) cinco minutos a quien admita. Dice si alguien admitió. */
  function turn(order: readonly SlotKind[], step: number): boolean {
    let moved = false;
    for (const kind of present(order)) {
      const left = minutes - total();
      if (step > 0 ? left < MINUTES_STEP : left >= 0) break;

      const current = allocated.get(kind) ?? 0;
      const { low, high } = range.get(kind) ?? { low: current, high: current };
      if (current + step < low || current + step > high) continue;
      allocated.set(kind, current + step);
      moved = true;
    }
    return moved;
  }

  while (minutes - total() >= MINUTES_STEP && turn(GROW_ORDER, MINUTES_STEP));
  while (total() > minutes && turn([...GROW_ORDER].reverse(), -MINUTES_STEP));

  return allocated;
}

/**
 * La propuesta de una sesión: activación, el objetivo principal, el secundario y competición,
 * con ejercicios de la biblioteca que valen para el equipo y los minutos de la franja repartidos.
 * Lo que no vale por edad no entra nunca; un hueco sin candidato se queda sin cubrir.
 *
 * Los ejercicios tienen su rango de minutos, y los de los huecos no siempre llenan la franja:
 * mientras quede tiempo para otro, se añade uno más del principal y uno del secundario, por
 * turnos, hasta ocho ejercicios. Lo que ni así se cubre se dice en `uncoveredMinutes`.
 */
export function buildProposal(input: ProposalInput): Proposal {
  const { minutes, age, players } = input;
  const valid = input.drills.filter(
    (drill) => age === null || (drill.minAge <= age && (drill.maxAge === null || age <= drill.maxAge)),
  );

  const ranked = input.primaryFocus === null ? rankFocus(valid) : [];
  const primary = input.primaryFocus ?? ranked[0] ?? null;
  const secondary = input.secondaryFocus ?? (input.primaryFocus === null ? (ranked[1] ?? null) : null);

  const slots = slotsFor(minutes, primary, secondary);
  const recent = new Set(input.recentDrillIds);
  const used = new Set<string>();
  const filled: Filled[] = [];

  for (const kind of PICK_ORDER) {
    const slot = slots.find((candidate) => candidate.kind === kind);
    if (!slot) continue;

    const drill = pick(
      slot,
      valid.filter((candidate) => !used.has(candidate.id)),
      players,
      recent,
    );
    if (!drill) continue;
    used.add(drill.id);
    filled.push({ ...slot, drill });
  }

  // Si ni con los mínimos caben todos, se quitan huecos hasta que quepan (o quede uno).
  let kept = filled;
  let allocated = allocate(kept, minutes);
  const over = () => [...allocated.values()].reduce((sum, value) => sum + value, 0) > minutes;
  for (const kind of DROP_ORDER) {
    if (!over() || kept.length <= 1) break;
    if (!kept.some((slot) => slot.kind === kind)) continue;
    kept = kept.filter((slot) => slot.kind !== kind);
    allocated = allocate(kept, minutes);
  }

  // Lo que los huecos no llenan: más ejercicios, del principal y del secundario por turnos.
  const extras: Extra[] = [];
  let left = minutes - [...allocated.values()].reduce((sum, value) => sum + value, 0);
  while (kept.length > 0 && kept.length + extras.length < MAX_PROPOSED_ITEMS && left >= MINUTES_STEP) {
    const after = extras.length % 2 === 0 ? "main" : "secondary";
    const focus = after === "main" ? primary : (secondary ?? primary);
    const drill = pick(
      { kind: "main", phase: focus?.name ?? null, focus },
      valid.filter((candidate) => !used.has(candidate.id) && bounds(candidate).low <= left),
      players,
      recent,
    );
    if (!drill) break;

    const { high } = bounds(drill);
    const given = Math.min(high, Math.floor(left / MINUTES_STEP) * MINUTES_STEP);
    used.add(drill.id);
    extras.push({ after, phase: focus?.name ?? null, drill, minutes: given });
    left -= given;
  }

  const toItem = (drill: ProposalDrill, phase: string | null, given: number): ProposedItem => ({
    drillId: drill.id,
    title: drill.title,
    phase,
    minutes: given,
    hint: proposalHint(drill),
  });
  /** Tras qué hueco van los extras: el último del principal, o el del secundario. */
  const anchorOf = (after: Extra["after"]): SlotKind | null => {
    const order: SlotKind[] = after === "main" ? ["main2", "main"] : ["secondary", "main2", "main"];
    return order.find((kind) => kept.some((slot) => slot.kind === kind)) ?? kept.at(-1)?.kind ?? null;
  };

  const items = SESSION_ORDER.flatMap((kind) => {
    const slot = kept.find((candidate) => candidate.kind === kind);
    if (!slot) return [];
    return [
      toItem(slot.drill, slot.phase, allocated.get(kind) ?? bounds(slot.drill).low),
      ...extras
        .filter((extra) => anchorOf(extra.after) === kind)
        .map((extra) => toItem(extra.drill, extra.phase, extra.minutes)),
    ];
  });

  const covered = items.reduce((sum, item) => sum + item.minutes, 0);
  return { items, uncoveredMinutes: Math.max(0, minutes - covered) };
}
