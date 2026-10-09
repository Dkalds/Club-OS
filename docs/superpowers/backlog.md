# CLUB OS · Pendientes que dejan las Fases 1 a 6

Lo que las revisiones de las Fases 1, 2, 3 y 4 dejaron para más adelante, ordenado por la fase que debe recogerlo; lo que dejó la Fase 2 tiene además su parte más abajo («Pendientes que deja la Fase 2»). Nada de esto bloquea el cierre de las fases ya hechas. Cada plan de fase debería incorporar su bloque antes de empezar. Si una fase se cierra sin recoger el suyo, lo que quede se pasa a otra en este fichero: aquí no hay pendientes sin dueño.

Estado de la Fase 1: tareas 1–11 hechas y revisadas. Verificado contra Supabase local real y desde una base vacía: `test:db` 208/208, `seed` dos veces, `test:int` 9/9, unidad 577/577, `test:e2e` 16/16. Task 12 (entorno remoto): la parte del repositorio está hecha (con ella, unidad 617/617 y `test:int` 11/11). Pendiente: lo que queda en los paneles (lista de abajo), primera ejecución real de CI y revisión en un móvil real.

Estado de la Fase 3: tareas 1–14 hechas (las 13 de implementación revisadas una a una), y la rama entera revisada al final, sin ningún crítico. Hecho y verificado: la biblioteca (búsqueda sin tildes, filtros en la URL, ficha, editor con diagrama, ejercicios relacionados en The Way); el aislamiento entre clubes, entre entrenadores y frente a jugadores, en la base de datos y con tests que fallan si se rompe (pgTAP, integración con sesiones de usuario de verdad y e2e); lo importante de la revisión final, arreglado o documentado en la tanda de cierre (y los menores baratos, arreglados). Verificado contra Supabase local real y desde una base vacía (`supabase db reset`, `pnpm seed`, `pnpm db:types` sin deriva: `git diff --exit-code src/lib/database.types.ts` limpio): `supabase db lint` (`public`, `private`; por defecto también `extensions` y `tests`) sin errores, `lint`, `typecheck` y `check:guards` limpios, unidad 2622/2622 (117 ficheros), `test:db` 884/884 (9 ficheros), `test:int` 52/52 (3 ficheros) y `test:e2e` 76/76 (375×812, proyectos `mobile` y `admin`, a la primera). Tras los e2e, `pnpm seed` y `test:int` otra vez (52/52), y la comprobación con el cliente de administración: ningún ejercicio `E2E …`, ninguna fila de `media_assets` y ningún objeto en `club-media`; quedan los 20 ejercicios del seed. Repaso visual a 375×812 con los usuarios del seed (Álex, Irene, Raúl y Marta; 25 pantallas, y la biblioteca y el formulario a 1280 px): ningún defecto claro, una sola cabecera en cada pantalla, sin scroll horizontal ni textos cortados, áreas táctiles de 44 px o más, marca del club en chips, insignias y cabecera (turquesa en Club Demo, nada de Arcángel en su lista) y consola sin errores ni avisos. Después se mezcló `main` en la rama (la Fase 2 ya fusionada y las correcciones de la revisión de su PR, `origin/main` 80bdb8f) y se verificó todo otra vez desde una base vacía: `supabase db lint` sin errores, tipos sin deriva, `lint`, `typecheck` y `check:guards` limpios, unidad 2673/2673 (119 ficheros), `test:db` 898/898 (9 ficheros), `test:int` 54/54 (3 ficheros) y `test:e2e` 77/77, a la primera; tras los e2e, `pnpm seed` y `test:int` otra vez (54/54) y la misma comprobación con el cliente de administración, sin sobras. Lo que quedó a juicio del propietario está en «Decisiones de producto a confirmar». Pendiente, y lo cierra el propietario del proyecto: aplicar las cuatro migraciones al Supabase remoto antes de usar la preview y de fusionar (README, «Despliegue de la biblioteca de ejercicios (Fase 3)»; empieza por `supabase migration list`: alguna de las de la Fase 2 puede estar pendiente también, como `20261021000100_methodology_integrity`, la de la revisión de su PR), la revisión en un móvil real con los usuarios del seed (Álex, Irene, Raúl, Nora y Marta) y la decisión sobre fotografías como diagrama (última sección). El PR de la fase es Dkalds/Club-OS#6, con CI en verde; se fusiona con las migraciones ya aplicadas en el remoto.

Estado de la Fase 4: tareas 1–15 hechas y revisadas una a una, la rama entera revisada al final (sin ningún crítico) y una sola tanda de arreglos, re-revisada y limpia. Hecho y verificado: crear una sesión, montarla en el constructor (ejercicios de la biblioteca y bloques libres, que se ordenan arrastrando, con el teclado o con «Subir» y «Bajar», y se cronometran de cinco en cinco minutos), duplicarla, cancelarla y abrirla desde Inicio; «Añadir a sesión» desde la ficha de un ejercicio; el aislamiento entre clubes y entre equipos, en la base de datos (políticas, privilegios por columna y claves foráneas compuestas) y con tests que fallan si se rompe (pgTAP, y e2e con Nora, de otro equipo, y Marta, de otro club); la copia obsoleta entre dos entrenadores del mismo equipo; y las horas siempre en la zona del club, también con el móvil en otra. Verificado contra Supabase local real y desde una base vacía sobre el commit `c4c82e1`, el último que toca código (`supabase db reset`, `pnpm seed` dos veces, `pnpm db:types` sin deriva): `supabase db lint` sin errores, `lint`, `typecheck` y `check:guards` limpios, unidad 3612/3612 (147 ficheros), `test:db` 1237/1237 (13 ficheros), `test:int` 56/56 y `test:e2e` 109/109 (375×812; 57 del proyecto `mobile` y 52 del `admin`). Repaso a 375×812 con capturas de 14 pantallas (Álex, Raúl y Nora), antes de la tanda de arreglos: sin scroll horizontal, ningún control por debajo de 44 px y consola sin errores ni avisos. De la pestaña Entrenar a una sesión guardada con cinco ejercicios hay unos 11 toques y un solo campo que escribir, el título; no se ha cronometrado con una persona (la meta de la spec son menos de 3 minutos). Lo que quedó a juicio del propietario está en «Decisiones de producto a confirmar»: lo primero, que dirección escribe las sesiones de cualquier equipo y la spec dice que solo las lee. Pendiente, y lo cierra el propietario del proyecto: aplicar las tres migraciones al Supabase remoto antes de usar la preview y de fusionar (README, «Despliegue del Practice Builder (Fase 4)»); abrir el PR y mirar su primera ejecución de CI (ver «Notas menores del último repaso»); y la revisión en un móvil real con Álex, Irene, Nora, Marta y Raúl, porque arrastrar con el dedo solo se ha probado emulado. El PR no está abierto.

La rama de la Fase 4 lleva dentro `main` (con la revisión de la Fase 2) y la Fase 3 entera, hasta su commit `962cb3e` (incluida su propia fusión de `main`), y su PR va detrás del de la Fase 3 (Dkalds/Club-OS#6): sus migraciones no se despliegan antes que las de la biblioteca. Las dos ramas resolvieron por separado la fusión con `main` y llegaron a lo mismo con texto distinto en `src/lib/mutate.ts`, `src/lib/use-action.ts` y `src/modules/methodology/actions.ts`: al juntarlas se tomó el texto de la Fase 3 en esos ficheros y en sus tests, que es el que llega a `main` primero. Así queda: `mutate(config, …)` con `retryOnConflict`, `useAction` con `unstable_rethrow`, y `DrillForm` con `useLeaveGuard` (esta rama borró `src/lib/unsaved-changes.ts`).

## Correcciones al texto de los planes

- **`runSeed` no está en `scripts/seed.ts`.** Vive en `scripts/seed/run.ts` con firma `runSeed(now, client?)`. `scripts/seed.ts` es solo la CLI. Los planes de las fases 2–4 dicen «Modify: `scripts/seed.ts` (`runSeed`)»: debe ser `scripts/seed/run.ts` y `scripts/seed/data.ts`.
- **`ClubContext` y `getClubContext`** están en `src/modules/tenancy/queries.ts`. El marcador de pestañas vacías es `src/app/c/[club]/coming-soon.tsx`.
- **E2E.** Los specs importan `test` de `e2e/helpers/test` y entran con `openAs` (sesión guardada por usuario). `loginAs` queda para probar el propio login. El `globalSetup` siembra y solo en local: el proyecto `admin` de la Fase 2 y cualquier `afterAll → runSeed` deben convivir con él.
- **Cada página bajo `/c/[club]` se protege sola.** Un layout no protege a sus páginas en una navegación parcial. Todas lo hacen con `requireClub` (`src/lib/guards.ts`); las de Gestión se exportan con `adminPage`, que además comprueba el permiso antes de ejecutar la página, y `pnpm check:guards` lo exige. Ninguna página nueva debe volver a `getClubContext` + `notFound()` a mano.
- **Error frente a 404.** Una avería de Supabase lanza y llega a un límite de error; `null` y 404 quedan solo para «no existe o no eres miembro activo».
- **Storage: la spec se implementa más estricta que como está escrita.** La spec habla de políticas de Storage «sobre el primer segmento» de la ruta (el club). Se implementó por visibilidad del ejercicio: leer, subir y borrar en `club-media` siguen la regla del ejercicio de la carpeta `org/{club}/drills/{ejercicio}/`, y nada más se puede leer (con la regla del primer segmento, un jugador o un entrenador sin acceso a un borrador listaba y firmaba su diagrama). La especificación no se ha editado.
- **Región.** La especificación aprobada (`docs/spec/club-os-primera-entrega.md`, fila «Región» de la tabla) dice Fráncfort. La decisión del 3 oct 2026 es Irlanda para Supabase y Dublín para las funciones de Vercel. La especificación no se ha editado.
- **Planes de sesión: dirección escribe, y la spec dice que lee.** La spec (§5, fila «Planes de sesión») da al admin «Lee todos». El contrato entre fases decía «admin o staff del equipo» y así se implementó: dirección crea, edita, duplica y cancela las sesiones de cualquier equipo de su club. Está pendiente de confirmar (la primera de «Decisiones de producto a confirmar»). La especificación no se ha editado.
- **El plan de la Fase 4 no es la referencia de lo que hay.** Sus tipos y sus props cambiaron al ejecutarlo (`PracticeListItem.location`, `PracticeDetailItem.drillVisible`, `PracticeBuilder` sin `backHref`, `sessionMinutes`, `defaultSessionDate`…). Lo que la fase produjo está en el contrato entre fases, sección «Fase 4 · Practice Builder — produce».

## Fase 2 · The Way (cerrada)

La Fase 2 se cerró sin recoger casi nada de este bloque. Lo que tenía marcado con «(de la Fase 2)» para las fases 3 y 4 lo hizo la Fase 4 (ver su bloque); lo que sigue pendiente está en el de la Fase 7.

Hecho, en la fase o al corregir la revisión de su PR:

- Menú de cuenta con «Salir» dentro del club (`src/ui/account-menu.tsx`).
- `requireClub` sustituye a `getClubContext` + `notFound()` en todas las páginas y layouts de `/c/[club]`.
- Test propio de Inicio (`src/app/c/[club]/(app)/page.test.tsx`).

## Fase 3 · Biblioteca (cerrada)

La Fase 3 se cerró sin recoger el único punto de este bloque, el test de postura: pasó al de la Fase 4, marcado con «(de la Fase 2)». Lo que deja la propia Fase 3 está en los bloques de las fases 4, 5 y 7 («Lo que deja la Fase 3») y en «Decisiones de producto a confirmar».

- (de la Fase 2) El test genérico de postura lo hizo la Fase 4: `supabase/tests/database/posture.test.sql` recorre el catálogo de `public` y comprueba RLS en toda tabla, nada para `anon` y los privilegios de `authenticated`, de tabla y de columna, contra dos listas escritas a mano. Cada tabla y cada `grant` nuevos se apuntan ahí. Lo que aún no fija (qué funciones ejecuta `authenticated`) está en la Fase 7. El `alter default privileges … revoke`, que era opcional, no se ha hecho: el test caza una tabla nueva que llegue con privilegios de más.

## Fase 4 · Practice Builder (cerrada)

La Fase 4 recogió su bloque entero y, del que la Fase 3 le dejó al cerrar (llegó cuando su plan ya estaba escrito), lo que tenía que ver con las sesiones o era barato. Lo que sigue pendiente está en los bloques «Lo que deja la Fase 4» de las fases 5, 6 y 7 y en «Pulido de la biblioteca», en la Fase 7.

Hecho, del bloque que tenía:

- (de la Fase 2) El generador de tokens falla con un alias desconocido y valida la forma de `tokens.json` (`validateTokens`, en `scripts/tokens-to-css.ts`).
- (de la Fase 2) Convención única de medidas: token, escala de Tailwind y literal con unidad solo en tipografía (`design/README.md`, «Espaciado y layout»). Con ella dejan de estar pendientes los `min-h-8` de `drill-sections.tsx` (escala) y las dos medidas del bloque de Standard y del chip (tipografía).
- (de la Fase 2) `check:guards` comprueba los colores hex y las medidas entre corchetes en los `.tsx` de `src/` (regla 4). Lo que no mira está en la Fase 7.
- (de la Fase 2) `ListRow` es un `<li>` y va dentro de `<Card variant="flush" as="ul">`; está documentado en `design/README.md` y en `design/components/ListRow/README.md`.
- El plan va atado al equipo y al tipo de su evento: clave foránea de cuatro columnas (`practice_plans_event_fkey`) y `check (event_id is null or team_id is not null)`. Con ella queda cerrado también el lado de los planes de la regla de `kind`: un plan no cuelga de un partido.
- Una sola regla de cuerpo técnico, `private.is_team_staff`: `can_see_person`, `can_see_plan` y la nueva `can_manage_team` la llaman.
- `practice_plans.created_by` es `on delete set null`: borrar la cuenta de un autor ya no falla.
- El fin de «Esta semana» en Inicio ya no se corre una hora donde el cambio de hora cae a medianoche (`build-home.ts`, con su test en `America/Santiago`), y `src/lib/time.ts` rechaza un ISO sin `Z` ni desfase.
- `PracticeCard` dice el equipo en su cabecera («Próximo entrenamiento · Alevín A»).
- Decidido, y pendiente de confirmar: el autor de un plan de equipo deja de verlo al dejar su cuerpo técnico (ver «Decisiones de producto a confirmar»).

Hecho, de lo que dejó la Fase 3 para el principio de esta fase:

- Protección contra perder lo escrito con `ConfirmDialog`: `DrillForm`, `SectionEditor` y el constructor usan `useLeaveGuard` (`src/ui/leave-guard.tsx`). Cualquier enlace de la app, también el «Volver» de la cabecera y la navegación inferior, abre «¿Salir sin guardar?». Ya no hay `window.confirm` ni `src/lib/unsaved-changes.ts`. Con ello queda cubierto el punto de iOS: `beforeunload` sigue sin preguntar en iOS Safari al cerrar la pestaña, pero los enlaces sí preguntan. Lo que no cubre (el botón «atrás» y el gesto de volver) está en «Decisiones de producto a confirmar».
- El trabajo `checks` de CI tiene 20 minutos (`.github/workflows/ci.yml`).
- Inicio usa el `throwReadError` común (`src/modules/home/queries.ts`).
- `restoreSeed` borra `practice_items` antes que `drills`, y con ellos las sesiones que no son del seed.
- Los tres ejercicios nuevos del seed conviven con los e2e de la Fase 3, que hubo que ajustar: uno de ellos, «Bloqueo y rebote 3x3», casa con `focus=rebote&age=10`, así que los casos «sin resultados» de `e2e/drills-library.spec.ts` filtran ahora por `focus=rebote&q=canasta`; y `e2e/drill-detail.spec.ts` espera el botón «Añadir a sesión».

El resto de ese bloque son retoques de la biblioteca sin relación con las sesiones: pasa a la Fase 7, «Pulido de la biblioteca (lo dejó la Fase 3)».

## Fase 5 · Live Practice (cerrada)

Estado: tareas 1–14 hechas. Hecho y verificado: el cronómetro y el reductor de estado live (`useLive`, `use-wake-lock`, `Timer`, `LiveControls`); la pantalla Live con precarga de diagramas, progreso por ítem, pausa y avance; «Iniciar entrenamiento» en el detalle y en Inicio; la PWA (manifiesto, service worker con Serwist, página sin conexión, `clearLiveData` al cerrar sesión); el seed con la sesión de hoy (`todayLive`); e2e de Live en el proyecto `admin` (inicia, avanza, recarga, sin conexión, termina con confirmación, aislamiento de equipo, sin Wake Lock API). `lint`, `typecheck` y `check:guards` limpios; unidad 3714/3714 (158 ficheros), `TZ=UTC` también. Pendiente de verificación con `supabase db reset`, `pnpm seed` y el resto de la suite desde una base vacía (Task 14, paso del propietario). Revisión en dispositivos físicos en la pista pendiente.

Pendientes conocidos que deja esta fase:

- La URL firmada del diagrama caduca a los 10 minutos (`signedUrl(path, expiresIn = 600)`): una pantalla de Live abierta mucho rato o sin conexión la pierde. Decidir cómo se piden o se cachean los diagramas de la sesión.
- La ficha dice «Pista sin diagrama» cuando la URL firmada de un diagrama enlazado ha caducado y la imagen no carga (`CourtDiagram` cae a la pista vacía). En Live eso sería engañoso.

**Lo que deja la Fase 4 (primeras tareas de esta fase):**

- `PracticeForm` en modo crear (`/train/new`; `train/_components/practice-form.tsx`) no tiene aviso de salida. Es el único formulario de la pestaña Entrenar que todavía pierde lo escrito con un toque en la navegación inferior. Le falta `useLeaveGuard(dirty)` y su `LeaveGuardDialog`, como en el constructor. Se dejó fuera porque el formulario es corto (ocho campos) y la fase solo admitía una tanda de arreglos.
- **Los ítems nuevos no reciben su `id` tras guardar.** `savePracticeItems` devuelve solo `updatedAt`, y el constructor (`toItem`, en `train/_components/practice-rows.ts`) vuelve a mandar sin `id` los ítems que se añadieron en esa visita: cada guardado siguiente los borra y los vuelve a crear con otro id. Hoy no se nota. Con Live sí: un ítem recreado pierde `completed` y `actual_minutes`, y cualquier estado que guarde ids de ítems (`LiveItem.id`, lo que se guarde en el dispositivo) apunta a filas que ya no existen. Arreglo: que el guardado devuelva los ítems y el constructor les ponga su `id`. Va con dos reglas del contrato entre fases: nada guarda ids de ítems a través de un guardado (C23), y toda escritura en `practice_items` mueve el `updated_at` del plan (C22).
- `insert … returning` sobre `practice_plans` da `42501` a un usuario autorizado: la política de lectura (`can_see_plan(id)`) busca por id una fila que todavía no existe. Las funciones de la Fase 4 insertan sin `returning` y leen por `event_id`, pero ningún test lo fija y la próxima función que inserte un plan puede caer en ello. Arreglo de raíz: una política de lectura escrita sobre las columnas de la fila, como `drills_select_visible`. No pasar las funciones a `security definer` para esquivarlo.
- La puerta de entrada de las funciones (sesión abierta, bloqueo del evento, bloqueo del plan y copia obsoleta) está escrita dos veces, en `update_practice_session` y en `save_practice_items` (`20261117000300_practice_functions.sql`). `record_live_progress` sería la tercera: extraerla entonces.
- `listPractices` corta cada pestaña en 50 sesiones sin decirlo (`LIST_LIMIT`, en `src/modules/practice/queries.ts`), y el `DateChip` del histórico no enseña el mes. Dirección, con varios equipos, llega a 50 en pocas semanas, y a partir de ahí el histórico parece haber perdido sesiones.
- Borrar una cuenta mueve el `updated_at` de los planes que creó o guardó (el `on delete set null` es un `update` y pasa por el trigger): quien esté editando una de esas sesiones recibe «Alguien ha cambiado esto…» sin que nadie haya cambiado nada.
- **Una respuesta perdida parece la edición de otra persona.** Si el guardado llega a la base pero su respuesta se pierde (mala cobertura en el pabellón), `useAction` dice «No se pudo guardar»; al reintentar, la copia ya es otra y sale `STALE_COPY`, y «Recargar» tira lo que se cambió desde entonces. Pasa hoy en el constructor, y la sincronización de Live trabaja justo en esas condiciones.

## Fase 6 · Equipo, jugadores y partidos (cerrada)

Estado: tareas 1–13 del plan (`docs/superpowers/plans/2026-10-09-fase-6-equipo-jugadores-partidos.md`) hechas. Hecho y verificado: «mis equipos» de esta temporada como única definición (Equipo, Entrenar, Partidos e Inicio; Inicio no filtraba por temporada); la pestaña Equipo (plantilla y ficha del jugador, sin año de nacimiento); objetivos (como mucho tres activos, también con altas en paralelo) y notas (una privada solo la lee su autor, también frente a dirección); la pestaña Partidos (lista, alta, detalle, resultado y cancelación); el aislamiento entre clubes, entre equipos y entre autores, con pgTAP, integración con sesiones reales y e2e. Verificado desde una base vacía (`supabase db reset`, `pnpm seed` dos veces, tipos sin deriva): `supabase db lint` sin errores, `lint`, `typecheck` y `check:guards` limpios, unidad 3868/3868 (también con `TZ=UTC`), `test:db` 1388/1388, `test:int` 67/67 y `test:e2e` 126/126. Repaso en el navegador a 375×812 con Álex y Raúl (Equipo, ficha con objetivos y notas, Partidos con alta, detalle y cancelación); Irene, Nora y Marta, por e2e.

Lo de este bloque que venía de antes, resuelto:

- El próximo partido se pide aparte del límite de 30 eventos de Inicio.
- «Mis equipos» = temporada actual, con una temporada pasada en el seed que lo prueba con datos reales.
- `GameCard`: cada equipo se anuncia una sola vez y el tono del rival va por prop (`Avatar tone`).
- Un partido no cuelga de un entreno ni un evento cambia de tipo (clave compuesta con `event_kind`). De paso se cerró un hueco de la capa de políticas: el `using` de entrenos y el `with check` de partidos dejaban convertir un evento de tipo (lo paraba el privilegio por columnas).
- Un entreno sin plan ya no se lista (ni en Entrenar ni en Inicio): su detalle era un 404.
- Las filas de «Esta semana» van a su pantalla con un `switch` exhaustivo.
- «Aún no estás en ningún equipo» ya no se lo dice a dirección en Entrenar.

Lo que deja la Fase 6:

- **Inicio de dirección.** Sigue contando solo los equipos que la persona entrena: a dirección sin equipos le dice «Aún no estás en ningún equipo». Va con la Inicio de dirección de la Fase 7.
- **Familias y jugadores.** Las políticas de objetivos y notas no dan lectura a cuentas de jugador ni de familia ([D6]); se añadirá con `guardianships` (Fase 7) y la decisión 13 de la spec.
- La lista de equipos de dirección no enseña cuántos jugadores tiene cada uno (el plan lo decía); haría falta contar la plantilla en la consulta.
- `pnpm dev` no arrancaba desde la Fase 5 (Serwist y Turbopack): arreglado (`next dev --webpack`).
- El nombre del autor de una nota sale de `coach_notes.author_person_id`, que pone un trigger desde la membresía. Si una persona cambia de ficha, sus notas viejas siguen con la anterior.

## Fase 7 · Gestión y cierre

- (de la Fase 2) Un usuario de seed con dos clubes y su test: hoy nada fija el `organizations!inner(` de la consulta de contexto ni la lista del selector. Con él, «cambiar de club» en el menú de cuenta, que ningún plan añade.
- (de la Fase 2) Política única de «quién es el usuario» y de errores de Auth en `guards.ts`: hoy hay tres (`session.ts`, `tenancy/queries.ts`, `select-club/page.tsx`). Añadir `.retry(false)` a la consulta de contexto: los reintentos de postgrest-js retrasan unos 7 s la pantalla de error.
- **Sesión cerrada con un editor abierto** (por ejemplo, tras «Salir» en otra pestaña). Comprobado en el navegador el 4 oct 2026: al guardar, el proxy responde 307 a `/login` a la petición de la acción, el navegador la sigue como un POST a `/login` y Next no reconoce la respuesta. El editor dice «No se pudo guardar. Inténtalo de nuevo.» y reintentar no sirve. No tiene arreglo local: o el proxy deja pasar sin sesión las peticiones que no son GET, para que conteste la propia acción (hoy las corta a propósito, y tiene su test en `session.test.ts`), o `requireClub` distingue «sin sesión» de «sin acceso» y lleva al login, que es la política única de arriba. Decidirlo con ella. Lo que sí está resuelto: si la acción responde con `notFound()` o con una redirección propia, el editor no lo convierte en «No se pudo guardar» (con el acceso revocado se ve el 404).
- (de la Fase 2) Campo de código que tolere pegar con espacios; botón primario del login y del 404 con `CTAButton`; etiqueta «The Way» por defecto definida una sola vez (hoy está en `tenancy/navigation.ts` y en `tenancy/queries.ts`).
- (de la Fase 2) Usar `useSelectedLayoutSegment` en el `error.tsx` de `(app)`.
- (de la Fase 2) Formateador de código y versión de Node fijada (`engines` o `.nvmrc`; CI usa 24).
- `organizations.status = 'suspended'` no corta el acceso. La zona horaria del club no se valida.
- Fixtures de la matriz RLS: admin y entrenador sin persona, usuario sin membresías.
- Coste de las políticas con función por fila y avisos del asesor de Supabase (FKs compuestas sin índice).
- Login: tope de tiempo en la verificación, mensaje distinto para 429 y 5xx (hoy todo es «código no válido»), nivel de log de los eventos esperados, foco tras un código erróneo.
- **Límites de Auth.** Todas las peticiones salen de la IP del servidor: unas 30 verificaciones en 5 minutos son compartidas por todos los usuarios. Activar CAPTCHA en Supabase Auth exige código (widget y `captchaToken` en las dos acciones). Planificar un límite propio en la app o subir los límites.
- Enumeración directa de emails contra `/auth/v1/otp` de Supabase con la clave pública: no se arregla en `src/`.
- Cabeceras de seguridad, `noindex`, `global-error.tsx`, validación de variables de entorno.

**Lo que deja la Fase 3 (matriz RLS, revisión de seguridad, axe):**

- Fotos de personas (`people.photo_media_id`): traen sus propias políticas de Storage y su función de ruta, atadas a la visibilidad de la persona y al consentimiento. Hoy nada fuera de `org/{org}/drills/{drill}/` se puede leer, y `media_assets_insert_own` y `MediaFolder` son solo de ejercicios.
- La lógica de consentimiento no puede fiarse de `contains_minor` para la carpeta `drills/`: toda subida de diagrama queda con `false` y no hay forma de marcarla (ver «fotografías como diagrama», más abajo).
- Fixture de `guardian` en la matriz de la biblioteca: `drills.test.sql` no tiene ninguno.
- Endurecer el alta: `INSERT` en `drills` es a nivel de tabla, así que `id`, `created_at` y `updated_at` los elige el cliente al crear (solo un miembro del cuerpo técnico llamando a PostgREST a mano, sin efecto entre clubes).
- `equipment`: sus elementos no tienen longitud máxima, ni en la tabla ni en Zod.
- `search_drills` no limita la longitud de `p_q` (la app lo trunca a 80) y su rama de prefijo del título no usa el índice GIN: bien a escala de club.
- `video_url`: los tests no fijan `$`, `\S` ni la forma `https://youtube.com@host/x`, y el enlace de «Ver vídeo» no pasa por `safeHref` al pintarse (la única barrera es el CHECK de la base de datos).
- `bodySizeLimit: "3mb"` de `next.config.ts` vale para todas las Server Actions, incluida la del login sin sesión. Una ruta de subida propia lo acotaría.
- Observabilidad de los errores de Storage (`logError` omite `statusCode`; un 403 sale como `NOT_FOUND` sin log; `discardUpload` no avisa si no borró nada) y mover `fromStorageError`, `discardUpload` y `previewUrlOf`, que son genéricos de medios, a `src/modules/media`.
- Limpieza de objetos y fichas de `media_assets` huérfanos tras sustituir o abandonar una subida (el plan de la Fase 3 los dejó «Fuera»).
- `getRelatedDrills` lee como mucho 1.000 filas por título para repartirlas: por encima, los principios cuyos ejercicios ordenan tarde dirían «Aún no hay ejercicios con este principio» sin que sea cierto.
- El e2e del 404 opaco compara solo el texto de `main`: comparar también `response.status()` y el título de la página.
- Accesibilidad (axe): el chip de `FilterSheetChip` con valor se llama solo «U12» (se pierde «Edad») y tiene `aria-pressed` y `aria-haspopup` sin `aria-expanded`; el chip de principio activo se llama «Quitar filtro de principio» sin el título (WCAG 2.5.3); «Ver todos en la biblioteca» se repite por principio sin contexto que los distinga; «Ver vídeo» no avisa de que abre otra pestaña; en un fallo de la ficha el mismo mensaje probablemente se lee dos veces (alerta y descripción del botón); la fila de chips da un salto horizontal al hidratar en una carga completa.

**Pulido de la biblioteca (lo dejó la Fase 3):**

Lo que la Fase 3 dejó para el principio de la Fase 4 y la Fase 4 no recogió: retoques de la biblioteca sin relación con las sesiones. Los dos últimos puntos los añade el cierre de la Fase 4.

- `ClubContext` lleva el id del usuario: hoy `getDrill` hace un segundo `getClaims()` por ficha solo para saber `createdByMe`.
- Andamiaje compartido para los tests de acciones (se ha copiado entre `methodology/actions.test.ts`, `drills/actions.test.ts` y `mutate.test.ts`) y para los e2e: `CAN_WRITE`, `targetIsLocal` y `expectFullyInRow` están copiados entre specs (ver también «Tests», en «Lo que deja la Fase 4»).
- Los límites del formulario de ejercicios (`maxLength`, topes de puntos y variantes) están duplicados entre `src/modules/drills/schema.ts` y `drill-form.tsx`: una sola fuente, como el `limits.ts` del módulo de sesiones.
- Estado de espera de la lista de la biblioteca: con latencia real el chip cambia al momento y `aria-busy` está solo en la barra, no en la lista. Dos clases (`peer` en la barra, `peer-aria-busy:opacity-…` en la lista) bastarían.
- La lectura de ejercicios relacionados va en serie tras la sección de principios y, si falla, tumba la sección entera para el cuerpo técnico: que su fallo no se lleve The Way.
- La hoja de «Archivar» no se puede cerrar mientras corre la acción y no dice «Archivando…».
- «Quitar diagrama» no limpia un error de subida anterior del servidor.
- `/drills` llama a `getPrinciples(ctx)`, que carga todos los principios con sus puntos, solo para sacar el título del filtro de principio activo.
- `createDrill` no es idempotente: una respuesta perdida con mala conexión y un reintento crean un segundo borrador, y un entrenador no puede borrar ni archivar el suyo.
- Tras publicar dirección un borrador que su autor está editando, el autor recibe `STALE_COPY`, pulsa «Recargar» y cae en el 404 opaco de la URL de edición. Es correcto según las reglas, pero confunde: redirigir a la ficha.
- En `DrillForm`, lo que se escribe mientras un guardado está en curso se pierde si el guardado acaba bien: el propio formulario navega a la ficha con `router.push` (`drills/drill-form.tsx`), y un cambio de ruta hecho por código no pasa por el aviso de salida. Es anterior a la Fase 4 y sus tests fijan ese comportamiento tal cual.
- Ningún e2e cubre el diálogo «¿Salir sin guardar?» del formulario de ejercicios: solo tests de unidad y una comprobación a mano en el navegador. El del constructor sí lo tiene (`e2e/practice-builder.spec.ts`).

**Lo que deja la Fase 4:**

- Base de datos, para la revisión de seguridad:
  - Un ítem puede enlazar un ejercicio que quien lo escribe no ve (el borrador de otro entrenador) si conoce su uuid: las políticas de `practice_items` no miran `drill_id`. Endurecer con `drill_id is null or private.can_see_drill(drill_id)` en el alta y en el cambio. La interfaz no lo ofrece (`findDrills` y `addDrillToPractice` solo dan publicados) y el detalle no enlaza lo que no se ve (`drillVisible`); queda quien llame a mano a `savePracticeItems` o a la API.
  - `char_length(title) between 1 and 80` admite un título de solo espacios, en `practice_plans.title` y en `practice_items.title_override`. Zod lo recorta; por la API directa pasa.
  - `posture.test.sql` no fija qué funciones puede ejecutar `authenticated` (en especial las `security definer`), ni las secuencias, ni `relforcerowsecurity`.
  - Un `id`, un `drill_id` o unos `minutes` malformados dentro de un elemento de `p_items` dan `22P02` o `22003`, no `INVALID` (`save_practice_items`). La acción los para antes con Zod; por la API directa sale un error fuera del contrato.
  - No hay test automático de concurrencia para las funciones de sesión: el bloqueo del evento y el del plan se comprobaron a mano, con dos sesiones de `psql`. Falta un test de dos conexiones en `test:int`.
  - `listPractices` interpola `nowIso` en un `.or(...)` de PostgREST sin validarlo (`src/modules/practice/queries.ts`). Hoy es siempre `new Date().toISOString()` del servidor: ninguna página debe pasarle un valor que venga de la petición.
  - Coste de la lista (estimado, sin medir): la política de `events` ejecuta dos funciones por fila antes de ordenar y cortar, cada sesión listada paga `can_see_plan` por su plan y otra vez por cada ítem embebido, y el histórico no tiene suelo de fecha, así que crece toda la temporada, sobre todo para dirección. `EXPLAIN ANALYZE` con una temporada realista. Va con «Coste de las políticas con función por fila», de arriba.
- Código repetido, en una pasada:
  - **Un solo gancho para «la última copia guardada».** `PracticeBuilder` y `PracticeForm` llevan `dirty` con dos fuentes de verdad (la copia guardada, en estado, y `latest`, un ref que se pone al día en un efecto): una ventana teórica de milisegundos. `DrillForm` y `SectionEditor` repiten la misma mecánica. Un gancho compartido lo arregla en un sitio. Con él, lo que venía de la Fase 2: `SectionEditor` lleva su propio estado de «guardado» y su región de estado al lado de `useConfirmation` y `EditorForm` (`editor-shell.tsx`), que hacen lo mismo para los otros tres editores, y el margen `empty:-mt-(--space-5)` de esa región tiene que coincidir a mano con el `gap` del formulario.
  - `Embedded<T>` y `one()` están copiados en `tenancy/queries.ts`, `home/map-rows.ts` y `practice/map-rows.ts`, y el mismo desempaquetado va en línea dos veces en `practice/actions.ts` (`findPractice` y `readPracticeToExtend`): uno solo, en `src/lib`.
  - `FIELD_SEPARATOR` está tres veces (`src/lib/time.ts`, `home/build-home.ts`, `practice/format.ts`) y «Entrenamiento sin plan», dos (`home/build-home.ts`, `practice/map-rows.ts`).
  - `confirm-dialog.tsx` repite de `bottom-sheet.tsx` cómo encuentra el contenedor del club y cómo devuelve el foco a quien lo abrió: un gancho común.
  - Las pestañas de `practice-list.tsx` copian las clases de los chips de `ui/filter.tsx`; la etiqueta de objetivo está escrita en `practice-card.tsx` y en `practice-summary.tsx`; y la fila-botón de `add-to-practice.tsx` copia la forma de `ListRow`.
  - `PracticeItemView` tiene una prop `phase` que solo recibe `null` (`train/[eventId]/page.tsx`: la fase la dice la cabecera del bloque).
  - La página de editar (`train/[eventId]/edit/page.tsx`) lee los objetivos del club dos veces (el `getFocusAreas` privado de `practice/queries.ts` y el de `drills/queries.ts`) y los equipos, que en modo editar no se usan.
  - La ficha de un ejercicio publicado ejecuta `listPractices` en cada carga, se abra o no la hoja «Añadir a sesión» (`drills/[drillId]/page.tsx`): pedirlas al abrir la hoja.
- Interfaz y accesibilidad:
  - Tras «Salir sin guardar», `useLeaveGuard` deja quitadas sus tres protecciones (el aviso de la pestaña, los clics en enlaces y `guard`) hasta que `dirty` pase por falso (`src/ui/leave-guard.tsx`). Si un destino dejara la pantalla montada (un enlace a la misma ruta con otra query, una descarga), el formulario, aún con cambios, se quedaría sin aviso. Hoy ninguna de las tres pantallas que usan el gancho tiene un enlace así; si llega uno, hay que volver a armar los avisos.
  - El foco de teclado puede quedar debajo de la barra fija de «Guardar sesión» (WCAG 2.2, 2.4.11): `scroll-padding-bottom` en el contenedor que se desplaza. Y los errores de una fila que no tienen campo propio (los minutos, el título de un ejercicio) no están asociados a ningún control (`train/_components/practice-row-editor.tsx`).
  - En «Histórico» vacío y con permiso hay dos botones principales: «Nueva sesión», arriba, y «Ver próximas», en el aviso. El arreglo es una variante secundaria para la acción de `EmptyState`.
  - `findDrills` pasa por el tope de 100 de `searchDrills` antes de quitar lo que no está publicado: para dirección, los borradores ocupan hueco, y el selector no avisa de que la lista está cortada.
  - El formulario de la sesión no refleja la normalización que provoca: un objetivo secundario elegido sin principal se guarda como principal, y el formulario lo sigue enseñando como secundario hasta recargar (`practice-form.tsx`).
- Guards y diseño:
  - Los guards de hex y de medidas solo miran `.tsx` (`scripts/check-guards.sh`): una clase escrita en un `.ts` no se comprueba. El de medidas solo conoce `px`, `rem`, `em` y `%`: `min-h-[50vh]` pasa. Y el de hex marca, en código, una entidad numérica (`&#8212;`) o un ancla con forma de color (`#add`).
  - `design/`, que es la fuente de verdad visual, no recoge lo que la fase añadió. No hay variante `danger` en `design/components/CTAButton` ni en `bundle.css`, ni vista previa de `ConfirmDialog`, del diálogo de salida ni de `PracticeSummary`. «Fecha y datos» es un desplegable hecho a mano en el editor: el sistema no tiene un componente para eso. Y las notas de uso de `shadow-sheet` («solo hojas inferiores y la barra del Live Mode») y de `scrim` («velo sobre fotografía») en `design/tokens.json` son más estrechas que el código: `ConfirmDialog` usa los dos y la fila que se arrastra, la sombra.
- Tests:
  - Los e2e siguen copiando su andamiaje: `targetIsLocal` y `CAN_WRITE` están en cinco sitios (`admin.spec.ts`, `drill-detail.spec.ts`, `drill-editor.spec.ts`, `way.spec.ts` y `e2e/helpers/train.ts`), `hydrated` en dos y `expectFitsMobile` en tres. Los specs de Entrenar ya comparten `e2e/helpers/train.ts`: llevar a un helper común los demás.

## Lista para la Task 12 (entorno remoto)

Hecho (todo en el repo; el detalle operativo está en el README, «Entorno remoto»):

- Región decidida: Supabase en `eu-west-1` (Irlanda) y funciones de Vercel en `dub1` (Dublín), fijadas en `vercel.json`.
- Las tres migraciones de la Fase 1 están aplicadas en el remoto con las mismas versiones que `supabase/migrations/`. `supabase/seed.sql` (esquema `tests`) no se aplicó y no debe llegar al remoto: nada de `db push --include-seed` ni `db reset --linked`.
- `playwright.config.ts` admite `BASE_URL`: con ella no arranca la app. Si `BASE_URL` es remoto y el Supabase del runner es local o falta, el arranque global falla antes de que corra ningún test. `VERCEL_AUTOMATION_BYPASS_SECRET` es opcional, para previews protegidas: el fixture `protectionBypass` (`e2e/helpers/test.ts`) lo envía solo en las peticiones al origen de `BASE_URL`, nunca a localhost.
- Comprobado: `auth.admin.generateLink` crea el usuario cuando no existe. `loginAs` comprueba ahora que el usuario existe antes de tocar la página, y `generateLoginCode` otra vez junto a `generateLink`; si no existe, falla pidiendo sembrar ese entorno. Ningún e2e crea cuentas, tampoco en local.
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
- Secreto de bypass de Vercel: Chromium reenvía las cabeceras que cambia una ruta de Playwright a las redirecciones de esa petición, también a otro dominio (comprobado; la documentación de Playwright dice lo contrario), y Playwright no vuelve a pasar la redirección por la ruta. Con un secreto incorrecto, la protección redirige a vercel.com y esa petición lo lleva. Con uno válido no pasa. Si alguna vez preocupa, validar el secreto con una petición previa en el arranque global.
- **«The destination stream closed early» en el log del servidor.** Salió en algunas pasadas de los e2e de la Fase 4 (en 3 de 9, sin que fallara ningún test) y se diagnosticó antes de cerrar. No es un defecto de la app y no hay nada que arreglar.
  - Qué lo emite: en este Next, una navegación de cliente pide una respuesta RSC que el servidor va pintando por partes. Si el cliente suelta esa respuesta cuando al servidor aún le quedan componentes por pintar, React aborta el render con ese mensaje. Next lo registra como error porque solo reconoce un corte del cliente por el nombre del error (`AbortError`, `ResponseAborted`), y este es un `Error` sin nombre propio.
  - Qué significa: alguien cerró la pestaña o navegó a otra parte a mitad de un render. No se pierde nada (era una lectura), y producción lo registrará cada vez que pase.
  - Cómo se comprobó: se reprodujo a propósito cortando peticiones RSC a mitad (31 de 34 cortes dejaron la línea) y con un control: las mismas peticiones, sin cortar, no la dejaron nunca. Cortar la carga de un documento HTML tampoco la produce. Ningún código de la app lanza.
  - Qué queda sin probar: qué test de los e2e lo dispara (por descarte, uno de `drills-library.spec.ts` que acaba justo después de volver a «Entrenar», mientras su respuesta sigue llegando; en las pasadas del diagnóstico la línea no salió sola ni una vez) y por qué empezó a verse al fusionar la Fase 3 (lo probable: más tests en paralelo). Ninguna de las dos cosas lo convierte en un defecto. Si se quiere el log de los e2e limpio, ese test puede esperar al contenido de «Entrenar» antes de acabar.
- Cada pasada de los e2e deja una vez en el log del servidor `[auth.request-code] AuthApiError status=422 code=otp_disabled`: es el login por invitación respondiendo a un email que no existe. Camino esperado, registrado como error (va con «nivel de log de los eventos esperados», en la Fase 7).
- `CLAUDE.md` dice que `pnpm check:guards` comprueba las «reglas 2, 3 y tokens sincronizados». Desde la Fase 4 comprueba también la regla 4 (ni colores hex ni medidas entre corchetes con unidad en los componentes) y, desde la revisión de la Fase 2, que cada página de Gestión se exporta con `adminPage`. Esa línea la cambia el propietario: `CLAUDE.md` no se edita en el cierre de una fase.
- **CI, tras la Fase 4.** La suite de unidad es más del doble que la de `main`, y todo lo verificado en la fase es local. El trabajo `checks` (lint, tipos, guards y unidad) tiene ahora 20 minutos de tope en vez de 10. La primera ejecución del PR de la Fase 4 (Dkalds/Club-OS#7) tardó 2 minutos en `checks` y 5 y medio en `e2e`, y falló en dos sitios que en local pasaban:
  - `zonedDateTimeToIso` dependía de la zona del servidor: con la hora que se repite al volver al horario de invierno daba la primera ocurrencia en una máquina en Madrid (donde se desarrolla) y la segunda en una en UTC (CI y producción). Corregido: se calcula con los desfases de la zona, y el test de independencia de la zona del dispositivo cubre ya ese caso. Los tests de unidad locales corren en la zona de quien desarrolla: antes de cerrar una fase, `TZ=UTC pnpm test`.
  - El e2e del arrastre con el dedo (`practice-builder.spec.ts`) recolocaba la página y leía `scrollY` cuando aún se estaba desplazando; en CI acababa 16 o 32 px más abajo. Corregido en el test: espera a que el desplazamiento esté quieto. No se pudo reproducir en local (Windows), ni con el hilo principal frenado.
- **Otras ayudas de hora con la hora que se repite.** `addLocalDays`, `nextWeeklySlot` y `startOfLocalDay` (`src/lib/time.ts`) mueven la fecha con los métodos de `TZDate`, que resuelven una hora repetida pasando por la zona del servidor: en UTC dan la segunda ocurrencia y en Madrid la primera. Solo afecta a algo programado entre las 02:00 y las 02:59 del día en que se atrasa el reloj (duplicar a la semana siguiente una sesión a esa hora). Mismo arreglo que `zonedDateTimeToIso`: calcular con `tzOffset`.

## Decisiones de producto a confirmar

- **Lo que deja la Fase 6.** El plan se aprobó con [D1]–[D10]; esto es lo que se decidió al ejecutarlo y no estaba escrito:
  - **Las entrevistas con otros clubes** (spec, riesgos de producto) no se hicieron antes de la fase: se asumió el riesgo.
  - **Lograr un objetivo también pide confirmación**, no solo archivarlo: los dos son irreversibles y un toque accidental en el móvil es fácil.
  - **Con un solo equipo, Equipo enseña la plantilla en `/team`** en vez de redirigir a `/team/[id]`: así «volver» no lleva a la misma pantalla.
  - **Al borrar la cuenta de un entrenador se borran sus notas** (`on delete cascade`), también las del cuerpo técnico; sus objetivos se quedan sin autor.
  - **Las notas del rival las ve el cuerpo técnico y dirección**, como el resto del partido; no hay notas de partido privadas.
  - **La hora propuesta para un partido nuevo es las 10:00** del día siguiente, y dura 90 minutos ([D9]).
  - **El copy nuevo no lo ha validado producto.** Entre otros: «Este jugador ya tiene 3 objetivos activos. Marca uno como logrado o archívalo para añadir otro.», «Este partido está cancelado y no se puede cambiar.», «¿Marcar como logrado?» / «Pasará al historial con la fecha de hoy. No se puede deshacer.», «¿Borrar esta nota?» / «Se borrará para siempre.» y «Aún no hay equipos esta temporada».

- Una cuenta de jugador con ficha en la plantilla no puede leer su propio equipo ni su plantilla (políticas del plan). Sin interfaz en el MVP.
- Dirección sin equipo ve en Inicio «Cuando dirección te asigne un equipo…». Hasta la Fase 7 no hay otra Inicio para dirección.
- Con Auth caído, el proxy lleva a `/login` en vez de mostrar la pantalla de error. Con la base o PostgREST caídos sí se ve la pantalla de error.
- Las cookies de sesión son `httpOnly` y `Secure`. La app no tiene cliente de Supabase en el navegador y la Fase 5 debe sincronizar por `POST /api/live-progress`.
- En tests de `src/` quedan nombres de persona y títulos de sesión de las vistas previas del diseño («Álex Prieto», «Transición + rebote defensivo»). La guarda cubre la identidad de los clubes, no esos ejemplos.
- **Lo que deja la Fase 4.** El plan de la fase se escribió y se ejecutó sin que el propietario lo revisara antes, así que nada de esto está confirmado:
  - **Dirección escribe las sesiones de cualquier equipo; la spec (§5) dice que las lee.** El contrato entre fases decía «admin o staff del equipo» y se implementó así (`private.can_manage_team`). No toca el aislamiento entre clubes ni entre equipos. Si dirección solo debe leer: una migración pequeña (que `can_edit_plan` y el alta de planes pidan ser del cuerpo técnico del equipo), sus tests y esconder las acciones a quien no lo es.
  - **El botón «atrás» y el gesto de volver no preguntan antes de salir del constructor**, y nada se guarda hasta «Guardar sesión»: cinco ejercicios elegidos se pierden con un gesto. En un móvil es la salida accidental más probable, y toca el primer riesgo de producto de la spec (que montar una sesión no cueste más que el papel). Los enlaces, la navegación inferior y cerrar la pestaña sí preguntan. Lo cubriría un borrador en `sessionStorage` o guardar solo.
  - **Una sesión hecha o cancelada es de solo lectura y no se restaura.** Cancelar no se deshace desde la app (la salida es duplicarla), y una sesión ya hecha no se puede corregir. Se decidió así para proteger el histórico que usará la cobertura.
  - **Las plantillas no tienen interfaz.** La spec da al entrenador «sus plantillas»; un plan sin equipo no lo crea ni lo edita ningún usuario. «Duplicar» cubre el caso de repetir una sesión.
  - **Quien creó un plan de un equipo y deja su cuerpo técnico deja de verlo.** Los planes de un equipo son de su cuerpo técnico, no de quien los escribió. Lo contrario es una línea de `can_see_plan`.
  - **Los datos de la sesión y sus ejercicios comparten una sola versión.** Dos entrenadores que editan mitades distintas de la misma sesión (uno la hora, otro los ejercicios) chocan: el segundo recibe «Alguien ha cambiado esto…». «Añadir a sesión» desde la ficha de un ejercicio invalida también un constructor abierto en otro móvil.
  - **La regla 8 (qué/por qué) se cumple en el detalle de la sesión, no en las filas.** El detalle enseña los objetivos y los Standards de sus ejercicios; las filas de la lista de Entrenar y las del constructor, ninguno. Es lo mismo que hacen las filas de «Esta semana» desde la Fase 1, pero es una lectura estrecha de una regla que no se negocia.
  - **Dos cabeceras distintas en la pestaña Entrenar.** Las pantallas de ejercicios llevan la cabecera de detalle («‹ Ejercicio … Editar», sin la de marca); las de sesión, la de marca y un enlace «Entrenar» debajo. Quien va de un ejercicio a una sesión ve cambiar la cabecera de forma. Hay que elegir una (convención C18 del contrato).
  - **El copy nuevo no lo ha validado producto.** Entre otros: «Sesión sin ejercicios» / «No se añadieron ejercicios a esta sesión.», «Aún no estás en ningún equipo» / «Cuando dirección te asigne un equipo, podrás crear sus sesiones.», «Has quitado {título}.», «Editar {título}», «Esta sesión ya está cerrada y no se puede cambiar. Duplícala para reutilizarla.», «¿Cancelar esta sesión?» / «Dejará de salir en Inicio y en Próximas. Seguirá en el histórico.» y «¿Salir sin guardar?» / «Tienes cambios sin guardar. Si sales, se pierden.».
  - Del repaso visual a 375 px: en la lista de Entrenar el título y el subtítulo se cortan con puntos suspensivos, y con varios equipos (dirección) el subtítulo empieza por el equipo y ya no llega a enseñar el lugar. Y el 404 de una sesión ajena ofrece «Volver a tus clubes», no volver a Entrenar.

# CLUB OS · Pendientes que deja la Fase 2

Lo que las revisiones de la Fase 2 dejaron para más adelante, ordenado por cuándo conviene recogerlo. Nada de esto bloquea la Fase 2: ninguno afecta al aislamiento entre clubes, a los permisos ni a los datos.

Estado de la Fase 2: tareas 1–11 hechas y revisadas, revisión final de toda la rama y una tanda de arreglos re-revisada. Verificado contra Supabase local real y desde una base vacía: `test:db` 407/407, `test:int` 15/15 antes y después de los e2e, unidad 1435/1435, `test:e2e` 35/35, `supabase db lint` sin errores y tipos sin deriva. Pendiente: revisión en un móvil real.

## Del bloque que la Fase 1 dejó para la Fase 2

El plan de la Fase 2 se ejecutó tal como estaba escrito, sin incorporar ese bloque. Lo hecho y el reparto de lo que queda están arriba: «Fase 2 · The Way (cerrada)», «Fase 4 · Practice Builder (cerrada)», que hizo lo que ese bloque dejaba para las fases 3 y 4, y el bloque de la Fase 7.

- A medias: la etiqueta «The Way» por defecto está en `wayLabel` (`tenancy/navigation.ts`), pero el nombre por defecto de la metodología sigue aparte en `tenancy/queries.ts:51`.
- Sigue sin haber «cambiar de club» en el menú de cuenta, y `(app)/error.tsx` no usa `useSelectedLayoutSegment`.

## Corregido tras la revisión del PR de la Fase 2

La revisión del PR, ya fusionado, dejó hallazgos que se corrigieron en un PR aparte (migración `20261021000100_methodology_integrity`). Lo que una fase siguiente debe copiar de esos arreglos:

- **`update` por columna.** En las tablas de la metodología, `authenticated` solo puede cambiar las columnas que la app edita: ni `organization_id`, ni `id`, ni el slug. Una tabla nueva que los usuarios editen debe hacer lo mismo: las políticas no pueden impedir que quien administra dos clubes pase una fila de uno a otro. `drills` (Fase 3) ya lo hace, en `20261103000400_save_drill`.
- **Altas que calculan número o slug.** Leen la lista y luego insertan: el único de la tabla frena la carrera y la acción reintenta (`retryOnConflict`, en el esqueleto común de `src/lib/mutate.ts`, al alcance de cualquier módulo; lo usan las altas de `src/modules/methodology/actions.ts`). Un único que se renumera en bloque tiene que ser diferible.
- **El seed y lo creado a mano.** `pnpm seed` no borra nada: recoloca lo que choca (`scripts/seed/strays.ts`). Una tabla nueva con un único que el seed escribe necesita el mismo cuidado.
- **Páginas de Gestión.** Se exportan con `adminPage` (`src/lib/guards.ts`); `pnpm check:guards` rechaza una página de `/admin` que se proteja a mano.

## Antes de empezar la Fase 3

Piezas de la Fase 2 que las fases siguientes van a copiar o reutilizar. Más barato moverlas ahora que después de cuatro copias.

Las Fases 3 y 4 ya han pasado. Hecho en ellas:

- `useAction()` está en `src/lib/use-action.ts`: lo usan Gestión y el formulario y la ficha de ejercicios.
- La parte genérica de `mutate` está en `src/lib/mutate.ts` (Zod, `requireClub`, permiso, registro de errores inesperados, reintento de las altas que chocan con `retryOnConflict`, revalidación), parametrizada por etiqueta de log, permiso y rutas. La metodología, los ejercicios y las sesiones la llaman cada una con su envoltorio.
- `throwReadError` es una sola función, en `src/lib/read-error.ts`, y la usan también las lecturas de Inicio.

Lo que sigue pendiente pasa a la Fase 7 (limpieza), porque ya no queda un «antes» en el que hacerlo:

- Un `limits.ts` sin Zod que importen `schema.ts` y los editores de la metodología: hoy `MAX_POINTS` y los `maxLength` (40, 80, 200, 300, 500) están escritos dos veces y cada capa fija su propio literal en sus tests. El módulo de sesiones ya lo hace así (`src/modules/practice/limits.ts`); el de ejercicios tiene el mismo pendiente («Pulido de la biblioteca»).
- Argumentos opcionales de las funciones SQL: al final y con `default null`. Así el generador de tipos los marca opcionales y sobra el cast de `p_summary` (`methodology/actions.ts`), que sigue ahí. Las funciones de la Fase 3 (`save_drill`) y las de la Fase 4 ya lo cumplen; afecta a las de la Fase 6.
- Fixture de `ClubContext` para tests en un solo sitio: `tenancy/test-support.ts` ya lo ofrece, pero siguen teniendo el suyo `lib/guards.test.ts`, `lib/permissions.test.ts`, `methodology/actions.test.ts`, `tenancy/queries.test.ts`, `home/queries.test.ts` y `(app)/coming-soon.test.tsx`, y desde la Fase 3 también `lib/mutate.test.ts` y `drills/actions.test.ts`. Lo mismo para los fixtures de pgTAP: unas 90 líneas repetidas entre `methodology.test.sql` y `methodology_functions.test.sql`; un helper en `supabase/seed.sql` ahorra la copia a cada fase.
- E2E del proyecto `admin`: `e2e/admin.spec.ts` tiene sus helpers (`hydrated`, `field`, `title`, `openList`, `itemCard`) locales. Moverlos a `e2e/helpers/` (los specs de Entrenar ya comparten `e2e/helpers/train.ts`) y partir el spec por pantalla, sumando los nuevos a `ADMIN_SPECS`. `hydrated()` lee el marcador interno `__reactProps$` de React: una subida de versión rompería a la vez todos los tests que lo usan.

## Fase 3 · Biblioteca de ejercicios

La Fase 3 se cerró con uno de los tres puntos de este bloque hecho; los otros dos pasan al de la Fase 4, aquí abajo.

- Hecho: los enlaces con ancla dentro de la app (`StandardBadge` hacia `/way/standards#standard-NN` y los principios de la ficha de un ejercicio) tienen e2e que llegan por una navegación de cliente y comprueban que se cae en el ancla (`e2e/drill-detail.spec.ts`, `e2e/way-drills.spec.ts`).

## Fase 4 · Practice Builder (cerrada)

Hecho:

- El editor de sección ya no usa `window.confirm`: pregunta con el diálogo de la app (`useLeaveGuard` y `LeaveGuardDialog`, de `src/ui/leave-guard.tsx`, sobre `ConfirmDialog`). Con cambios sin guardar, cualquier enlace que saque de la pantalla abre «¿Salir sin guardar?»: «Volver», «Ir a los valores / principios / Standards», las pestañas de Gestión y «Volver a la app». Un clic con Ctrl o Cmd, que abre otra pestaña, ya no pregunta.

Pasa a la Fase 7 (arriba, «Lo que deja la Fase 4», «Código repetido»), porque es un refactor de la Fase 2 sin relación con las sesiones:

- Unificar el estado de «guardado» y la región de estado de `SectionEditor` con `useConfirmation` y `EditorForm` (`editor-shell.tsx`).

Sin recoger al cerrar la fase, pasan a la Fase 7 (más abajo, en su bloque): los dos que venían para la Fase 3, el de `MarkdownBody` y el de `safeHref`. Son del Markdown compartido y no tienen relación con las sesiones.

## Fase 7 · Gestión y cierre

- **Pasada de accesibilidad.** El panel de vista previa de las pestañas «Escribir / Vista previa» no recibe foco (el `tabIndex` itinerante y las flechas ya están). El botón del menú de cuenta se llama «Abrir menú de cuenta» también cuando está abierto. La pestaña activa de Gestión no se desplaza a la vista por debajo de `lg`. Los errores de campo siguen pintados después de editar. Al reordenar, el cambio de número no se anuncia. Con un error en una fila de punto, a partir de `lg` los botones se alinean con el error y no con el campo. Los enlaces dentro de un texto en Markdown miden 24 px de alto.
- **Asesor de seguridad de Supabase.** El cierre de la Fase 2 pasó `supabase db lint`, no el asesor que nombra la tarea 12. Pasado contra el proyecto remoto el 4 oct 2026, ya con las dos migraciones de metodología: sin avisos. Volver a pasarlo con cada migración que llegue al remoto.
- **Reordenar no se serializa.** `reorder_methodology` no se serializa frente a un alta: una fila creada entre la comprobación y el update conserva su `sort` y su `number` hasta el siguiente reordenado. Dos reordenados a la vez: gana el último. Un movimiento sin efecto también revalida. Aceptable con una sola persona en dirección. Las altas simultáneas ya no duplican el número ni chocan en el slug: los dos son únicos por club y el alta reintenta.
- **Rastro de errores.** `fromDbError` no registra nada; lo hacen las acciones en el punto de llamada, solo para lo inesperado. El `catch` general de `mutate` convierte cualquier excepción en `SAVE_FAILED` y `logError` solo imprime el nombre del error: un fallo de programación queda como `[methodology.x] TypeError`. Si Supabase no responde, `requireClub` lanza dentro de la acción y el formulario muestra «No se pudo guardar».
- Los mensajes por defecto de Zod, en inglés, pueden llegar a `fieldErrors` con un cliente manipulado (enums, `expectedUpdatedAt`, nulos). Los tests usan `toMatchObject` y no fijan el texto.
- Los formularios de Gestión no tienen `method`: un envío antes de que React hidrate es un GET nativo, con los campos en la URL y los cambios perdidos.
- `(app)/layout.tsx` espera el nombre de quien entra antes del primer byte, y al pasar de la app a Gestión no hay estado de carga hasta que resuelve el layout de destino.
- `delete` está concedido a `authenticated` en las cuatro tablas de metodología con `status`, sin política que lo abra (lo pide el plan: «0 filas»). Un `.delete()` perdido en la app no falla, simplemente no borra. La alternativa es no conceder el permiso y que dé `42501`.
- `reorder_methodology` tiene cuatro ramas casi iguales, una por tabla, para no usar SQL dinámico. Si llega una quinta tabla ordenable, es otra rama.
- `toContentKind` convierte en silencio un `content_kind` desconocido en «texto». `sectionSubtitle` devuelve `''` y no `null` para un resumen vacío. `listSectionsForAdmin` trae el cuerpo entero de cada sección solo para pintar la lista. El número propuesto para un Standard nuevo puede ser 100 si ya existe el 99.
- (venía para la Fase 3) `MarkdownBody` se reutiliza, ya también en la ficha de un ejercicio: un ítem de lista, un `###` o una cita que solo contengan una imagen dejan un `li`, `h3` o `blockquote` vacío (los párrafos y los enlaces ya no). Un párrafo con solo `&nbsp;` ha dejado de pintarse (`markdown-body.tsx:38` usa `trim()`).
- (venía para la Fase 3) `safeHref` deja pasar `https:foo` y `https:/ruta`, que el navegador resuelve como relativas al propio origen.

## Tests

- Tres literales del club piloto en tests nuevos de `src/`: «RESPECT», «EFFORT» y «FINISH» (`methodology/queries.test.ts`, `admin-queries.test.ts`). El guard no los detecta. Es un renombrado.
- `section-editor.test.tsx`, «guardar sin tocar nada otra vez también avisa»: no puede fallar por lo que dice su nombre, y ningún test protege el `setSaved(false)` del editor de sección. Los otros tres editores ya tienen ese test.
- El atajo de «Recargar» tras una copia obsoleta solo lo fija el test de unidad: Playwright acepta los `beforeunload` por defecto, así que el e2e «dos pestañas editan a la vez» pasaría también sin él.
- `restoreSeed` (`e2e/helpers/seed.ts`) comprueba que el Supabase es local mirando la URL del entorno, no la del cliente que recibe. Hoy solo el test de unidad le pasa un cliente.
- `scripts/check-guards.sh`: el `|| true` de la comprobación de Gestión se traga un error de lectura de `grep`, al contrario que `check_absent`.
- Los patrones de `revalidatePath` (`/c/[club]/(app)/way`, `/c/[club]/admin`) solo están fijados como cadenas. Todo bajo `/c/[club]` es dinámico, así que un patrón equivocado no se notaría hoy. Un test que compruebe que las dos carpetas existen lo ataría.
- Tests que obligan a tocarlos en cada fase: `action-result.test.ts` fija toda la tabla de copy con `toStrictEqual` y `permissions.test.ts` escribe a mano la lista de acciones.
- pgTAP de las funciones: sin aserción para `p_expected_updated_at` nulo (da `STALE_COPY`) ni para un elemento nulo en `p_points` (da `23502`, fuera del contrato). Las aserciones «nada cambió tras una llamada rechazada» no pueden fallar por sí solas.
- Seed: el test de integración de puntos deja la base sucia si falla antes de `runSeed`. `scripts/seed/data.ts` ronda las 800 líneas.
- `e2e/admin.spec.ts`: un caso depende de la longitud de las etiquetas del seed para que las pestañas desborden; hay capturas sin aserción; ningún e2e comprueba el nombre real del avatar.
- `src/lib/database.types.ts` es la salida cruda del generador, sin formatear. Un paso de formato en `db:types` haría legibles sus diffs; va con el formateador que ya pide el bloque de la Fase 1.

## Decisiones de producto a confirmar

- `#` y `##` se pintan como texto plano (solo `###` es un título) y los saltos de línea simples se juntan en un párrafo. Las dos cosas salen de la lista blanca del plan. Quien pegue un texto verá las líneas unidas. Opciones sin plugins: pintar `#`/`##` como `h3` y conservar los saltos con `white-space: pre-line`.
- Los tres valores de Arcángel están sembrados sin título: el plan da para cada uno solo código y descripción.
- Gestión no tiene menú de cuenta ni «Salir»: su marco solo ofrece «Volver a la app».
- Un slug no cambia nunca y no hay borrado: una sección creada por error conserva su URL para siempre (se puede dejar en borrador).
- Un Standard tiene el número que elige dirección y, aparte, su orden: el entrenador puede ver 01, 03, 02.
- La terminología del club se aplica a la navegación, los títulos y los enlaces de vuelta. Los recuentos («5 Standards»), el rótulo «Standard» de cada bloque y los textos de Gestión son literales.
- Valores, principios y Standards no tienen copia obsoleta: si dos personas editan el mismo, gana la última. Solo las secciones la tienen.
- Publicar y pasar a borrador no guardan quién ni cuándo.
- Las cuentas de jugador y de tutor, si entran, leen The Way: el contexto de club admite a cualquier miembro activo.
- Un borrador o una sección que no existe muestran «No encontramos esta página» con código HTTP 200 (la respuesta ya está en curso); un club ajeno sigue dando un 404 real.
- El token `header-height` (56px) entró en `design/tokens.json` sin pasar por diseño, y los componentes nuevos de la Fase 2 no tienen vista previa en `design/components/`. Dos medidas siguen fuera de tokens (el número de 40 px del bloque de Standard y el interletrado del chip): las dos son de tipografía y caben en la convención de medidas que fijó la Fase 4 (`design/README.md`, «Espaciado y layout»).
- Salir del editor de sección con cambios sin guardar avisa en cualquier enlace de la app (desde la Fase 4, también en las pestañas de Gestión y en «Volver a la app»), al recargar y al cerrar la pestaña. No avisa con el botón «atrás» ni con el gesto de volver del navegador: es la misma decisión pendiente del constructor de sesiones (primera sección de «Decisiones de producto a confirmar»).
- **Fotografías como diagrama.** Hoy `uploadDrillDiagram` acepta cualquier PNG, JPEG o WebP de hasta 2 MiB: nada distingue un dibujo de una foto de la pizarra o del entrenamiento, la ficha de `media_assets` se registra siempre con `contains_minor = false` y el JPEG conserva su EXIF (ubicación, hora, dispositivo). Con el ejercicio publicado, lo ve todo el cuerpo técnico del club. Lo único que hay delante es un texto de ayuda en el formulario («Sube solo el dibujo de la pista. No subas fotos en las que salgan jugadores.»). La regla 5 de CLAUDE.md pide consentimiento registrado para fotos de menores.
  - Se aceptó por ahora porque el plan espera ese canal (la foto de la pizarra como diagrama, Task 14, paso 3) y la exposición está acotada: bucket privado, solo cuerpo técnico, URLs firmadas de 10 minutos. Falta que Daniel lo confirme.
  - Alternativas: una confirmación explícita al subir («no salen jugadores»), o quitar los metadatos en el servidor (recodificar la imagen, con una dependencia nueva). Y, en la Fase 7, que el consentimiento nunca se fíe de `contains_minor` para esta carpeta.
- **Lo que dejó el repaso visual de la Fase 3** (a ojo, a 375 px; sin defectos claros, solo lo que puede ser cuestión de gusto):
  - Tras un guardado con errores, los campos que se corrigen conservan su aviso rojo («Elige entre 1 y 40 jugadores.» con un 4 escrito, «Elige al menos un objetivo.» con uno marcado) hasta el siguiente «Guardar». Es el diseño actual (los avisos se quitan al volver a guardar); se podría limpiar el de cada campo al tocarlo.
  - En las filas de coaching points y variantes, «Subir» y «Bajar» desactivados se pintan como un botón gris con fondo, y los activos como texto dorado sin fondo: se lee como dos estilos distintos.
  - La fila de chips de objetivo se corta contra el borde del contenedor, a 16 px del borde de la pantalla, en vez de salir de ella; el recorte sugiere que hay más, pero queda a medias («Defen»).
- **`DrillCard` no enseña ningún Standard.** El diseño y el plan solo piden la etiqueta del objetivo; la ficha sí enseña los Standards. La regla 8 de CLAUDE.md pide enseñar el porqué «en todo lo que se muestra».
- «Objetivo» nombra dos cosas distintas: el texto del objetivo de un ejercicio y los objetivos de trabajo (`focus_areas`). Los mensajes de error del formulario los llaman igual.
- La línea «Mostrando los primeros 100 ejercicios» no sugiere afinar la búsqueda, y el título largo de un principio en el chip de filtro puede dejar la × fuera de la vista.
- El título de la cabecera `detail` solo queda centrado cuando no hay acción: el hueco es de 44 px y «Editar» es más ancho.
- **Lo que la revisión final dejó sin juzgar** (alcance de producto o de fases posteriores; ninguna contradice el plan ni la spec):
  - Un entrenador no puede borrar ni archivar su propio borrador: los borradores equivocados o duplicados siguen en su lista hasta que dirección los archive. El plan no da borrado y archivar es de dirección.
  - Un ejercicio archivado no tiene camino de vuelta en la interfaz (no sale en la búsqueda y no hay filtro de estado) hasta `/admin/drills` en la Fase 7: «Publicar» en su ficha es la única vía y hay que tener la URL.
  - Dirección no tiene cola de revisión ni filtro de estado para encontrar los borradores pendientes. Plan: Fase 7.
  - Si dirección archiva un borrador que nunca se publicó, queda legible por URL para todos los entrenadores (`status <> 'draft'`). No figura en ningún sitio; sale de la regla de visibilidad del plan.
  - `publishDrill` y `archiveDrill` no llevan `expectedUpdatedAt`: dirección puede publicar una versión que no ha visto. El plan especifica un `update` de estado simple.
  - No hay paginación más allá de los 100 resultados: el plan fija `limit(100)`.
  - La edad de un ejercicio va de U8 a U18. Decisión de la spec.
  - `/train` enseña la entrada a la biblioteca, y `/drills` pinta su estado vacío, a jugadores y familias. Esos roles no tienen interfaz en el MVP y ningún dato les llega.
  - Los títulos de sección «Coaching points» y «Principios» no se configuran por club: `Terminology` solo tiene `way` y `standards`.
  - El Markdown de «Organización», escrito por un entrenador, puede llevar enlaces https externos que ve todo el cuerpo técnico. `MarkdownBody` restringe los protocolos, pero no está definido el modelo de confianza del contenido del cuerpo técnico.
  - Quedan objetos y fichas de medios huérfanos al sustituir o abandonar una subida. Plan: «Fuera».
  - Un nuevo seed sobre un demo remoto pisa lo editado en los ejercicios del seed (21 de Arcángel desde la Fase 4, y 2 de Club Demo). Es el mismo diseño que el seed de metodología de la Fase 2.
  - La búsqueda ordena por título, no por relevancia. El plan fija `order('title')`.
