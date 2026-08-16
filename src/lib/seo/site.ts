const DEFAULT_SITE_ORIGIN = "https://myheroes.nthstudio.eu";

function normalizeOrigin(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getSiteOrigin(): string {
  return (
    normalizeOrigin(process.env.APP_PUBLIC_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    DEFAULT_SITE_ORIGIN
  );
}

export function getSiteUrl(path = "/"): string {
  return new URL(path, `${getSiteOrigin()}/`).toString();
}
