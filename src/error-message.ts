type ErrorTemplateParams = Record<string, string | number | undefined>;

export function formatErrorTemplate(template: string, params: ErrorTemplateParams) {
  const normalized = template.trim();
  if (!normalized) return;

  return normalized.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}
