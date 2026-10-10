// Contrato de datos del constructor de entrenamientos. Las queries, las Server Actions y la
// interfaz importan estos tipos: no cambies nombres, campos ni orden sin tocar el contrato
// entre tareas.

import type { LiveProgress } from "@/modules/live/label";
import type { Standard } from "@/modules/methodology/types";

/** El estado de un entrenamiento (`events.status`). */
export type PracticeStatus = 'scheduled' | 'done' | 'cancelled';
/** Un equipo a elegir al crear un entrenamiento. */
export type TeamOption = { id: string; name: string };
/** Un objetivo (foco) a elegir. */
export type FocusOption = { id: string; name: string };
/** Un ítem como lo edita el constructor: sin `id` hasta que se guarda. `drillId` null es un título libre. */
export type PracticeItemDraft = { id?: string; drillId: string | null; title: string; phase: string | null; minutes: number; notes: string | null };
/** Un ítem ya guardado: lleva `id`. */
export type SavedPracticeItem = PracticeItemDraft & { id: string };
/** Una fila de la lista de entrenamientos. `dow`, `day`, `month` y `time` llegan ya en la zona del club; `location` es el lugar tal cual se guardó, para los metadatos de la fila. */
export type PracticeListItem = { eventId: string; teamName: string; dow: string; day: string; month: string; time: string; title: string; totalMinutes: number; itemCount: number; status: PracticeStatus; location: string | null };
/** Un ítem del detalle: `drillVisible` dice si su ejercicio se pudo leer (RLS esconde el borrador de otro entrenador), y solo entonces la fila enlaza a su ficha. `completed` y `actualMinutes` son lo que el directo registró de él; `null` si nada. */
export type PracticeDetailItem = SavedPracticeItem & { drillVisible: boolean; completed: boolean | null; actualMinutes: number | null };
/** Un entrenamiento entero para el constructor. `updatedAt` es la versión con la que se guarda; `canEdit` lo decide la sesión del usuario. `live` es lo que el servidor sabe del directo y `actualMinutes`, lo que duró de verdad una sesión ya hecha. */
export type PracticeDetail = { eventId: string; planId: string; teamId: string; teamName: string; status: PracticeStatus; startsAt: string; endsAt: string; slotLabel: string; location: string | null; title: string; primaryFocus: FocusOption | null; secondaryFocus: FocusOption | null; notes: string | null; items: PracticeDetailItem[]; standards: Standard[]; updatedAt: string; canEdit: boolean; live: LiveProgress; actualMinutes: number | null };
/** Ítems consecutivos de la misma fase. `startIndex` es la posición del primero en la lista completa. */
export type PhaseBlock<T> = { phase: string | null; startIndex: number; items: T[]; minutes: number };
/** Una plantilla de sesión de quien la guarda: lo que dura, cuántos ejercicios tiene y sus objetivos. No tiene equipo ni fecha. */
export type PracticeTemplate = { id: string; title: string; totalMinutes: number; itemCount: number; primaryFocus: FocusOption | null; secondaryFocus: FocusOption | null };
/** La hora, la duración y el lugar con los que se propone una sesión nueva de un equipo: los de su última sesión. */
export type TeamDefaults = { time: string; durationMinutes: number; location: string | null };
