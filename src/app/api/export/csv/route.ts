import { exportCsv, csvExports } from "@/db/transfer";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const file = new URL(request.url).searchParams.get("file") ?? "values";
  if (!(file in csvExports)) return new Response("Unknown CSV export", { status: 400 });
  return new Response(exportCsv(file as keyof typeof csvExports), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"` } });
}
