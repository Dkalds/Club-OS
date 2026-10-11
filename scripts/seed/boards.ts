import type { Board, BoardMove, BoardStep, BoardToken } from "../../src/modules/board/types";

// Las pizarras de ejemplo del seed, por club y por título de ejercicio. Son ficticias, como el
// resto de los datos de ejemplo. Hasta que exista el editor de jugadas, son las únicas que hay.
//
// Entre todas cubren los cuatro movimientos (corte, bote, pase y bloqueo), la media pista y la
// pista completa, una foto fija y una secuencia de cuatro pasos. Los demás ejercicios del seed
// no llevan pizarra: así se ve también ese caso.
//
// Coordenadas de pista, de 0 a 100: `x` a lo ancho y `y` a lo largo, con el aro de ataque en
// `y = 0`. En media pista, `y = 100` es el centro del campo; en pista completa, la otra línea de
// fondo. El balón va 3 unidades a la derecha de quien lo lleva: así le acompaña cuando bota.

const attacker = (label: string, x: number, y: number): BoardToken => ({
  id: `a${label}`,
  kind: "attacker",
  label,
  at: { x, y },
});
const defender = (label: string, x: number, y: number): BoardToken => ({
  id: `d${label}`,
  kind: "defender",
  label,
  at: { x, y },
});
const ball = (x: number, y: number): BoardToken => ({ id: "ball", kind: "ball", at: { x, y } });
const cone = (n: number, x: number, y: number): BoardToken => ({ id: `c${n}`, kind: "cone", at: { x, y } });

const cut = (token: string, x: number, y: number): BoardMove => ({ token, kind: "cut", to: { x, y } });
const dribble = (token: string, x: number, y: number): BoardMove => ({ token, kind: "dribble", to: { x, y } });
const screen = (token: string, x: number, y: number): BoardMove => ({ token, kind: "screen", to: { x, y } });
const pass = (x: number, y: number): BoardMove => ({ token: "ball", kind: "pass", to: { x, y } });

const step = (note: string, ...moves: BoardMove[]): BoardStep => ({ note, moves });

const half = (tokens: BoardToken[], ...steps: BoardStep[]): Board => ({ version: 1, court: "half", tokens, steps });
const full = (tokens: BoardToken[], ...steps: BoardStep[]): Board => ({ version: 1, court: "full", tokens, steps });

/** Las pizarras de cada club, por el título de su ejercicio. */
export const SEED_BOARDS: Record<string, Record<string, Board>> = {
  arcangel: {
    // Pista completa, tres pasos: bote, cortes y pase.
    "3 calles": full(
      [attacker("1", 50, 92), attacker("2", 20, 92), attacker("3", 80, 92), ball(53, 92)],
      step("Cada uno corre su calle. El 1 bota por el centro.", dribble("a1", 50, 62), cut("a2", 20, 60), cut("a3", 80, 60)),
      step("El 1 pasa al 2 y sigue por su calle.", pass(23, 38), cut("a2", 20, 38), cut("a1", 50, 42), cut("a3", 80, 38)),
      step("El 2 entra a canasta. El 1 y el 3 van al rebote.", dribble("a2", 40, 10), cut("a1", 50, 22), cut("a3", 62, 14)),
    ),

    // Media pista, dos pasos: pase y salida.
    "Rebote + outlet": half(
      [attacker("5", 50, 18), attacker("1", 15, 45), attacker("2", 85, 45), attacker("3", 90, 10), ball(52, 13)],
      step("El 5 asegura el rebote y saca el outlet al 1.", pass(18, 45), cut("a2", 86, 70)),
      step("El 1 bota hacia delante. Los demás abren carriles.", dribble("a1", 25, 88), cut("a3", 92, 46), cut("a5", 50, 52)),
    ),

    // Con defensores: quién salta y quién presiona.
    "2x2 presión": half(
      [attacker("1", 40, 74), attacker("2", 76, 54), defender("1", 42, 62), defender("2", 60, 42), ball(43, 74)],
      step("El 1 pasa al 2. Los dos defensores saltan con el balón: uno presiona y el otro cierra el centro.", pass(79, 54), cut("d2", 71, 46), cut("d1", 54, 54)),
    ),

    // La secuencia de cuatro pasos.
    "Pase y corte": half(
      [attacker("1", 50, 76), attacker("2", 18, 50), attacker("3", 82, 50), ball(53, 76)],
      step("El 1 pasa al 2.", pass(21, 50)),
      step("El 1 corta al aro.", cut("a1", 48, 14)),
      step("El 2 le devuelve el balón en el corte. El 3 repone arriba.", pass(51, 14), cut("a3", 50, 76)),
      step("El 1 finaliza y el 2 va al rebote.", cut("a2", 30, 20)),
    ),

    // Pista completa, con un defensor.
    "Contraataque 2x1": full(
      [attacker("1", 35, 80), attacker("2", 65, 80), defender("1", 50, 30), ball(38, 80)],
      step("El 1 bota por su calle y fija al defensor.", dribble("a1", 38, 40), cut("a2", 65, 36), cut("d1", 45, 22)),
      step("Pase al 2, que finaliza.", pass(63, 12), cut("a2", 60, 12)),
    ),

    // Con conos.
    "Tiro tras bote": half(
      [attacker("1", 50, 80), ball(53, 80), cone(1, 50, 62), cone(2, 35, 45)],
      step("Un bote fuerte hasta el cono y tiro.", dribble("a1", 42, 53)),
    ),

    // Una foto fija: el circuito, sin pasos.
    "Bote y control": half([
      attacker("1", 20, 92),
      ball(23, 92),
      cone(1, 30, 78),
      cone(2, 50, 64),
      cone(3, 30, 50),
      cone(4, 50, 36),
      cone(5, 30, 22),
    ]),

    // El bloqueo.
    "3x3 a 5 puntos": half(
      [
        attacker("1", 50, 76),
        attacker("2", 20, 50),
        attacker("5", 62, 40),
        defender("1", 50, 64),
        defender("2", 28, 44),
        defender("5", 66, 30),
        ball(53, 76),
      ],
      step("El 5 sube a bloquear al defensor del 1.", screen("a5", 59, 65)),
      step("El 1 sale del bloqueo botando. El 5 continúa al aro.", dribble("a1", 72, 56), cut("a5", 52, 22)),
    ),
  },

  "club-demo": {
    "Tiro en carrera": half(
      [attacker("1", 30, 76), ball(33, 76), cone(1, 40, 46)],
      step("Entrada por la derecha tras superar el cono.", dribble("a1", 58, 14)),
    ),
  },
};

/** La pizarra de un ejercicio del seed, o `null` si no tiene. */
export function seedBoard(orgSlug: string, title: string): Board | null {
  return SEED_BOARDS[orgSlug]?.[title] ?? null;
}
