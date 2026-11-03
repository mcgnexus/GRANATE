import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** pgvector column. Stored as a JSON-ish string "[0.1,0.2,...]". */
const vector1536 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown) {
    return JSON.parse(value as string) as number[];
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    image: text("image"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(sql`lower(${table.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("oauth_provider_account_unique").on(table.provider, table.providerAccountId),
    index("oauth_user_idx").on(table.userId),
  ],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("verification_token_hash_unique").on(table.tokenHash)],
);

/** Personal access tokens for the CLI and API clients. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("api_tokens_hash_unique").on(table.tokenHash),
    index("api_tokens_user_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// Vaults
// ---------------------------------------------------------------------------

export const vaults = pgTable(
  "vaults",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vaults_owner_slug_unique").on(table.ownerId, table.slug),
    index("vaults_owner_idx").on(table.ownerId),
  ],
);

export type VaultRole = "owner" | "editor" | "viewer";

export const vaultMembers = pgTable(
  "vault_members",
  {
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<VaultRole>().notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.vaultId, table.userId] }),
    index("vault_members_user_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("folders_vault_path_ci").on(table.vaultId, sql`lower(${table.path})`),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    frontmatter: jsonb("frontmatter").$type<Record<string, unknown>>().default({}).notNull(),
    contentHash: text("content_hash").notNull(),
    wordCount: integer("word_count").notNull().default(0),
    mtime: timestamp("mtime", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("notes_vault_path_ci").on(table.vaultId, sql`lower(${table.path})`),
    index("notes_vault_updated_idx").on(table.vaultId, table.updatedAt),
    index("notes_vault_deleted_idx").on(table.vaultId, table.deletedAt),
  ],
);

export const noteVersions = pgTable(
  "note_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    frontmatter: jsonb("frontmatter").$type<Record<string, unknown>>().default({}).notNull(),
    contentHash: text("content_hash").notNull(),
    source: text("source").$type<"save" | "import" | "llm" | "restore" | "api">().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("note_versions_note_idx").on(table.noteId, table.createdAt)],
);

export const links = pgTable(
  "links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    sourceNoteId: uuid("source_note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    rawTarget: text("raw_target").notNull(),
    targetPath: text("target_path"),
    targetNoteId: uuid("target_note_id").references(() => notes.id, { onDelete: "set null" }),
    kind: text("kind").$type<"wikilink" | "embed" | "markdown">().notNull().default("wikilink"),
    heading: text("heading"),
    alias: text("alias"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("links_source_idx").on(table.sourceNoteId),
    index("links_target_idx").on(table.targetNoteId),
    index("links_vault_idx").on(table.vaultId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (table) => [uniqueIndex("tags_vault_name_ci").on(table.vaultId, sql`lower(${table.name})`)],
);

export const noteTags = pgTable(
  "note_tags",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.noteId, table.tagId] })],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    /** Base64 encoded bytes. Keeps the MVP portable across Neon drivers. */
    data: text("data"),
    blobUrl: text("blob_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("attachments_vault_path_ci").on(table.vaultId, sql`lower(${table.path})`),
  ],
);

export const canvases = pgTable(
  "canvases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    contentHash: text("content_hash").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("canvases_vault_path_ci").on(table.vaultId, sql`lower(${table.path})`)],
);

export const bases = pgTable(
  "bases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
    raw: text("raw").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("bases_vault_path_ci").on(table.vaultId, sql`lower(${table.path})`)],
);

// ---------------------------------------------------------------------------
// Semantic index
// ---------------------------------------------------------------------------

export const chunks = pgTable(
  "note_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    heading: text("heading"),
    content: text("content").notNull(),
    tokens: integer("tokens").notNull().default(0),
    embedding: vector1536("embedding"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("chunks_note_idx").on(table.noteId),
    index("chunks_vault_idx").on(table.vaultId),
  ],
);

// ---------------------------------------------------------------------------
// LLM usage / audit
// ---------------------------------------------------------------------------

export const llmRuns = pgTable(
  "llm_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vaultId: uuid("vault_id").references(() => vaults.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    status: text("status").notNull().default("ok"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("llm_runs_user_idx").on(table.userId, table.createdAt)],
);

export const usageQuotas = pgTable(
  "usage_quotas",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    tokens: integer("tokens").notNull().default(0),
    requests: integer("requests").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    vaultId: uuid("vault_id").references(() => vaults.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_logs_vault_idx").on(table.vaultId, table.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Vault = typeof vaults.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Canvas = typeof canvases.$inferSelect;
export type Base = typeof bases.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
