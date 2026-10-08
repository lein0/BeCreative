import { getActor } from "@/lib/actor";
import { analyticsCsv, rangeFromSearch } from "@/lib/analytics-report";
import { canViewPlatformStats } from "@/lib/permissions";

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor || !canViewPlatformStats(actor.roles)) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const search = Object.fromEntries(url.searchParams.entries());
  const csv = await analyticsCsv(rangeFromSearch(search));
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=analytics.csv" } });
}
