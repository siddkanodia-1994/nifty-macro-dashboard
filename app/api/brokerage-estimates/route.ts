import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import type { IndexKey } from "@/lib/types";
import type { BrokerageRow } from "@/components/BrokerageEstimatesCard";

const BROKERAGE_KEY = "brokerage-estimates";
const redis = Redis.fromEnv();

type BrokerageStore = Partial<Record<IndexKey, BrokerageRow[]>>;

export async function GET() {
  try {
    const data = await redis.get<BrokerageStore>(BROKERAGE_KEY);
    return NextResponse.json(data ?? {}, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(request: Request) {
  try {
    const { indexKey, row } = await request.json() as {
      indexKey: IndexKey;
      row: Omit<BrokerageRow, "id" | "addedAt">;
    };
    const newRow: BrokerageRow = {
      ...row,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      addedAt: new Date().toISOString(),
    };
    const existing = (await redis.get<BrokerageStore>(BROKERAGE_KEY)) ?? {};
    const updated = [...(existing[indexKey] ?? []), newRow];
    await redis.set(BROKERAGE_KEY, { ...existing, [indexKey]: updated });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { indexKey, rowId } = await request.json() as { indexKey: IndexKey; rowId: string };
    const existing = (await redis.get<BrokerageStore>(BROKERAGE_KEY)) ?? {};
    const updated = (existing[indexKey] ?? []).filter((r) => r.id !== rowId);
    await redis.set(BROKERAGE_KEY, { ...existing, [indexKey]: updated });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
