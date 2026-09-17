insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('timesheet-pdfs','timesheet-pdfs',false,10485760,array['application/pdf']);
create policy timesheet_pdf_owner_read on storage.objects for select to authenticated
using (bucket_id='timesheet-pdfs' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy timesheet_pdf_owner_insert on storage.objects for insert to authenticated
with check (bucket_id='timesheet-pdfs' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy timesheet_pdf_owner_update on storage.objects for update to authenticated
using (bucket_id='timesheet-pdfs' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='timesheet-pdfs' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy timesheet_pdf_owner_delete on storage.objects for delete to authenticated
using (bucket_id='timesheet-pdfs' and (storage.foldername(name))[1]=(select auth.uid())::text);
