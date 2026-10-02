import { describe, expect, it } from "vitest";
import { contrastarLecturaIA, importesDelTexto, leerTicketCierre, revisarTicket, ticketCoherente } from "../ticket-cierre";

// Texto tal como sale de un ticket real de cierre (Estado de la caja).
const TICKET = `ESTADO DE LA CAJA
Saldo Inicial Caja 0,00
Entradas - Ingresos 0,00
Salidas - Gastos 0,00
Retiradas - Gastos 0,00
Cobrado Efectivo 10,80
Ticket 10,80
Factura/Albaran 0,00
Pendientes 0,00
Cobrado Bancos 125,90
Ticket 125,90
Factura/Albaran 0,00
Pendientes 0,00
Total Cobrado 136,70
Saldo Final Caja 10,80
Saldo Real Caja 10,80
Descuadre Caja 0,00
Saldo Retirado Caja 10,80
Nuevo Saldo Caja 0,00
VENTAS DEL DIA - MANIPULACION
Tickets Efectivo 10,80
Tickets Banco 125,90
Tickets Pendientes 0,00
Total Tickets 136,70
Facturas Efectivo 0,00
Facturas Banco 0,00
Total Facturas 0,00
Ticket/Factura Media 6,51
Cuentas Abiertas 0,00
Clientes Ptes. Cobro 0,00`;

describe("leerTicketCierre", () => {
  it("lee la venta del día y el reparto entre efectivo y tarjeta", () => {
    expect(leerTicketCierre(TICKET)).toEqual({
      venta: 136.7,
      efectivo: 10.8,
      banco: 125.9,
      ticketMedio: 6.51,
      fecha: null,
    });
  });

  it("suma facturas a los tickets y aguanta saltos de línea y miles", () => {
    const texto = "Tickets Efectivo\n1.200,50\nTotal Tickets\n1.200,50\nFacturas Banco 300,00\nTotal Facturas 300,00";
    const lectura = leerTicketCierre(texto);
    expect(lectura?.venta).toBe(1500.5);
    expect(lectura?.banco).toBe(300);
  });

  it("toma la fecha si el ticket la trae", () => {
    expect(leerTicketCierre(`Fecha 29/09/2026\n${TICKET}`)?.fecha).toBe("2026-09-29");
  });

  it("devuelve null si no es un ticket de cierre", () => {
    expect(leerTicketCierre("Factura de Helados SL, total 45,00")).toBeNull();
  });
});

describe("ticketCoherente", () => {
  it("la venta no puede ser menor que lo cobrado", () => {
    expect(ticketCoherente({ venta: 136.7, efectivo: 10.8, banco: 125.9 })).toBe(true);
    expect(ticketCoherente({ venta: 6.51, efectivo: 125.9, banco: 0 })).toBe(false);
    expect(ticketCoherente({ venta: 50, efectivo: null, banco: null })).toBe(true);
  });
});

describe("revisarTicket", () => {
  const lectura = (texto: string) => {
    const t = leerTicketCierre(texto);
    if (!t) throw new Error("no se pudo leer");
    return t;
  };

  it("un ticket que cuadra es fiable y no trae avisos", () => {
    expect(revisarTicket(TICKET, lectura(TICKET))).toEqual({ fiable: true, avisos: [] });
  });

  it("con pendientes de cobro (cuentas a crédito) sigue siendo fiable: efectivo + banco + pendientes = total", () => {
    const texto = TICKET.replace("Tickets Pendientes 0,00", "Tickets Pendientes 20,00").replace("Total Tickets 136,70", "Total Tickets 156,70");
    const r = revisarTicket(texto, lectura(texto));
    expect(r.fiable).toBe(true);
    expect(r.avisos).toEqual([]);
  });

  it("con facturas a crédito la venta incluye las facturas y no se descarta", () => {
    const texto = TICKET.replace("Total Facturas 0,00", "Total Facturas 80,00").replace("Facturas Banco 0,00", "Facturas Banco 80,00").replace("Total Cobrado 136,70", "Total Cobrado 216,70");
    const t = lectura(texto);
    expect(t.venta).toBe(216.7);
    expect(revisarTicket(texto, t).fiable).toBe(true);
  });

  it("si lo cobrado y la venta no coinciden solo avisa: la lectura se enseña igualmente", () => {
    const texto = TICKET.replace("Total Cobrado 136,70", "Total Cobrado 150,00");
    const r = revisarTicket(texto, lectura(texto));
    expect(r.fiable).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/Total cobrado/);
  });

  it("si efectivo + tarjeta + pendientes no suman el total, la lectura no es fiable", () => {
    const texto = TICKET.replace("Total Tickets 136,70", "Total Tickets 99,00");
    const r = revisarTicket(texto, lectura(texto));
    expect(r.fiable).toBe(false);
    expect(r.avisos.join(" ")).toMatch(/no cuadran/);
  });

  it("el texto desordenado (cifras antes que sus etiquetas) no es fiable", () => {
    const desordenado =
      "55,60Tickets Efectivo\n276,20Tickets Banco\n0,00Tickets Pendientes\n331,80Total Tickets\n0,00Facturas Efectivo\n0,00Facturas Banco\n0,00Total Facturas\n9,76Ticket/Factura Media";
    const t = leerTicketCierre(desordenado);
    expect(t && revisarTicket(desordenado, t).fiable).toBe(false);
  });

  it("una venta menor que lo cobrado no es fiable", () => {
    expect(revisarTicket("", { venta: 6.51, efectivo: 125.9, banco: 0, ticketMedio: null, fecha: null }).fiable).toBe(false);
  });

  it("avisa de un cierre que abarca varios días", () => {
    const texto = `Fecha inicial: 01/10/2026\nFecha final: 05/10/2026\n${TICKET}`;
    const r = revisarTicket(texto, lectura(texto));
    expect(r.fiable).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/varios días.*01\/10\/2026.*05\/10\/2026/);
  });

  it("la fecha final del día siguiente (cierre pasada la medianoche) no avisa de nada", () => {
    const texto = `Fecha inicial: 01/10/2026\nFecha final: 02/10/2026\n${TICKET}`;
    expect(revisarTicket(texto, lectura(texto)).avisos).toEqual([]);
  });
});

describe("contrastarLecturaIA", () => {
  const ticket = { venta: 331.8, efectivo: 55.6, banco: 276.2, ticketMedio: null, fecha: "2026-10-02" };
  const texto = "Fecha inicial: 01/10/2026\nFecha final: 02/10/2026\nTotal Tickets 331,80";

  it("prefiere la fecha inicial impresa a la que haya leído la IA", () => {
    expect(contrastarLecturaIA(texto, ticket).ticket.fecha).toBe("2026-10-01");
  });

  it("pone la fecha impresa aunque la IA no trajera ninguna", () => {
    expect(contrastarLecturaIA(texto, { ...ticket, fecha: null }).ticket.fecha).toBe("2026-10-01");
  });

  it("respeta la fecha de la IA si el texto no trae ninguna", () => {
    expect(contrastarLecturaIA("Total Tickets 331,80", ticket).ticket.fecha).toBe("2026-10-02");
  });

  it("no avisa si la venta aparece en el texto", () => {
    expect(contrastarLecturaIA(texto, ticket).avisos).toEqual([]);
  });

  it("avisa si la venta de la IA no aparece en el texto del PDF", () => {
    const r = contrastarLecturaIA(texto, { ...ticket, venta: 125 });
    expect(r.avisos.join(" ")).toMatch(/no aparece en el texto/);
  });

  it("sin texto (foto o escaneo) no hay con qué contrastar y no avisa", () => {
    const r = contrastarLecturaIA("", ticket);
    expect(r.avisos).toEqual([]);
    expect(r.ticket.fecha).toBe("2026-10-02");
  });
});

describe("importesDelTexto", () => {
  it("saca importes con miles y negativos", () => {
    expect(importesDelTexto("Total 1.234,56 y -20,00 y 5,10")).toEqual([1234.56, -20, 5.1]);
  });
});

// Texto de un "Cierres de caja.pdf" real del correo, ordenado por posición (pdf-lineas). Con el
// orden interno del PDF las cifras salían antes que las etiquetas y la venta se leía como 9,76.
describe("cierre real del correo", () => {
  const REAL = `CIERRE DE LA CAJA 1
Código:57 NUMERO 57
Fecha inicial: 01/10/2026
Fecha final: 02/10/2026
ESTADO DE LA CAJA
Cobrado Efectivo 55,60
Cobrado Bancos 276,20
Total Cobrado 331,80
VENTAS DEL DIA - MANIPULACION
Tickets Efectivo 55,60
Tickets Banco 276,20
Tickets Pendientes 0,00
Total Tickets 331,80
Facturas Efectivo 0,00
Facturas Banco 0,00
Total Facturas 0,00
Ticket/Factura Media 9,76`;

  it("lee venta, efectivo y tarjeta", () => {
    const t = leerTicketCierre(REAL);
    expect(t).toMatchObject({ venta: 331.8, efectivo: 55.6, banco: 276.2, ticketMedio: 9.76 });
    expect(t && ticketCoherente(t) && revisarTicket(REAL, t).fiable).toBe(true);
  });

  it("la fecha es la inicial aunque la final salga antes en el texto", () => {
    const invertido = "Fecha final: 02/10/2026\nFecha inicial: 01/10/2026\n" + REAL;
    expect(leerTicketCierre(invertido)?.fecha).toBe("2026-10-01");
    expect(leerTicketCierre(REAL)?.fecha).toBe("2026-10-01");
  });
});
