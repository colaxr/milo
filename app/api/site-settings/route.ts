import { sessionUser } from "../../../server/auth";
import { getSiteSettings, updateSiteSettings } from "../../../server/site-settings";
import { apiError, json } from "../../../server/responses";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return json({ settings: getSiteSettings() });
  } catch {
    return apiError("site settings unavailable", 503);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const admin = await sessionUser(request);
    if (!admin || admin.role !== "admin") return apiError("forbidden", 403);
    const body = await request.json() as { brandName?: unknown; footerLabel?: unknown };
    if (typeof body.brandName !== "string" || typeof body.footerLabel !== "string") {
      return apiError("invalid site settings", 400);
    }
    const brandName = body.brandName.trim();
    const footerLabel = body.footerLabel.trim();
    if (!brandName || brandName.length > 40 || !footerLabel || footerLabel.length > 80) {
      return apiError("invalid site settings", 400);
    }
    return json({ settings: updateSiteSettings({ brandName, footerLabel }) });
  } catch {
    return apiError("site settings unavailable", 503);
  }
}
