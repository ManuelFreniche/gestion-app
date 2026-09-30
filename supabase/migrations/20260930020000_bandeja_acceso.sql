-- Quien sube un archivo puede volver a leerlo (lo necesita el servidor para leer el ticket),
-- y la bandeja aparece como módulo en los negocios que ya existen y en los nuevos.

create policy "ver mis archivos de documentos" on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos' and owner_id = (select auth.uid())::text);

alter table public.ajustes_organizacion
  alter column modulos set default array['inventario', 'gastos', 'facturas', 'ventas', 'margenes', 'bandeja'];

update public.ajustes_organizacion
set modulos = array_append(modulos, 'bandeja')
where not ('bandeja' = any (modulos));
