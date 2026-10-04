import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import { fail, type ActionError, type ActionResult } from "@/lib/action-result";

/** Un fallo de una acción, tal como lo enseña un formulario: el error y el de cada campo. */
export type Failure = { error: ActionError; fieldErrors: Record<string, string> };

/**
 * Lo común a todo lo que llama a una Server Action desde un componente de cliente, en Gestión
 * o fuera de ella: el estado de espera, el fallo y la mecánica de lanzarla. Cada componente
 * decide qué hace con lo que sale bien (`onSuccess`) y qué enseña del fallo.
 *
 * `run(call, onSuccess)`:
 * - Quita el fallo anterior y lanza `call` dentro de una transición: `pending` es verdadero
 *   hasta que termina, y los botones se desactivan con él.
 * - Una acción siempre devuelve un `ActionResult`, pero la llamada puede lanzar (la red se cae
 *   a medias, el servidor no responde): eso es un `SAVE_FAILED`, sin el mensaje del error.
 * - Salvo lo que lanza el propio Next para dirigir el flujo: si la acción llamó a `notFound()`
 *   o a `redirect()`, la llamada rechaza con ese error y aquí se relanza (`unstable_rethrow`).
 *   Dentro de la transición, React lo sube al límite de Next que lo espera: el que pinta el
 *   404 o el que navega. No es un fallo al guardar, y reintentar no serviría de nada.
 *
 * Lo que este hook no distingue: con la sesión cerrada, el proxy redirige la petición de la
 * acción a `/login` y la llamada rechaza con un error cualquiera, no con uno de Next. Sigue
 * siendo un `SAVE_FAILED` (ver `docs/superpowers/backlog.md`, Fase 7).
 * - Si va bien, llama a `onSuccess` con sus datos; si no, `failure` se queda con el error y los
 *   errores de campo (vacíos si no hay).
 *
 * Tras un `await`, React ya no considera transición lo que se actualiza después (un límite de
 * JavaScript): sin volver a envolverlo, el resultado se pintaría con `pending` aún en
 * verdadero (un «Cambios guardados.» con el botón todavía parado). Por eso el resultado se
 * aplica en una segunda `startTransition`, y llega en la misma pintura que el fin de la espera.
 * `onSuccess` corre dentro de ella: puede cambiar estado y navegar.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);

  function run<T>(call: () => Promise<ActionResult<T>>, onSuccess?: (data: T) => void): void {
    setFailure(null);
    startTransition(async () => {
      let result: ActionResult<T>;
      try {
        result = await call();
      } catch (error) {
        unstable_rethrow(error);
        result = fail("SAVE_FAILED");
      }
      startTransition(() => {
        if (result.ok) {
          onSuccess?.(result.data);
        } else {
          setFailure({ error: result.error, fieldErrors: result.fieldErrors ?? {} });
        }
      });
    });
  }

  return { pending, failure, run };
}
