import { describe, expect, it } from "vitest";
import {
  DIAGRAM_ERROR,
  DIAGRAM_MIME,
  MAX_DIAGRAM_BYTES,
  sniffImageType,
  validateDiagramFile,
} from "./diagram-file";

/** Una cabecera seguida de relleno: lo único que mira `sniffImageType` son los primeros bytes. */
function withHeader(header: number[], total = 64): Uint8Array {
  const bytes = new Uint8Array(total);
  bytes.set(header);
  return bytes;
}

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** `RIFF`, cuatro bytes de tamaño y `WEBP`. */
const WEBP_HEADER = [...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WEBP")];

describe("constantes", () => {
  it("el tamaño máximo son 2 MiB, el límite del bucket", () => {
    expect(MAX_DIAGRAM_BYTES).toBe(2_097_152);
    expect(MAX_DIAGRAM_BYTES).toBe(2 * 1024 * 1024);
  });

  it("el mensaje dice los tres tipos y el tamaño", () => {
    expect(DIAGRAM_ERROR).toBe("Sube una imagen PNG, JPEG o WebP de hasta 2 MB.");
  });

  it("cada tipo detectado tiene su tipo MIME", () => {
    expect(DIAGRAM_MIME).toEqual({ png: "image/png", jpg: "image/jpeg", webp: "image/webp" });
  });
});

describe("sniffImageType", () => {
  it("la cabecera PNG de 8 bytes es png", () => {
    expect(sniffImageType(withHeader(PNG_HEADER))).toBe("png");
  });

  it("FF D8 FF es jpg, sea cual sea el cuarto byte", () => {
    expect(sniffImageType(withHeader([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffImageType(withHeader([0xff, 0xd8, 0xff, 0xdb]))).toBe("jpg");
    expect(sniffImageType(withHeader([0xff, 0xd8, 0xff, 0xe1]))).toBe("jpg");
  });

  it("RIFF, cuatro bytes cualesquiera y WEBP es webp", () => {
    expect(sniffImageType(withHeader(WEBP_HEADER))).toBe("webp");
    expect(sniffImageType(withHeader([...ascii("RIFF"), 0xff, 0xff, 0xff, 0xff, ...ascii("WEBP")]))).toBe(
      "webp",
    );
  });

  it("un SVG con script no es una imagen permitida", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    expect(sniffImageType(svg)).toBeNull();
  });

  it("un SVG que empieza por el prólogo XML tampoco", () => {
    const svg = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>');

    expect(sniffImageType(svg)).toBeNull();
  });

  it("un RIFF que no es WebP (un WAV, un AVI) es null", () => {
    expect(sniffImageType(withHeader([...ascii("RIFF"), 0x24, 0, 0, 0, ...ascii("WAVE")]))).toBeNull();
    expect(sniffImageType(withHeader([...ascii("RIFF"), 0x24, 0, 0, 0, ...ascii("AVI ")]))).toBeNull();
  });

  it("un GIF, un PDF y un ejecutable de Windows son null", () => {
    expect(sniffImageType(withHeader(ascii("GIF89a")))).toBeNull();
    expect(sniffImageType(withHeader(ascii("%PDF-1.7")))).toBeNull();
    expect(sniffImageType(withHeader(ascii("MZ")))).toBeNull();
  });

  it("una cabecera PNG a medias, o con un solo byte distinto, es null", () => {
    expect(sniffImageType(new Uint8Array(PNG_HEADER.slice(0, 7)))).toBeNull();
    expect(sniffImageType(withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b]))).toBeNull();
  });

  it("FF D8 sin el tercer FF es null", () => {
    expect(sniffImageType(withHeader([0xff, 0xd8, 0x00]))).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it("un RIFF cortado antes del WEBP es null", () => {
    expect(sniffImageType(new Uint8Array([...ascii("RIFF"), 0x24, 0, 0, 0, ...ascii("WEB")]))).toBeNull();
  });

  it("vacío, o de menos bytes que cualquier cabecera, es null", () => {
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89]))).toBeNull();
  });

  it("mira el principio del fichero: la cabecera PNG más adelante no cuenta", () => {
    expect(sniffImageType(withHeader([0x00, 0x00, ...PNG_HEADER]))).toBeNull();
  });

  it("funciona con una vista que no empieza en el byte 0 de su buffer", () => {
    const buffer = new Uint8Array([0, 0, 0, ...PNG_HEADER, 1, 2, 3]).buffer;

    expect(sniffImageType(new Uint8Array(buffer, 3))).toBe("png");
    expect(sniffImageType(new Uint8Array(buffer, 0))).toBeNull();
  });
});

describe("validateDiagramFile", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("%s de tamaño normal es ok", (type) => {
    expect(validateDiagramFile({ type, size: 100_000 })).toBe("ok");
  });

  it("un SVG es de un tipo no permitido", () => {
    expect(validateDiagramFile({ type: "image/svg+xml", size: 100 })).toBe("type");
  });

  it.each(["", "text/html", "application/pdf", "image/gif", "image/png; charset=binary"])(
    "el tipo «%s» no es de los permitidos",
    (type) => {
      expect(validateDiagramFile({ type, size: 100 })).toBe("type");
    },
  );

  it("20 MB es demasiado grande", () => {
    expect(validateDiagramFile({ type: "image/png", size: 20 * 1024 * 1024 })).toBe("size");
  });

  it("el límite es exacto: 2 097 152 bytes valen y uno más no", () => {
    expect(validateDiagramFile({ type: "image/png", size: 2_097_152 })).toBe("ok");
    expect(validateDiagramFile({ type: "image/png", size: 2_097_153 })).toBe("size");
  });

  it("un fichero vacío tampoco vale: la ficha exige al menos un byte", () => {
    expect(validateDiagramFile({ type: "image/png", size: 0 })).toBe("size");
  });

  it("el tipo manda sobre el tamaño: un SVG de 20 MB es de tipo no permitido", () => {
    expect(validateDiagramFile({ type: "image/svg+xml", size: 20 * 1024 * 1024 })).toBe("type");
  });

  it("acepta un File de verdad", () => {
    expect(validateDiagramFile(new File([new Uint8Array(10)], "x.png", { type: "image/png" }))).toBe("ok");
  });
});
