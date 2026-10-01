-- Los PDF con muchas facturas juntas pesan más de 10 MB: se sube el límite del bucket a 25 MB.
-- Por encima de 14 MB el lector no manda el PDF entero a la IA, lee las páginas como imágenes.
update storage.buckets set file_size_limit = 26214400 where id = 'documentos';
