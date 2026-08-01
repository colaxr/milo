export type LocalUser = {
  username: string;
  displayName: string;
  role: "admin" | "user";
  vaultSalt: string;
  vaultIterations: number;
  createdAt: string;
};

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
