// Contrato de datos de la biblioteca de ejercicios. Las fases siguientes importan estos tipos:
// no cambies nombres, campos ni orden sin tocar el contrato entre fases.

import type { Standard } from "@/modules/methodology/types";

/**
 * Un ejercicio nace en `draft`. Publicarlo es cosa del admin; el archivado lo saca de la
 * búsqueda, pero su ficha y su enlace en las sesiones siguen visibles.
 */
export type DrillStatus = "draft" | "published" | "archived";

/** Un objetivo de trabajo del club (rebote, tiro…), con el que se etiquetan y filtran los ejercicios. */
export type FocusArea = { id: string; slug: string; name: string };

/**
 * Lo que enseñan las listas: tarjeta, resultado de búsqueda, fila de una sesión. Los rangos
 * son los de la base de datos: `maxAge` a `null` deja la edad máxima abierta («U12+»).
 * `createdBy` es el usuario que lo escribió, o `null` si no consta (el seed).
 */
export type DrillSummary = {
  id: string;
  title: string;
  status: DrillStatus;
  createdBy: string | null;
  minAge: number;
  maxAge: number | null;
  minPlayers: number;
  maxPlayers: number;
  minMinutes: number;
  maxMinutes: number;
  focus: Array<{ slug: string; name: string }>;
};

/**
 * La ficha completa de un ejercicio. `diagramUrl` es una URL firmada de corta vida, no la
 * ruta del objeto. `principlesSectionSlug` es el slug de la sección publicada de The Way que
 * lista los principios (para enlazarlos), o `null` si no hay. `principles` y `standards` solo
 * traen lo publicado. `createdByMe` lo resuelve la consulta con el usuario de la sesión.
 * `updatedAt` es el texto tal cual lo devuelve PostgREST (con microsegundos): sirve de
 * `expectedUpdatedAt` al guardar y no debe pasar nunca por `Date`.
 */
export type DrillDetail = DrillSummary & {
  summary: string | null;
  objective: string | null;
  setupMd: string | null;
  equipment: string[];
  videoUrl: string | null;
  diagramMediaId: string | null;
  diagramUrl: string | null;
  coachingPoints: Array<{ text: string; isKey: boolean }>;
  variants: Array<{ title: string; description: string | null }>;
  focusAreaIds: string[];
  principles: Array<{ id: string; slug: string; title: string }>;
  principlesSectionSlug: string | null;
  standards: Standard[];
  createdByMe: boolean;
  updatedAt: string;
};

/**
 * Los filtros de la biblioteca, tal como viajan en la URL. Todos son opcionales y ninguno
 * vale `undefined` a propósito: si está, tiene valor (lo garantiza `parseDrillFilters`).
 */
export type DrillFilters = {
  q?: string;
  focus?: string;
  principle?: string;
  age?: number;
  players?: number;
  minutes?: number;
};
