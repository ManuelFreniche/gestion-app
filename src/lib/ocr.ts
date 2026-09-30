import path from "node:path";
import { getDocumentProxy, renderPageAsImage } from "unpdf";

// Lector de texto (OCR) gratuito y local: no envía nada a ningún servicio externo.
// Sirve para fotos, capturas y PDFs escaneados. El idioma va incluido en el paquete
// @tesseract.js-data/spa para no descargarlo en cada petición.

const RUTA_IDIOMA = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "spa", "4.0.0_best_int");
const MAX_PAGINAS = 2;

// El motor tarda en arrancar (carga idioma y WASM), así que se reutiliza entre subidas
// mientras la instancia del servidor siga viva.
let trabajador: Promise<import("tesseract.js").Worker> | null = null;

async function obtenerTrabajador() {
  if (!trabajador) {
    trabajador = import("tesseract.js")
      .then(({ createWorker }) => createWorker("spa", 1, { langPath: RUTA_IDIOMA, cacheMethod: "none", gzip: true }))
      .catch((e) => {
        trabajador = null;
        throw e;
      });
  }
  return trabajador;
}

// Para cortar una lectura que se ha pasado de tiempo y no bloquear las siguientes.
export function reiniciarMotor() {
  const viejo = trabajador;
  trabajador = null;
  viejo?.then((m) => m.terminate()).catch(() => {});
}

async function reconocer(imagenes: Uint8Array[]): Promise<string> {
  try {
    const motor = await obtenerTrabajador();
    const textos: string[] = [];
    for (const imagen of imagenes) {
      const { data } = await motor.recognize(Buffer.from(imagen));
      textos.push(data.text);
    }
    return textos.join("\n");
  } catch (e) {
    // Si el motor quedó en mal estado, la próxima vez se crea de nuevo.
    const viejo = trabajador;
    trabajador = null;
    viejo?.then((m) => m.terminate()).catch(() => {});
    throw e;
  }
}

// Prepara la imagen para el OCR: gris, contraste y un tamaño razonable.
async function prepararImagen(bytes: Uint8Array): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  const meta = await sharp(bytes).metadata();
  const ancho = meta.width ?? 0;
  let imagen = sharp(bytes).rotate().grayscale().normalize();
  if (ancho && ancho < 1200) imagen = imagen.resize({ width: 1600 });
  else if (ancho > 2400) imagen = imagen.resize({ width: 2400 });
  return imagen.png().toBuffer();
}

export async function textoDeImagen(bytes: Uint8Array): Promise<string> {
  return reconocer([await prepararImagen(bytes)]);
}

// Para PDFs escaneados: cada página se dibuja como imagen y se lee.
export async function textoDePdfEscaneado(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const paginas = Math.min(pdf.numPages, MAX_PAGINAS);
  const imagenes: Uint8Array[] = [];
  for (let i = 1; i <= paginas; i++) {
    const png = await renderPageAsImage(pdf, i, { canvasImport: () => import("@napi-rs/canvas"), scale: 2 });
    imagenes.push(new Uint8Array(png));
  }
  return reconocer(imagenes);
}
