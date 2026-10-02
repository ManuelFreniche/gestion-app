import { getDocumentProxy } from "unpdf";

// Texto de un PDF ordenado como se ve en la página: de arriba abajo y, en cada línea, de izquierda
// a derecha. El orden interno del PDF no sirve: muchos programas de caja dibujan primero las
// etiquetas y después las cifras (o las negritas aparte), y el texto sale desordenado.
export async function textoPorLineas(bytes: Uint8Array): Promise<string> {
  // pdf.js se queda con el buffer que recibe: se le pasa una copia para poder reutilizar el original.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const paginas: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const contenido = await (await pdf.getPage(n)).getTextContent();
    const piezas: { texto: string; x: number; y: number }[] = [];
    for (const pieza of contenido.items) {
      if ("str" in pieza && pieza.str.trim()) piezas.push({ texto: pieza.str, x: pieza.transform[4], y: pieza.transform[5] });
    }
    piezas.sort((a, b) => b.y - a.y);
    const lineas: { y: number; piezas: typeof piezas }[] = [];
    for (const pieza of piezas) {
      const linea = lineas.find((l) => Math.abs(l.y - pieza.y) <= 3);
      if (linea) linea.piezas.push(pieza);
      else lineas.push({ y: pieza.y, piezas: [pieza] });
    }
    paginas.push(
      lineas
        .map((l) => l.piezas.sort((a, b) => a.x - b.x).map((p) => p.texto.trim()).join(" "))
        .join("\n"),
    );
  }
  return paginas.join("\n");
}
