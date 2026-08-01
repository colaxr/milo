import { ensureDatabase } from "../../../server/mongodb";
import { apiError, json } from "../../../server/responses";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const database = await ensureDatabase();
    await database.command({ ping: 1 });
    return json({ status: "ok", database: "connected" });
  } catch {
    return apiError("database unavailable", 503);
  }
}
