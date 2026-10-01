// Reduce un PDF pesado (p. ej. escaneos de 60–120 MB) en el propio navegador, sin perder páginas:
// cada página se dibuja y se vuelve a guardar como JPEG dentro de un PDF nuevo. El tamaño se
// ajusta solo bajando la nitidez poco a poco; si ni con la nitidez mínima cabe, no se manda nada
// a medias: se avisa con claridad. Solo se debe importar desde componentes de cliente.

// Hasta aquí un PDF se sube tal cual (el lector de Google admite 14 MB y el almacén, 25).
export const MAX_SIN_COMPRIMIR = 12 * 1024 * 1024;
const PRESUPUESTO = 12 * 1024 * 1024;

// De más a menos nitidez. El último sigue siendo legible para importes (~120 ppp en un A4).
export const NIVELES = [
  { lado: 2000, calidad: 0.75 },
  { lado: 1700, calidad: 0.68 },
  { lado: 1450, calidad: 0.6 },
  { lado: 1250, calidad: 0.55 },
  { lado: 1000, calidad: 0.5 },
] as const;

// Con lo hecho hasta ahora, ¿hay que bajar de nivel para las páginas que faltan?
export function elegirNivel(bytes: number, hechas: number, total: number, nivel: number, presupuesto = PRESUPUESTO) {
  if (hechas === 0 || nivel >= NIVELES.length - 1) return nivel;
  return (bytes / hechas) * total > presupuesto ? nivel + 1 : nivel;
}

export type Progreso = (hechas: number, total: number) => void;

export class NoCabe extends Error {
  constructor(readonly paginas: number) {
    super("no cabe");
  }
}

export async function comprimirPdf(archivo: File, progreso?: Progreso): Promise<File> {
  const [pdfjs, { PDFDocument }] = await Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("pdf-lib")]);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const origen = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
  const total = origen.numPages;

  let nivel = 0;
  for (let intento = 0; intento < NIVELES.length; intento++) {
    const salida = await PDFDocument.create();
    let bytes = 0;
    for (let n = 1; n <= total; n++) {
      nivel = elegirNivel(bytes, n - 1, total, nivel);
      const { lado, calidad } = NIVELES[nivel];
      const pagina = await origen.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const vista = pagina.getViewport({ scale: lado / Math.max(base.width, base.height) });
      const lienzo = document.createElement("canvas");
      lienzo.width = Math.ceil(vista.width);
      lienzo.height = Math.ceil(vista.height);
      await pagina.render({ canvas: lienzo, viewport: vista }).promise;
      const jpeg = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", calidad));
      lienzo.width = lienzo.height = 0; // libera la memoria del dibujo
      pagina.cleanup();
      if (!jpeg) throw new Error("No se pudo dibujar una página.");
      const datos = new Uint8Array(await jpeg.arrayBuffer());
      bytes += datos.length;
      const imagen = await salida.embedJpg(datos);
      salida.addPage([base.width, base.height]).drawImage(imagen, { x: 0, y: 0, width: base.width, height: base.height });
      progreso?.(n, total);
    }
    const resultado = await salida.save();
    if (resultado.length <= MAX_SIN_COMPRIMIR + 1024 * 1024) {
      const nombre = archivo.name.replace(/\.pdf$/i, "") + ".pdf";
      return new File([resultado as BlobPart], nombre, { type: "application/pdf" });
    }
    if (nivel >= NIVELES.length - 1) break;
    nivel++; // se repite todo con menos nitidez
  }
  throw new NoCabe(total);
}
