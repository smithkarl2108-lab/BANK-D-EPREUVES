-- Ajustements post-installation du schema initial BANK D'EPREUVES.
-- Index couvrant les cles etrangeres pour les recherches et suppressions.
create index if not exists documents_series_idx on public.documents(series_id);
create index if not exists documents_subject_idx on public.documents(subject_id);
create index if not exists documents_reviewer_idx on public.documents(reviewer_id);
create index if not exists document_files_uploader_idx on public.document_files(uploader_id);
create index if not exists favorites_document_idx on public.favorites(document_id);
create index if not exists import_jobs_class_idx on public.import_jobs(suggested_class_id);
create index if not exists import_jobs_series_idx on public.import_jobs(suggested_series_id);
create index if not exists import_jobs_subject_idx on public.import_jobs(suggested_subject_id);
create index if not exists activity_logs_actor_idx on public.activity_logs(actor_id);

-- Une seule politique de lecture par role pour les referentiels.
drop policy if exists catalog_classes_admin on public.school_classes;
drop policy if exists catalog_series_admin on public.series;
drop policy if exists catalog_subjects_admin on public.subjects;
drop policy if exists catalog_classes_read on public.school_classes;
drop policy if exists catalog_series_read on public.series;
drop policy if exists catalog_subjects_read on public.subjects;
create policy catalog_classes_read on public.school_classes
for select to anon, authenticated using (is_active = true or (select private.is_admin()));
create policy catalog_series_read on public.series
for select to anon, authenticated using (is_active = true or (select private.is_admin()));
create policy catalog_subjects_read on public.subjects
for select to anon, authenticated using (is_active = true or (select private.is_admin()));

-- Les metadonnees et fichiers publies sont lisibles sans compte.
grant select on public.document_files to anon;
create policy document_files_public_published on public.document_files
for select to anon using (
  exists (select 1 from public.documents d
          where d.id = document_id and d.status = 'published')
);
create policy document_storage_read_published_anon on storage.objects
for select to anon using (
  bucket_id = 'documents'
  and exists (
    select 1 from public.document_files f
    join public.documents d on d.id = f.document_id
    where f.bucket_id = storage.objects.bucket_id
      and f.storage_path = storage.objects.name
      and d.status = 'published'
  )
);
