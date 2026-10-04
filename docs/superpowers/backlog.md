# CLUB OS · Pendientes que deja la Fase 1

Lo que las revisiones de la Fase 1 dejaron para más adelante, ordenado por la fase que debe recogerlo. Nada de esto bloquea la Fase 1. Cada plan de fase debería incorporar su bloque antes de empezar. Si una fase se cierra sin recoger el suyo, lo que quede se pasa a otra en este fichero: aquí no hay pendientes sin dueño.

Estado de la Fase 1: tareas 1–11 hechas y revisadas. Verificado contra Supabase local real y desde una base vacía: `test:db` 208/208, `seed` dos veces, `test:int` 9/9, unidad 577/577, `test:e2e` 16/16. Task 12 (entorno remoto): la parte del repositorio está hecha (con ella, unidad 617/617 y `test:int` 11/11). Pendiente: lo que queda en los paneles (lista de abajo), primera ejecución real de CI y revisión en un móvil real.

## Correcciones al texto de los planes

- **`runSeed` no está en `scripts/seed.ts`.** Vive en `scripts/seed/run.ts` con firma `runSeed(now, client?)`. `scripts/seed.ts` es solo la CLI. Los planes de las fases 2–4 dicen «Modify: `scripts/seed.ts` (`runSeed`)»: debe ser `scripts/seed/run.ts` y `scripts/seed/data.ts`.
- **`ClubContext` y `getClubContext`** están en `src/modules/tenancy/queries.ts`. El marcador de pestañas vacías es `src/app/c/[club]/coming-soon.tsx`.
- **E2E.** Los specs importan `test` de `e2e/helpers/test` y entran con `openAs` (sesión guardada por usuario). `loginAs` queda para probar el propio login. El `globalSetup` siembra y solo en local: el proyecto `admin` de la Fase 2 y cualquier `afterAll → runSeed` deben convivir con él.
- **Cada página bajo `/c/[club]` se protege sola.** Un layout no protege a sus páginas en una navegación parcial. Todas lo hacen con `requireClub` (`src/lib/guards.ts`); las de Gestión se exportan con `adminPage`, que además comprueba el permiso antes de ejecutar la página, y `pnpm check:guards` lo exige. Ninguna página nueva debe volver a `getClubContext` + `notFound()` a mano.
- **Error frente a 404.** Una avería de Supabase lanza y llega a un límite de error; `null` y 404 quedan solo para «no existe o no eres miembro activo».
- **Región.** La especificación aprobada (`docs/spec/club-os-primera-entrega.md`, fila «Región» de la tabla) dice Fráncfort. La decisión del 3 oct 2026 es Irlanda para Supabase y Dublín para las funciones de Vercel. La especificación no se ha editado.

## Fase 2 · The Way (cerrada)

La Fase 2 se cerró sin recoger casi nada de este bloque. Lo que sigue pendiente está repartido en los bloques de las fases 3, 4 y 7 de aquí abajo, marcado con «(de la Fase 2)».

Hecho, en la fase o al corregir la revisión de su PR:

- Menú de cuenta con «Salir» dentro del club (`src/ui/account-menu.tsx`).
- `requireClub` sustituye a `getClubContext` + `notFound()` en todas las páginas y layouts de `/c/[club]`.
- Test propio de Inicio (`src/app/c/[club]/(app)/page.test.tsx`).

## Fase 3 · Biblioteca (en curso)

- (de la Fase 2) Un test genérico de postura sobre todas las tablas de `public`: RLS activado, nada para `anon`, lo de `authenticated` contra una lista permitida (incluido qué columnas puede cambiar). Opcional: `alter default privileges … revoke`. La Fase 3 abre la primera tabla que escriben los entrenadores: si no entra en ella, pasa a la Fase 4 antes de abrir más escritura.

## Fase 4 · Practice Builder

- (de la Fase 2) El generador de tokens debe fallar con un alias desconocido (`{x}`) y validar la forma de `tokens.json`.
- (de la Fase 2) Decidir una convención única para tamaños sin token. Hoy conviven medidas de la escala de Tailwind copiadas de `bundle.css` (`size-10`, `w-11`, `h-15`…) con expresiones sobre tokens (`min-w-[calc(var(--target-min)*4)]`). La Fase 4 trae mucha interfaz nueva: decidirlo antes.
- (de la Fase 2) Comprobación de hex en `src/**/*.tsx` dentro de `check:guards` (la regla 4 no tiene guarda hoy), y de medidas fuera de la convención que se decida.
- (de la Fase 2) `ListRow`: semántica de lista (`ul`/`li`) y documentar que las filas van como hijas directas de `Card flush`. Las listas de ejercicios y de ítems de una sesión la van a usar.
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

# CLUB OS · Pendientes que deja la Fase 2

Lo que las revisiones de la Fase 2 dejaron para más adelante, ordenado por cuándo conviene recogerlo. Nada de esto bloquea la Fase 2: ninguno afecta al aislamiento entre clubes, a los permisos ni a los datos.

Estado de la Fase 2: tareas 1–11 hechas y revisadas, revisión final de toda la rama y una tanda de arreglos re-revisada. Verificado contra Supabase local real y desde una base vacía: `test:db` 407/407, `test:int` 15/15 antes y después de los e2e, unidad 1435/1435, `test:e2e` 35/35, `supabase db lint` sin errores y tipos sin deriva. Pendiente: revisión en un móvil real.

## Del bloque que la Fase 1 dejó para la Fase 2

El plan de la Fase 2 se ejecutó tal como estaba escrito, sin incorporar ese bloque. Lo hecho y el reparto de lo que queda están arriba: «Fase 2 · The Way (cerrada)» y los bloques de las fases 3, 4 y 7.

- A medias: la etiqueta «The Way» por defecto está en `wayLabel` (`tenancy/navigation.ts`), pero el nombre por defecto de la metodología sigue aparte en `tenancy/queries.ts:51`.
- Sigue sin haber «cambiar de club» en el menú de cuenta, y `(app)/error.tsx` no usa `useSelectedLayoutSegment`.

## Corregido tras la revisión del PR de la Fase 2

La revisión del PR, ya fusionado, dejó hallazgos que se corrigieron en un PR aparte (migración `20261021000100_methodology_integrity`). Lo que una fase siguiente debe copiar de esos arreglos:

- **`update` por columna.** En las tablas de la metodología, `authenticated` solo puede cambiar las columnas que la app edita: ni `organization_id`, ni `id`, ni el slug. Una tabla nueva que los usuarios editen debe hacer lo mismo: las políticas no pueden impedir que quien administra dos clubes pase una fila de uno a otro.
- **Altas que calculan número o slug.** Leen la lista y luego insertan: el único de la tabla frena la carrera y la acción reintenta (`retryOnConflict` en `src/modules/methodology/actions.ts`). Un único que se renumera en bloque tiene que ser diferible.
- **El seed y lo creado a mano.** `pnpm seed` no borra nada: recoloca lo que choca (`scripts/seed/strays.ts`). Una tabla nueva con un único que el seed escribe necesita el mismo cuidado.
- **Páginas de Gestión.** Se exportan con `adminPage` (`src/lib/guards.ts`); `pnpm check:guards` rechaza una página de `/admin` que se proteja a mano.

## Antes de empezar la Fase 3

Piezas de la Fase 2 que las fases siguientes van a copiar o reutilizar. Más barato moverlas ahora que después de cuatro copias.

- `useAction()` vive en `src/app/c/[club]/admin/_components/use-action.ts` y es genérico: llevarlo a `src/lib/`. El formulario de ejercicios de la Fase 3 cuelga de `(app)/` y lo necesita.
- Extraer a `src/lib/` la parte genérica de `mutate` (`methodology/actions.ts`: Zod, `requireClub`, permiso, registro de errores inesperados, revalidación), parametrizada por permiso y rutas.
- Un `limits.ts` sin Zod que importen `schema.ts` y los editores: hoy `MAX_POINTS` y los `maxLength` (40, 80, 200, 300, 500) están escritos dos veces y cada capa fija su propio literal en sus tests.
- Argumentos opcionales de las funciones SQL: al final y con `default null`. Así el generador de tipos los marca opcionales y sobra el cast de `p_summary` (`actions.ts`). Afecta a las funciones de las fases 4 y 6.
- Fixture de `ClubContext` para tests en un solo sitio: `tenancy/test-support.ts` ya lo ofrece, pero siguen teniendo el suyo `lib/guards.test.ts`, `lib/permissions.test.ts`, `methodology/actions.test.ts`, `tenancy/queries.test.ts`, `home/queries.test.ts` y `(app)/coming-soon.test.tsx`. Lo mismo para los fixtures de pgTAP: unas 90 líneas repetidas entre `methodology.test.sql` y `methodology_functions.test.sql`; un helper en `supabase/seed.sql` ahorra la copia a cada fase.
- E2E del proyecto `admin`: `e2e/admin.spec.ts` tiene unas 790 líneas y sus helpers (`hydrated`, `field`, `title`, `openList`, `itemCard`) son locales. Moverlos a `e2e/helpers/` y partir el spec por pantalla, sumando los nuevos a `ADMIN_SPECS`. `hydrated()` lee el marcador interno `__reactProps$` de React: una subida de versión rompería todos los tests de Gestión a la vez.
- `throwReadError` (`methodology/map-rows.ts`) y el `fail` privado de `home/queries.ts:16` son la misma función: una sola, junto a `src/lib/log.ts`.

## Fase 3 · Biblioteca de ejercicios

- `MarkdownBody` se reutiliza: un ítem de lista, un `###` o una cita que solo contengan una imagen dejan un `li`, `h3` o `blockquote` vacío (los párrafos y los enlaces ya no). Un párrafo con solo `&nbsp;` ha dejado de pintarse (`markdown-body.tsx:38` usa `trim()`).
- Cuando haya enlaces con ancla dentro de la app (`StandardBadge` hacia `/way/standards#standard-NN`), comprobar que una navegación de cliente cae en el ancla: los e2e solo prueban la carga completa, y el router puede hacer su desplazamiento mientras se ve el `loading.tsx`.
- `safeHref` deja pasar `https:foo` y `https:/ruta`, que el navegador resuelve como relativas al propio origen.

## Fase 4 · Practice Builder

- Con `ConfirmDialog`, sustituir el `window.confirm` del editor de sección. De paso: el enlace «Ir a los valores / principios / Standards» de ese editor sale sin preguntar con cambios sin guardar (`section-editor.tsx`), y «Volver» pregunta también con Ctrl/Cmd+clic.
- `SectionEditor` lleva su propio estado de «guardado» y su región de estado, al lado de `useConfirmation` y `EditorForm` (`editor-shell.tsx`), que hacen lo mismo para los otros tres editores. El margen `empty:-mt-(--space-5)` de esa región tiene que coincidir a mano con el `gap` del formulario.

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
- El token `header-height` (56px) entró en `design/tokens.json` sin pasar por diseño, y los componentes nuevos de la Fase 2 no tienen vista previa en `design/components/`. Dos medidas siguen fuera de tokens (el número de 40 px del bloque de Standard y el interletrado del chip): van con la convención que ya pide el bloque de la Fase 1.
- Salir del editor de sección con cambios sin guardar avisa en «Volver», al recargar y al cerrar la pestaña, pero no al navegar por las pestañas de Gestión ni con «Volver a la app».
