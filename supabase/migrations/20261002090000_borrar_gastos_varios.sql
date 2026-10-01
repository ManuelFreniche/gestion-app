-- Los gastos ya no se apuntan a mano: todo entra por la Bandeja y se reparte en facturas_recibidas.
-- La tabla gastos_varios (migración 20261001100000) se quedó sin uso y se borra.
drop table if exists public.gastos_varios;
