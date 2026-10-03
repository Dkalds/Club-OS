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

   `.env.local` no se sube al repo. La clave de servicio solo la usan `scripts/` y `e2e/`.

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
| `pnpm test:e2e` | La app en un móvil de 375×812 (Playwright) | Supabase local, `.env.local` y el puerto 3000 libre |

- La primera vez, instala el navegador de los e2e: `pnpm exec playwright install chromium`.
- Los e2e compilan y arrancan la app por su cuenta (`pnpm build && pnpm start`). Si ya hay algo en el puerto 3000, lo usan tal cual.
- Los e2e siembran solos al arrancar, y solo si Supabase es local. Contra un Supabase remoto no escriben nada: usan los datos que ya haya.

## Probar desde el móvil

En el build de producción la cookie de sesión es `Secure`: solo viaja por HTTPS o en `localhost`. Con `pnpm start` y `http://<IP>:3000`, el móvil no guarda la sesión y el login no se mantiene.

Para probar en la red local:

- `pnpm dev --hostname <IP de tu equipo>` y abre `http://<IP>:3000`. En desarrollo la cookie no es `Secure`.
- O un túnel HTTPS hacia `pnpm start`.

## Archivos generados

No se editan a mano. CI falla si no están al día.

- `src/ui/tokens.css` sale de `design/tokens.json` con `pnpm tokens`. Lleva un bloque `@theme` de Tailwind: no es CSS plano y solo funciona importado desde `src/app/globals.css`.
- `src/lib/database.types.ts` sale del esquema local con `pnpm db:types`. Regenéralo después de cada migración, con Supabase arrancado.
