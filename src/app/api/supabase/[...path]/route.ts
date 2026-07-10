import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

async function proxyRequest(request: NextRequest, path: string[] = []) {
  const internalUrl = getSupabaseInternalUrl();
  if (!internalUrl) {
    return NextResponse.json(
      { error: "Supabase internal URL is not configured. Set SUPABASE_INTERNAL_URL in .env." },
      { status: 500 },
    );
  }

  const targetOrigin = internalUrl.replace(/\/+$/, "");
  const targetPath = path.length ? `/${path.join("/")}` : "";
  const targetUrl = `${targetOrigin}${targetPath}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  headers.set("host", new URL(targetOrigin).host);
  headers.delete("origin");

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.body && request.method !== "GET" && request.method !== "HEAD") {
    // Buffer the small Auth/PostgREST payload before forwarding it. Passing the
    // incoming stream through directly can be aborted by Next dev navigation,
    // which surfaced as intermittent ECONNRESET on a second anonymous signup.
    fetchOptions.body = await request.arrayBuffer();
    headers.delete("content-length");
  }

  let response: Response;

  try {
    response = await fetch(targetUrl, fetchOptions);
  } catch {
    return NextResponse.json(
      { error: "Supabase local est indisponible. Demarrez la stack avec npm run dev ou npm run dev:supabase." },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers(response.headers);
  ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade"].forEach((name) => {
    responseHeaders.delete(name);
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

function getSupabaseInternalUrl() {
  return (
    readDotEnvValue("SUPABASE_INTERNAL_URL") || process.env.SUPABASE_INTERNAL_URL ||
    readDotEnvValue("SUPABASE_URL") || process.env.SUPABASE_URL ||
    readDotEnvValue("NEXT_PUBLIC_SUPABASE_URL") || process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

function readDotEnvValue(name: string) {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return undefined;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([^=]+)=(.*)$/.exec(trimmed);
    if (!match || match[1].trim() !== name) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value;
  }

  return undefined;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function OPTIONS(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function HEAD(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyRequest(request, path);
}
