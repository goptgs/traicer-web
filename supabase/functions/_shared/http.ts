export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, apikey, x-client-info, x-render-secret",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

export function empty(status = 204): Response {
  return new Response(null, { status, headers: CORS_HEADERS });
}

export function envValue(name: string): string | null {
  const value = Deno.env.get(name)?.trim() ?? "";
  return value ? value : null;
}

export function siteUrl(): string {
  const raw = envValue("SITE_URL") ?? "https://traicer.golf";
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:" || (url.protocol === "http:" && local)) {
      return raw.replace(/\/+$/, "");
    }
  } catch {
    /* fall through */
  }
  return "https://traicer.golf";
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}
