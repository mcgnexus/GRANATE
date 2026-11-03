-- GRANATE feature pack: favorites, recents, preferences, share links, backups.
-- Idempotent so it can be applied to an existing database.

alter table notes add column if not exists pinned_at timestamptz;
create index if not exists notes_vault_pinned_idx
  on notes (vault_id, pinned_at)
  where pinned_at is not null;

create table if not exists note_opens (
  user_id uuid not null references users(id) on delete cascade,
  note_id uuid not null references notes(id) on delete cascade,
  open_count integer not null default 1,
  last_opened_at timestamptz not null default now(),
  primary key (user_id, note_id)
);
create index if not exists note_opens_user_idx
  on note_opens (user_id, last_opened_at desc);

create table if not exists user_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  palette text not null default 'granite',
  theme text not null default 'dark',
  updated_at timestamptz not null default now()
);

create table if not exists share_links (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  note_id uuid references notes(id) on delete cascade,
  token text not null unique,
  created_by uuid references users(id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists share_links_vault_idx on share_links (vault_id, created_at desc);

create table if not exists backups (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  path text not null,
  blob_url text not null,
  size integer not null default 0,
  note_count integer not null default 0,
  kind text not null default 'manual',
  created_at timestamptz not null default now()
);
create index if not exists backups_vault_idx on backups (vault_id, created_at desc);
