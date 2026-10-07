# CLUB OS · Fase 5 (Live Practice) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado: BORRADOR para revisión del propietario.** La Fase 4 se planificó y se ejecutó sin que el propietario revisara el plan antes (backlog, «Lo que deja la Fase 4»). Este no se ejecuta hasta que el propietario confirme las decisiones de la sección «Decisiones que este plan toma y hay que confirmar». Hasta entonces, la rama `claude/fase-5-493dfb` solo lleva este fichero y la Task 0.

**Goal:** Un entrenador abre la sesión de hoy en la pista, pulsa «Iniciar entrenamiento» y la sigue a pantalla completa, con una mano y con la pantalla siempre encendida: ve el ejercicio en curso, su diagrama y sus tres coaching points clave, una cuenta atrás que sobrevive a bloquear el móvil, y avanza con «Siguiente». Lo que se completó y cuánto duró de verdad se guarda en el dispositivo al momento y llega a la base de datos cuando hay conexión, sin perder nada en un pabellón sin cobertura. Al terminar, la sesión queda hecha y en el histórico.

**Architecture:** La pantalla de Live es un componente de cliente sin `AppShell` (`(live)`, C3) que recibe la sesión ya resuelta desde un Server Component (`getLiveSession`). El estado vive en un reductor puro (`liveReducer`) que trabaja con marcas de tiempo, nunca con intervalos acumulados, y se guarda en `localStorage` a cada cambio. La sincronización es una cola idempotente (`syncLiveProgress`) que envía el estado completo, no deltas, a `POST /api/live-progress`; el Route Handler valida con Zod, acota al club (C25) y llama a `record_live_progress`, una función SQL `security invoker` que escribe ítems, plan y, al terminar, el evento, en ese orden (C24). La PWA (`@serwist/next`) da manifiesto, instalación y la caché que permite reabrir Live sin red.

**Tech Stack:** `@serwist/next`, `serwist` (nuevos) + lo de las Fases 1–4. Wake Lock y Vibration son APIs del navegador, sin dependencia.

**Spec:** `docs/spec/club-os-primera-entrega.md` (decisiones 10 y 12; §3 «Live Practice»; riesgos «Pabellón sin cobertura» y «Live Practice no encaja en la pista real») + `docs/superpowers/plans/2026-10-03-00-contratos-entre-fases.md` («Fase 5 · Live Practice — produce», C3, C12, C13, C22–C28) + bloque «Fase 5» de `docs/superpowers/backlog.md` + `design/components/Timer/README.md`.

**Requiere:** Fases 1–4 fusionadas en `main` (lo están: Dkalds/Club-OS#7).

**Dentro de esta fase:** los pendientes de la Fase 4 asignados a la Fase 5 (ids estables tras guardar, respuesta perdida, política de lectura de planes, aviso de salida al crear, puerta de entrada común, límite silencioso de la lista); `record_live_progress` y `POST /api/live-progress`; módulo `live`; pantalla `/train/[eventId]/live`; «Iniciar entrenamiento»; PWA con manifiesto, caché y página sin conexión; diagramas que no caducan a mitad de entrenamiento. **Fuera:** editar el plan desde Live (se edita en el constructor), notas de la sesión desde Live, cronómetro por bloque de fase, partidos (Fase 6), notificaciones push, vista de cobertura (Fase 7, aunque consumirá lo que esta fase registra), restaurar una sesión cerrada.

## Antes de empezar (no es código)

1. **Prototipo en pista.** La spec («Riesgos») pide probar un prototipo clicable de Live en un entrenamiento real antes de esta fase. Si no se ha hecho, hacerlo con `design/components/Timer/preview.html` en un móvil y apuntar en este plan lo que cambie.
2. **Revisión del propietario** de este plan y de sus decisiones.
3. **Entorno:** Docker en marcha, `pnpm supabase start`, `pnpm seed`. En macOS, la Task 0 primero.

## Global Constraints

Las de la Fase 4 siguen valiendo todas (TypeScript estricto, regla de literales de club en `src/`, tokens, copy, horas en la zona del club, `requireClub` en cada página, 404 opaco). Además:

- Migraciones `20261201000100_practice_save_ids.sql`, `…000200_practice_read_policy.sql`, `…000300_live_progress.sql` (rango F5 del contrato).
- `record_live_progress` y toda función nueva de escritura cumplen C26 (orden `NOT_FOUND` → `SESSION_CLOSED` → `STALE_COPY` → `INVALID`) y C24 (ítems y plan primero, evento al final). Cada `grant` nuevo se apunta en `posture.test.sql` en la misma tarea (C27).
- El cliente no guarda en el dispositivo nada que identifique a un menor: Live no muestra jugadores. En `localStorage` solo van ids opacos, títulos de ejercicio, minutos y marcas de tiempo.
- El temporizador nunca acumula `setInterval`: el tiempo restante se calcula siempre como función pura de `(estado, sesión, ahora)`. El intervalo solo repinta.
- La sincronización envía el estado completo de la sesión (idempotente): repetir un envío, o enviarlo fuera de orden, deja la base igual que el último estado.
- `POST /api/live-progress` es la única escritura que no es una Server Action (C13). Va con la cookie de sesión (`httpOnly`), comprueba el origen (`Origin` igual al host) y responde JSON `{ ok: true }` o `{ ok: false, error: ActionError }` con 200, 401 (sin sesión), 404, 409 (`SESSION_CLOSED`) o 422 (`INVALID`).
- Controles de Live con altura `target-live` (72 px). Un solo `primary` en pantalla (Pausa/Reanudar).
- Tests de unidad en `TZ=UTC` además de en la zona local antes de cerrar (lección del CI de la Fase 4).

## Decisiones que este plan toma y hay que confirmar

Se marcan **[D1]–[D8]** donde se aplican. Si el propietario cambia alguna, se cambia aquí antes de ejecutar.

- **[D1] Quién puede iniciar Live:** quien puede editar la sesión (`practice.manage` y `canEdit`), es decir, el cuerpo técnico del equipo y dirección, mientras el evento esté `scheduled`. No se limita a «hoy»: el botón sale siempre en una sesión programada, pero en una que no es de hoy pide confirmación («Esta sesión es el martes 6 oct. ¿Empezar igualmente?»).
- **[D2] Dos móviles en la misma sesión:** no se bloquea. Cada dispositivo lleva su estado; el último envío gana ítem a ítem (`completed`, `actual_minutes`). El caso normal es un solo móvil por sesión.
- **[D3] El constructor mientras hay Live:** la sesión sigue editable en el constructor mientras no se termine. Cada envío de Live mueve la copia (C22), así que un constructor abierto recibirá `STALE_COPY` al guardar. Live no envía `expectedUpdatedAt`: no falla por una edición del constructor.
- **[D4] Ítems que Live no conoce o que ya no existen:** si el constructor quitó un ítem mientras Live corría, el envío de Live lo ignora (no es `INVALID`) y la respuesta dice cuántos aplicó. Una cola que se bloqueara para siempre por un ítem borrado sería peor que perder su marca.
- **[D5] Saltar y volver:** «Siguiente» marca el ítem actual `completed = true` con sus minutos reales; «Anterior» vuelve al ítem anterior sin desmarcarlo. Un ítem al que nunca se llegó queda `completed = false` y `actual_minutes = null` al terminar. Un ítem de 0 minutos reales (se pasó sin empezar) cuenta como saltado: `completed = false`.
- **[D6] Al llegar a 0:** vibración corta si se puede y aviso «Tiempo» en pantalla; **no** se pasa solo al siguiente. El entrenador decide (el README del Timer dice «paso al siguiente con confirmación»: la confirmación es pulsar «Siguiente»). El cronómetro sigue en negativo («+01:20») para que los minutos reales salgan bien.
- **[D7] Terminar:** «Terminar entrenamiento» pide confirmación, envía el estado con `finished = true`, y deja el evento `done` y el plan `done` con `actual_minutes` = suma de los reales. Un entrenamiento terminado no se reabre (C24 y decisión de la Fase 4).
- **[D8] Diagramas sin conexión:** al abrir Live se piden URLs firmadas que duran lo que queda de sesión más 2 horas (máximo 6 h, mínimo los 10 min de hoy) y el cliente descarga cada imagen a `Cache Storage` (`clubos-live-<eventId>`), indexada por el id del ítem y no por la URL firmada. Sin red y sin la imagen en caché se muestra «Diagrama no disponible sin conexión», nunca «Pista sin diagrama» (backlog). La caché de una sesión se borra al terminarla y, como mucho, a los 7 días.

## Review Focus

1. **Pabellón sin cobertura.** Se abre Live con red, se corta la conexión, se avanza por tres ejercicios, se bloquea el móvil cinco minutos, se recarga la página: todo sigue (estado, cronómetro, diagramas). Al volver la red, la base queda igual que el dispositivo, aunque se reenvíe dos veces. → Tasks 7, 8, 10, 12 (unidad y e2e con `context.setOffline`).
2. **Aislamiento.** Nora (otro equipo) o Marta (otro club) llaman a `record_live_progress` o a `POST /api/live-progress` con el id de una sesión de Alevín A: `NOT_FOUND`/404 opaco, nada escrito. Un ítem de otra sesión en `p_items` no se escribe. → Tasks 5 (pgTAP), 6 (unidad) y 12 (e2e).
3. **Cerrar es lo último y no se deshace.** `finished = true` deja ítems, plan y evento coherentes en una transacción; un segundo envío igual responde OK sin cambiar nada; uno distinto tras cerrar responde `SESSION_CLOSED`; una sesión cancelada no admite progreso. → Task 5.
4. **Los ids no se mueven.** Guardar dos veces seguidas en el constructor tras añadir ejercicios conserva sus ids, y por tanto su `completed` y `actual_minutes`. Una respuesta perdida y reintentada no sale como «Alguien ha cambiado esto». → Tasks 1 y 2.
5. **El cronómetro dice la verdad.** Con el reloj del sistema avanzado (bloqueo, segundo plano), el restante y los minutos reales salen de las marcas de tiempo; pausar y reanudar no pierde ni suma segundos. → Task 7.

---

## Estructura de ficheros

```
scripts/check-guards.sh (+ test)                                       Task 0: grep de macOS
supabase/migrations/20261201000{100_practice_save_ids,200_practice_read_policy,300_live_progress}.sql
supabase/tests/database/{practice_save_ids,practice_read_policy,live_progress,posture}.test.sql
scripts/seed/data.ts, scripts/seed/seed.int.test.ts, e2e/helpers/seed.ts   sesión de hoy para Live
src/lib/action-result.ts                                               sin códigos nuevos (409 = SESSION_CLOSED)
src/modules/practice/actions.ts, queries.ts, schema.ts, types.ts       ids tras guardar, saveId, lista sin corte silencioso
src/modules/live/{types,reducer,timer,storage,sync,queries,schema,diagram-cache}.ts (+ tests)
src/modules/live/use-wake-lock.ts, use-live.ts (+ tests)
src/app/api/live-progress/route.ts (+ test)
src/app/c/[club]/(live)/layout.tsx
src/app/c/[club]/(live)/train/[eventId]/live/{page,loading,error}.tsx, live-screen.tsx (+ tests)
src/app/c/[club]/(app)/train/[eventId]/page.tsx                        «Iniciar entrenamiento»
src/app/c/[club]/(app)/train/_components/practice-builder.tsx, practice-rows.ts, practice-form.tsx
src/app/{manifest.ts, sw.ts, ~offline/page.tsx}, next.config.ts, package.json (build --webpack)
src/ui/{timer,live-controls,court-diagram}.tsx (+ tests)
e2e/live.spec.ts (admin), playwright.config.ts (testMatch)
```

---

### Task 0: `check-guards` en macOS

**Files:** Modify `scripts/check-guards.test.ts` (y `scripts/check-guards.sh` solo si hace falta).

Con el `grep` de macOS (BSD), el caso «falla, y no pasa en silencio, si grep no puede leer src/» recibe los fallos en otro orden y sin la línea del hex: la primera comprobación que no puede leer `src/` corta antes de llegar a la del hex. En Linux (CI) y Windows pasa. Hoy: 3609/3610 en macOS.

- [ ] **Step 1:** Reproducir (`pnpm test scripts/check-guards.test.ts`) y decidir: si el script se comporta igual en las dos plataformas y solo cambia el orden, el test comprueba cada mensaje por separado sin depender del orden; si el script se salta comprobaciones en macOS, se arregla el script (que todas las comprobaciones corran y fallen ruidosamente).
- [ ] **Step 2:** `pnpm test && pnpm check:guards` → PASS en macOS. CI sigue en verde.
- [ ] **Step 3: Commit** `test(guards): el test de grep sin src/ no depende del orden de los fallos`

---

### Task 1: Ids estables tras guardar el constructor (C23)

**Files:**
- Create: `supabase/migrations/20261201000100_practice_save_ids.sql`, `supabase/tests/database/practice_save_ids.test.sql`
- Modify: `src/modules/practice/actions.ts` (+ test), `src/app/c/[club]/(app)/train/_components/practice-builder.tsx`, `practice-rows.ts` (+ tests), `src/lib/database.types.ts`

**Interfaces:**
- Produces: `public.save_practice_items(p_plan uuid, p_expected_updated_at timestamptz, p_items jsonb, p_save_id uuid default null) returns jsonb` → `{ "updated_at": "<texto de timestamptz>", "item_ids": ["<uuid>", …] }`, con `item_ids` en el orden de `p_items`. (Se borra la firma anterior con `drop function` y se vuelven a dar los privilegios; Postgres no cambia el tipo de retorno con `create or replace`.) `p_save_id` es de la Task 2: aquí ya existe y se ignora.
- Produces: `savePracticeItems(clubSlug, input): Promise<ActionResult<{ updatedAt: string; itemIds: string[] }>>`.

Reglas:
- `updated_at` viaja como texto, igual que hoy (C22): `to_jsonb(v_updated_at)` da el mismo texto que PostgREST. Un test lo fija comparando con `select updated_at from practice_plans`.
- El constructor, al recibir `itemIds`, pone a cada ítem su `id` por posición (`withSavedIds(items, itemIds)` en `practice-rows.ts`). Si las longitudes no coinciden, no toca nada y registra el error (no puede pasar; si pasa, el siguiente guardado se comporta como hoy).
- Se quita de C23 la advertencia y se anota en «Cambios propuestos al contrato».

- [ ] **Step 1: Tests que fallan**
  - pgTAP: guardar `[A(sin id), B(sin id)]` devuelve dos ids que son los de las filas; guardar después `[B(id), A(id), C(sin id)]` conserva los ids de A y B y su `completed`/`actual_minutes` (puestos a mano con el rol de servicio en el test); `item_ids` vacío con lista vacía; los errores de la Fase 4 (`NOT_FOUND`, `SESSION_CLOSED`, `STALE_COPY`, `INVALID`) siguen igual con la firma nueva (copiar los casos de `practice_functions.test.sql` que la usan).
  - `practice-rows.test.ts`: `withSavedIds` pone ids por posición; con longitudes distintas devuelve la lista igual.
  - `practice-builder.test.tsx`: añadir un ejercicio, guardar, guardar otra vez → el segundo envío lleva el `id` del ejercicio añadido.
  - `actions.test.ts`: `savePracticeItems` devuelve `itemIds` del RPC.
- [ ] **Step 2:** `pnpm supabase db reset && pnpm test:db && pnpm test src/modules/practice src/app` → FAIL.
- [ ] **Step 3:** Implementar; `pnpm db:types`.
- [ ] **Step 4:** `pnpm test:db && pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `fix(practice): el guardado devuelve los ids de los ítems y el constructor los conserva`

---

### Task 2: Una respuesta perdida no parece la edición de otra persona

**Files:**
- Modify: `supabase/migrations/20261201000100_practice_save_ids.sql` (misma migración que la Task 1: aún no está en `main`), `practice_save_ids.test.sql`, `src/modules/practice/{schema,actions}.ts` (+ tests), `practice-builder.tsx`, `practice-form.tsx` (modo editar)

**Interfaces:**
- `practice_plans.last_save_id uuid` (sin privilegio para `authenticated`: lo escriben las funciones dentro de su `update` del plan, que ya hacen; se concede la columna en el `update` del plan y se apunta en `posture.test.sql`).
- `save_practice_items(…, p_save_id uuid default null)` y `update_practice_session(…, p_save_id uuid default null)`: si `p_expected_updated_at` no coincide **pero** `last_save_id = p_save_id`, el guardado ya se aplicó y la respuesta se perdió: devuelven el estado actual (`updated_at` e `item_ids` actuales) sin escribir. Si no coincide ninguno de los dos, `STALE_COPY` como hoy.
- Inputs: `saveId: string` (uuid) en `savePracticeItemsSchema` y `updatePracticeMetaSchema`. El cliente genera uno por intento de guardado lógico y lo **reutiliza** en el reintento de ese mismo guardado; uno nuevo cuando cambia lo que se guarda.

- [ ] **Step 1: Tests que fallan**
  - pgTAP: guardar con `save_id = S` y copia `U0` → `U1`; repetir exactamente la misma llamada (copia `U0`, `S`) → devuelve `U1` y los mismos ids, sin escribir (`updated_at` no se mueve); con `U0` y otro `S2` → `STALE_COPY`; sin `p_save_id` → `STALE_COPY` (como hoy).
  - Componente: el guardado falla por red (la acción lanza), «Reintentar» envía el mismo `saveId`; tras un cambio en la lista, el siguiente guardado lleva uno nuevo.
- [ ] **Step 2–4:** FAIL → implementar → `pnpm test:db && pnpm test` PASS.
- [ ] **Step 5: Commit** `fix(practice): reintentar un guardado que sí llegó no da «Alguien ha cambiado esto»`

---

### Task 3: Política de lectura de planes sobre sus columnas

**Files:** Create `supabase/migrations/20261201000200_practice_read_policy.sql`, `supabase/tests/database/practice_read_policy.test.sql`.

Hoy `insert … returning` sobre `practice_plans` da `42501` a un usuario autorizado, porque la política de lectura llama a `private.can_see_plan(id)` y busca una fila que aún no existe (backlog F4). Se reescribe `practice_plans_select_visible` sobre las columnas de la fila (`organization_id`, `team_id`, `created_by`), como `drills_select_visible`, con el mismo resultado que `can_see_plan`. No se pasa ninguna función a `security definer`.

- [ ] **Step 1: Test que falla:** c1 inserta un plan de T1 con `returning id` → `lives_ok`. Matriz de visibilidad de la Task 3 de la Fase 4 (adminA, c1, c2, coachB, jugador, autor que deja el equipo, plantilla privada) → idéntica (copiar sus aserciones).
- [ ] **Step 2–4:** FAIL → migración → `pnpm test:db` PASS (todos los ficheros).
- [ ] **Step 5: Commit** `fix(db): la lectura de planes mira las columnas de la fila y el alta con returning funciona`

---

### Task 4: Pendientes pequeños de Entrenar

**Files:** `train/_components/practice-form.tsx` (+ test), `src/modules/practice/queries.ts`, `src/modules/practice/practice-list.tsx` (+ tests), `src/ui/practice-card.tsx` o el `DateChip` que corresponda.

- `PracticeForm` en modo crear usa `useLeaveGuard(dirty)` y `LeaveGuardDialog` (C28), como el constructor.
- `listPractices` deja de cortar en silencio: pide `LIST_LIMIT + 1`; si llegan más, la lista lo dice al final («Mostrando las 50 más recientes») con el mismo estilo que la biblioteca. El chip de fecha del histórico enseña el mes («6 oct»).

- [ ] **Step 1: Tests que fallan:** formulario de crear con un campo cambiado + clic en la navegación inferior → sale «¿Salir sin guardar?»; lista con 51 filas → 50 filas y el aviso; chip del histórico con el mes.
- [ ] **Step 2–4:** FAIL → implementar → `pnpm test` PASS. Ampliar `e2e/practice-session.spec.ts` con el aviso al crear.
- [ ] **Step 5: Commit** `fix(train): aviso de salida al crear una sesión y la lista dice cuándo se corta`

---

### Task 5: `record_live_progress` y la puerta de entrada común

**Files:**
- Create: `supabase/migrations/20261201000300_live_progress.sql`, `supabase/tests/database/live_progress.test.sql`
- Modify: `supabase/tests/database/posture.test.sql`, `src/lib/database.types.ts`

**Interfaces:**
- Produces: `private.open_session(p_event uuid) returns table (org uuid, team uuid, plan uuid)`: la puerta de entrada que hoy está escrita dos veces (backlog F4): `NOT_FOUND` si no es un entreno con plan de un equipo que se gestiona, `SESSION_CLOSED` si no está `scheduled`, y bloqueo del evento y del plan en ese orden. `update_practice_session` y `save_practice_items` pasan a usarla (sus tests de la Fase 4 siguen en verde sin tocarlos).
- Produces (contrato F5, con [D4]): `public.record_live_progress(p_event uuid, p_items jsonb, p_finished boolean, p_actual_minutes int default null) returns jsonb` → `{ "applied": <int>, "updated_at": "<texto>" }`. `p_items` es una lista de `{ id, completed, actual_minutes }`.
- Grants (C24, C27): `update (completed, actual_minutes)` de `practice_items` y `update (actual_minutes)` de `practice_plans` para `authenticated`; las políticas existentes (`can_edit_plan`) ya limitan a sesiones abiertas del equipo.

Reglas (C24, C26):
1. `NOT_FOUND` si el evento no es un entreno con plan de un equipo que se gestiona.
2. Si el evento está `done` y `p_finished` es true → idempotente: devuelve `{ applied: 0, updated_at }` sin escribir (**[D7]**: el reenvío del cierre no es un error). `done` con `p_finished` false, o `cancelled` → `SESSION_CLOSED`.
3. Sin `STALE_COPY`: Live no lleva copia (**[D3]**).
4. `INVALID` si `p_items` no es una lista, tiene más de 30 elementos, un elemento sin `id` uuid, `completed` no booleano, `actual_minutes` fuera de 0–180, o un id repetido.
5. Los ids que no son ítems de este plan se ignoran (**[D4]**) y no cuentan en `applied`.
6. Escribe los ítems, después un `update` del plan (mueve `updated_at` y `updated_by`, C22), y si `p_finished`: ítems no enviados → `completed = false`, `actual_minutes = null`; plan `status = 'done'` y `actual_minutes = coalesce(p_actual_minutes, suma de los reales)`; y **al final** el evento `status = 'done'`.

- [ ] **Step 1: Test que falla** `live_progress.test.sql` (fixtures de `practice_write.test.sql`):
  - c1 envía dos ítems → `applied = 2`, filas escritas, `updated_at` del plan avanza.
  - mismo envío dos veces → mismo resultado (idempotencia del estado).
  - un id de un ítem de otra sesión de T1 y uno de club B en la lista → ignorados, `applied` no los cuenta, sus filas no cambian (Review Focus 2).
  - c2, coachB y `jugador` → `NOT_FOUND`; `anon` → `42501`.
  - `finished`: evento `done`, plan `done` con la suma; ítems no enviados quedan `false`/`null`; reenviar el cierre → OK sin cambios; enviar progreso sin `finished` tras cerrar → `SESSION_CLOSED`; sesión `cancelled` → `SESSION_CLOSED` (Review Focus 3).
  - entradas inválidas → `INVALID` (22023).
  - `update_practice_session` y `save_practice_items` con `open_session`: `practice_functions.test.sql` entero en verde.
  - `posture.test.sql`: las listas incluyen las columnas nuevas.
- [ ] **Step 2–4:** FAIL → migración → `pnpm supabase db reset && pnpm test:db` PASS; `pnpm db:types`; `supabase db lint` sin errores.
- [ ] **Step 5: Commit** `feat(db): record_live_progress y una sola puerta de entrada para escribir una sesión`

---

### Task 6: `POST /api/live-progress`

**Files:** Create `src/app/api/live-progress/route.ts` (+ test), `src/modules/live/schema.ts` (+ test). Modify `src/proxy.ts` (el `matcher` ya cubre `/api`; comprobar que una petición sin sesión responde 401 JSON y no un redirect a `/login`).

**Interfaces:**
- Body: `{ clubSlug: string; eventId: uuid; items: { id: uuid; completed: boolean; actualMinutes: number | null }[]; finished: boolean; actualMinutes?: number }` (`liveProgressSchema`).
- Respuesta: ver Global Constraints. 401 sin sesión; 403 si `Origin` no es el host; 404 opaco si el entreno no es de ese club (lectura previa C25) o la función da `NOT_FOUND`; 409 `SESSION_CLOSED`; 422 `INVALID`; 500 `SAVE_FAILED` (con `logError`, sin datos personales).
- `revalidatePath('/c/[club]/(app)', 'layout')` tras escribir.

- [ ] **Step 1: Tests que fallan:** con `createClient` simulado como en `src/modules/practice/actions.test.ts`: cuerpo inválido → 422; sin sesión → 401; `Origin` ajeno → 403; entreno de otro club → 404 sin llamar al RPC; `SESSION_CLOSED` → 409; OK → 200 y `revalidatePath`. `check:guards` sigue en verde (sin clave de servicio).
- [ ] **Step 2–4:** FAIL → implementar → `pnpm test` PASS.
- [ ] **Step 5: Commit** `feat(live): POST /api/live-progress con la sesión del usuario`

---

### Task 7: Estado y cronómetro de Live (módulo puro)

**Files:** Create `src/modules/live/{types,reducer,timer}.ts` (+ tests).

**Interfaces (contrato F5):**
- `LiveSession { eventId; clubSlug; title; startsAt; items: LiveItem[] }`, `LiveItem { id; title; phase: string | null; minutes; diagramUrl: string | null; keyPoints: string[]; standards: { number: number; title: string }[] }`.
- `LiveState { version: 1; eventId; index; startedAt: number | null; itemStartedAt: number | null; pausedAt: number | null; pausedMs: number; progress: Record<itemId, { completed: boolean; actualMs: number }>; finishedAt: number | null }`.
- `liveReducer(state, action, nowMs): LiveState` con acciones `start`, `pause`, `resume`, `next`, `previous`, `finish`.
- `remainingMs(state, session, nowMs): number` (negativo cuando se pasa de tiempo, **[D6]**) y `elapsedMs(state, nowMs)`; `toProgressPayload(state, session): LiveProgressInput` (redondea a minutos; 0 min → `completed = false`, **[D5]**).

- [ ] **Step 1: Tests que fallan** (Review Focus 5): restante a 0 s, 30 s, 10 min y tras un salto de reloj de 5 min sin eventos; pausa 2 min y reanudar → el restante no cambia; `next` acumula `actualMs` y marca completado; `previous` no desmarca; `next` en el último no hace nada; `finish` fija `finishedAt`; acciones sobre un estado terminado no lo cambian; `toProgressPayload` con ítems sin tocar.
- [ ] **Step 2–4:** FAIL → implementar → `pnpm test src/modules/live` PASS (también con `TZ=UTC`).
- [ ] **Step 5: Commit** `feat(live): estado y cronómetro calculados desde marcas de tiempo`

---

### Task 8: Guardado en el dispositivo y cola de sincronización

**Files:** Create `src/modules/live/{storage,sync}.ts` (+ tests).

**Interfaces:**
- `loadLiveState(eventId): LiveState | null`, `saveLiveState(state): void` (clave `clubos:live:<eventId>`; `try/catch`: sin `localStorage`, Live funciona en memoria y avisa una vez «No se puede guardar en este dispositivo»). Descarta un estado de `version` distinta o con ids que la sesión ya no tiene ([D4]: el estado se reconcilia, no se tira entero).
- `syncLiveProgress(payload, { fetch, now })`: guarda el último payload pendiente (`clubos:live-pending:<eventId>`), envía, y si falla por red o 5xx reintenta con espera exponencial (2 s → 60 s) y al evento `online`. 401 → para y avisa «Tu sesión ha caducado. Entra de nuevo para guardar el entrenamiento.» sin borrar nada. 404/409/422 → para y avisa; no reintenta. Solo hay un envío en vuelo; uno nuevo sustituye al pendiente (idempotencia: el último estado manda).

- [ ] **Step 1: Tests que fallan:** guardar y leer; `localStorage` que lanza; cola con `fetch` que falla dos veces y luego responde → un único envío final con el último estado; `online` dispara el reintento; 401 conserva el pendiente; 409 no reintenta.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(live): el progreso se guarda en el dispositivo y se sincroniza al volver la red`

---

### Task 9: Lectura de la sesión para Live y diagramas que no caducan

**Files:** Create `src/modules/live/queries.ts` (+ test), `src/modules/live/diagram-cache.ts` (+ test). Modify `src/modules/media/storage.ts` (`signedUrl` ya admite `expiresIn`), `src/ui/court-diagram.tsx` (+ test).

**Interfaces:**
- `getLiveSession(ctx, eventId): Promise<LiveSession | null>`: `null` (404) si no existe, no es del club, no se ve o no está `scheduled`. Ítems en orden con sus 3 primeros coaching points `is_key`, sus Standards y el diagrama con URL firmada de vida **[D8]**: `clamp(endsAt + 2 h − ahora, 10 min, 6 h)`.
- `cacheDiagrams(session)`: descarga cada diagrama a `Cache Storage` con la clave `/live-cache/<eventId>/<itemId>`; `diagramSrc(eventId, itemId)` devuelve una URL `blob:` desde la caché o `null`; `clearDiagrams(eventId)`; `pruneDiagramCaches(nowMs)` borra las de más de 7 días.
- `CourtDiagram` acepta `unavailable?: 'offline'`: pinta «Diagrama no disponible sin conexión» en vez de la pista vacía.

- [ ] **Step 1: Tests que fallan:** `getLiveSession` con filas simuladas: orden, solo `is_key` y como mucho 3, expiración calculada; sesión cerrada → `null`. `diagram-cache` con una `caches` simulada. `CourtDiagram` con `unavailable`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. Test de integración en `scripts/media/storage.int.test.ts`: la URL firmada con `expiresIn` largo se descarga con la sesión de Álex y no con la de Marta.
- [ ] **Step 5: Commit** `feat(live): la sesión se precarga con sus diagramas para usarla sin conexión`

---

### Task 10: Pantalla de Live

**Files:**
- Create: `src/app/c/[club]/(live)/layout.tsx` (sin `AppShell`, con los colores del club que ya pone `c/[club]/layout.tsx`), `src/app/c/[club]/(live)/train/[eventId]/live/{page,loading,error,live-screen}.tsx` (+ tests), `src/ui/{timer,live-controls}.tsx` (+ tests), `src/modules/live/{use-wake-lock,use-live}.ts` (+ tests)
- Reconstruir `Timer` desde `design/components/Timer/preview.html` (no se importa).

**Interfaces:**
- `useWakeLock(active: boolean): { supported: boolean; locked: boolean }`: pide `navigator.wakeLock.request('screen')` y lo vuelve a pedir en `visibilitychange` (el navegador lo suelta al ocultar la pestaña). Sin soporte, Live funciona y muestra una vez «Este navegador puede apagar la pantalla».
- `useLive(session)`: une reductor, `localStorage`, cola y repintado cada 250 ms con `requestAnimationFrame`/intervalo (solo repinta).
- `Timer({ remainingMs, paused, overtime })`, `LiveControls({ onPrevious, onTogglePause, onNext, paused, isFirst, isLast })`.

Pantalla (README del Timer + reglas de la app): cabecera mínima con «Salir» (vuelve al detalle; Live sigue guardado y se retoma), «EN DIRECTO» con punto `danger` y palabra, «3 / 5» y barra de progreso; fase y título del ejercicio (`display-m`); cronómetro (`timer`, tabular; pausado en `ink-3`; en negativo con «+», **[D6]**); diagrama a ancho completo; 3 coaching points clave; Standards del ejercicio (regla 8); controles abajo a 72 px, Pausa/Reanudar como único `primary`; en el último, «Terminar entrenamiento» con `ConfirmDialog` (**[D7]**). Estado de sincronización discreto («Guardado en el móvil» / «Guardado» / «Sin conexión: se enviará al volver»), con palabra, no solo color. Sin navegación inferior. 375×812 sin desplazamiento horizontal; el contenido largo (coaching points) se desplaza por encima de los controles fijos con `scroll-padding-bottom` (WCAG 2.4.11).

- [ ] **Step 1: Tests que fallan:** `Timer` (formato `mm:ss`, pausado, `+mm:ss`); `LiveControls` (áreas de 72 px por clase, `aria-label`s, un solo primario, «Anterior» deshabilitado en el primero); `useWakeLock` con `navigator.wakeLock` simulado y `visibilitychange`; `LiveScreen` con reloj simulado: iniciar, pausar, siguiente, terminar con confirmación; al llegar a 0 llama a `navigator.vibrate` si existe; restaurar desde `localStorage`.
- [ ] **Step 2–4:** FAIL → implementar → `pnpm test && pnpm check:guards && pnpm typecheck` PASS.
- [ ] **Step 5: Commit** `feat(live): pantalla de Live Practice a pantalla completa con una mano`

---

### Task 11: «Iniciar entrenamiento»

**Files:** `src/app/c/[club]/(app)/train/[eventId]/page.tsx`, `train/_components/practice-actions.tsx` (+ tests), `src/modules/home/home-screen.tsx` (+ test).

- En el detalle de una sesión `scheduled` con `canEdit` y al menos un ítem, «Iniciar entrenamiento» es el CTA principal (pasa a secundario «Editar sesión»). Si la sesión no es de hoy en la zona del club, pide confirmación (**[D1]**). Si hay un Live a medias en el dispositivo (`loadLiveState`), el botón dice «Continuar entrenamiento».
- En Inicio, la card destacada del próximo entrenamiento, si es hoy y se puede editar, enlaza a Live.

- [ ] **Step 1–4:** tests de componente (visibilidad por estado, permiso e ítems; texto «Continuar»; confirmación fuera de hoy) → implementar → PASS.
- [ ] **Step 5: Commit** `feat(train): iniciar o continuar el entrenamiento desde la sesión y desde Inicio`

---

### Task 12: PWA: manifiesto, caché y sin conexión

**Files:** `package.json` (`@serwist/next`, `serwist`; `build: next build --webpack`, C12), `next.config.ts` (`withSerwist`), `src/app/manifest.ts`, `src/app/sw.ts`, `src/app/~offline/page.tsx`, iconos de plataforma en `public/` (marca «CLUB OS», nunca la de un club: regla 3), `tsconfig.json` (tipos de `serwist`), `.gitignore` (`public/sw.js`).

Reglas:
- Manifiesto de plataforma: `name: "CLUB OS"`, `display: "standalone"`, `start_url: "/select-club"`, colores de plataforma (`bg`), iconos 192/512 y `maskable`.
- Service worker: precache de los estáticos de Next; `NetworkFirst` (3 s de espera) para los documentos y las respuestas RSC de `/c/*/train/*/live`; `NetworkOnly` para `/api/*` y para todo POST (las Server Actions no se cachean nunca); nada de `/login` ni de `/auth/*` en caché. Fallback de documento: `/~offline` («Sin conexión. Si tenías un entrenamiento abierto, vuelve a él: sigue guardado en el móvil.»).
- La caché de Live se limita a la sesión abierta; al cerrar sesión (`/auth/sign-out`) se borran las cachés `clubos-*` y las claves `clubos:*` de `localStorage` (otra persona puede usar el mismo móvil).
- En desarrollo el service worker está desactivado (`disable: process.env.NODE_ENV === 'development'`).

- [ ] **Step 1: Tests que fallan:** `manifest.test.ts` (campos y que no menciona ningún club); test del `sign-out` que limpia `clubos:*`; `check:guards` sobre `sw.ts`.
- [ ] **Step 2–4:** FAIL → implementar → `pnpm build` (con `--webpack`) sin avisos nuevos; `pnpm start` y Lighthouse PWA «instalable» en local.
- [ ] **Step 5: Commit** `feat(pwa): CLUB OS se instala y Live se reabre sin conexión`

---

### Task 13: Seed y e2e de Live

**Files:** `scripts/seed/data.ts`, `scripts/seed/seed.int.test.ts` (recuentos, C7: `events` de Alevín A F4 8 → F5 9, una sesión hoy en la zona del club con 4 ítems, uno de ellos con diagrama), `e2e/helpers/seed.ts` (`restoreSeed` deja esa sesión `scheduled` y sin progreso, C21), `e2e/live.spec.ts`, `playwright.config.ts` (`admin.testMatch`).

E2E (`admin`, 375×812, C30), con `page.clock` para el tiempo:
- [ ] Álex abre la sesión de hoy → «Iniciar entrenamiento» → ve «1 / 4», el cronómetro y el diagrama; avanza dos; recarga → sigue en «3 / 4» con el tiempo correcto.
- [ ] Sin conexión (`context.setOffline(true)`): avanza, se ve «Sin conexión: se enviará al volver», recarga y el diagrama sigue; vuelve la red → «Guardado»; en la base (cliente de servicio en el helper) los ítems tienen `completed` y `actual_minutes`. (Review Focus 1)
- [ ] Terminar → confirmación → la sesión sale en Histórico como hecha; su detalle no ofrece Live ni Editar.
- [ ] Nora abre `/c/arcangel/train/<id>/live` de Alevín A → 404; `POST /api/live-progress` con su sesión → 404. (Review Focus 2)
- [ ] Sin `navigator.wakeLock` (`addInitScript` que lo borra) → Live funciona y avisa.
- [ ] Proyecto WebKit (`devices['iPhone 13']`) solo para `live.spec.ts`: la mayoría de entrenadores usará iPhone y hasta ahora los e2e solo corren en Chromium. Si `page.clock` o `setOffline` no se comportan en WebKit, se apunta y se deja en Chromium con el motivo.
- [ ] **Commit** `test(e2e): Live Practice con y sin conexión`

---

### Task 14: Cierre de la fase

- [ ] `pnpm lint && pnpm typecheck && pnpm check:guards && pnpm test && TZ=UTC pnpm test && pnpm test:db && pnpm test:int && pnpm test:e2e` en verde, desde una base vacía (`supabase db reset`, `pnpm seed` dos veces) y sin deriva de tipos (`git diff --exit-code src/lib/database.types.ts`); `supabase db lint` sin errores.
- [ ] Arrancar el proyecto, revisar la consola, recorrer Live a 375×812 y **en un iPhone y un Android reales en una pista** (riesgo de la spec), con la red cortada a mitad.
- [ ] Revisión de toda la rama, una tanda de arreglos y re-revisión.
- [ ] `backlog.md`: estado de la Fase 5, lo que deja, y quitar lo recogido. Contrato: «Cambios propuestos al contrato» (abajo) a las convenciones reconciliadas.
- [ ] PR a `main` con el resumen, lo verificado y lo que queda.

---

## Cambios propuestos al contrato

- `save_practice_items` devuelve `jsonb` (`updated_at`, `item_ids`) y acepta `p_save_id`; `update_practice_session` acepta `p_save_id`; `practice_plans.last_save_id`. C23 deja de aplicar: los ids de los ítems son estables mientras el ítem siga en la lista.
- `private.open_session(p_event)` es la puerta de entrada de toda función que escriba una sesión (C26 la referencia).
- `record_live_progress(p_event, p_items, p_finished, p_actual_minutes default null) returns jsonb` (antes `void`): `applied` y `updated_at`. Ignora ids ajenos ([D4]); el reenvío del cierre es idempotente ([D7]).
- `LiveSession` añade `clubSlug` y `startsAt`; `LiveItem` añade `standards` (regla 8).
- `POST /api/live-progress`: códigos HTTP de Global Constraints.
- Nuevo patrón: un Route Handler de escritura comprueba `Origin` y acota al club como una Server Action (C25).
