create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  password_hash text,
  image text,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_email_unique on users (lower(email));

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  user_agent text,
  ip text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index if not exists sessions_token_hash_unique on sessions (token_hash);
create index if not exists sessions_user_idx on sessions (user_id);

create table if not exists oauth_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists oauth_provider_account_unique on oauth_accounts (provider, provider_account_id);
create index if not exists oauth_user_idx on oauth_accounts (user_id);

create table if not exists verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists verification_token_hash_unique on verification_tokens (token_hash);

create table if not exists api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  token_hash text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists api_tokens_hash_unique on api_tokens (token_hash);
create index if not exists api_tokens_user_idx on api_tokens (user_id);

create table if not exists vaults (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  name text not null,
  slug text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists vaults_owner_slug_unique on vaults (owner_id, slug);
create index if not exists vaults_owner_idx on vaults (owner_id);

create table if not exists vault_members (
  vault_id uuid not null references vaults(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (vault_id, user_id)
);
create index if not exists vault_members_user_idx on vault_members (user_id);

create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists folders_vault_path_ci on folders (vault_id, lower(path));

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  path text not null,
  title text not null,
  content text not null default '',
  frontmatter jsonb not null default '{}'::jsonb,
  content_hash text not null,
  word_count integer not null default 0,
  mtime timestamptz not null default now(),
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists notes_vault_path_ci on notes (vault_id, lower(path));
create index if not exists notes_vault_updated_idx on notes (vault_id, updated_at);
create index if not exists notes_vault_deleted_idx on notes (vault_id, deleted_at);
create index if not exists notes_path_trgm_idx on notes using gin (lower(path) gin_trgm_ops);
create index if not exists notes_title_trgm_idx on notes using gin (lower(title) gin_trgm_ops);
create index if not exists notes_fts_idx on notes using gin (
  to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(content, ''))
);

create table if not exists note_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references notes(id) on delete cascade,
  content text not null,
  frontmatter jsonb not null default '{}'::jsonb,
  content_hash text not null,
  source text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists note_versions_note_idx on note_versions (note_id, created_at);

create table if not exists links (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  source_note_id uuid not null references notes(id) on delete cascade,
  raw_target text not null,
  target_path text,
  target_note_id uuid references notes(id) on delete set null,
  kind text not null default 'wikilink',
  heading text,
  alias text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists links_source_idx on links (source_note_id);
create index if not exists links_target_idx on links (target_note_id);
create index if not exists links_vault_idx on links (vault_id);

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  name text not null
);
create unique index if not exists tags_vault_name_ci on tags (vault_id, lower(name));

create table if not exists note_tags (
  note_id uuid not null references notes(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (note_id, tag_id)
);

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  path text not null,
  mime text not null,
  size integer not null,
  sha256 text not null,
  data text,
  blob_url text,
  created_at timestamptz not null default now()
);
create unique index if not exists attachments_vault_path_ci on attachments (vault_id, lower(path));

create table if not exists canvases (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  path text not null,
  data jsonb not null,
  content_hash text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists canvases_vault_path_ci on canvases (vault_id, lower(path));

create table if not exists bases (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  path text not null,
  config jsonb not null default '{}'::jsonb,
  raw text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists bases_vault_path_ci on bases (vault_id, lower(path));

create table if not exists note_chunks (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references notes(id) on delete cascade,
  vault_id uuid not null references vaults(id) on delete cascade,
  idx integer not null,
  heading text,
  content text not null,
  tokens integer not null default 0,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index if not exists chunks_note_idx on note_chunks (note_id);
create index if not exists chunks_vault_idx on note_chunks (vault_id);
create index if not exists chunks_embedding_idx on note_chunks using hnsw (embedding vector_cosine_ops);

create table if not exists llm_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  vault_id uuid references vaults(id) on delete cascade,
  kind text not null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  status text not null default 'ok',
  created_at timestamptz not null default now()
);
create index if not exists llm_runs_user_idx on llm_runs (user_id, created_at);

create table if not exists usage_quotas (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  tokens integer not null default 0,
  requests integer not null default 0,
  primary key (user_id, day)
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  vault_id uuid references vaults(id) on delete cascade,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_vault_idx on audit_logs (vault_id, created_at);
