import { NextRequest, NextResponse } from "next/server";

const SUPABASE_INTERNAL_URL = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!SUPABASE_INTERNAL_URL) {
  throw new Error("Supabase internal URL is not configured. Set SUPABASE_INTERNAL_URL in .env.");
}

async function proxyRequest(request: NextRequest) {
  const targetOrigin = SUPABASE_INTERNAL_URL!.replace(/\/+$/, "");
  const targetUrl = `${targetOrigin}${request.nextUrl.pathname.replace(/^\/api\/supabase/, "")}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  headers.set("host", new URL(targetOrigin).host);
  headers.delete("origin");

  let response: Response;

  try {
    response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });
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

export async function GET(request: NextRequest) {
  return proxyRequest(request);
}

export async function POST(request: NextRequest) {
  return proxyRequest(request);
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request);
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request);
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request);
}

export async function OPTIONS(request: NextRequest) {
  return proxyRequest(request);
}

export async function HEAD(request: NextRequest) {
  return proxyRequest(request);
}
