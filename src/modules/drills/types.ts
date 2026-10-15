// Contrato de datos de la biblioteca de ejercicios. Las fases siguientes importan estos tipos:
// no cambies nombres, campos ni orden sin tocar el contrato entre fases.

import type { Board } from "@/modules/board/types";
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
 * `createdBy` es el usuario que lo escribió, o `null` si no consta (el seed). `board` es su
 * pizarra, ya validada; falta si el ejercicio no tiene (o si la que tiene no cumple la forma).
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
  board?: Board;
};

/**
 * Lo que devuelve la búsqueda: como mucho `SEARCH_LIMIT` ejercicios, por título, y si hay más
 * que no se traen. Sin `hasMore` no se sabe distinguir «justo 100» de «los primeros 100 de
 * más».
 */
export type DrillSearchResult = { drills: DrillSummary[]; hasMore: boolean };

/**
 * La ficha completa de un ejercicio. `diagramUrl` es una URL firmada de corta vida, no la
 * ruta del objeto. `principlesSectionSlug` es el slug de la sección publicada de The Way que
 * lista los principios (para enlazarlos), o `null` si no hay. `createdByMe` lo resuelve la
 * consulta con el usuario de la sesión. `updatedAt` es el texto tal cual lo devuelve PostgREST
 * (con microsegundos): sirve de `expectedUpdatedAt` al guardar y no debe pasar nunca por
 * `Date`.
 *
 * Principios y Standards vienen en dos pares con usos distintos:
 * - `principles` y `standards` son para MOSTRAR: solo lo publicado, con su texto. Pasar un
 *   Standard o un principio a borrador («archivarlo») lo saca de la ficha, y puede volver a
 *   publicarse.
 * - `principleIds` y `standardIds` son para GUARDAR: TODOS los vínculos del ejercicio, se vea
 *   o no el elemento. Un formulario de edición parte de ellos, no de lo que muestra la ficha;
 *   si no, al guardar desvincularía en silencio lo que está en borrador. Igual que
 *   `focusAreaIds`, sin orden con significado.
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
  principleIds: string[];
  standardIds: string[];
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
