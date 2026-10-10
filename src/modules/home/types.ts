// Contrato de datos de Inicio. Las fases siguientes importan estos tipos: no cambies
// nombres, campos ni orden sin tocar el contrato entre fases.

import type { LiveProgress } from "@/modules/live/label";

/** El próximo entrenamiento. `live` es lo que el servidor sabe de su directo: si ya se inició y por qué ejercicio va. */
export type HomePractice = { eventId: string; teamName: string; slotLabel: string; title: string; totalMinutes: number; drillCount: number; focus: string[]; location: string | null; live: LiveProgress };
export type HomeGame = { eventId: string; teamName: string; slotLabel: string; opponent: string; competition: string | null };
export type WeekItem = { eventId: string; kind: 'practice' | 'game'; dow: string; day: string; title: string; subtitle: string; time: string };
export type HomeData = { greeting: string; firstName: string; kicker: string | null; nextPractice: HomePractice | null; nextGame: HomeGame | null; week: WeekItem[]; hasTeams: boolean };
export type HomeEvent = { id: string; teamId: string; kind: 'practice' | 'game'; status: 'scheduled' | 'done' | 'cancelled'; startsAt: string; endsAt: string; location: string | null; plan: { title: string; focus: string[]; itemMinutes: number[]; live: LiveProgress } | null; game: { opponent: string; competition: string | null; homeAway: 'home' | 'away' | null } | null };
export type HomeInput = { firstName: string; teams: Array<{ id: string; name: string; seasonName: string }>; events: HomeEvent[] };
