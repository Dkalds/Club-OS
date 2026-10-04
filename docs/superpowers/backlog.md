# CLUB OS · Pendientes que dejan las Fases 1 a 3

Lo que las revisiones de las Fases 1, 2 y 3 dejaron para más adelante, ordenado por la fase que debe recogerlo. Nada de esto bloquea el cierre de las fases ya hechas. Cada plan de fase debería incorporar su bloque antes de empezar.

Estado de la Fase 1: tareas 1–11 hechas y revisadas. Verificado contra Supabase local real y desde una base vacía: `test:db` 208/208, `seed` dos veces, `test:int` 9/9, unidad 577/577, `test:e2e` 16/16. Task 12 (entorno remoto): la parte del repositorio está hecha (con ella, unidad 617/617 y `test:int` 11/11). Pendiente: lo que queda en los paneles (lista de abajo), primera ejecución real de CI y revisión en un móvil real.

Estado de la Fase 3: tareas 1–13 hechas y revisadas una a una, y la rama entera revisada al final, sin ningún crítico. Hecho y verificado: la biblioteca (búsqueda sin tildes, filtros en la URL, ficha, editor con diagrama, ejercicios relacionados en The Way); el aislamiento entre clubes, entre entrenadores y frente a jugadores, en la base de datos y con tests que fallan si se rompe (pgTAP, integración con sesiones de usuario de verdad y e2e); lo importante de la revisión final, arreglado o documentado en la tanda de cierre (y los menores baratos, arreglados). <!-- resultados del cierre: los rellena el cierre de fase --> Pendiente: aplicar las cuatro migraciones al Supabase remoto antes de usar la preview y de fusionar (README, «Despliegue de la biblioteca de ejercicios (Fase 3)»), una ejecución de CI en verde, la revisión en un móvil real y la decisión sobre fotografías como diagrama (última sección).

## Correcciones al texto de los planes

- **`runSeed` no está en `scripts/seed.ts`.** Vive en `scripts/seed/run.ts` con firma `runSeed(now, client?)`. `scripts/seed.ts` es solo la CLI. Los planes de las fases 2–4 dicen «Modify: `scripts/seed.ts` (`runSeed`)»: debe ser `scripts/seed/run.ts` y `scripts/seed/data.ts`.
- **`ClubContext` y `getClubContext`** están en `src/modules/tenancy/queries.ts`. El marcador de pestañas vacías es `src/app/c/[club]/coming-soon.tsx`.
- **E2E.** Los specs importan `test` de `e2e/helpers/test` y entran con `openAs` (sesión guardada por usuario). `loginAs` queda para probar el propio login. El `globalSetup` siembra y solo en local: el proyecto `admin` de la Fase 2 y cualquier `afterAll → runSeed` deben convivir con él.
- **Cada página bajo `/c/[club]` se protege sola.** Un layout no protege a sus páginas en una navegación parcial. Hoy cada página hace `getClubContext` + `notFound()`. El `requireClub` de la Fase 2 debe sustituir esa convención en todas.
- **Error frente a 404.** Una avería de Supabase lanza y llega a un límite de error; `null` y 404 quedan solo para «no existe o no eres miembro activo».
- **Storage: la spec se implementa más estricta que como está escrita.** La spec habla de políticas de Storage «sobre el primer segmento» de la ruta (el club). Se implementó por visibilidad del ejercicio: leer, subir y borrar en `club-media` siguen la regla del ejercicio de la carpeta `org/{club}/drills/{ejercicio}/`, y nada más se puede leer (con la regla del primer segmento, un jugador o un entrenador sin acceso a un borrador listaba y firmaba su diagrama). La especificación no se ha editado.
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

**Lo que deja la Fase 3 (primeras tareas de esta fase):**

- `ClubContext` lleva el id del usuario: hoy `getDrill` hace un segundo `getClaims()` por ficha solo para saber `createdByMe`.
- Andamiaje compartido para los tests de acciones (se ha copiado entre `methodology/actions.test.ts`, `drills/actions.test.ts` y `mutate.test.ts`) y para los e2e: `CAN_WRITE`, `targetIsLocal` y `expectFullyInRow` están copiados entre specs.
- `restoreSeed` (`e2e/helpers/seed.ts`): `practice_items` va antes que `drills` en `WRITABLE_TABLES`, porque `practice_items.drill_id → drills` no tiene cascade; hoy no hace falta porque ningún e2e mete un ejercicio `E2E …` en una sesión.
- Los ejercicios nuevos del seed no pueden romper lo que los e2e de la Fase 3 suponen: los tres primeros por título de cada principio (`way-drills.spec.ts`) y que `focus=rebote&age=10` no devuelva nada al otro club. Los ejercicios `E2E …` no casan con ese filtro ni son del principio `rebote` con una edad fuera de 12.
- Protección completa contra perder lo escrito, con `ConfirmDialog`: el «Volver» de la cabecera y la navegación inferior descartan un formulario largo de un toque. `DrillForm` y `SectionEditor` solo protegen el cierre de la pestaña y su propio «Cancelar»/«Volver» (con `window.confirm`), y pasan a `ConfirmDialog`.
- Los límites del formulario de ejercicios (`maxLength`, topes de puntos y variantes) están duplicados entre `src/modules/drills/schema.ts` y `drill-form.tsx`: una sola fuente.
- Estado de espera de la lista de la biblioteca: con latencia real el chip cambia al momento y `aria-busy` está solo en la barra, no en la lista. Dos clases (`peer` en la barra, `peer-aria-busy:opacity-…` en la lista) bastarían.
- La lectura de ejercicios relacionados va en serie tras la sección de principios y, si falla, tumba la sección entera para el cuerpo técnico: que su fallo no se lleve The Way.
- La hoja de «Archivar» no se puede cerrar mientras corre la acción y no dice «Archivando…».
- «Quitar diagrama» no limpia un error de subida anterior del servidor.
- `/drills` llama a `getPrinciples(ctx)`, que carga todos los principios con sus puntos, solo para sacar el título del filtro de principio activo.
- `createDrill` no es idempotente: una respuesta perdida con mala conexión y un reintento crean un segundo borrador, y un entrenador no puede borrar ni archivar el suyo.
- Tras publicar dirección un borrador que su autor está editando, el autor recibe `STALE_COPY`, pulsa «Recargar» y cae en el 404 opaco de la URL de edición. Es correcto según las reglas, pero confunde: redirigir a la ficha.

## Fase 5 · Live Practice

- La URL firmada del diagrama caduca a los 10 minutos (`signedUrl(path, expiresIn = 600)`): una pantalla de Live abierta mucho rato o sin conexión la pierde. Decidir cómo se piden o se cachean los diagramas de la sesión.
- La ficha dice «Pista sin diagrama» cuando la URL firmada de un diagrama enlazado ha caducado y la imagen no carga (`CourtDiagram` cae a la pista vacía). En Live eso sería engañoso.

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
- Tamaños sin token (`min-h-8` en `drill-sections.tsx`): ya está en la lista de la Fase 2 («convención única para tamaños y espaciados»).

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

## Decisiones de producto a confirmar

- Una cuenta de jugador con ficha en la plantilla no puede leer su propio equipo ni su plantilla (políticas del plan). Sin interfaz en el MVP.
- Dirección sin equipo ve en Inicio «Cuando dirección te asigne un equipo…». Hasta la Fase 7 no hay otra Inicio para dirección.
- Con Auth caído, el proxy lleva a `/login` en vez de mostrar la pantalla de error. Con la base o PostgREST caídos sí se ve la pantalla de error.
- Las cookies de sesión son `httpOnly` y `Secure`. La app no tiene cliente de Supabase en el navegador y la Fase 5 debe sincronizar por `POST /api/live-progress`.
- En tests de `src/` quedan nombres de persona y títulos de sesión de las vistas previas del diseño («Álex Prieto», «Transición + rebote defensivo»). La guarda cubre la identidad de los clubes, no esos ejemplos.
- **Fotografías como diagrama.** Hoy `uploadDrillDiagram` acepta cualquier PNG, JPEG o WebP de hasta 2 MiB: nada distingue un dibujo de una foto de la pizarra o del entrenamiento, la ficha de `media_assets` se registra siempre con `contains_minor = false` y el JPEG conserva su EXIF (ubicación, hora, dispositivo). Con el ejercicio publicado, lo ve todo el cuerpo técnico del club. Lo único que hay delante es un texto de ayuda en el formulario («Sube solo el dibujo de la pista. No subas fotos en las que salgan jugadores.»). La regla 5 de CLAUDE.md pide consentimiento registrado para fotos de menores.
  - Se aceptó por ahora porque el plan espera ese canal (la foto de la pizarra como diagrama, Task 14, paso 3) y la exposición está acotada: bucket privado, solo cuerpo técnico, URLs firmadas de 10 minutos. Falta que Daniel lo confirme.
  - Alternativas: una confirmación explícita al subir («no salen jugadores»), o quitar los metadatos en el servidor (recodificar la imagen, con una dependencia nueva). Y, en la Fase 7, que el consentimiento nunca se fíe de `contains_minor` para esta carpeta.
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
  - Un nuevo seed sobre un demo remoto pisa lo editado en los ejercicios del seed (18 de Arcángel y 2 de Club Demo). Es el mismo diseño que el seed de metodología de la Fase 2.
  - La búsqueda ordena por título, no por relevancia. El plan fija `order('title')`.
  - La rama de la Fase 3 está apilada sobre el PR abierto de la Fase 2: la estrategia de fusión (cambiar la base del PR o rebasar tras un squash) es un riesgo del montaje, no del código.
