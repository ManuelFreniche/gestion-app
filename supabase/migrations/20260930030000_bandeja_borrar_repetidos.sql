-- Quien sube un archivo puede borrarlo: se usa para quitar las copias repetidas
-- que se detectan al subir (no las de otras personas).
create policy "borrar mis archivos de documentos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos' and owner_id = (select auth.uid())::text);
