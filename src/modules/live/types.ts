export type LiveItem = {
  id: string;
  title: string;
  phase: string | null;
  minutes: number;
  diagramUrl: string | null;
  keyPoints: string[];
  standards: { number: number; title: string }[];
};

export type LiveSession = {
  eventId: string;
  clubSlug: string;
  title: string;
  startsAt: string;
  items: LiveItem[];
};

export type ItemProgress = {
  completed: boolean;
  actualMs: number;
};

export type LiveState = {
  version: 1;
  eventId: string;
  index: number;
  startedAt: number | null;
  itemStartedAt: number | null;
  pausedAt: number | null;
  pausedMs: number;
  progress: Record<string, ItemProgress>;
  finishedAt: number | null;
};

export type LiveAction =
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "next" }
  | { type: "previous" }
  | { type: "finish" };
