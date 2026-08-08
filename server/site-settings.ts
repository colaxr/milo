import { getDatabase } from "./sqlite";

export type SiteSettings = {
  brandName: string;
  footerLabel: string;
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  brandName: "青屿云盘",
  footerLabel: "© 2026 青屿云盘",
};

type SiteSettingRow = {
  key: string;
  value: string;
};

function readSetting(key: string): string | undefined {
  const row = getDatabase().prepare("SELECT value FROM site_settings WHERE key = ?").get(key) as SiteSettingRow | undefined;
  return row?.value;
}

export function getSiteSettings(): SiteSettings {
  return {
    brandName: readSetting("brandName") ?? DEFAULT_SITE_SETTINGS.brandName,
    footerLabel: readSetting("footerLabel") ?? DEFAULT_SITE_SETTINGS.footerLabel,
  };
}

export function updateSiteSettings(next: SiteSettings): SiteSettings {
  const database = getDatabase();
  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run("brandName", next.brandName, now);
    database.prepare(`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run("footerLabel", next.footerLabel, now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return next;
}
