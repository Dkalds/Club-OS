import { formatDate, formatEventSlot } from "@/lib/time";

// El registro de cambios de un evento (`event_changes`): qué cambió, qué había antes y cuándo.
// Lo escribe la base cada vez que un entrenamiento o un partido programado cambia de hora, de
// lugar o se cancela. Aquí, sin base de datos: los tipos y cómo se dice cada cambio. Todas las
// horas salen en la zona que se pasa, que es la del club.

export type ChangeWhat = "time" | "location" | "cancelled";

export type EventKind = "practice" | "game";

/** Un cambio de un evento: lo que había antes (lo de después está en el propio evento). */
export type EventChange = {
  id: string;
  what: ChangeWhat;
  oldStartsAt: string;
  oldEndsAt: string;
  oldLocation: string | null;
  changedAt: string;
};

/** Un cambio dicho para la ficha del evento. */
export type ChangeLine = {
  id: string;
  /** Qué ha pasado: «Cambio de hora». */
  title: string;
  /** Lo que había antes: «Antes: Martes 6 oct · 18:00–19:15». */
  detail: string;
  /** Cuándo se cambió: «Lunes 5 oct». */
  when: string;
};

/** Un evento que ha cambiado hace poco, para el aviso de Inicio y de la Agenda. */
export type RecentChange = {
  eventId: string;
  href: string;
  /** «Cambio de hora», «Cambio de hora y de lugar», «Cancelada». */
  label: string;
  /** El título de la sesión, o «vs Rival». */
  title: string;
  /**
   * Cuándo es ahora, de qué equipo (si se ven varios) y qué es: «Martes 13 oct · 19:00–20:15 ·
   * Equipo A · Entrenamiento». El día y la hora van delante: la fila trunca el final, y son lo
   * que el aviso existe para decir.
   */
  subtitle: string;
  cancelled: boolean;
};

/** Un evento que ha cambiado hace poco, tal como está ahora, y qué le ha pasado. */
export type RecentEvent = {
  id: string;
  kind: EventKind;
  startsAt: string;
  endsAt: string;
  teamName: string;
  /** El título de su plan (una sesión) o el rival (un partido). */
  name: string;
  whats: readonly ChangeWhat[];
};

const CANCELLED_TITLE: Record<EventKind, string> = {
  practice: "Sesión cancelada",
  game: "Partido cancelado",
};

const CANCELLED_LABEL: Record<EventKind, string> = {
  practice: "Cancelada",
  game: "Cancelado",
};

/** Un cambio, dicho con lo que había antes y el día en que se cambió. */
export function changeLine(change: EventChange, kind: EventKind, tz: string): ChangeLine {
  const before = formatEventSlot(change.oldStartsAt, change.oldEndsAt, tz);
  const base = { id: change.id, when: formatDate(change.changedAt, tz) };

  switch (change.what) {
    case "time":
      return { ...base, title: "Cambio de hora", detail: `Antes: ${before}` };
    case "location":
      return {
        ...base,
        title: "Cambio de lugar",
        detail: change.oldLocation ? `Antes: ${change.oldLocation}` : "Antes no tenía lugar",
      };
    case "cancelled":
      return { ...base, title: CANCELLED_TITLE[kind], detail: `Era: ${before}` };
    default: {
      const unknown: never = change.what;
      return unknown;
    }
  }
}

/** Lo que le ha pasado a un evento, en una etiqueta. La cancelación manda sobre lo demás. */
export function recentLabel(whats: ReadonlySet<ChangeWhat>, kind: EventKind): string {
  if (whats.has("cancelled")) return CANCELLED_LABEL[kind];
  if (whats.has("time") && whats.has("location")) return "Cambio de hora y de lugar";
  return whats.has("time") ? "Cambio de hora" : "Cambio de lugar";
}

/**
 * Los eventos que han cambiado hace poco, dichos para el aviso: uno por evento aunque haya
 * cambiado varias veces, en el orden en que llegan (quien los lee los pide del que antes se juega
 * al que más tarde: lo primero que hay que saber es lo de mañana). `more` es cuántos quedan fuera
 * de los que se enseñan, de los `total` que hay.
 *
 * `showTeam`: si quien mira ve varios equipos, cada línea dice de cuál es.
 */
export function buildRecentChanges(
  events: readonly RecentEvent[],
  { clubSlug, tz, total, showTeam }: { clubSlug: string; tz: string; total: number; showTeam: boolean },
): { items: RecentChange[]; more: number } {
  const items = events.map((event) => {
    const whats = new Set(event.whats);
    const title = event.kind === "game" ? `vs ${event.name}` : event.name;
    const slot = formatEventSlot(event.startsAt, event.endsAt, tz);

    return {
      eventId: event.id,
      href: `/c/${clubSlug}/${event.kind === "game" ? "games" : "train"}/${event.id}`,
      label: recentLabel(whats, event.kind),
      title,
      subtitle: [slot, showTeam ? event.teamName : null, title].filter(Boolean).join(" · "),
      cancelled: whats.has("cancelled"),
    };
  });

  return { items, more: Math.max(0, total - items.length) };
}
