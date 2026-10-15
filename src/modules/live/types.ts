import type { Board } from "@/modules/board/types";

export type LiveItem = {
  id: string;
  title: string;
  phase: string | null;
  minutes: number;
  /** La pizarra del ejercicio, si la tiene: viaja con la sesión y se ve sin conexión. */
  board?: Board;
  /** Cómo se organiza el ejercicio (`setup_md`), si lo dice. */
  setup?: string;
  diagramUrl: string | null;
  /** El enlace al vídeo del ejercicio (YouTube o Vimeo), si lo tiene. */
  videoUrl: string | null;
  keyPoints: string[];
  standards: { number: number; title: string }[];
  /** Lo que el servidor tiene registrado de este ejercicio; `null` si aún nada. */
  completed: boolean | null;
  actualMinutes: number | null;
};

/**
 * Lo que el servidor sabe del directo: cuándo se inició, por qué ejercicio va (desde 0) y la
 * copia de la sesión de la que sale ese dato (`practice_plans.updated_at`, tal cual, en texto).
 */
export type ServerLive = { startedAt: string | null; position: number | null; updatedAt: string };

export type LiveSession = {
  eventId: string;
  clubSlug: string;
  title: string;
  startsAt: string;
  items: LiveItem[];
  live: ServerLive;
};

export type ItemProgress = {
  completed: boolean;
  actualMs: number;
};

export type LiveState = {
  version: 2;
  eventId: string;
  index: number;
  startedAt: number | null;
  itemStartedAt: number | null;
  pausedAt: number | null;
  pausedMs: number;
  progress: Record<string, ItemProgress>;
  finishedAt: number | null;
};

/**
 * Lo que guarda el dispositivo: el estado, si lo último ya llegó al servidor y la copia de la
 * sesión que devolvió el último envío que salió bien (`null` si aún ninguno).
 */
export type StoredLive = { state: LiveState; synced: boolean; serverUpdatedAt: string | null };

export type LiveAction =
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "next" }
  | { type: "previous" }
  | { type: "finish" };
