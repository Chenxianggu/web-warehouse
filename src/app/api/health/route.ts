import { healthResponse } from "@/server/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return healthResponse();
}
