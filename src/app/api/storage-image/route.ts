import { NextRequest, NextResponse } from "next/server";

type Bucket = "avatars" | "pupdates";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const imageSessionCookie = "pupdate.image-session";

function isBucket(value: string | null): value is Bucket {
  return value === "avatars" || value === "pupdates";
}

function readAccessToken(request: NextRequest) {
  const raw = request.cookies.get(imageSessionCookie)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { access_token?: string };
    return parsed.access_token ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const bucket = request.nextUrl.searchParams.get("bucket");
  const path = request.nextUrl.searchParams.get("path");
  const accessToken = readAccessToken(request);

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  if (!isBucket(bucket) || !path || path.includes("..")) {
    return NextResponse.json({ error: "Invalid image path." }, { status: 400 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const upstream = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Image could not be loaded." }, { status: upstream.status });
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
    "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
  });
  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}
