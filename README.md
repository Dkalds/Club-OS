# CLUB OS

Plataforma SaaS multi-club para clubes de baloncesto de formación. Este repo es la app web: Next.js (App Router), Tailwind y Supabase con RLS.

- Reglas del proyecto y lista de comandos: [CLAUDE.md](CLAUDE.md). Léelo antes de tocar nada.
- Qué se construye: [docs/spec/club-os-primera-entrega.md](docs/spec/club-os-primera-entrega.md).
- Plan de cada fase: [docs/superpowers/plans/](docs/superpowers/plans/).
- Design system: [design/README.md](design/README.md).

## Requisitos

- Node 24, la versión que usa CI.
- pnpm 12. La versión exacta está en `packageManager`, en `package.json`.
- Docker en marcha. El Supabase local corre en contenedores.

## Primera vez

1. Instala las dependencias.

   ```bash
   pnpm install
   ```

2. Arranca Supabase en local. La primera vez descarga las imágenes y aplica las migraciones.

   ```bash
   pnpm supabase start
   ```

   Arráncalo con todos sus servicios, Storage incluido (`[storage] enabled = true` en `supabase/config.toml`, que es lo que hace `supabase start` a secas). La biblioteca de ejercicios guarda sus diagramas en un bucket privado. Sin el servicio de Storage no funcionan la subida de diagramas, los tests de Storage de `pnpm test:int` ni los e2e que suben un diagrama: el Supabase local tiene que incluir Storage (no lo excluyas con `-x storage-api` ni desactives `[storage]`).

3. Copia `.env.example` a `.env.local` y rellénalo con lo que imprime `pnpm supabase status -o env`:

   | En `.env.local` | Valor de `supabase status -o env` |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `PUBLISHABLE_KEY` (en CLI antiguos, `ANON_KEY`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` (si no viene, `SECRET_KEY`) |

   `.env.local` no se sube al repo. La clave de servicio solo la usan `scripts/` y `e2e/`, y nunca se configura en Vercel.

4. Siembra los datos de ejemplo: dos clubes ficticios.

   ```bash
   pnpm seed
   ```

5. Arranca la app y abre http://localhost:3000.

   ```bash
   pnpm dev
   ```

## Entrar en local

El acceso es por invitación, con un código de 6 dígitos. No hay contraseñas ni registro. La única excepción es el acceso de demo, temporal y apagado por defecto (ver «Acceso de demo»).

1. En `/login`, escribe el email de un usuario del seed.
2. Abre el buzón local en http://127.0.0.1:54324 y copia el código del último correo.
3. Escríbelo y entra.

| Email | Quién es |
| --- | --- |
| `alex@arcangel.test` | Entrenador de Alevín A |
| `irene@arcangel.test` | Entrenadora ayudante de Alevín A |
| `nora@arcangel.test` | Entrenadora de Benjamín A, en el mismo club |
| `raul@arcangel.test` | Dirección, sin equipo |
| `marta@demo.test` | Entrenadora del otro club |
| `sin.club@clubos.test` | Cuenta sin club |

`pnpm seed` se puede repetir: no duplica nada y recalcula las fechas respecto a hoy.

Si has usado Gestión en un club del seed, al volver a sembrar:

- Lo que es del seed vuelve a su texto, su estado, su orden y su número.
- Lo que creaste a mano se queda. Las secciones pasan detrás de las del seed, en el orden que tenían. Un Standard solo cambia de número si ocupaba uno de los del seed: pasa al primero libre, y `pnpm seed` lo dice al acabar.
- Con los ejercicios, igual: los que creaste se quedan y los del seed vuelven a su versión original, sin diagrama ni vídeo (ver «Despliegue de la biblioteca de ejercicios»).

Con las sesiones de entrenamiento pasa lo mismo: las del seed vuelven a lo que dice el seed (título, estado, lugar y ejercicios) y cambian de fecha con él; las que creaste en la app se quedan.

## Tests

| Comando | Qué prueba | Qué necesita |
| --- | --- | --- |
| `pnpm lint`, `pnpm typecheck` | ESLint y TypeScript | Nada más |
| `pnpm check:guards` | Reglas 2, 3 y 4 de CLAUDE.md (ni la clave de servicio ni nada de un club en `src/`; ni colores hex ni medidas entre corchetes con unidad en los componentes), que cada página de Gestión se exporta con `adminPage` y tokens al día | Nada más |
| `pnpm test` | Unidad y componentes (Vitest) | Nada más |
| `pnpm test:db` | RLS y aislamiento entre clubes y entre equipos, las funciones SQL y la postura de privilegios de todo `public` (pgTAP) | Supabase local |
| `pnpm test:int` | El seed, `generateLoginCode` (el código de acceso de los e2e), Storage (`scripts/media/storage.int.test.ts`: el bucket `club-media` y sus políticas, con la sesión de cada usuario del seed) y el importador de contenido (`scripts/content/import.int.test.ts`) contra la base de datos | Supabase local con Storage, `.env.local` y el seed ya cargado (`pnpm seed`) |
| `pnpm test:e2e` | La app en un móvil de 375×812 (Playwright) | Supabase local, `.env.local` y un puerto libre: el 3000, o el de `PORT`. Con `BASE_URL`, ver [Entorno remoto](#entorno-remoto) |

- La primera vez, instala el navegador de los e2e: `pnpm exec playwright install chromium`.
- Los e2e compilan y arrancan la app por su cuenta (`pnpm build && pnpm start`). Si ya hay algo en el puerto, lo usan tal cual. Con `BASE_URL` no arrancan nada: prueban esa URL.
- **Otro puerto.** `PORT=3100 pnpm test:e2e` arranca y prueba la app en el 3100. Úsalo si el 3000 está ocupado (por ejemplo, con `pnpm dev`) o si pasas los e2e en dos copias del repo a la vez.
- **Dos proyectos de Playwright.** `mobile` lee y corre en paralelo. `admin` son los specs que escriben (Gestión, la ficha y el editor de ejercicios, y las sesiones: crear, constructor y ejercicios en la sesión): van en serie y solo si `mobile` ha pasado. `pnpm test:e2e --project=mobile` lanza solo el primero. Un spec nuevo que escriba se añade a `ADMIN_SPECS`, en `playwright.config.ts`.
- **Los e2e borran contenido en local.** Al arrancar, y al empezar y acabar los specs de Gestión y de sesiones, dejan los clubes del seed como recién sembrados: todo lo que hayas creado a mano en esos clubes se borra. Eso incluye la metodología (secciones, valores, principios, Standards), los ejercicios y sus diagramas (también los ficheros de `club-media`) y las sesiones de entrenamiento. Los partidos no se tocan. `pnpm seed` no borra nada; los e2e sí. Solo pasa con un Supabase local.
- Los e2e siembran solos al arrancar, y solo si Supabase es local. Contra un Supabase remoto no siembran, no borran ni crean usuarios: usan los datos que ya haya, y los tests que escriben se saltan.
- Ningún e2e crea usuarios. Si el usuario que necesita un test no existe, el test falla y pide sembrar ese entorno.

## Probar desde el móvil

En el build de producción la cookie de sesión es `Secure`: solo viaja por HTTPS o en `localhost`. Con `pnpm start` y `http://<IP>:3000`, el móvil no guarda la sesión y el login no se mantiene.

Para probar en la red local:

- `pnpm dev --hostname <IP de tu equipo>` y abre `http://<IP>:3000`. En desarrollo la cookie no es `Secure`.
- O un túnel HTTPS hacia `pnpm start`.
- O la app desplegada, que ya va por HTTPS: ver [Entorno remoto](#entorno-remoto).

## Contenido de un club

El seed trae ejercicios de ejemplo, ficticios. El contenido real de un club (sus ejercicios, con su pizarra) vive en un **paquete** bajo `content/` y se carga con su propio comando, que no toca el seed:

```bash
pnpm content:import content/arcangel/biblioteca-entrenador-2026 --club arcangel
```

- **Solo crea lo que falta.** Repetirlo no duplica nada, y un ejercicio que ya existe no se toca: lo editado en la app manda.
- **`--update` sobrescribe.** Cada ejercicio del paquete vuelve a lo que dice el paquete, y lo retocado en la app en esos ejercicios se pierde. Lo que el formato del paquete no lleva se conserva: los Standards enlazados, el resumen y el vídeo.
- **Antes de escribir lo comprueba todo:** el paquete entero y que el club tenga los objetivos de trabajo y los principios que el paquete nombra. Si algo falla, lo dice de una vez y no escribe nada. Si falla a mitad de la escritura, deshace lo que había creado.
- **Si la ejecución se corta** (se cierra la terminal a mitad), repetir el comando completa el ejercicio que se quedó a medias.
- **Solo escribe en un Supabase local**, salvo `ALLOW_REMOTE_IMPORT=true`. Esa variable va en la shell, solo para esa orden, y nunca en `.env.local`, igual que `ALLOW_REMOTE_SEED`. Permitir sembrar no permite importar, ni al revés. Para un remoto, la URL y la clave de servicio se ponen como en [Sembrar el demo](#sembrar-el-demo).

El formato del paquete está en [`content/README.md`](content/README.md).

Dos avisos en local:

- **Los e2e borran lo importado.** Dejan los clubes del seed como recién sembrados (ver [Tests](#tests)). Después de pasarlos hay que importar otra vez.
- **`pnpm test:int` falla con un paquete importado.** El test del seed cuenta los ejercicios de cada club. Para volver a una base limpia: `pnpm supabase db reset` y `pnpm seed`.

## Entorno remoto

Hay un entorno desplegado para probar en un móvil real y para enseñar la app. Es de demo: nunca lleva datos reales.

### Qué hay

- **Supabase «Club OS»** en `eu-west-1` (Irlanda). Tiene las migraciones de `supabase/migrations/` con las mismas versiones que el repo. No tiene `supabase/seed.sql`: es del esquema `tests` y no debe llegar nunca al remoto.
- **Vercel, proyecto `club-os`**, con las funciones en `dub1` (Dublín, junto a la base de datos). Lo fija `vercel.json`.
- **Despliegues**: la integración con Git de Vercel despliega sola. Cada PR tiene su preview y cada push a `main` despliega producción, en https://club-os-phi.vercel.app. Las previews están detrás de la protección de despliegues de Vercel y piden un login de Vercel.

Las migraciones nuevas van al remoto con las mismas versiones que tienen en el repo: `pnpm supabase link --project-ref <ref>` una vez y después `pnpm supabase db push`. Nunca `supabase db reset --linked` ni `supabase db push --include-seed`: lo primero borra la base de datos y lo segundo lleva `seed.sql` al remoto.

### Despliegue de la biblioteca de ejercicios (Fase 3)

El Supabase remoto lo comparten producción (se despliega sola con cada push a `main`) y las previews de los PR. Las cuatro migraciones de la Fase 3 (`20261103000100_drills`, `…000200_media_storage`, `…000300_drill_search` y `…000400_save_drill`) tienen que estar aplicadas **antes de usar la preview del PR** para revisar en el móvil y **antes de fusionar**: sin ellas, `/drills` falla en cada carga y `/train` ya enlaza a ella. Son aditivas y seguras con la app que hay desplegada hoy: sigue funcionando con ellas puestas.

`supabase db push` aplica todo lo que falte en el remoto, no solo lo de la Fase 3: si alguna de las tres migraciones de la Fase 2 (The Way: `20261020000100_methodology`, `…000200_methodology_functions` y, de la revisión de su PR, `20261021000100_methodology_integrity`) tampoco está, se aplica en el mismo paso, delante de las cuatro.

Lista, en este orden:

- [ ] **Ver qué falta por aplicar**: `pnpm supabase migration list` contra el proyecto enlazado (`pnpm supabase link --project-ref <ref>` si aún no lo está). Apunta cuáles faltan: las de la Fase 3 y, quizá, alguna de las tres de la Fase 2. El resto de la lista vale igual con las de la Fase 2 pendientes que con ninguna, y `db push` las aplica en orden de versión.
- [ ] **Comprobar el remoto** antes de aplicar nada:
  - `select count(*) from practice_items where drill_id is not null;` tiene que dar 0. La migración añade la clave foránea `practice_items (organization_id, drill_id) → drills`, y fallaría con ítems que ya apuntan a un ejercicio que aún no existe.
  - `select extname, extnamespace::regnamespace from pg_extension where extname = 'unaccent';` no tiene que devolver una fila de otro esquema que `extensions`. La migración hace `create extension if not exists unaccent with schema extensions`: si ya estuviera instalada en otro esquema se saltaría, y `extensions.unaccent` (que usa la búsqueda) no existiría.
  - Postgres 15 o posterior (`show server_version;`): la clave foránea del diagrama usa `on delete set null (columna)`. El `config.toml` local fija la 17.
  - El rol con el que se migra puede crear políticas en `storage.objects` y escribir en `storage.buckets`.
- [ ] **Aplicar las migraciones** con `pnpm supabase db push`, como arriba. Antes de confirmar, comprueba que la lista que enseña es la que viste en `migration list`: las cuatro de la Fase 3 y, si faltaba alguna, las de la Fase 2.
- [ ] **Volver a sembrar el demo** («Sembrar el demo», más abajo): sin los ejercicios del seed (23 desde la Fase 4) la biblioteca sale vacía.
- [ ] **Saber qué hace un nuevo seed con los ejercicios.** Devuelve cada ejercicio del seed a lo que dice el seed: texto, estado, puntos, variantes y vínculos, y pone a null su diagrama y su vídeo. Lo que alguien editó en la app sobre esos ejercicios se pierde, y un diagrama subido a uno de ellos queda desenlazado (su objeto de Storage y su ficha de `media_assets` no se borran).

### Despliegue del Practice Builder (Fase 4)

La Fase 4 trae tres migraciones: `20261117000100_practice_integrity`, `…000200_practice_write` y `…000300_practice_functions`. Van detrás de las cuatro de la Fase 3: sus versiones son posteriores y dan por hecho algo que trae la primera de aquellas (un `updated_at` que avanza dentro de una transacción). Como aquellas, tienen que estar aplicadas **antes de usar la preview del PR** y **antes de fusionar**: sin ellas, abrir una sesión falla (`/train/[eventId]` lee una columna que aún no existe) y no se puede crear ni guardar ninguna.

`supabase db push` aplica todo lo que falte en el remoto, en orden de versión: si las de la Fase 3 (o las de la Fase 2) tampoco están, entran en el mismo paso, delante de estas tres. No hace falta aplicarlas por separado.

No hay nada nuevo en Storage, ni en Auth, ni en las variables de entorno: ni buckets, ni ajustes del panel, ni variables en Vercel.

Lista, en este orden:

- [ ] **Ver qué falta por aplicar**: `pnpm supabase migration list` contra el proyecto enlazado. Tienen que faltar, como mucho, las de las Fases 2, 3 y 4.
- [ ] **Saber qué hace la primera migración con lo que ya hay.** Añade restricciones sobre filas que existen (cada plan con evento es del equipo de ese evento y el evento es un entreno; títulos de 1 a 80 caracteres; un ítem lleva ejercicio o título) y falla, nombrando la restricción, si alguna fila no las cumple: no corrige nada en silencio. Hasta esta fase ningún usuario podía escribir sesiones, así que en el remoto solo están las del seed, que las cumplen.
- [ ] **Aplicar las migraciones** con `pnpm supabase db push`. Antes de confirmar, comprueba que la lista que enseña es la que viste en `migration list`.
- [ ] **Volver a sembrar el demo** («Sembrar el demo», más abajo). El seed de la Fase 4 añade a Arcángel tres ejercicios («Ayuda y recuperación 3x3», «Presión al balón en medio campo» y «Bloqueo y rebote 3x3»: 21 en total, 23 con los 2 de Club Demo), los enlaza a tres ítems de la sesión «Defensa presionante» y da a Alevín A una sesión cancelada, «Tiro libre y finalizaciones», para que el histórico tenga una. Un nuevo seed devuelve las sesiones del seed a lo que dice el seed (título, estado, lugar y ejercicios); las creadas en la app se quedan.
- [ ] **Comprobar a mano**, en un móvil y con la app desplegada:
  - Como entrenador (`alex@arcangel.test`): Sesiones → «Preparar sesión», crearla, añadirle un ejercicio y guardarla. Tiene que salir en «Próximas» y en Inicio si es la siguiente.
  - Como la entrenadora de otro equipo (`nora@arcangel.test`): abrir la URL de esa sesión. Tiene que ver «No encontramos esta página», sin ningún dato de la sesión. Lo mismo con `marta@demo.test`, del otro club.
  - Las horas: la sesión sale a la hora que se escribió, que es la del club (`organizations.timezone`), aunque el móvil esté en otra zona horaria.

Las tres migraciones no rompen la app que haya desplegada antes de fusionar: la única pantalla que leía planes era Inicio, que embebe el plan en su evento sin nombrar la clave foránea que la primera migración sustituye.

### Despliegue de Equipo y Partidos (Fase 6)

La Fase 6 trae dos migraciones: `20261215000100_development` (objetivos y notas de jugador) y `…000200_games_write` (escritura de partidos). Van detrás de las de las Fases 4 y 5 y, como aquellas, tienen que estar aplicadas **antes de usar la preview del PR** y **antes de fusionar**: sin ellas, la ficha de un jugador falla (lee `player_goals` y `coach_notes`, que aún no existen) y no se puede crear ningún partido.

No hay nada nuevo en Storage, ni en Auth, ni en las variables de entorno.

Lista, en este orden:

- [ ] **Ver qué falta por aplicar**: `pnpm supabase migration list` contra el proyecto enlazado. Tienen que faltar, como mucho, las de las Fases 2 a 6.
- [ ] **Saber qué hace la segunda migración con lo que ya hay.** Ata cada partido a un evento `game` con una clave foránea nueva y añade topes (rival de 1 a 80 caracteres, marcador entero o vacío). Falla, nombrando la restricción, si alguna fila no los cumple: no corrige nada en silencio. Hasta esta fase ningún usuario podía escribir partidos, así que en el remoto solo está el del seed, que los cumple.
- [ ] **Aplicar las migraciones** con `pnpm supabase db push`, comprobando que la lista que enseña es la de `migration list`.
- [ ] **Volver a sembrar el demo** («Sembrar el demo», más abajo). El seed de la Fase 6 añade a Arcángel la temporada 2025/26 con un equipo (Benjamín B, que entrenaba Álex: no sale en «mis equipos»), un partido ya jugado de Alevín A (CD Almendros, 54–49), objetivos de Hugo Serrano y Leo Ortega y dos notas sobre Hugo (una privada de Álex y una del cuerpo técnico de Irene). Todos son datos ficticios.
- [ ] **Comprobar a mano**, en un móvil y con la app desplegada:
  - Como entrenador (`alex@arcangel.test`): Equipo → Hugo Serrano. Tiene que ver dos objetivos activos, el historial con uno logrado y las dos notas. Añadir un objetivo, marcarlo como logrado y escribir una nota.
  - Como su ayudante (`irene@arcangel.test`): la misma ficha. Tiene que ver la nota del cuerpo técnico y **no** la privada de Álex. Lo mismo como dirección (`raul@arcangel.test`).
  - Como la entrenadora de otro equipo (`nora@arcangel.test`) y como `marta@demo.test`: la URL de esa ficha da «No encontramos esta página».
  - Partidos (Agenda → «Añadir» → «Partido»): crear uno, cancelarlo, y corregir el resultado del jugado.

### Despliegue de «Preparar sesión» (propuesta y plantillas)

Va encima del uso diario: primero su migración (abajo) y después esta, `20270119000100_practice_templates`. No crea tablas: añade un `check` a `practice_plans` (una plantilla no tiene evento), concede `insert (is_template)` y `delete` sobre ella, cambia la política de alta de un plan de equipo (rechaza el que venga marcado como plantilla), crea tres políticas y dos funciones (`save_practice_as_template` y `create_practice_from_template`). Tiene que estar aplicada **antes de usar la preview del PR** y **antes de fusionar**: sin ella, «Guardar como plantilla» y crear una sesión con una plantilla fallan. La propuesta de entrenamiento no depende de ella.

Nada en Storage, en Auth ni en las variables de entorno.

- [ ] **Ver qué falta por aplicar**: `pnpm supabase migration list`.
- [ ] **Comprobar que el `check` entra**: ninguna fila tiene `is_template` con `event_id` (`select count(*) from practice_plans where is_template and event_id is not null` da 0). Con el seed lo da: no hay plantillas.
- [ ] **Entre aplicarla y desplegar**, la app antigua no nota nada: no escribe `is_template` ni borra planes.
- [ ] **Aplicar la migración** con `pnpm supabase db push`.
- [ ] **Comprobar a mano**, en un móvil y con la app desplegada, como entrenador:
  - «Preparar sesión» acaba con «Proponer entrenamiento» y «Empezar desde cero». Proponer abre el constructor con ejercicios de la biblioteca y el aviso «Propuesta sin guardar…»; nada queda guardado hasta «Guardar sesión».
  - En el constructor, el total dice «Te sobran…» o «Te pasas…» cuando lo montado no dura lo que la franja.
  - En la ficha de una sesión con ejercicios, «Guardar como plantilla»; aparece en Sesiones → «Plantillas»; al usarla, la sesión nace con sus ejercicios; «Borrar plantilla» la quita. Otra persona del club no la ve.

### Despliegue del uso diario (navegación por rol, Agenda y directo)

Trae una migración: `20270105000100_live_state`. Añade a `practice_plans` dos columnas (`live_started_at` y `live_position`), sustituye `record_live_progress` por una con dos parámetros opcionales más y crea `reset_live_progress`. Tiene que estar aplicada **antes de usar la preview del PR** y **antes de fusionar**: sin ella, Inicio y la ficha de una sesión fallan (piden esas columnas) y el directo no guarda.

No hay tablas nuevas, ni nada en Storage, en Auth o en las variables de entorno.

Lista, en este orden:

- [ ] **Ver qué falta por aplicar**: `pnpm supabase migration list` contra el proyecto enlazado.
- [ ] **Saber qué hace con lo que ya hay.** Las columnas nacen vacías: todas las sesiones programadas quedan «sin iniciar», también las que algún móvil tuviera a medias (su estado guardado es de una versión anterior y se descarta). Una sesión ya hecha no cambia.
- [ ] **Entre aplicarla y desplegar**, la app antigua llama a `record_live_progress` con cuatro argumentos: los dos nuevos tienen valor por defecto, así que sigue funcionando.
- [ ] **Aplicar la migración** con `pnpm supabase db push`, comprobando que la lista que enseña es la de `migration list`.
- [ ] **Comprobar a mano**, en un móvil y con la app desplegada:
  - Como entrenador (`alex@arcangel.test`): la barra es Inicio, Agenda, Sesiones, Biblioteca y Equipo. Agenda enseña entrenos y partidos por semanas, y «Identidad» está en Inicio y en el menú de cuenta.
  - Iniciar la sesión de hoy desde Inicio, pasar al segundo ejercicio y salir: Inicio y la ficha dicen «Continuar entrenamiento» y «Ejercicio 2 de 4», también en otro dispositivo. Continuar abre el segundo. «Empezar de nuevo» lo deja en «Iniciar entrenamiento».
  - Como dirección (`raul@arcangel.test`): la cabecera tiene el selector de equipo. Elegir uno filtra Inicio, Agenda, Sesiones y Equipo; «Todos mis equipos» lo quita.

### Variables en Vercel

Solo dos, las dos públicas. Van en Production y en Preview.

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | La URL de la API del proyecto remoto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | La clave pública (publishable) del proyecto remoto |

Las tres `DEMO_LOGIN_*` del acceso de demo son aparte y temporales: solo existen mientras esté encendido (ver «Acceso de demo»).

La clave de servicio no se configura en Vercel: la app usa siempre la sesión del usuario. Las variables `NEXT_PUBLIC_` se leen al compilar, así que tras cambiarlas hace falta un despliegue nuevo.

### Auth en Supabase

El panel de Auth del remoto tiene que decir lo mismo que `supabase/config.toml`. `supabase db push` no lo sincroniza: se ajusta a mano en el panel.

| Ajuste | Valor | En `config.toml` |
| --- | --- | --- |
| Registro abierto | Desactivado | `[auth]` `enable_signup = false` |
| Código de acceso | 6 dígitos | `[auth.email]` `otp_length = 6` |
| Caducidad del código | 600 s | `[auth.email]` `otp_expiry = 600` |
| Plantilla «Magic link» | El contenido de `supabase/templates/magic_link.html` | `[auth.email.template.magic_link]` `content_path` |
| Asunto de esa plantilla | «Tu código para entrar» | `[auth.email.template.magic_link]` `subject` |
| URL del sitio | La de producción: https://club-os-phi.vercel.app | `[auth]` `site_url` (en local, `http://127.0.0.1:3000`) |

- El proveedor de email tiene que seguir activado (`[auth.email]` `enable_signup = true`) con el registro abierto desactivado (`[auth]` `enable_signup = false`). El código por email es el único acceso.
- No uses `supabase config push`: subiría al remoto el `site_url` local y los límites de desarrollo de abajo. Estos ajustes se hacen a mano en el panel.

Lo que no se copia del `config.toml` local, porque es de desarrollo:

- `max_frequency = "1s"` en `[auth.email]`. Deja pedir un código cada segundo. En el remoto se queda el valor por defecto del proyecto.
- Los límites de `[auth.rate_limit]`. Se deciden aparte para el remoto (ver abajo).

### Email

- El correo integrado de Supabase solo envía a miembros de la organización de Supabase y con un límite muy bajo. Sirve para probar con tu propio email.
- Los usuarios reales necesitan un SMTP propio, configurado en el panel de Auth.
- Los usuarios de demo del seed usan direcciones `.test`, que no pueden recibir correo. Para entrar como uno de ellos, genera su código desde el panel de Supabase, o deja que lo haga el helper de los e2e.

### Acceso de demo (temporal)

Mientras el remoto no tenga SMTP, el login puede enseñar dos botones, «Probar como entrenador» y «Probar como dirección», que entran como un usuario de ejemplo sin pedir código.

Es una excepción a «acceso solo por invitación»: **cualquiera que abra la URL entra como ese usuario** y puede hacer todo lo que él pueda. Vale solo para un entorno con datos de demo, y hay que apagarlo antes de que entre un solo dato real.

Está apagado salvo que el servidor de la app tenga estas tres variables. Son de servidor, sin `NEXT_PUBLIC_`: la contraseña no llega al navegador.

| Variable | Valor |
| --- | --- |
| `DEMO_LOGIN_COACH_EMAIL` | El usuario de demo entrenador, por ejemplo `alex@arcangel.test` |
| `DEMO_LOGIN_ADMIN_EMAIL` | El usuario de demo de dirección, por ejemplo `raul@arcangel.test` |
| `DEMO_LOGIN_PASSWORD` | La contraseña de los dos. Al menos 16 caracteres, generada y guardada en un gestor |

- Solo valen emails `.test`, los de los usuarios del seed. Con cualquier otro, ese botón no sale y la acción se niega: el botón no puede abrir la cuenta de una persona.
- Con un solo email sale un solo botón.
- Cada entrada gasta cupo de los límites de Auth, que comparte todo el despliegue (ver «Límites de Auth»).

Encenderlo:

1. Siembra el remoto si no lo está (ver «Sembrar el demo»).
2. Pon la contraseña a los usuarios con `pnpm demo:password`. Nunca crea cuentas: si un usuario no existe, falla sin cambiar nada. La contraseña se pide sin eco, como la clave de servicio.

   Git Bash:

   ```bash
   export NEXT_PUBLIC_SUPABASE_URL="https://…"
   export DEMO_LOGIN_COACH_EMAIL="alex@arcangel.test" DEMO_LOGIN_ADMIN_EMAIL="raul@arcangel.test"
   read -rs -p "Clave de servicio: " SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY; echo
   read -rs -p "Contraseña de demo: " DEMO_LOGIN_PASSWORD && export DEMO_LOGIN_PASSWORD; echo
   pnpm demo:password
   unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY DEMO_LOGIN_COACH_EMAIL DEMO_LOGIN_ADMIN_EMAIL DEMO_LOGIN_PASSWORD
   ```

   PowerShell:

   ```powershell
   $env:NEXT_PUBLIC_SUPABASE_URL = "https://…"
   $env:DEMO_LOGIN_COACH_EMAIL = "alex@arcangel.test"
   $env:DEMO_LOGIN_ADMIN_EMAIL = "raul@arcangel.test"
   $clave = Read-Host "Clave de servicio" -AsSecureString
   $env:SUPABASE_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new("", $clave).Password
   $demo = Read-Host "Contraseña de demo" -AsSecureString
   $env:DEMO_LOGIN_PASSWORD = [System.Net.NetworkCredential]::new("", $demo).Password
   pnpm demo:password
   Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL, Env:SUPABASE_SERVICE_ROLE_KEY, Env:DEMO_LOGIN_COACH_EMAIL, Env:DEMO_LOGIN_ADMIN_EMAIL, Env:DEMO_LOGIN_PASSWORD, Variable:clave, Variable:demo
   ```

3. Crea las tres variables en Vercel (Production) con los mismos valores y despliega de nuevo. `/login` se genera al compilar: sin un despliegue nuevo los botones no aparecen.

Apagarlo: borra las tres variables en Vercel y despliega de nuevo. Para que la contraseña deje de valer, repite el paso 2 con otra que no guardes.

En local funciona igual: las tres variables en `.env.local` y `pnpm demo:password`.

### Claves en la shell

Los secretos (`SUPABASE_SERVICE_ROLE_KEY` y, si lo usas, `VERCEL_AUTOMATION_BYPASS_SECRET`) solo se dan en la sesión de la shell. Nunca van en un fichero, `.env.local` incluido. Y nunca los escribas en la línea de comandos: `SUPABASE_SERVICE_ROLE_KEY=… pnpm seed` deja la clave en el historial de la shell.

Pídela sin eco. Así no pasa por el historial.

Git Bash:

```bash
read -rs -p "Clave de servicio: " SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY; echo
```

PowerShell (vale también en Windows PowerShell 5.1: `Read-Host -MaskInput` solo existe en PowerShell 7):

```powershell
$clave = Read-Host "Clave de servicio" -AsSecureString
$env:SUPABASE_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new("", $clave).Password
```

`VERCEL_AUTOMATION_BYPASS_SECRET` se pide igual, cambiando el nombre. Las variables que no son secretas (las URLs, `BASE_URL`) sí se pueden escribir en la línea.

Al terminar, cierra la shell o borra las variables. Cada bloque de abajo acaba con ese borrado.

### Sembrar el demo

El seed escribe con la clave de servicio y se niega a correr contra un Supabase remoto salvo que se lo pidas con `ALLOW_REMOTE_SEED=true`. Hazlo solo en un entorno de demo y nunca junto a datos reales. Esa variable tampoco va en ningún fichero, y solo debe estar puesta durante el seed.

Pon la URL del proyecto remoto, pide la clave como se explica arriba y siembra.

Git Bash:

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://…"
read -rs -p "Clave de servicio: " SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY; echo
ALLOW_REMOTE_SEED=true pnpm seed
unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
```

PowerShell:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://…"
$clave = Read-Host "Clave de servicio" -AsSecureString
$env:SUPABASE_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new("", $clave).Password
$env:ALLOW_REMOTE_SEED = "true"
pnpm seed
Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL, Env:SUPABASE_SERVICE_ROLE_KEY, Env:ALLOW_REMOTE_SEED, Variable:clave
```

Las fechas del seed son relativas al día en que se siembra: vuelve a sembrar antes de una demo. Un nuevo seed también devuelve los ejercicios y las sesiones del seed a su versión original (ver «Despliegue de la biblioteca de ejercicios» y «Despliegue del Practice Builder»).

### E2E contra una URL desplegada

Con la URL desplegada y el Supabase remoto de esa app, y el entorno ya sembrado:

Git Bash:

```bash
export BASE_URL="https://…"
export NEXT_PUBLIC_SUPABASE_URL="https://…"
read -rs -p "Clave de servicio: " SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY; echo
pnpm test:e2e e2e/tenancy.spec.ts
unset BASE_URL NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
```

PowerShell:

```powershell
$env:BASE_URL = "https://…"
$env:NEXT_PUBLIC_SUPABASE_URL = "https://…"
$clave = Read-Host "Clave de servicio" -AsSecureString
$env:SUPABASE_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new("", $clave).Password
pnpm test:e2e e2e/tenancy.spec.ts
Remove-Item Env:BASE_URL, Env:NEXT_PUBLIC_SUPABASE_URL, Env:SUPABASE_SERVICE_ROLE_KEY, Variable:clave
```

- `BASE_URL` es la URL desplegada. Playwright no construye ni arranca nada.
- La URL y la clave de Supabase son las del proyecto remoto de esa app, y van en la shell. Los tests piden sus códigos de acceso con la clave de servicio: si salieran de otro Supabase, la app no los aceptaría. Con `BASE_URL` remoto y un Supabase local o ausente, los e2e fallan antes de empezar, con un solo mensaje.
- El entorno tiene que estar sembrado de antemano. Contra un remoto los e2e no siembran ni crean usuarios, y no guardan sesiones: si falta un usuario del seed, fallan y piden sembrar. Sí reescriben el código de acceso de los usuarios que ya existen y abren sesiones con ellos, como cualquiera que entre.
- Sin traza ni vídeo: una traza lleva la cookie de sesión de la ejecución y no debe acabar en un artefacto.
- Para una preview con protección de despliegues, pide también `VERCEL_AUTOMATION_BYPASS_SECRET` (el secreto de «Protection Bypass for Automation» del proyecto en Vercel). Los tests lo envían en la cabecera `x-vercel-protection-bypass` solo en las peticiones al origen de `BASE_URL`. Nunca a otros dominios, y nunca a `localhost`, aunque la variable esté puesta. Si el secreto es incorrecto y la protección redirige a otro dominio, esa redirección lo lleva también: si un test acaba en vercel.com, cambia el secreto.
- Los tests de Inicio (`e2e/home.spec.ts`) y los de la lista de sesiones (`e2e/train.spec.ts`) comparan con el calendario del seed y solo aciertan si el entorno se sembró hace poco. `E2E_SEED_NOW=<fecha ISO>` dice cuándo se sembró.

### Límites de Auth

Todas las peticiones a Auth salen de la IP del servidor de Vercel, así que los límites son compartidos por todos los usuarios del despliegue. Cada login de un e2e gasta uno de esos cupos. Qué hacer con ellos está en [docs/superpowers/backlog.md](docs/superpowers/backlog.md) («Límites de Auth»).

## Archivos generados

No se editan a mano. CI falla si no están al día.

- `src/ui/tokens.css` sale de `design/tokens.json` con `pnpm tokens`. Lleva un bloque `@theme` de Tailwind: no es CSS plano y solo funciona importado desde `src/app/globals.css`. El generador es estricto: si a `design/tokens.json` le falta una familia, un token no tiene nombre o valor, un nombre se repite o un alias apunta a un token que no existe, `pnpm tokens` falla y dice dónde, en vez de escribir un CSS roto.
- `src/lib/database.types.ts` sale del esquema local con `pnpm db:types`. Regenéralo después de cada migración, con Supabase arrancado.
