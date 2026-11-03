-- Fallback storage for backups when Vercel Blob is not available.
alter table backups add column if not exists data text;
