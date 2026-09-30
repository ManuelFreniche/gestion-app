// Lee el texto de un documento en el propio navegador de quien lo sube: el texto del PDF
// si lo tiene y, si es una foto o un PDF escaneado, OCR gratuito (Tesseract) en el dispositivo.
// Así la subida no espera a ningún servidor lento y cada persona usa su propio dispositivo.
// Solo se debe importar desde componentes de cliente.

import type { Worker } from "tesseract.js";

const MAX_PAGINAS = 2;
const MIN_TEXTO_PDF = 40; // menos letras que esto y se considera un PDF escaneado
const LADO_MAX_IMAGEN = 2000;

type RutasOcr = { workerPath?: string; corePath?: string; langPath?: string };
let rutasOcr: RutasOcr = {};

// Permite apuntar el OCR a archivos propios (pruebas o alojamiento propio del idioma).
export function configurarOcr(rutas: RutasOcr) {
  rutasOcr = rutas;
}

let motor: Promise<Worker> | null = null;

function obtenerMotor(): Promise<Worker> {
  if (!motor) {
    motor = import("tesseract.js")
      .then(({ createWorker }) => createWorker("spa", 1, rutasOcr))
      .catch((e) => {
        motor = null;
        throw e;
      });
  }
  return motor;
}

async function reconocer(lienzo: HTMLCanvasElement): Promise<string> {
  const trabajador = await obtenerMotor();
  const { data } = await trabajador.recognize(lienzo);
  return data.text;
}

async function lienzoDeImagen(archivo: File): Promise<HTMLCanvasElement> {
  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAX_IMAGEN / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext("2d")?.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();
  return lienzo;
}

export async function leerTextoEnNavegador(archivo: File): Promise<string> {
  if (archivo.type !== "application/pdf") {
    return reconocer(await lienzoDeImagen(archivo));
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
  const paginas = Math.min(pdf.numPages, MAX_PAGINAS);

  // 1) Texto del propio PDF: instantáneo.
  const textos: string[] = [];
  for (let n = 1; n <= paginas; n++) {
    const contenido = await (await pdf.getPage(n)).getTextContent();
    textos.push(contenido.items.map((i) => ("str" in i ? i.str : "")).join("\n"));
  }
  const texto = textos.join("\n");
  if (texto.replace(/\s/g, "").length >= MIN_TEXTO_PDF) return texto;

  // 2) PDF escaneado: cada página se dibuja y se lee con OCR.
  const ocr: string[] = [];
  for (let n = 1; n <= paginas; n++) {
    const pagina = await pdf.getPage(n);
    const base = pagina.getViewport({ scale: 1 });
    const vista = pagina.getViewport({ scale: Math.min(2.5, LADO_MAX_IMAGEN / Math.max(base.width, base.height)) });
    const lienzo = document.createElement("canvas");
    lienzo.width = vista.width;
    lienzo.height = vista.height;
    await pagina.render({ canvas: lienzo, viewport: vista }).promise;
    ocr.push(await reconocer(lienzo));
  }
  return ocr.join("\n");
}

// ---- Preparar un documento para que el servidor lo lea con IA ----
// Un PDF con texto se manda como texto (instantáneo). Un PDF escaneado o una foto se mandan como
// imágenes pequeñas de sus páginas: la IA las lee directamente, sin esperar a ningún OCR.

const MIN_TEXTO_IA = 300; // con menos texto que esto, el PDF se considera escaneado
const PAGINAS_TEXTO = 30;
const PAGINAS_IMAGEN = 8;
const LADO_IA = 1400;
const MAX_BASE64_TOTAL = 3_300_000; // la petición a Vercel admite 4,5 MB

export type DocumentoPreparado = { texto: string; imagenes: string[]; paginas?: string[] };

function jpegBase64(lienzo: HTMLCanvasElement, calidad = 0.68): string {
  return lienzo.toDataURL("image/jpeg", calidad).split(",")[1] ?? "";
}

export async function prepararDocumento(archivo: File): Promise<DocumentoPreparado> {
  if (archivo.type !== "application/pdf") {
    const imagen = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_IA / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext("2d")?.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    imagen.close();
    return { texto: "", imagenes: [jpegBase64(lienzo)] };
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;

  const textos: string[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, PAGINAS_TEXTO); n++) {
    const contenido = await (await pdf.getPage(n)).getTextContent();
    textos.push(contenido.items.map((i) => ("str" in i ? i.str : "")).join("\n"));
  }
  const texto = textos.join("\n\n");
  if (texto.replace(/\s/g, "").length >= MIN_TEXTO_IA) return { texto, imagenes: [], paginas: textos };

  const imagenes: string[] = [];
  let total = 0;
  for (let n = 1; n <= Math.min(pdf.numPages, PAGINAS_IMAGEN); n++) {
    const pagina = await pdf.getPage(n);
    const base = pagina.getViewport({ scale: 1 });
    const vista = pagina.getViewport({ scale: Math.min(2.5, LADO_IA / Math.max(base.width, base.height)) });
    const lienzo = document.createElement("canvas");
    lienzo.width = vista.width;
    lienzo.height = vista.height;
    await pagina.render({ canvas: lienzo, viewport: vista }).promise;
    const imagen = jpegBase64(lienzo);
    if (total + imagen.length > MAX_BASE64_TOTAL) break;
    total += imagen.length;
    imagenes.push(imagen);
  }
  return { texto, imagenes };
}
