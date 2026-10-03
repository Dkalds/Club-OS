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

## Tests

| Comando | Qué prueba | Qué necesita |
| --- | --- | --- |
| `pnpm lint`, `pnpm typecheck` | ESLint y TypeScript | Nada más |
| `pnpm check:guards` | Reglas 2 y 3 de CLAUDE.md y tokens al día | Nada más |
| `pnpm test` | Unidad y componentes (Vitest) | Nada más |
| `pnpm test:db` | RLS y aislamiento entre clubes (pgTAP) | Supabase local |
| `pnpm test:int` | El seed contra la base de datos | Supabase local y `.env.local` |
| `pnpm test:e2e` | La app en un móvil de 375×812 (Playwright) | Supabase local, `.env.local` y el puerto 3000 libre. Con `BASE_URL`, ver [Entorno remoto](#entorno-remoto) |

- La primera vez, instala el navegador de los e2e: `pnpm exec playwright install chromium`.
- Los e2e compilan y arrancan la app por su cuenta (`pnpm build && pnpm start`). Si ya hay algo en el puerto 3000, lo usan tal cual. Con `BASE_URL` no arrancan nada: prueban esa URL.
- Los e2e siembran solos al arrancar, y solo si Supabase es local. Contra un Supabase remoto no escriben nada: usan los datos que ya haya.
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

Lo que no se copia del `config.toml` local, porque es de desarrollo:

- `max_frequency = "1s"` en `[auth.email]`. Deja pedir un código cada segundo. En el remoto se queda el valor por defecto del proyecto.
- Los límites de `[auth.rate_limit]`. Se deciden aparte para el remoto (ver abajo).

### Email

- El correo integrado de Supabase solo envía a miembros de la organización de Supabase y con un límite muy bajo. Sirve para probar con tu propio email.
- Los usuarios reales necesitan un SMTP propio, configurado en el panel de Auth.
- Los usuarios de demo del seed usan direcciones `.test`, que no pueden recibir correo. Para entrar como uno de ellos, genera su código desde el panel de Supabase, o deja que lo haga el helper de los e2e.

### Sembrar el demo

El seed escribe con la clave de servicio y se niega a correr contra un Supabase remoto salvo que se lo pidas. Hazlo desde una shell, solo en un entorno de demo y nunca junto a datos reales:

```bash
NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… ALLOW_REMOTE_SEED=true pnpm seed
```

Pon la URL y la clave del proyecto remoto. `ALLOW_REMOTE_SEED` no se escribe en ningún fichero, ni en `.env.local`. Las fechas del seed son relativas al día en que se siembra: vuelve a sembrar antes de una demo.

### E2E contra una URL desplegada

```bash
BASE_URL=https://… NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm test:e2e e2e/tenancy.spec.ts
```

- `BASE_URL` es la URL desplegada. Playwright no construye ni arranca nada.
- La URL y la clave de Supabase son las del proyecto remoto de esa app, y van en la shell. Los tests piden sus códigos de acceso con la clave de servicio: si salieran de otro Supabase, la app no los aceptaría. Con `BASE_URL` remoto y un Supabase local o ausente, los e2e fallan antes de empezar, con un solo mensaje.
- El entorno tiene que estar sembrado de antemano. Contra un remoto los e2e no siembran, no guardan sesiones y nunca crean usuarios: si falta uno del seed, fallan y piden sembrar.
- Sin traza ni vídeo: una traza lleva la cookie de sesión de la ejecución y no debe acabar en un artefacto.
- Para una preview con protección de despliegues, pasa también `VERCEL_AUTOMATION_BYPASS_SECRET` (el secreto de «Protection Bypass for Automation» del proyecto en Vercel) por la shell. Los tests lo envían en la cabecera `x-vercel-protection-bypass`. Si no está, no se envía nada.
- Los tests de Inicio (`e2e/home.spec.ts`) comparan con el calendario del seed y solo aciertan si el entorno se sembró hace poco. `E2E_SEED_NOW=<fecha ISO>` dice cuándo se sembró.

### Límites de Auth

Todas las peticiones a Auth salen de la IP del servidor de Vercel, así que los límites son compartidos por todos los usuarios del despliegue. Cada login de un e2e gasta uno de esos cupos. Qué hacer con ellos está en [docs/superpowers/backlog.md](docs/superpowers/backlog.md) («Límites de Auth»).

## Archivos generados

No se editan a mano. CI falla si no están al día.

- `src/ui/tokens.css` sale de `design/tokens.json` con `pnpm tokens`. Lleva un bloque `@theme` de Tailwind: no es CSS plano y solo funciona importado desde `src/app/globals.css`.
- `src/lib/database.types.ts` sale del esquema local con `pnpm db:types`. Regenéralo después de cada migración, con Supabase arrancado.
