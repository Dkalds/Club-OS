import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Cuánto esperan `waitFor` y `findBy*` antes de rendirse. El 1 s por defecto sobra en una
// máquina tranquila y se queda corto con la suite entera y otras cosas corriendo a la vez: un
// repintado que tarda más no es un fallo del componente. Una espera que de verdad no se cumple
// sigue fallando, 5 s después. El `testTimeout` del proyecto `ui` es mayor, para que el fallo
// que se vea sea el de la espera y no el del tiempo del test.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});
