import { describe, expect, it } from "vitest";
import { cuadraConCobrado, leerTicketCierre, ticketCoherente } from "../ticket-cierre";

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

describe("cuadraConCobrado", () => {
  it("la venta debe coincidir con el total cobrado", () => {
    expect(cuadraConCobrado(TICKET, { venta: 136.7 })).toBe(true);
    expect(cuadraConCobrado(TICKET, { venta: 6.51 })).toBe(false);
  });
  it("sin total cobrado no puede comprobarse y se acepta", () => {
    expect(cuadraConCobrado("Total Tickets 10,00", { venta: 10 })).toBe(true);
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
    expect(t && ticketCoherente(t) && cuadraConCobrado(REAL, t)).toBe(true);
  });

  it("la fecha es la inicial aunque la final salga antes en el texto", () => {
    const invertido = "Fecha final: 02/10/2026\nFecha inicial: 01/10/2026\n" + REAL;
    expect(leerTicketCierre(invertido)?.fecha).toBe("2026-10-01");
    expect(leerTicketCierre(REAL)?.fecha).toBe("2026-10-01");
  });
});
