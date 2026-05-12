import { NextRequest, NextResponse } from "next/server";

const SUPABASE_INTERNAL_URL = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!SUPABASE_INTERNAL_URL) {
  throw new Error("Supabase internal URL is not configured. Set SUPABASE_INTERNAL_URL in .env.");
}

async function proxyRequest(request: NextRequest, path: string[] = []) {
  const targetOrigin = SUPABASE_INTERNAL_URL!.replace(/\/+$/, "");
  const targetPath = path.length ? `/${path.join("/")}` : "";
  const targetUrl = `${targetOrigin}${targetPath}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  headers.set("host", new URL(targetOrigin).host);
  headers.delete("origin");

  const fetchOptions: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.body) {
    fetchOptions.body = request.body;
    fetchOptions.duplex = 'half';
  }

  const response = await fetch(targetUrl, fetchOptions);

  const responseHeaders = new Headers(response.headers);
  ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade"].forEach((name) => {
    responseHeaders.delete(name);
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
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
