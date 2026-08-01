const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function normalizeSyncServiceUrl(value: string): string {
  const candidate = value.trim();
  if (!candidate) throw new Error("Enter the sync service URL.");

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a valid sync service URL.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("The sync service URL must not contain credentials.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("The sync service URL must not contain a query or fragment.");
  }

  const localHttp = parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error("Use HTTPS, except for a localhost development service.");
  }

  return parsed.toString().replace(/\/$/, "");
}
