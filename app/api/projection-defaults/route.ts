import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const REDIS_KEY = "projection-defaults";
const redis = Redis.fromEnv();

export async function GET() {
  try {
    const data = await redis.get(REDIS_KEY);
    return NextResponse.json(data ?? null, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(null);
  }
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    await redis.set(REDIS_KEY, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
