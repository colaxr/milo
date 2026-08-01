import { usersExist } from "../../../../server/auth";
import { apiError, json } from "../../../../server/responses";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return json({ initialized: usersExist() });
  } catch {
    return apiError("initialization status unavailable", 503);
  }
}
