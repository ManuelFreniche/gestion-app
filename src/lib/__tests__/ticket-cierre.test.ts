import { describe, expect, it } from "vitest";
import { leerTicketCierre } from "../ticket-cierre";

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
