export function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export const appUrl = () =>
  (getEnv("APP_URL") ?? "http://localhost:3000").replace(/\/$/, "");

export const config = {
  get openRegistration() {
    return (getEnv("ALLOW_OPEN_REGISTRATION") ?? "true") === "true";
  },
  get autoVerifyEmails() {
    return (getEnv("AUTO_VERIFY_EMAILS") ?? "false") === "true";
  },
  get dailyTokenQuota() {
    return Number(getEnv("DAILY_TOKEN_QUOTA") ?? "50000");
  },
  get llmModel() {
    return getEnv("OPENROUTER_MODEL") ?? "google/gemini-2.5-flash";
  },
  get embeddingModel() {
    return getEnv("GEMINI_EMBEDDING_MODEL") ?? "gemini-embedding-001";
  },
  get embeddingDimensions() {
    return Number(getEnv("EMBEDDING_DIMENSIONS") ?? "1536");
  },
  get hasLlm() {
    return Boolean(getEnv("OPENROUTER_API_KEY"));
  },
  get hasEmbeddings() {
    return Boolean(getEnv("GEMINI_API_KEY"));
  },
  get googleEnabled() {
    return Boolean(getEnv("GOOGLE_CLIENT_ID") && getEnv("GOOGLE_CLIENT_SECRET"));
  },
};
