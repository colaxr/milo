import { databaseReady } from "../../../server/sqlite";
import { apiError, json } from "../../../server/responses";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    databaseReady();
    return json({ status: "ok", database: "connected" });
  } catch {
    return apiError("database unavailable", 503);
  }
}
