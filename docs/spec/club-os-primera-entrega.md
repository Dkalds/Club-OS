# CLUB OS — Primera Entrega (especificación aprobada)

> Exportado del Claude Doc el 2026-10-02. Las 13 decisiones están aprobadas. Fuente viva: https://claude.ai/code/artifact/beb02859-1867-4eb0-8d33-68ffa9bf14ad

Oct 2, 2026 · @Daniel

## Qué necesito que apruebes

Propongo un monolito modular Next.js + Supabase, multi-tenant con RLS desde el primer día y un MVP centrado en dirección + entrenador. Estas 13 decisiones condicionan la Fase 1: márcalas y preparo el plan de implementación.

| # | Decisión | Recomendación | § | Estado |  |
| --- | --- | --- | --- | --- | --- |
| 1 | Stack | Next.js (App Router) + Supabase (Postgres, Auth, Storage) en región UE, desplegado en Vercel | 3 | Aprobada |  |
| 2 | Aislamiento entre clubes | Base compartida, `organization_id` en cada tabla, RLS deny-by-default y claves foráneas compuestas | 9 | Aprobada |  |
| 3 | Tenant en la URL | `/c/{club}/…`; subdominio o dominio propio más adelante sin tocar el modelo | 9 | Aprobada |  |
| 4 | Persona ≠ cuenta | Los jugadores son fichas del club sin login; una cuenta se vincula a una ficha solo cuando haga falta | 4 | Aprobada |  |
| 5 | Calendario único | `events` (entrenamiento, partido) separado del contenido `practice_plans`; plantillas y duplicar salen gratis | 4 | Aprobada |  |
| 6 | Practice Builder de un nivel | Lista ordenada de ejercicios con fase y duración; las fases consecutivas se muestran como bloque | 4 | Aprobada |  |
| 7 | Diagramas de pista | Imagen subida en el MVP; editor de diagramas propio más adelante (esquema JSON reservado) | 2 | Aprobada |  |
| 8 | Notas del entrenador | Privadas por defecto (solo autor); opción de compartir con cuerpo técnico y dirección | 5 | Aprobada |  |
| 9 | Imagen de menores | Iniciales + dorsal por defecto; foto solo con consentimiento de imagen registrado | 5 | Aprobada |  |
| 10 | Live Practice | PWA con pantalla siempre encendida, temporizador por marcas de tiempo y sesión precargada para pabellones sin cobertura | 3 | Aprobada |  |
| 11 | Vista de cobertura de The Way | Dirección ve qué Standards y principios ha trabajado cada equipo en las últimas semanas y cuáles no; entra en el MVP | 1 | Aprobada |  |
| 12 | Registro real + notas del rival | Live guarda qué ejercicios se completaron y sus minutos; cada partido admite notas sobre el rival. Es la base de la futura IA | 4 | Aprobada |  |
| 13 | Siguiente fase: familias | Tras validar el MVP, familias primero con el QUÉ (calendario, convocatorias) y después el POR QUÉ (The Way, objetivos) | 1 | Aprobada |  |

El design system vive en su propio artifact: [CLUB OS Design System](https://claude.ai/code/artifact/52183693-d538-406b-a3da-2cc3037939db).

## 1. Visión del producto

CLUB OS convierte la identidad y la metodología deportiva de un club en la experiencia diaria de dirección, entrenadores, jugadores y familias. No gestiona el club: hace que todo el club funcione bajo una misma identidad. CB Arcángel es el primer tenant y el entorno de validación, no el producto.

**Everyone knows what's next. Everyone knows why.** El QUÉ es calendario, entrenamiento, partido, convocatoria y comunicación; el POR QUÉ es metodología, identidad, objetivos y desarrollo. Regla de diseño: todo QUÉ muestra su POR QUÉ, es decir, el Standard o principio que trabaja.

- **Diferencial.** La cadena The Way → principio → Standard → ejercicio → sesión → jugador → partido es el esqueleto, pero un competidor directo ya ofrece algo parecido. Nos diferencia cerrar el bucle: dirección ve cómo llega su metodología a cada equipo, la IA trabaja sobre lo que el club entrenó de verdad y The Way llega también a jugadores y familias.
- **Efecto red interno.** Dirección publica, el entrenador aplica, el jugador trabaja y la familia entiende: cada rol que entra da valor a los demás. Retiene al club, pero no trae clubes nuevos; la captación necesita su propia estrategia.
- **Usuarios del MVP.** Director deportivo (configura identidad, metodología, equipos y biblioteca) y entrenador (planifica, entrena, sigue a sus jugadores). Jugador y familia: modelo de datos y permisos preparados, sin interfaz.
- **Después del MVP.** Familias primero, empezando por el QUÉ (calendario, convocatorias), que es lo que les hace abrir la app; después el POR QUÉ (The Way, objetivos de sus hijos).
- **Qué valida el MVP.** Que los entrenadores de Arcángel preparan y ejecutan sus sesiones semanales en CLUB OS sin formación, y que el director ve su metodología aplicada en esas sesiones.
- **Señales de validación propuestas.** Sesiones de Alevín A planificadas en CLUB OS durante 6 semanas; entrenadores activos cada semana; sesiones ejecutadas en Live Practice; ejercicios usados que enlazan con un Standard; dirección consultando la vista de cobertura.
- **Lo que no es.** Ni ERP, ni intranet, ni repositorio de PDF. Si una función no ayuda a organizar, enseñar, entrenar, comunicar o desarrollar jugadores, no entra; si no hace falta para el uso semanal, se pospone.

### Competencia y mercado

| Producto | Enfoque | Qué implica para nosotros |
| --- | --- | --- |
| Coach Court | Basketball-first: dirección define la metodología, coordinación supervisa, entrenadores aplican; playbook, ejercicios, entrenamientos y temporadas. Según la investigación de César, ha entrado en Lanzadera y colabora con Valencia Basket (sin confirmar por mi parte) | Competidor directo. Paridad en la cadena metodológica; diferenciarnos en cobertura, IA sobre datos reales y familias |
| Clupik | Gestión del club: web, app, inscripciones y comunicación, con sesiones de entrenamiento incluidas. Pro 39 $/mes (hasta 20 equipos), Elite 99 $/mes | Referencia de precio. No competir en gestión administrativa |

La FEB registró 453.092 licencias y 3.180 clubes en 2025. A 200 €/mes, llegar a 1,2 M€ de ARR exige 500 clubes: 1 de cada 6 clubes federados de España, a un precio entre 2 y 5 veces el de Clupik. El escenario se sostiene sumando colegios y academias, otros deportes de formación y otros países; basketball-first es la puerta de entrada, no el techo.

## 2. Decisiones ambiguas

El brief deja abiertos 14 puntos; para cada uno propongo un valor por defecto que aplicaré si no dices lo contrario.

| Tema | Pregunta abierta | Recomendación por defecto |
| --- | --- | --- |
| Idioma | El brief mezcla español y términos en inglés (The Way, Standards, Coaching Points). | Interfaz en español. Los términos de marca son configurables por club; código preparado para i18n, sin traducir contenido. |
| Admin vs director | ¿Club Admin y Director deportivo son el mismo rol? | Un único rol `admin` en el MVP. Separar gestión (personas, datos) de dirección deportiva (contenido) cuando un club lo pida. |
| Visibilidad entre equipos | ¿Qué ve un entrenador de otros equipos? | Metodología y biblioteca: todo el club. Plantillas, objetivos y notas: solo sus equipos. Coordinador de categoría: rol futuro; validarlo en entrevistas, porque un competidor directo ya lo ofrece. |
| Autoría de ejercicios | ¿Pueden los entrenadores crear ejercicios? | Sí, como borrador propio. Dirección los revisa y publica en la biblioteca del club. |
| Notas privadas | ¿Las ve dirección? | No por defecto. Dos niveles: Solo yo / Cuerpo técnico + dirección. Las notas no son canal de incidencias de protección del menor (LOPIVI): eso será un flujo aparte. |
| Diagramas de pista | ¿Editor propio o imagen? | Imagen (PNG o SVG) sobre plantilla de pista en el MVP. Se reserva un esquema JSON de diagrama para un editor y animaciones futuros. |
| Vídeo de ejercicio | ¿Subida propia o enlace? | Enlace (YouTube o Vimeo no listado). Subida propia cuando haya demanda: coste de almacenamiento y transcodificación. |
| Categorías y edades | Alevín, Infantil… frente a U10, U12… | Categorías por club y temporada. Los ejercicios se etiquetan por edad numérica (U8–U18), así el filtro funciona en cualquier club. |
| Objetivos de sesión | ¿Lista fija? | Taxonomía por club con técnica, transición, tiro, defensa, rebote y ataque como semilla. La misma lista filtra la biblioteca. |
| Bloques del Practice Builder | ¿Un bloque puede tener varios ejercicios? | Un nivel: cada ítem es ejercicio + fase + duración. Fases consecutivas se ven como un bloque. |
| Partidos | ¿De dónde salen sin FBM? | Alta manual: rival, fecha, competición, local o visitante, resultado opcional. |
| Acceso | ¿Contraseña, enlace mágico, Google? | Solo por invitación; código o enlace por email. Sin registro abierto. Google, más adelante. |
| Temporadas | ¿Cómo se pasa de 2026/27 a 2027/28? | Una temporada activa en el MVP. Duplicar estructura a la nueva temporada, en fase posterior. |
| Datos demo | Los mockups usan nombres que podrían ser reales. | Seed 100 % ficticio. Ningún dato real de menores fuera de producción. |

## 3. Arquitectura

Un monolito modular: una app Next.js, un despliegue y una base Postgres en Supabase donde RLS es la garantía de aislamiento. Sin microservicios ni API separada en el MVP.

> Diagrama (arquitectura · una app, una base, futuro aislado): ver el documento original en https://claude.ai/code/artifact/beb02859-1867-4eb0-8d33-68ffa9bf14ad

Las pantallas solo hablan con módulos y los módulos consultan Postgres con la sesión del usuario: una consulta mal escrita no puede salir de su club. Lo futuro entra siempre por staging.

| Capa | Elección | Por qué |
| --- | --- | --- |
| Frontend | Next.js App Router, React, TypeScript estricto | Server Components para lecturas rápidas en móvil; Server Actions para escrituras; un solo repo |
| UI | Tailwind CSS + variables CSS por club + primitivas Radix | Tematizar cada club sin recompilar; accesibilidad de base |
| Datos | Supabase Postgres, migraciones SQL versionadas, tipos TS generados | RLS nativo; SQL estándar, portable a otro Postgres |
| Acceso a datos | supabase-js con la sesión del usuario + Zod para validar entradas | Cada consulta pasa por RLS. Un ORM con conexión de servicio (Prisma) se saltaría RLS |
| Auth | Supabase Auth, código o enlace por email, solo por invitación | Sin contraseñas que gestionar; familias y jugadores después con el mismo mecanismo |
| Ficheros | Supabase Storage, buckets privados, rutas `org/{org_id}/…`, URLs firmadas de corta duración | Ninguna imagen de un menor accesible por URL pública |
| Drag & drop | dnd-kit, con botones subir y bajar como alternativa | Funciona con tacto y teclado |
| Live Practice | PWA: service worker, Wake Lock, temporizador calculado desde marcas de tiempo | Sobrevive a bloqueos de pantalla y a pabellones sin cobertura |
| Región | Supabase y funciones de Vercel en la UE (Fráncfort) | Datos de menores dentro de la UE (RGPD) |
| Calidad | Vitest, Playwright en viewport móvil, tests SQL de RLS, CI en GitHub Actions | Cada fase cierra con estas suites en verde |
| Observabilidad | Registro de errores sin datos personales en los logs | Depurar sin exponer menores |

Cada módulo de dominio expone sus propias consultas, acciones, esquemas de validación y reglas de permiso; las pantallas solo hablan con módulos.

```text
src/
  app/
    (auth)/login, invite/[token]
    c/[club]/(app)/...        rutas por sección (ver sitemap)
  modules/
    tenancy/       organizations, branding, memberships, invitations
    club/          seasons, categories, teams, roster
    methodology/   way sections, values, principles, standards
    drills/        library, detail, focus areas
    practice/      plans, items, live mode
    schedule/      events, games
    development/   player goals, coach notes
    media/         uploads, signed URLs
    integrations/  solo interfaces (sin implementar)
  ui/              componentes del design system
  lib/             supabase, auth, permissions, i18n
supabase/
  migrations/  seed/  tests/rls/
```

App nativa: no en el MVP. Una PWA instalada cubre pantalla de inicio, offline y, más adelante, notificaciones web. Si hiciera falta una app de tiendas, la capa `modules/` se expone como API sin reescribir el dominio.

## 4. Modelo de datos

Propongo 38 tablas en 11 dominios. Tres cambios de fondo sobre tu lista: separar cuenta de persona, separar el evento del calendario del contenido de la sesión y sustituir la tabla de roles por enums.

> Diagrama (modelo de datos · dominios y referencias entre ellos): ver el documento original en https://claude.ai/code/artifact/beb02859-1867-4eb0-8d33-68ffa9bf14ad

Cada flecha es una clave foránea compuesta con `organization_id`: un ejercicio solo puede enlazar Standards de su propio club, y una sesión solo puede usar ejercicios de su club.

### Cambios sobre la lista del brief

| Tu lista | Propuesta | Motivo |
| --- | --- | --- |
| users, coaches, players | `profiles` (cuenta) + `people` (ficha del club) + `team_staff` + `team_players` | Un menor existe sin cuenta; una persona puede ser entrenador y padre; un jugador cambia de equipo cada temporada |
| roles | Enums `org_role` (admin, coach, player, guardian) y `staff_role` (head\_coach, assistant) | Nadie va a configurar un RBAC genérico; las reglas viven en políticas SQL |
| family\_relationships | `guardianships` | Distingue tutor legal de otro familiar; base de los consentimientos |
| practice\_sessions, practice\_blocks, practice\_drills | `events` + `practice_plans` + `practice_items` | Calendario único; un plan puede ser plantilla o estar programado; duplicar = copiar plan |
| games | `events` (kind = game) + `games` | Convocatorias y calendario familiar futuros sobre la misma tabla |
| methodology\_sections, principles | `way_sections` + `club_values` + `game_principles` + `principle_points` | Contenido estructurado y relacionable, no texto largo |
| standards, drill\_standards | Se mantienen; se añaden `drill_principles` y `drill_focus_areas` | Base de filtros, análisis e IA |
| (no estaba) | `focus_areas`, `invitations`, `consents`, `audit_log`, `platform_admins` | Objetivos como taxonomía del club, alta de entrenadores, imagen de menores, trazabilidad, soporte de plataforma |
| external\_integrations, external\_records | `external_connections` + `external_records` + `external_links` + `sync_runs` | Conexión, datos crudos y mapeo externo-local separados |

### Tablas por dominio

| Dominio | Tablas | Columnas clave |
| --- | --- | --- |
| Tenancy | organizations, organization\_branding, memberships, invitations | slug, timezone; colores, logo, portada, way\_name, terminology (jsonb); user\_id + org\_role + person\_id |
| Personas | profiles, people, guardianships, consents | profiles: cuenta de plataforma, sin club. people: nombre, apellidos y año de nacimiento, no fecha completa |
| Estructura | seasons, categories, teams, team\_staff, team\_players | is\_current; age\_band; season + category; staff\_role; dorsal y posición |
| Metodología | way\_sections, club\_values, game\_principles, principle\_points, standards | number, slug, content\_kind, body (Markdown corto), status borrador o publicado, sort |
| Biblioteca | drills, drill\_coaching\_points, drill\_variants, focus\_areas, drill\_focus\_areas, drill\_principles, drill\_standards | jugadores mín./máx., minutos mín./máx., edad mín./máx., material, diagrama, vídeo, status; `is_key` marca los coaching points que salen en Live |
| Calendario | events, games | kind, team\_id, starts\_at y ends\_at (timestamptz), lugar, status; rival, competición, local o visitante, resultado, notas del rival, source (manual o externo) |
| Entrenamiento | practice\_plans, practice\_items | event\_id único y opcional, is\_template, foco principal y secundario, status, minutos reales; sort, phase, drill\_id, minutos, notas; completado y minutos reales (registrados en Live) |
| Desarrollo | player\_goals, coach\_notes | máximo 3 objetivos activos por jugador (índice parcial + trigger); visibility solo yo o cuerpo técnico |
| Media | media\_assets | path, kind, mime, bytes, contains\_minor |
| Integraciones | external\_connections, external\_records, external\_links, sync\_runs | provider, payload crudo (jsonb), external\_id frente a local\_id, checksum |
| Transversal | audit\_log, platform\_admins | actor, acción, entidad, fecha; personal de CLUB OS con acceso de soporte auditado |

**Convenciones.** PK uuid; `organization_id NOT NULL` en toda tabla de club; `created_at`, `updated_at`, `created_by`; borrado lógico con `archived_at`; slugs únicos por club; claves foráneas compuestas `(organization_id, parent_id)`. La duración total de un plan se calcula sumando sus ítems, no se guarda.

## 5. Sistema de permisos

Dos niveles de rol, rol en el club y rol en el equipo, y la base de datos los hace cumplir con RLS. La interfaz solo oculta lo que la base ya prohíbe.

- **Rol en el club** (`memberships.org_role`): admin, coach, player, guardian. Una persona puede tener varias membresías, por ejemplo entrenador en un club y familiar en otro.
- **Rol en el equipo** (`team_staff.staff_role`): head\_coach, assistant. Delimita qué jugadores, objetivos y notas ve un entrenador.

| Recurso | Admin | Coach | Player (futuro) | Family (futuro) |
| --- | --- | --- | --- | --- |
| Identidad y branding del club | Gestiona | Lee | Lee | Lee |
| The Way, valores, principios, Standards | Gestiona y publica | Lee lo publicado | Lee lo publicado | Lee lo publicado |
| Ejercicios | Gestiona y publica | Lee publicados; crea y edita sus borradores | — | — |
| Temporadas, categorías, equipos | Gestiona | Lee sus equipos | Lee su equipo | Lee equipos de sus hijos |
| Personas y plantillas | Gestiona | Lee la plantilla de sus equipos | Nombre y dorsal de compañeros | Sus hijos |
| Eventos y partidos | Gestiona | Gestiona los de sus equipos | Lee su equipo | Lee equipos de sus hijos |
| Planes de sesión | Lee todos | Gestiona los de sus equipos y sus plantillas | — | — |
| Objetivos de jugador | Gestiona | Gestiona los de sus jugadores | Lee los suyos | Lee los de sus hijos |
| Notas de entrenador | Lee las compartidas | Gestiona las suyas; lee las compartidas de sus equipos | — | — |
| Miembros e invitaciones | Gestiona | — | — | — |

**Cómo se implementa**

1. RLS activado en todas las tablas; sin política no hay acceso.
2. Funciones SQL de apoyo, `SECURITY DEFINER` con `search_path` vacío: `is_member(org)`, `has_org_role(org, roles)`, `is_team_staff(team)`, `can_see_player(person)`.
3. Una política por tabla y operación (select, insert, update, delete); en escrituras, `WITH CHECK` sobre el `organization_id` y el equipo.
4. Módulo `lib/permissions` con `can(acción, recurso)` para mostrar u ocultar controles; nunca es la única comprobación.
5. La clave de servicio solo en migraciones, seeds y tareas internas; nunca en una petición de usuario ni en el navegador.
6. Tests de RLS por rol y por club en CI: un entrenador del club B no lee nada del club A; un entrenador del equipo X no lee notas del equipo Y.

**Menores.** Sin perfiles públicos ni URLs con datos personales; IDs opacos en rutas. Cuentas de jugador, cuando lleguen: a partir de 14 años por sí mismos o con consentimiento del tutor por debajo (art. 7 LOPDGDD). Fotos solo con consentimiento de imagen registrado en `consents`.

## 6. Sitemap

Cinco pestañas (Inicio, The Way, Entrenar, Partidos, Equipo) cubren la semana del entrenador; la gestión vive fuera de la navegación y solo la ve dirección.

> Diagrama (sitemap del MVP · 5 pestañas + gestión): ver el documento original en https://claude.ai/code/artifact/beb02859-1867-4eb0-8d33-68ffa9bf14ad

- **Entrenador y dirección comparten las cinco pestañas.** Dirección añade Gestión desde el menú del avatar y, en Inicio, la cobertura de The Way por equipo.
- **La biblioteca vive dentro de Entrenar** y también se abre como selector desde el Practice Builder.
- **Gestión es responsive pero pensada para escritorio**: redactar The Way o dar de alta una plantilla es trabajo de mesa, no de pista.
- Las rutas usan IDs opacos; ningún nombre de jugador aparece en una URL.

## 7. User flows principales

Dirección configura una vez y publica; el entrenador repite un ciclo semanal corto que empieza en Inicio y termina en pista.

> Diagrama (flujos principales · dirección y entrenador): ver el documento original en https://claude.ai/code/artifact/beb02859-1867-4eb0-8d33-68ffa9bf14ad

**Primer acceso del entrenador**

1. Dirección le invita por email con su rol y su equipo.
2. Abre el enlace, entra con el código y aterriza en Inicio de su equipo, sin configurar nada.

**Del principio al ejercicio**

1. The Way → Cómo jugamos → Transición.
2. Ejercicios relacionados con ese principio.
3. Ficha del ejercicio → Añadir a sesión → elegir la sesión.

**Objetivos de un jugador**

1. Equipo → jugador.
2. Añadir objetivo (máximo 3 activos), opcionalmente ligado a un Standard.
3. Después del entrenamiento, nota privada y, cuando toque, objetivo logrado.

## 8. Design system

El design system ya está montado en su propio artifact: 22 tokens de color, 12 estilos de texto, 21 componentes con vista previa y dos temas, CB Arcángel y un club demo, para comprobar el white-label desde el primer día. [Abrir CLUB OS Design System](https://claude.ai/code/artifact/52183693-d538-406b-a3da-2cc3037939db)

- **Plataforma frente a club.** Solo cuatro tokens `brand-*` cambian por club y se cargan desde `organization_branding`; fondos, texto, estados, tipografía y espaciado son de plataforma. Al configurar un club se valida el contraste de su acento.
- **Dorado con moderación.** Un CTA principal por pantalla, pestaña activa, dorsales y números de bloque, Standards y progreso del Live Mode.
- **Una card destacada por pantalla** en blanco roto: lo que el usuario necesita hoy.
- **Tipografía.** Barlow Condensed para títulos, números y botones; Barlow para texto. Cifras tabulares en cronómetro, horas y dorsales.
- **Accesibilidad verificada.** Todo texto a 4.5:1 o más en los dos temas, bordes de control a 3:1 o más, foco visible sobre cualquier acento, áreas táctiles de 44px y de 72px en Live.

**Regla qué/por qué.** Cada sesión, ejercicio, objetivo y, más adelante, convocatoria muestra con un StandardBadge el Standard o principio que trabaja.

| Grupo | Componentes |
| --- | --- |
| Layout | AppShell, TopNavigation, BottomNavigation, Hero, SectionHeader |
| Acciones | CTAButton, Filter, Search |
| Contenido | Card, ListRow, PracticeCard, GameCard, DrillCard, PlayerCard, Avatar, StandardBadge |
| Entrenamiento | PracticeItem, Timer (Live Mode) |
| Estados | EmptyState, LoadingState, ErrorState |

**Cambios sobre el mockup, a favor de la usabilidad.** El CTA de la card destacada pasa a fondo oscuro con texto dorado, porque dorado sobre blanco roto queda en 1.9:1. Las fotos de jugadores se sustituyen por iniciales o dorsal salvo consentimiento. En Live Mode los controles bajan a 72px al alcance del pulgar y Pausa es la única acción principal. ListRow y PracticeItem se añaden al inventario del brief porque los repiten varias pantallas.

En la Fase 1 los tokens pasan a variables CSS y al tema de Tailwind, y cada componente se implementa en React a partir de su vista previa.

## 9. Multi-tenancy

Base de datos compartida con aislamiento por fila: cada tabla de club lleva `organization_id` y Postgres rechaza cualquier lectura o escritura fuera de las membresías del usuario, aunque la aplicación tenga un fallo.

| Capa | Mecanismo |
| --- | --- |
| Esquema | `organization_id NOT NULL` en toda tabla de club. Claves foráneas compuestas `(organization_id, id)`: es imposible enlazar un ejercicio del club A con una sesión del club B |
| Base de datos | RLS deny-by-default en todas las tablas; políticas basadas en `memberships`; índices por `organization_id` |
| Petición | El slug de `/c/{club}` se resuelve en el servidor a `org_id` y se comprueba la membresía. En escrituras, el `org_id` se deriva del recurso padre y RLS lo valida; nunca se confía en el que envía el cliente |
| Ficheros | Rutas `org/{org_id}/…` y políticas de Storage sobre el primer segmento; solo URLs firmadas de corta duración |
| Caché | Páginas autenticadas siempre dinámicas; ninguna clave de caché compartida entre clubes |
| Marca | El layout de `/c/[club]` carga `organization_branding` y lo convierte en variables CSS. Ningún nombre, color ni logo de Arcángel en el código |
| Soporte | El personal de CLUB OS (`platform_admins`) accede mediante herramientas internas auditadas, no saltándose RLS desde la app |
| Pruebas | Todos los entornos de test tienen dos clubes: Arcángel y un club ficticio. La matriz de tests cross-tenant bloquea el merge si falla |

**Evolución sin cambiar el modelo.** Subdominio o dominio propio por club: el middleware traduce host a club. Un cliente que exija base aislada recibe un proyecto Supabase dedicado con el mismo esquema y las mismas migraciones.

## 10. Integraciones futuras

El core nunca llama a un proveedor: un conector deja datos crudos en `external_records`, un normalizador los traduce a entidades propias y `external_links` guarda la correspondencia externo-local. Si una integración se cae, CLUB OS sigue funcionando con los datos manuales.

1. **Conector (adaptador).** Uno por proveedor, detrás de una interfaz común; declara qué sabe traer.
2. **Datos crudos.** `external_records` guarda cada registro tal como llega, con fecha y checksum; nada del core lo lee directamente.
3. **Normalización.** Convierte registros en `events`, `games`, equipos rivales y competiciones del club; idempotente gracias a `external_links`.
4. **Core.** Cada entidad lleva `source` (manual o proveedor). Los campos sincronizados no se editan a mano; un cambio manual queda marcado como excepción.

```ts
interface Connector {
  provider: string;                 // 'fbm', ...
  capabilities: Capability[];       // 'fixtures' | 'results' | 'standings' | ...
  fetch(entity: Capability, cursor?: string): Promise<RawRecord[]>;
}
```

**FBM.** No asumo API ni endpoints, y no habrá scraping. Propongo una fase de descubrimiento antes de construir nada: qué publica la federación y en qué formato, condiciones de uso de esos datos y si ofrece acuerdos o exportaciones. Orden de preferencia: acuerdo o API oficial, luego importación de ficheros exportados (CSV, ICS), y alta manual como base siempre disponible.

**IA.** El contenido estructurado de hoy es lo que la hará útil mañana: un plan generado tira de principios, Standards, ejercicios con edad, jugadores y duración, de lo que el equipo entrenó de verdad (registrado en Live) y de las notas del rival. Ejemplo de referencia: «Prepárame el entrenamiento del jueves para Alevín, 75 minutos; el sábado jugamos contra un equipo que nos presiona arriba». Cuando llegue: embeddings en el mismo Postgres (pgvector) con RLS por club, ningún dato de otro club en el contexto, y la IA solo propone un borrador que el entrenador edita. Nada de esto se implementa en el MVP.

**Otras, después del MVP.** Exportar calendario del equipo en ICS (barato y muy útil para familias), enlaces de vídeo de partidos, pagos.

## 11. Riesgos técnicos

El riesgo técnico número uno es un fallo de RLS que exponga datos de un club o de un menor; el resto son riesgos de uso en pista.

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Política RLS mal escrita | Fuga entre clubes o de datos de menores | Tests cross-tenant y por rol en CI, claves foráneas compuestas, asesor de seguridad de Supabase, revisión de seguridad en la Fase 7 |
| RLS lento con subconsultas de membresía | Pantallas lentas al crecer | Funciones `STABLE`, `(select auth.uid())` en políticas, índices por `organization_id` y `team_id` |
| Pabellón sin cobertura o pantalla que se bloquea | Live Practice inservible en el momento clave | Sesión precargada y caché offline, Wake Lock, temporizador por marcas de tiempo; pruebas en iPhone y Android reales |
| Soporte desigual de PWA en iOS | Wake Lock o instalación que fallan en algunos iPhone | Detección de capacidades y aviso para desactivar el bloqueo automático; matriz de dispositivos en QA |
| Drag & drop táctil poco fiable | Frustración al montar sesiones | dnd-kit con sensores táctiles + botones subir y bajar |
| The Way deriva en un CMS | Meses de editor en vez de producto | Markdown corto + entidades estructuradas; nada de constructor de páginas |
| Diagramas como imagen | No reutilizables por IA ni animables | Esquema JSON reservado; migración cuando exista el editor |
| Zonas horarias y cambio de hora | Entrenamientos a la hora equivocada | `timestamptz` y `organizations.timezone` (Europe/Madrid para Arcángel) |
| Acoplamiento a Supabase | Migración costosa | SQL Postgres estándar; Auth y Storage detrás de interfaces finas en `lib/` |
| Datos reales en entornos de prueba | Exposición de menores | Seeds ficticios; prohibido copiar producción a otros entornos |

## 12. Riesgos de producto

El mayor riesgo es que preparar una sesión en CLUB OS sea más lento que hacerlo en papel o en WhatsApp: si ocurre, el entrenador no vuelve.

| Riesgo | Mitigación |
| --- | --- |
| Crear una sesión cuesta más que el papel | Meta de diseño: sesión de 5 ejercicios en menos de 3 minutos; duplicar sesión; probar con entrenadores reales desde la Fase 4 |
| Biblioteca vacía = producto vacío | 15–20 ejercicios de calidad de Arcángel cargados antes del piloto; el director es responsable del contenido |
| La metodología no está escrita o está en un PDF | Taller con el director para estructurarla; The Way puede arrancar con 3 de las 5 secciones |
| Live Practice no encaja en la pista real | Prototipo clicable probado en un entrenamiento real antes de la Fase 5 |
| Construir para Arcángel y no para muchos clubes | Entrevistas con 2–3 clubes más antes de la Fase 6; revisar en cada fase que nada esté fijado a Arcángel |
| Presión por familias, chat y convocatorias | Mantener el foco; el ICS del calendario como respuesta barata |
| Dirección no ve valor | Vista de cobertura de The Way en el MVP: qué Standards y principios ha trabajado cada equipo y cuáles no |
| Desconfianza de familias por datos de menores | Política de privacidad clara, contrato de encargo de tratamiento con el club, consentimientos registrados |
| Un solo campeón en el club | Implicar a los 2 entrenadores de Alevín A en el diseño desde la primera semana |
| Precio y modelo de negocio sin validar | No bloquea el MVP; medir uso por equipo para fijar precio por club o por equipo |
| Un competidor directo ya ofrece la cadena metodológica (Coach Court) | Diferenciarse en la vista de cobertura, la IA sobre lo entrenado de verdad y The Way para familias; no competir en precio |
| Precio por encima del mercado: Clupik cobra 39–99 $/mes | Validar disposición a pagar con Arcángel y 2–3 clubes; probar precio por equipo o por tramos |
| Los clubes esperan un rol de coordinación de categoría | Preguntarlo en las entrevistas; el modelo de permisos admite un rol con ámbito de categoría sin rehacer nada |

## 13. Qué recortaría del MVP

Si sigue siendo grande, recortaría en este orden: primero lo que el entrenador no echa de menos la primera semana.

1. **Admin completo** → alta de equipos, jugadores y ejercicios por importación CSV + edición en línea mínima.
2. **Pantalla Partidos** → solo el próximo partido en Inicio; la pestaña llega después.
3. **Variantes y vídeo de ejercicio** → solo texto, coaching points y diagrama.
4. **Home específica de dirección** → la misma Inicio que el entrenador + acceso a gestión; la vista de cobertura se queda, dentro de Gestión.
5. **Drag & drop** → botones subir y bajar.
6. **Offline completo en Live** → Wake Lock y temporizador robusto; la caché offline, después.
7. **Notas compartidas** → solo notas privadas.
8. **Filtros completos** → búsqueda + objetivo + edad.

**No recortaría nunca:** multi-tenancy con RLS, The Way, biblioteca, Practice Builder con duplicar, Live Practice, objetivos de jugador y la vista de cobertura de The Way. Son lo que el MVP tiene que validar.

## Fuentes

- [FEB: más de 450.000 licencias registradas en 2025](https://www.feb.es/2026/3/5/baloncesto/las-mas-450000-licencias-registradas-por-feb-2025-suponen-nuevo-record-jugadores-espana/104414.aspx)
- [Clupik: precios](https://clupik.com/en/pricing/)
