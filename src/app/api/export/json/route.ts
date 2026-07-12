import { exportBackup } from "@/db/transfer";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(exportBackup(), { headers: { "Content-Disposition": `attachment; filename="values-tool-backup-${new Date().toISOString().slice(0, 10)}.json"` } });
}
