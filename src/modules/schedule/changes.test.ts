import { describe, expect, it } from "vitest";
import {
  buildRecentChanges,
  changeLine,
  recentLabel,
  type ChangeWhat,
  type EventChange,
  type EventKind,
  type RecentEvent,
} from "./changes";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const TZ = "Europe/Madrid";

/** Un cambio de un evento que era el martes 6 oct de 18:00 a 19:15 en Madrid, hecho el lunes 5. */
function change(what: ChangeWhat, overrides: Partial<EventChange> = {}): EventChange {
  return {
    id: "c-1",
    what,
    oldStartsAt: "2026-10-06T16:00:00+00:00",
    oldEndsAt: "2026-10-06T17:15:00+00:00",
    oldLocation: "Pista 1",
    changedAt: "2026-10-05T09:00:00+00:00",
    ...overrides,
  };
}

describe("changeLine", () => {
  it("un cambio de hora dice la franja que tenía antes", () => {
    expect(changeLine(change("time"), "practice", TZ)).toEqual({
      id: "c-1",
      title: "Cambio de hora",
      detail: "Antes: Martes 6 oct · 18:00–19:15",
      when: "Lunes 5 oct",
    });
  });

  it("un cambio de lugar dice el lugar que tenía antes, no la hora", () => {
    expect(changeLine(change("location"), "practice", TZ)).toEqual({
      id: "c-1",
      title: "Cambio de lugar",
      detail: "Antes: Pista 1",
      when: "Lunes 5 oct",
    });
  });

  it("un cambio de lugar de algo que no tenía lugar lo dice así", () => {
    expect(changeLine(change("location", { oldLocation: null }), "practice", TZ).detail).toBe("Antes no tenía lugar");
    expect(changeLine(change("location", { oldLocation: "" }), "practice", TZ).detail).toBe("Antes no tenía lugar");
  });

  it("una sesión cancelada dice cuándo era", () => {
    expect(changeLine(change("cancelled"), "practice", TZ)).toEqual({
      id: "c-1",
      title: "Sesión cancelada",
      detail: "Era: Martes 6 oct · 18:00–19:15",
      when: "Lunes 5 oct",
    });
  });

  it("un partido cancelado se dice en masculino", () => {
    expect(changeLine(change("cancelled"), "game", TZ)).toMatchObject({
      title: "Partido cancelado",
      detail: "Era: Martes 6 oct · 18:00–19:15",
    });
  });

  it.each(["time", "location"] as const)("un cambio de %s se dice igual de una sesión que de un partido", (what) => {
    expect(changeLine(change(what), "game", TZ)).toEqual(changeLine(change(what), "practice", TZ));
  });

  it("lleva el id del cambio, que es la clave de su línea", () => {
    expect(changeLine(change("time", { id: "c-9" }), "practice", TZ).id).toBe("c-9");
  });

  it("la franja usa la raya corta y el punto medio", () => {
    const { detail } = changeLine(change("time"), "practice", TZ);

    expect(detail).toContain("18:00–19:15");
    expect(detail).toContain(" · ");
  });

  describe("en la zona del club", () => {
    // Las 22:30 UTC del lunes 5 son las 00:30 del martes 6 en Madrid (CEST).
    const LATE = "2026-10-05T22:30:00+00:00";

    it("el día del cambio es el del reloj del club, no el de UTC", () => {
      expect(changeLine(change("time", { changedAt: LATE }), "practice", TZ).when).toBe("Martes 6 oct");
      expect(changeLine(change("time", { changedAt: LATE }), "practice", "UTC").when).toBe("Lunes 5 oct");
    });

    it("lo que había antes también: cerca de medianoche UTC cambia de día y de hora", () => {
      const moved = change("time", { oldStartsAt: "2026-10-06T22:30:00+00:00", oldEndsAt: "2026-10-06T23:45:00+00:00" });

      expect(changeLine(moved, "practice", TZ).detail).toBe("Antes: Miércoles 7 oct · 00:30–01:45");
      expect(changeLine(moved, "practice", "UTC").detail).toBe("Antes: Martes 6 oct · 22:30–23:45");
    });

    it("la cancelación, igual", () => {
      const cancelled = change("cancelled", {
        oldStartsAt: "2026-10-06T22:30:00+00:00",
        oldEndsAt: "2026-10-06T23:45:00+00:00",
        changedAt: LATE,
      });

      expect(changeLine(cancelled, "game", TZ)).toMatchObject({
        detail: "Era: Miércoles 7 oct · 00:30–01:45",
        when: "Martes 6 oct",
      });
    });

    it("pasado el cambio de hora, el reloj del club va una hora por delante de UTC, no dos", () => {
      const winter = change("time", { oldStartsAt: "2026-11-03T17:00:00+00:00", oldEndsAt: "2026-11-03T18:15:00+00:00" });

      expect(changeLine(winter, "practice", TZ).detail).toBe("Antes: Martes 3 nov · 18:00–19:15");
    });

    it("otra zona, otro reloj", () => {
      expect(changeLine(change("time"), "practice", "Atlantic/Canary").detail).toBe("Antes: Martes 6 oct · 17:00–18:15");
    });
  });
});

describe("recentLabel", () => {
  const label = (whats: ChangeWhat[], kind: EventKind = "practice") => recentLabel(new Set(whats), kind);

  it("solo de hora o solo de lugar, lo dice", () => {
    expect(label(["time"])).toBe("Cambio de hora");
    expect(label(["location"])).toBe("Cambio de lugar");
  });

  it("de hora y de lugar, los dos juntos", () => {
    expect(label(["time", "location"])).toBe("Cambio de hora y de lugar");
    expect(label(["location", "time"])).toBe("Cambio de hora y de lugar");
  });

  it("la cancelación manda sobre lo demás", () => {
    expect(label(["cancelled"])).toBe("Cancelada");
    expect(label(["time", "cancelled"])).toBe("Cancelada");
    expect(label(["location", "cancelled"])).toBe("Cancelada");
    expect(label(["time", "location", "cancelled"])).toBe("Cancelada");
  });

  it("una sesión está «Cancelada»; un partido, «Cancelado»", () => {
    expect(label(["cancelled"], "practice")).toBe("Cancelada");
    expect(label(["cancelled"], "game")).toBe("Cancelado");
    expect(label(["time", "cancelled"], "game")).toBe("Cancelado");
  });

  it("los cambios de hora y de lugar se dicen igual de un partido", () => {
    expect(label(["time"], "game")).toBe("Cambio de hora");
    expect(label(["time", "location"], "game")).toBe("Cambio de hora y de lugar");
  });
});

describe("buildRecentChanges", () => {
  const OPTIONS = { clubSlug: "club-a", tz: TZ, total: 0, showTeam: false };

  /** Un evento del martes 13 oct de 19:00 a 20:15 en Madrid que ha cambiado de hora. */
  function event(id: string, overrides: Partial<RecentEvent> = {}): RecentEvent {
    return {
      id,
      kind: "practice",
      startsAt: "2026-10-13T17:00:00+00:00",
      endsAt: "2026-10-13T18:15:00+00:00",
      teamName: "Equipo A",
      name: `Sesión ${id}`,
      whats: ["time"],
      ...overrides,
    };
  }

  it("sin eventos, nada que enseñar", () => {
    expect(buildRecentChanges([], OPTIONS)).toEqual({ items: [], more: 0 });
  });

  it("una sesión que ha cambiado de hora: su enlace, lo que le ha pasado, su título y cuándo es ahora", () => {
    expect(buildRecentChanges([event("e-1")], { ...OPTIONS, total: 1 })).toEqual({
      items: [
        {
          eventId: "e-1",
          href: "/c/club-a/train/e-1",
          label: "Cambio de hora",
          title: "Sesión e-1",
          subtitle: "Martes 13 oct · 19:00–20:15 · Sesión e-1",
          cancelled: false,
        },
      ],
      more: 0,
    });
  });

  it("un partido lleva a su ficha de partido y se titula «vs Rival», también en el subtítulo", () => {
    const { items } = buildRecentChanges([event("g-1", { kind: "game", name: "CB Rival", whats: ["location"] })], OPTIONS);

    expect(items[0]).toMatchObject({
      href: "/c/club-a/games/g-1",
      title: "vs CB Rival",
      label: "Cambio de lugar",
      subtitle: "Martes 13 oct · 19:00–20:15 · vs CB Rival",
    });
  });

  it("el enlace lleva el slug del club que se le pasa", () => {
    const { items } = buildRecentChanges([event("e-1")], { ...OPTIONS, clubSlug: "club-b" });

    expect(items[0]?.href).toBe("/c/club-b/train/e-1");
  });

  describe("lo que le ha pasado a cada evento", () => {
    it("con varios cambios, una sola etiqueta con todo: la hora y el lugar juntos, sin repetir", () => {
      const { items } = buildRecentChanges([event("e-1", { whats: ["time", "location", "time"] })], OPTIONS);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ label: "Cambio de hora y de lugar", cancelled: false });
    });

    it("movido y después cancelado: la cancelación manda, y se marca", () => {
      const { items } = buildRecentChanges([event("e-1", { whats: ["cancelled", "time"] })], OPTIONS);

      expect(items[0]).toMatchObject({ label: "Cancelada", cancelled: true });
    });

    it("un partido cancelado está «Cancelado»", () => {
      const { items } = buildRecentChanges(
        [event("g-1", { kind: "game", name: "CB Rival", whats: ["cancelled"] })],
        OPTIONS,
      );

      expect(items[0]).toMatchObject({ label: "Cancelado", cancelled: true });
    });

    it("los cambios de un evento no se mezclan con los de otro", () => {
      const { items } = buildRecentChanges([event("e-1"), event("e-2", { whats: ["location"] })], OPTIONS);

      expect(items.map((item) => [item.eventId, item.label, item.cancelled])).toEqual([
        ["e-1", "Cambio de hora", false],
        ["e-2", "Cambio de lugar", false],
      ]);
    });
  });

  // Quien los lee ya los pide del que antes se juega al que más tarde, y con su tope.
  it("un elemento por evento, en el orden en que llegan: ni ordena ni corta", () => {
    const later = { startsAt: "2026-10-20T17:00:00+00:00", endsAt: "2026-10-20T18:15:00+00:00" };
    const soon = { startsAt: "2026-10-12T17:00:00+00:00", endsAt: "2026-10-12T18:15:00+00:00" };

    const { items } = buildRecentChanges([event("e-later", later), event("e-mid"), event("e-soon", soon)], OPTIONS);

    expect(items.map((item) => item.eventId)).toEqual(["e-later", "e-mid", "e-soon"]);
  });

  describe("`total` y `more`", () => {
    const events = [event("e-1"), event("e-2"), event("e-3")];

    it("`more` es cuántos quedan fuera de los que se enseñan, de los `total` que hay", () => {
      expect(buildRecentChanges(events, { ...OPTIONS, total: 7 }).more).toBe(4);
      expect(buildRecentChanges(events, { ...OPTIONS, total: 4 }).more).toBe(1);
    });

    it("si se enseñan todos, no queda ninguno fuera", () => {
      const result = buildRecentChanges(events, { ...OPTIONS, total: 3 });

      expect(result.more).toBe(0);
      expect(result.items).toHaveLength(3);
    });

    it("nunca es negativo, aunque el total se quede corto", () => {
      expect(buildRecentChanges(events, { ...OPTIONS, total: 0 }).more).toBe(0);
      expect(buildRecentChanges(events, { ...OPTIONS, total: 2 }).more).toBe(0);
    });

    it("sin eventos que enseñar, `more` es el total", () => {
      expect(buildRecentChanges([], { ...OPTIONS, total: 2 })).toEqual({ items: [], more: 2 });
    });
  });

  describe("el subtítulo", () => {
    it("empieza por el día y la hora: la fila trunca el final, y son lo que el aviso viene a decir", () => {
      const { items } = buildRecentChanges([event("e-1", { name: "Un título de sesión muy largo" })], OPTIONS);

      expect(items[0]?.subtitle).toBe("Martes 13 oct · 19:00–20:15 · Un título de sesión muy largo");
      expect(items[0]?.subtitle.startsWith("Martes 13 oct · 19:00–20:15")).toBe(true);
    });

    it("quien ve varios equipos lee de cuál es cada uno, entre cuándo es y qué es", () => {
      const { items } = buildRecentChanges([event("e-1", { teamName: "Equipo B" })], { ...OPTIONS, showTeam: true });

      expect(items[0]?.subtitle).toBe("Martes 13 oct · 19:00–20:15 · Equipo B · Sesión e-1");
    });

    it("quien ve uno solo no lo necesita", () => {
      const { items } = buildRecentChanges([event("e-1", { teamName: "Equipo B" })], OPTIONS);

      expect(items[0]?.subtitle).toBe("Martes 13 oct · 19:00–20:15 · Sesión e-1");
    });

    it("un equipo sin nombre no deja un separador suelto", () => {
      const { items } = buildRecentChanges([event("e-1", { teamName: "" })], { ...OPTIONS, showTeam: true });

      expect(items[0]?.subtitle).toBe("Martes 13 oct · 19:00–20:15 · Sesión e-1");
    });

    it("de un partido, con el equipo: cuándo es, de quién y contra quién", () => {
      const { items } = buildRecentChanges([event("g-1", { kind: "game", name: "CB Rival" })], {
        ...OPTIONS,
        showTeam: true,
      });

      expect(items[0]?.subtitle).toBe("Martes 13 oct · 19:00–20:15 · Equipo A · vs CB Rival");
    });

    it("cuándo es ahora se dice en la zona del club", () => {
      // Las 22:30 UTC del martes 13 son las 00:30 del miércoles 14 en Madrid.
      const late = event("e-1", { startsAt: "2026-10-13T22:30:00+00:00", endsAt: "2026-10-13T23:45:00+00:00" });

      expect(buildRecentChanges([late], OPTIONS).items[0]?.subtitle).toBe("Miércoles 14 oct · 00:30–01:45 · Sesión e-1");
      expect(buildRecentChanges([late], { ...OPTIONS, tz: "UTC" }).items[0]?.subtitle).toBe(
        "Martes 13 oct · 22:30–23:45 · Sesión e-1",
      );
    });
  });
});
