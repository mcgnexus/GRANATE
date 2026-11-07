-- Papelera de bovedas: borrado logico con 30 dias de gracia.
alter table vaults add column if not exists deleted_at timestamp with time zone;
