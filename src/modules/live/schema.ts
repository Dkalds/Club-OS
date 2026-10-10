import { z } from "zod";

const id = z.string().uuid("No encontramos este contenido.");

/** El último índice que admite `practice_plans.live_position`. */
const MAX_POSITION = 29;

const liveItemSchema = z.object({
  id,
  completed: z.boolean(),
  actualMinutes: z.number().int().min(0).max(180).nullable(),
});

export const liveProgressSchema = z.object({
  clubSlug: z.string().min(1),
  eventId: id,
  items: z.array(liveItemSchema),
  finished: z.boolean(),
  actualMinutes: z.number().int().min(0).max(999).optional(),
  /** Cuándo se pulsó «Iniciar», en ISO con zona. El servidor guarda el primero que le llega. */
  startedAt: z.iso.datetime({ offset: true }).optional(),
  /** El índice (desde 0) del ejercicio en curso. */
  position: z.number().int().min(0).max(MAX_POSITION).optional(),
});

export type LiveProgressInput = z.infer<typeof liveProgressSchema>;
