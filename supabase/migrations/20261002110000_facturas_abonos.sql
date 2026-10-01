-- Facturas de abono (rectificativas, notas de crédito): importes negativos que restan del gasto.
-- Un total de cero no tiene sentido; en las líneas basta con que haya importe.

alter table public.facturas_recibidas drop constraint facturas_recibidas_importe_check;
alter table public.facturas_recibidas add constraint facturas_recibidas_importe_check check (importe <> 0);

alter table public.facturas_lineas drop constraint facturas_lineas_importe_check;
alter table public.facturas_lineas drop constraint facturas_lineas_cantidad_check;
