# CLUB OS · Pendientes que deja la Fase 1

Lo que las revisiones de la Fase 1 dejaron para más adelante, ordenado por la fase que debe recogerlo. Nada de esto bloquea la Fase 1. Cada plan de fase debería incorporar su bloque antes de empezar.

Estado de la Fase 1: tareas 1–11 hechas y revisadas. Verificado contra Supabase local real y desde una base vacía: `test:db` 208/208, `seed` dos veces, `test:int` 9/9, unidad 577/577, `test:e2e` 16/16. Task 12 (entorno remoto): la parte del repositorio está hecha (con ella, unidad 607/607 y `test:int` 11/11). Pendiente: lo que queda en los paneles (lista de abajo), primera ejecución real de CI y revisión en un móvil real.

## Correcciones al texto de los planes

- **`runSeed` no está en `scripts/seed.ts`.** Vive en `scripts/seed/run.ts` con firma `runSeed(now, client?)`. `scripts/seed.ts` es solo la CLI. Los planes de las fases 2–4 dicen «Modify: `scripts/seed.ts` (`runSeed`)»: debe ser `scripts/seed/run.ts` y `scripts/seed/data.ts`.
- **`ClubContext` y `getClubContext`** están en `src/modules/tenancy/queries.ts`. El marcador de pestañas vacías es `src/app/c/[club]/coming-soon.tsx`.
- **E2E.** Los specs importan `test` de `e2e/helpers/test` y entran con `openAs` (sesión guardada por usuario). `loginAs` queda para probar el propio login. El `globalSetup` siembra y solo en local: el proyecto `admin` de la Fase 2 y cualquier `afterAll → runSeed` deben convivir con él.
- **Cada página bajo `/c/[club]` se protege sola.** Un layout no protege a sus páginas en una navegación parcial. Hoy cada página hace `getClubContext` + `notFound()`. El `requireClub` de la Fase 2 debe sustituir esa convención en todas.
- **Error frente a 404.** Una avería de Supabase lanza y llega a un límite de error; `null` y 404 quedan solo para «no existe o no eres miembro activo».
- **Región.** La especificación aprobada (`docs/spec/club-os-primera-entrega.md`, fila «Región» de la tabla) dice Fráncfort. La decisión del 3 oct 2026 es Irlanda para Supabase y Dublín para las funciones de Vercel. La especificación no se ha editado.

## Fase 2 · The Way

- El generador de tokens debe fallar con un alias desconocido (`{x}`) y validar la forma de `tokens.json`.
- Decidir una convención única para tamaños y espaciados sin token (hoy hay medidas copiadas de `bundle.css` como valores arbitrarios).
- Un test genérico de postura sobre todas las tablas de `public`: RLS activado, nada para `anon`, lo de `authenticated` contra una lista permitida. Opcional: `alter default privileges … revoke`.
- Comprobación de hex en `src/**/*.tsx` dentro de `check:guards` (la regla 4 no tiene guarda hoy).
- Un usuario de seed con dos clubes y su test: hoy nada fija el `organizations!inner(` de la consulta de contexto ni la lista del selector.
- Política única de «quién es el usuario» y de errores de Auth en `guards.ts`: hoy hay tres (`session.ts`, `tenancy/queries.ts`, `select-club/page.tsx`). Añadir `.retry(false)` a la consulta de contexto: los reintentos de postgrest-js retrasan unos 7 s la pantalla de error.
- `ListRow`: semántica de lista (`ul`/`li`) y documentar que las filas van como hijas directas de `Card flush`.
- Campo de código que tolere pegar con espacios; botón primario del login y del 404 con `CTAButton`; etiqueta «The Way» por defecto definida una sola vez.
- Test propio de `c/[club]/page.tsx` y usar `useSelectedLayoutSegment` en `error.tsx` al mover las rutas a `(app)`.
- Menú de cuenta con «Salir» dentro del club. Hoy solo se puede salir desde el estado sin clubes. Ningún plan añade «cambiar de club».
- Formateador de código y versión de Node fijada (`engines` o `.nvmrc`; CI usa 24).

## Fase 4 · Practice Builder

- **Atar el equipo del plan al de su evento.** Hoy el esquema acepta un plan de T2 sobre un evento de T1. Con escritura de usuarios, un entrenador de otro equipo podría ocupar el evento (`event_id` es único). Solución de esquema: `unique (organization_id, team_id, id)` en `events`, FK de tres columnas en `practice_plans` y `check (event_id is null or team_id is not null)`. El plan de la Fase 4 no lo recoge.
- Una sola regla de «staff de un equipo» (`private.can_manage_team`): hoy está escrita tres veces (`is_team_staff`, `can_see_person`, `can_see_plan`).
- El autor de un plan lo sigue viendo tras dejar el cuerpo técnico. Decidir antes de abrir la autoría.
- `practice_plans.created_by` sin acción `on delete`: borrar a un autor fallará con 23503.
- El `kind` del evento no está atado al contenido (plan sobre un partido).
- Fin de semana una hora tarde en zonas con hueco de medianoche por cambio de hora (Santiago, El Cairo, Azores): `startOfLocalDay(addLocalDays(now, 7))`. `inZone` debería rechazar fechas ISO sin desfase. No afecta a España ni a México.
- `PracticeCard` no muestra el equipo: con dos equipos no se sabe de cuál es la sesión.

## Fase 6 · Equipo, jugadores y partidos

- El límite de 30 eventos de Inicio mezcla entrenamientos y partidos y puede esconder el próximo partido.
- «Mis equipos» = temporada actual. Hoy `team_staff` no filtra por temporada ni se usa `archived_at`.
- `GameCard`: cada equipo se anuncia dos veces a lectores de pantalla; tono del avatar rival por selector descendiente.
- Partido colgado de un evento de entrenamiento (lado de partidos de la regla de `kind`).

## Fase 7 · Gestión y cierre

- `organizations.status = 'suspended'` no corta el acceso. La zona horaria del club no se valida.
- Fixtures de la matriz RLS: admin y entrenador sin persona, usuario sin membresías.
- Coste de las políticas con función por fila y avisos del asesor de Supabase (FKs compuestas sin índice).
- Login: tope de tiempo en la verificación, mensaje distinto para 429 y 5xx (hoy todo es «código no válido»), nivel de log de los eventos esperados, foco tras un código erróneo.
- **Límites de Auth.** Todas las peticiones salen de la IP del servidor: unas 30 verificaciones en 5 minutos son compartidas por todos los usuarios. Activar CAPTCHA en Supabase Auth exige código (widget y `captchaToken` en las dos acciones). Planificar un límite propio en la app o subir los límites.
- Enumeración directa de emails contra `/auth/v1/otp` de Supabase con la clave pública: no se arregla en `src/`.
- Cabeceras de seguridad, `noindex`, `global-error.tsx`, validación de variables de entorno.

## Lista para la Task 12 (entorno remoto)

Hecho (todo en el repo; el detalle operativo está en el README, «Entorno remoto»):

- Región decidida: Supabase en `eu-west-1` (Irlanda) y funciones de Vercel en `dub1` (Dublín), fijadas en `vercel.json`.
- Las tres migraciones de la Fase 1 están aplicadas en el remoto con las mismas versiones que `supabase/migrations/`. `supabase/seed.sql` (esquema `tests`) no se aplicó y no debe llegar al remoto: nada de `db push --include-seed` ni `db reset --linked`.
- `playwright.config.ts` admite `BASE_URL`: con ella no arranca la app. Si `BASE_URL` es remoto y el Supabase del runner es local o falta, el arranque global falla antes de que corra ningún test. `VERCEL_AUTOMATION_BYPASS_SECRET` es opcional, para previews protegidas.
- Comprobado: `auth.admin.generateLink` crea el usuario cuando no existe. `loginAs` comprueba ahora que el usuario existe antes de generar el código y, si no, falla pidiendo sembrar ese entorno. Ningún e2e crea cuentas, tampoco en local.
- Contra un remoto, los e2e no guardan traza ni vídeo: la traza de un test fallido lleva la cookie de sesión de esa ejecución.
- `ALLOW_REMOTE_SEED` solo desde la shell, nunca en `.env.local` (documentado en `.env.example`). El e2e nunca siembra un destino remoto.

Pendiente (paneles y primera ejecución):

- Las dos variables públicas en Vercel (Production y Preview) y un despliegue nuevo.
- Auth en Supabase: desactivar el registro abierto, subir la plantilla del código y su asunto, y poner la URL del sitio. No copiar `max_frequency = "1s"` ni los límites de Auth de desarrollo del `config.toml` local.
- SMTP real: el correo integrado de Supabase solo envía a miembros de la organización.
- Seed del demo con `ALLOW_REMOTE_SEED=true pnpm seed` desde la shell.
- Primera ejecución de `e2e/tenancy.spec.ts` contra la URL desplegada.
- Revisión en un móvil real.
- Una ejecución de CI en verde forma parte del cierre de la fase. Ahora sube los informes de Playwright si falla.

## Notas menores del último repaso

- `check-guards.sh`: el patrón del segundo club no tiene límite por la derecha; un texto como «el club demostró» en `src/` daría un falso positivo.
- `openAs` entra con un login real para cualquier usuario que no esté en `SESSION_USERS`: un spec con un usuario nuevo gasta una verificación por test sin avisar. Añadir el usuario a la lista.
- Fuera de CI, Playwright reutiliza un servidor ya abierto en el puerto 3000 aunque esté construido contra otro Supabase.
- `scripts/seed.ts` y `scripts/tokens-to-css.ts`: si el repo se abre a través de un enlace simbólico, la guarda de entrada puede no reconocer la ejecución directa y terminar sin hacer nada.

## Decisiones de producto a confirmar

- Una cuenta de jugador con ficha en la plantilla no puede leer su propio equipo ni su plantilla (políticas del plan). Sin interfaz en el MVP.
- Dirección sin equipo ve en Inicio «Cuando dirección te asigne un equipo…». Hasta la Fase 7 no hay otra Inicio para dirección.
- Con Auth caído, el proxy lleva a `/login` en vez de mostrar la pantalla de error. Con la base o PostgREST caídos sí se ve la pantalla de error.
- Las cookies de sesión son `httpOnly` y `Secure`. La app no tiene cliente de Supabase en el navegador y la Fase 5 debe sincronizar por `POST /api/live-progress`.
- En tests de `src/` quedan nombres de persona y títulos de sesión de las vistas previas del diseño («Álex Prieto», «Transición + rebote defensivo»). La guarda cubre la identidad de los clubes, no esos ejemplos.
