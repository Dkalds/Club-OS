import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Search } from "./search";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function field() {
  return screen.getByRole("searchbox", { name: "Buscar ejercicios" });
}

function type(text: string) {
  fireEvent.change(field(), { target: { value: text } });
}

describe("Search", () => {
  it("tiene nombre accesible, sacado del placeholder sin los puntos suspensivos", () => {
    render(<Search placeholder="Buscar ejercicios…" onSearch={() => {}} />);

    expect(field()).toHaveAttribute("placeholder", "Buscar ejercicios…");
  });

  it("un placeholder sin puntos suspensivos es su propio nombre", () => {
    render(<Search placeholder="Buscar" onSearch={() => {}} />);

    expect(screen.getByRole("searchbox", { name: "Buscar" })).toBeInTheDocument();
  });

  it("enseña el valor inicial", () => {
    render(<Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={() => {}} />);

    expect(field()).toHaveValue("outlet");
  });

  it("no busca al montarse, ni con valor inicial", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={onSearch} />);

    act(() => vi.advanceTimersByTime(1000));

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("busca una sola vez, a los 250 ms de la última pulsación", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" onSearch={onSearch} />);

    type("o");
    act(() => vi.advanceTimersByTime(100));
    type("ou");
    act(() => vi.advanceTimersByTime(100));
    type("outl");
    act(() => vi.advanceTimersByTime(249));
    expect(onSearch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("outl");
    act(() => vi.advanceTimersByTime(1000));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("busca otra vez en la pausa siguiente, con el texto de ese momento", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" onSearch={onSearch} />);

    type("outl");
    act(() => vi.advanceTimersByTime(250));
    type("outlet");
    act(() => vi.advanceTimersByTime(250));

    expect(onSearch.mock.calls).toEqual([["outl"], ["outlet"]]);
  });

  it("respeta un debounce propio", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" debounceMs={600} onSearch={onSearch} />);

    type("outl");
    act(() => vi.advanceTimersByTime(599));
    expect(onSearch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));

    expect(onSearch).toHaveBeenCalledWith("outl");
  });

  it("no manda los espacios de los lados: envía el texto recortado, y el campo conserva lo escrito", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" onSearch={onSearch} />);

    type("  outl ");
    act(() => vi.advanceTimersByTime(250));

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("outl");
    // Quien teclea no ve cómo se le recorta lo que escribe.
    expect(field()).toHaveValue("  outl ");
  });

  it("un texto de solo espacios no es una búsqueda", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" onSearch={onSearch} />);

    type("   ");
    act(() => vi.advanceTimersByTime(1000));

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("un defaultValue con espacios a los lados no busca al montarse ni al teclear lo mismo", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" defaultValue=" outlet " onSearch={onSearch} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(onSearch).not.toHaveBeenCalled();

    type("outlet");
    act(() => vi.advanceTimersByTime(1000));

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("Intro con espacios a los lados busca el texto recortado", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" onSearch={onSearch} />);

    type("  outl ");
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(onSearch.mock.calls).toEqual([["outl"]]);
  });

  it("un espacio detrás de una palabra ya buscada no busca ni toca el campo", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" defaultValue="rebote" onSearch={onSearch} />);

    type("rebote ");
    act(() => vi.advanceTimersByTime(1000));

    expect(onSearch).not.toHaveBeenCalled();
    expect(field()).toHaveValue("rebote ");
  });

  it("maxLength llega al campo, y sin él no lo limita", () => {
    const { rerender } = render(
      <Search placeholder="Buscar ejercicios…" maxLength={80} onSearch={() => {}} />,
    );
    expect(field()).toHaveAttribute("maxlength", "80");

    rerender(<Search placeholder="Buscar ejercicios…" onSearch={() => {}} />);
    expect(field()).not.toHaveAttribute("maxlength");
  });

  it("Intro busca al momento, sin esperar, y solo una vez", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" onSearch={onSearch} />);

    type("outl");
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("outl");
    act(() => vi.advanceTimersByTime(1000));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("Intro sin cambios no repite la búsqueda", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={onSearch} />);

    fireEvent.keyDown(field(), { key: "Enter" });

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("Intro no envía ningún formulario que lo contenga", () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Search placeholder="Buscar ejercicios…" onSearch={() => {}} />
      </form>,
    );

    const notPrevented = fireEvent.keyDown(field(), { key: "Enter" });

    // El manejador cancela la tecla: el navegador no hace el envío implícito del formulario.
    expect(notPrevented).toBe(false);
  });

  it("vaciar el campo busca «» para que la lista se restablezca", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={onSearch} />);

    type("");
    act(() => vi.advanceTimersByTime(250));

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("");
  });

  it("escribir y volver al texto de antes dentro de la pausa no busca nada", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={onSearch} />);

    type("outlets");
    act(() => vi.advanceTimersByTime(100));
    type("outlet");
    act(() => vi.advanceTimersByTime(1000));

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("no pinta el botón de borrar mientras el campo está vacío", () => {
    render(<Search placeholder="Buscar ejercicios…" onSearch={() => {}} />);

    expect(screen.queryByRole("button", { name: "Borrar búsqueda" })).not.toBeInTheDocument();
  });

  it("con texto, el botón de borrar vacía el campo, busca «» al momento y devuelve el foco", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={onSearch} />);

    fireEvent.click(screen.getByRole("button", { name: "Borrar búsqueda" }));

    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("");
    act(() => vi.advanceTimersByTime(1000));
    expect(onSearch).toHaveBeenCalledTimes(1);
    // Y desaparece: ya no hay nada que borrar.
    expect(screen.queryByRole("button", { name: "Borrar búsqueda" })).not.toBeInTheDocument();
  });

  it("borrar cancela la búsqueda pendiente", () => {
    const onSearch = vi.fn();
    render(<Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={onSearch} />);

    type("outlet 2");
    fireEvent.click(screen.getByRole("button", { name: "Borrar búsqueda" }));
    act(() => vi.advanceTimersByTime(1000));

    expect(onSearch.mock.calls).toEqual([[""]]);
  });

  it("el botón de borrar mide 44 px", () => {
    render(<Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={() => {}} />);

    expect(screen.getByRole("button", { name: "Borrar búsqueda" })).toHaveClass(
      "w-(--target-min)",
    );
  });

  it("llama a la última función onSearch, no a la del primer render", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Search placeholder="Buscar ejercicios…" onSearch={first} />);

    type("outl");
    rerender(<Search placeholder="Buscar ejercicios…" onSearch={second} />);
    act(() => vi.advanceTimersByTime(250));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("outl");
  });

  it("al desmontarse cancela la búsqueda pendiente", () => {
    const onSearch = vi.fn();
    const { unmount } = render(<Search placeholder="Buscar ejercicios…" onSearch={onSearch} />);

    type("outl");
    unmount();
    act(() => vi.advanceTimersByTime(1000));

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("es un campo de búsqueda de 44 px, en surface-2 y con borde line-strong", () => {
    render(<Search placeholder="Buscar ejercicios…" onSearch={() => {}} />);

    expect(field()).toHaveClass(
      "h-(--target-min)",
      "rounded-md",
      "border-line-strong",
      "bg-surface-2",
      "text-ink",
      "placeholder:text-ink-3",
    );
    expect(field()).toHaveClass("focus-visible:outline-2", "focus-visible:outline-focus-ring");
  });

  it("el texto es de 17 px (body-l): por debajo de 16 px iOS amplía la página al enfocar", () => {
    render(<Search placeholder="Buscar ejercicios…" onSearch={() => {}} />);

    expect(field()).toHaveClass("text-body-l");
    expect(field()).not.toHaveClass("text-body");
  });

  it("el icono de lupa es decorativo", () => {
    render(<Search placeholder="Buscar ejercicios…" onSearch={() => {}} />);

    const landmark = screen.getByRole("search");
    expect(landmark.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

// Un `defaultValue` que cambia después de montar es la URL que cambia (el «Quitar filtros» de
// la lista vacía, atrás y adelante del navegador). El campo lo sigue, salvo que sea justo el
// eco de su propia búsqueda: entonces no toca nada, para no mover el cursor ni el foco de
// quien sigue escribiendo.
describe("Search · sigue a defaultValue", () => {
  it("un defaultValue nuevo se ve en el campo y no se manda como búsqueda", () => {
    const onSearch = vi.fn();
    const { rerender } = render(
      <Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={onSearch} />,
    );

    rerender(<Search placeholder="Buscar ejercicios…" defaultValue="" onSearch={onSearch} />);

    expect(field()).toHaveValue("");
    act(() => vi.advanceTimersByTime(1000));
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("lo que llega de fuera cuenta como ya buscado: escribirlo otra vez no repite la búsqueda", () => {
    const onSearch = vi.fn();
    const { rerender } = render(
      <Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={onSearch} />,
    );
    rerender(<Search placeholder="Buscar ejercicios…" defaultValue="pase" onSearch={onSearch} />);

    type("pases");
    act(() => vi.advanceTimersByTime(100));
    type("pase");
    act(() => vi.advanceTimersByTime(1000));

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("el eco de la propia búsqueda no toca el campo: conserva el valor y el foco", () => {
    const onSearch = vi.fn();
    const { rerender } = render(<Search placeholder="Buscar ejercicios…" onSearch={onSearch} />);
    act(() => field().focus());
    type("outl");
    act(() => vi.advanceTimersByTime(250));
    expect(onSearch.mock.calls).toEqual([["outl"]]);

    // La URL vuelve con la misma búsqueda.
    rerender(<Search placeholder="Buscar ejercicios…" defaultValue="outl" onSearch={onSearch} />);

    expect(field()).toHaveValue("outl");
    expect(field()).toHaveFocus();
    act(() => vi.advanceTimersByTime(1000));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("el eco de una búsqueda anterior no pisa lo que se sigue escribiendo", () => {
    const onSearch = vi.fn();
    const { rerender } = render(<Search placeholder="Buscar ejercicios…" onSearch={onSearch} />);
    type("outl");
    act(() => vi.advanceTimersByTime(250));

    // Se sigue escribiendo mientras la URL de «outl» llega.
    type("outlet");
    rerender(<Search placeholder="Buscar ejercicios…" defaultValue="outl" onSearch={onSearch} />);

    expect(field()).toHaveValue("outlet");
    act(() => vi.advanceTimersByTime(250));
    expect(onSearch.mock.calls).toEqual([["outl"], ["outlet"]]);
  });

  it("si llega algo distinto de lo buscado mientras se escribe, gana lo de fuera y se cancela lo pendiente", () => {
    const onSearch = vi.fn();
    const { rerender } = render(
      <Search placeholder="Buscar ejercicios…" defaultValue="outl" onSearch={onSearch} />,
    );
    type("outlet");

    // Quien cambia la URL (un enlace de «Quitar filtros», atrás en el navegador) lo hace a
    // propósito: su valor manda sobre un texto que aún no se había buscado.
    rerender(<Search placeholder="Buscar ejercicios…" defaultValue="pase" onSearch={onSearch} />);

    expect(field()).toHaveValue("pase");
    act(() => vi.advanceTimersByTime(1000));
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("después de seguir a la URL, escribir vuelve a buscar con normalidad", () => {
    const onSearch = vi.fn();
    const { rerender } = render(
      <Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={onSearch} />,
    );
    rerender(<Search placeholder="Buscar ejercicios…" defaultValue="" onSearch={onSearch} />);

    type("tiro");
    act(() => vi.advanceTimersByTime(250));

    expect(onSearch.mock.calls).toEqual([["tiro"]]);
  });

  it("volver a pintar con el mismo defaultValue no cambia nada", () => {
    const onSearch = vi.fn();
    const { rerender } = render(
      <Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={onSearch} />,
    );
    type("outlets");

    rerender(<Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={onSearch} />);

    expect(field()).toHaveValue("outlets");
    act(() => vi.advanceTimersByTime(250));
    expect(onSearch.mock.calls).toEqual([["outlets"]]);
  });
});

// El contrato con la página: el campo manda su texto recortado y la URL lo devuelve tal cual lo
// parsea la página (`parseQuery` recorta, y nada más: en `maxLength` no cambia lo que se manda).
// El eco de lo enviado es entonces idéntico, byte a byte, a lo que el campo guardó como enviado.
describe("Search · el eco de la URL con el texto recortado", () => {
  it("«rebote » se busca como «rebote»; su eco no pisa el espacio ni el foco, y se sigue escribiendo", () => {
    const onSearch = vi.fn();
    const { rerender } = render(<Search placeholder="Buscar ejercicios…" onSearch={onSearch} />);
    act(() => field().focus());
    type("rebote ");
    act(() => vi.advanceTimersByTime(250));
    expect(onSearch.mock.calls).toEqual([["rebote"]]);

    // La URL vuelve con la búsqueda ya recortada.
    rerender(<Search placeholder="Buscar ejercicios…" defaultValue="rebote" onSearch={onSearch} />);

    expect(field()).toHaveValue("rebote ");
    expect(field()).toHaveFocus();
    act(() => vi.advanceTimersByTime(1000));
    expect(onSearch).toHaveBeenCalledTimes(1);

    // Quien busca sigue: «rebote o», no «reboteo».
    type("rebote o");
    expect(field()).toHaveValue("rebote o");
    act(() => vi.advanceTimersByTime(250));
    expect(onSearch.mock.calls).toEqual([["rebote"], ["rebote o"]]);
  });

  it("lo que se teclea mientras llega el eco recortado se conserva", () => {
    const onSearch = vi.fn();
    const { rerender } = render(<Search placeholder="Buscar ejercicios…" onSearch={onSearch} />);
    type("rebote ");
    act(() => vi.advanceTimersByTime(250));

    type("rebote p");
    rerender(<Search placeholder="Buscar ejercicios…" defaultValue="rebote" onSearch={onSearch} />);

    expect(field()).toHaveValue("rebote p");
    act(() => vi.advanceTimersByTime(250));
    expect(onSearch.mock.calls).toEqual([["rebote"], ["rebote p"]]);
  });

  it("un valor de fuera con espacios a los lados se muestra y se da por buscado, recortado", () => {
    const onSearch = vi.fn();
    const { rerender } = render(
      <Search placeholder="Buscar ejercicios…" defaultValue="outlet" onSearch={onSearch} />,
    );

    rerender(<Search placeholder="Buscar ejercicios…" defaultValue=" pase " onSearch={onSearch} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(field()).toHaveValue(" pase ");
    expect(onSearch).not.toHaveBeenCalled();

    // Escribir lo mismo, con o sin los espacios, no es una búsqueda nueva.
    type("pase");
    act(() => vi.advanceTimersByTime(1000));
    expect(onSearch).not.toHaveBeenCalled();
  });
});
