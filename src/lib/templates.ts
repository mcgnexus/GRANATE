const DATE_FORMAT_RE = /\{\{date(?::([^}]+))?\}\}/g;
const TIME_FORMAT_RE = /\{\{time(?::([^}]+))?\}\}/g;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDatePattern(date: Date, pattern: string) {
  return pattern
    .replace(/YYYY/g, String(date.getFullYear()))
    .replace(/YY/g, String(date.getFullYear()).slice(-2))
    .replace(/MMMM/g, date.toLocaleDateString("es-ES", { month: "long" }))
    .replace(/MMM/g, date.toLocaleDateString("es-ES", { month: "short" }))
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/DD/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()))
    .replace(/ss/g, pad(date.getSeconds()));
}

export function renderTemplate(
  content: string,
  options: { title: string; date?: Date },
) {
  const date = options.date ?? new Date();
  return content
    .replace(DATE_FORMAT_RE, (_, pattern?: string) =>
      pattern ? formatDatePattern(date, pattern) : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    )
    .replace(TIME_FORMAT_RE, (_, pattern?: string) =>
      pattern ? formatDatePattern(date, pattern) : `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    )
    .replace(/\{\{title\}\}/g, options.title)
    .replace(/\{\{nombre\}\}/g, options.title);
}

export function todayPath(folder: string, date = new Date()) {
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${folder.replace(/\/+$/, "")}/${stamp}.md`;
}

export function vaultTemplateSettings(settings: Record<string, unknown>) {
  return {
    templatesFolder:
      typeof settings.templatesFolder === "string" && settings.templatesFolder.trim()
        ? settings.templatesFolder.replace(/^\/+|\/+$/g, "")
        : "Plantillas",
    dailyFolder:
      typeof settings.dailyFolder === "string" && settings.dailyFolder.trim()
        ? settings.dailyFolder.replace(/^\/+|\/+$/g, "")
        : "Diario",
    dailyTemplate:
      typeof settings.dailyTemplate === "string" && settings.dailyTemplate.trim()
        ? settings.dailyTemplate.replace(/^\/+|\/+$/g, "")
        : "Plantillas/Diario.md",
  };
}
