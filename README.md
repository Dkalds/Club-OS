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

El acceso es por invitación, con un código de 6 dígitos. No hay contraseñas ni registro.

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

Con las sesiones de entrenamiento pasa lo mismo: las del seed vuelven a lo que dice el seed (título, estado, lugar y ejercicios) y cambian de fecha con él; las que creaste en la app se quedan.

## Tests

| Comando | Qué prueba | Qué necesita |
| --- | --- | --- |
| `pnpm lint`, `pnpm typecheck` | ESLint y TypeScript | Nada más |
| `pnpm check:guards` | Reglas 2, 3 y 4 de CLAUDE.md (ni la clave de servicio ni nada de un club en `src/`; ni colores hex ni medidas entre corchetes con unidad en los componentes), que cada página de Gestión se exporta con `adminPage` y tokens al día | Nada más |
| `pnpm test` | Unidad y componentes (Vitest) | Nada más |
| `pnpm test:db` | RLS y aislamiento entre clubes y entre equipos, las funciones SQL y la postura de privilegios de todo `public` (pgTAP) | Supabase local |
| `pnpm test:int` | El seed, `generateLoginCode` (el código de acceso de los e2e) y Storage (`scripts/media/storage.int.test.ts`: el bucket `club-media` y sus políticas, con la sesión de cada usuario del seed) contra la base de datos | Supabase local con Storage, `.env.local` y el seed ya cargado (`pnpm seed`) |
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

## Entorno remoto

Hay un entorno desplegado para probar en un móvil real y para enseñar la app. Es de demo: nunca lleva datos reales.

### Qué hay

- **Supabase «Club OS»** en `eu-west-1` (Irlanda). Tiene las migraciones de `supabase/migrations/` con las mismas versiones que el repo. No tiene `supabase/seed.sql`: es del esquema `tests` y no debe llegar nunca al remoto.
- **Vercel, proyecto `club-os`**, con las funciones en `dub1` (Dublín, junto a la base de datos). Lo fija `vercel.json`.
- **Despliegues**: la integración con Git de Vercel despliega sola. Cada PR tiene su preview y cada push a `main` despliega producción, en https://club-os-phi.vercel.app. Las previews están detrás de la protección de despliegues de Vercel y piden un login de Vercel.

Las migraciones nuevas van al remoto con las mismas versiones que tienen en el repo: `pnpm supabase link --project-ref <ref>` una vez y después `pnpm supabase db push`. Nunca `supabase db reset --linked` ni `supabase db push --include-seed`: lo primero borra la base de datos y lo segundo lleva `seed.sql` al remoto.

### Despliegue de la biblioteca de ejercicios (Fase 3)

El Supabase remoto lo comparten producción (se despliega sola con cada push a `main`) y las previews de los PR. Las cuatro migraciones de la Fase 3 (`20261103000100_drills`, `…000200_media_storage`, `…000300_drill_search` y `…000400_save_drill`) tienen que estar aplicadas **antes de usar la preview del PR** para revisar en el móvil y **antes de fusionar**: sin ellas, `/drills` falla en cada carga y `/train` ya enlaza a ella. Son aditivas y seguras con la app que hay desplegada hoy: sigue funcionando con ellas puestas.

`supabase db push` aplica todo lo que falte en el remoto, no solo lo de la Fase 3: si las dos migraciones de la Fase 2 (The Way, `20261020000100_methodology` y `…000200_methodology_functions`) tampoco están, se aplican en el mismo paso, delante de las cuatro.

Lista, en este orden:

- [ ] **Ver qué falta por aplicar**: `pnpm supabase migration list` contra el proyecto enlazado (`pnpm supabase link --project-ref <ref>` si aún no lo está). Apunta cuáles faltan: las de la Fase 3 y, quizá, las dos de la Fase 2. El resto de la lista vale igual con las dos de la Fase 2 pendientes que con ninguna, y `db push` las aplica en orden de versión.
- [ ] **Comprobar el remoto** antes de aplicar nada:
  - `select count(*) from practice_items where drill_id is not null;` tiene que dar 0. La migración añade la clave foránea `practice_items (organization_id, drill_id) → drills`, y fallaría con ítems que ya apuntan a un ejercicio que aún no existe.
  - `select extname, extnamespace::regnamespace from pg_extension where extname = 'unaccent';` no tiene que devolver una fila de otro esquema que `extensions`. La migración hace `create extension if not exists unaccent with schema extensions`: si ya estuviera instalada en otro esquema se saltaría, y `extensions.unaccent` (que usa la búsqueda) no existiría.
  - Postgres 15 o posterior (`show server_version;`): la clave foránea del diagrama usa `on delete set null (columna)`. El `config.toml` local fija la 17.
  - El rol con el que se migra puede crear políticas en `storage.objects` y escribir en `storage.buckets`.
- [ ] **Aplicar las migraciones** con `pnpm supabase db push`, como arriba. Antes de confirmar, comprueba que la lista que enseña es la que viste en `migration list`: las cuatro de la Fase 3 y, si faltaban, las dos de la Fase 2.
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
  - Como entrenador (`alex@arcangel.test`): Entrenar → «Nueva sesión», crearla, añadirle un ejercicio y guardarla. Tiene que salir en «Próximas» y en Inicio si es la siguiente.
  - Como la entrenadora de otro equipo (`nora@arcangel.test`): abrir la URL de esa sesión. Tiene que ver «No encontramos esta página», sin ningún dato de la sesión. Lo mismo con `marta@demo.test`, del otro club.
  - Las horas: la sesión sale a la hora que se escribió, que es la del club (`organizations.timezone`), aunque el móvil esté en otra zona horaria.

Las tres migraciones no rompen la app que haya desplegada antes de fusionar: la única pantalla que leía planes era Inicio, que embebe el plan en su evento sin nombrar la clave foránea que la primera migración sustituye.

### Variables en Vercel

Solo dos, las dos públicas. Van en Production y en Preview.

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | La URL de la API del proyecto remoto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | La clave pública (publishable) del proyecto remoto |

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
