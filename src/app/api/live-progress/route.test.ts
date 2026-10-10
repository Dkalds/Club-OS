import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { NextRequest } from "next/server";
import { POST } from "./route";

const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const ITEM = "00000000-0000-4000-8000-0000000000b1";
const HOST = "http://localhost:3000";
const SLUG = "club-a";

const VALID_BODY = {
  clubSlug: SLUG,
  eventId: EVENT,
  items: [{ id: ITEM, completed: true, actualMinutes: 10 }],
  finished: false,
};

type Reply = { data: unknown; error: unknown };

class FakeQuery implements PromiseLike<Reply> {
  private _calls: Array<{ method: string; args: unknown[] }> = [];
  constructor(readonly table: string, private readonly reply: Reply) {}
  private track(method: string, args: unknown[]): this {
    this._calls.push({ method, args });
    return this;
  }
  select = (...args: unknown[]) => this.track("select", args);
  eq = (...args: unknown[]) => this.track("eq", args);
  maybeSingle = (...args: unknown[]) => this.track("maybeSingle", args);
  then<A, B>(
    ok?: ((v: Reply) => A | PromiseLike<A>) | null,
    fail?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.reply).then(ok, fail);
  }
}

class FakeDb {
  readonly queries: FakeQuery[] = [];
  readonly rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
  auth: { getUser: ReturnType<typeof vi.fn> };
  constructor(
    private readonly replies: Reply[],
    user: { id: string } | null,
  ) {
    this.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    };
  }
  private next(): Reply {
    const r = this.replies.shift();
    if (!r) throw new Error("respuesta de DB sin preparar");
    return r;
  }
  from(table: string): FakeQuery {
    const q = new FakeQuery(table, this.next());
    this.queries.push(q);
    return q;
  }
  rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
    this.rpcs.push({ name, args });
    return Promise.resolve(this.next());
  }
}

function useDb(user: { id: string } | null, ...replies: Reply[]): FakeDb {
  const db = new FakeDb(replies, user);
  mocks.createClient.mockResolvedValue(db);
  return db;
}

const ok = (data: unknown): Reply => ({ data, error: null });
const err = (code: string, message: string): Reply => ({ data: null, error: { code, message } });

const USER = { id: "00000000-0000-4000-8000-0000000000u1" };
const ownEvent = ok({ id: EVENT, organizations: { slug: SLUG } });
const noEvent = ok(null);
const progressOk = ok({ applied: 1, updated_at: "2026-11-17T10:00:00.000000+00:00" });

function req(body: unknown, origin = HOST): NextRequest {
  return new NextRequest(`${HOST}/api/live-progress`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.clearAllMocks());

it("cuerpo inválido → 422", async () => {
  const db = useDb(USER);
  const res = await POST(req({ clubSlug: SLUG, eventId: "no-es-uuid", items: [], finished: false }));
  expect(res.status).toBe(422);
  expect(db.queries).toHaveLength(0);
  expect(db.rpcs).toHaveLength(0);
});

it("sin sesión → 401", async () => {
  useDb(null);
  const res = await POST(req(VALID_BODY));
  expect(res.status).toBe(401);
});

it("Origin ajeno → 403", async () => {
  mocks.createClient.mockResolvedValue({
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  });
  const res = await POST(req(VALID_BODY, "https://evil.example.com"));
  expect(res.status).toBe(403);
  expect(mocks.createClient).not.toHaveBeenCalled();
});

it("entreno de otro club → 404 sin llamar al RPC", async () => {
  const db = useDb(USER, noEvent);
  const res = await POST(req(VALID_BODY));
  expect(res.status).toBe(404);
  expect(db.rpcs).toHaveLength(0);
});

it("SESSION_CLOSED → 409", async () => {
  useDb(USER, ownEvent, err("P0001", "SESSION_CLOSED"));
  const res = await POST(req(VALID_BODY));
  expect(res.status).toBe(409);
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("OK → 200 y revalidatePath", async () => {
  const db = useDb(USER, ownEvent, progressOk);
  const res = await POST(req(VALID_BODY));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data).toMatchObject({ applied: 1 });
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/c/[club]/(app)", "layout");
  expect(db.rpcs[0].name).toBe("record_live_progress");
});

it("pasa el inicio y la posición a la función cuando llegan", async () => {
  const db = useDb(USER, ownEvent, progressOk);
  const res = await POST(req({ ...VALID_BODY, startedAt: "2026-11-17T17:02:00.000Z", position: 2 }));
  expect(res.status).toBe(200);
  expect(db.rpcs[0].args).toMatchObject({
    p_started_at: "2026-11-17T17:02:00.000Z",
    p_position: 2,
  });
});

it("sin inicio ni posición no manda esas claves (ni nulas)", async () => {
  const db = useDb(USER, ownEvent, progressOk);
  await POST(req(VALID_BODY));
  expect(db.rpcs[0].args).not.toHaveProperty("p_started_at");
  expect(db.rpcs[0].args).not.toHaveProperty("p_position");
});

it("posición fuera de rango → 422 sin tocar la base", async () => {
  const db = useDb(USER);
  const res = await POST(req({ ...VALID_BODY, position: 30 }));
  expect(res.status).toBe(422);
  expect(db.rpcs).toHaveLength(0);
});
