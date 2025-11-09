const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
);

function ensureAllowlist() {
  if (!ADMIN_EMAILS.size) {
    console.warn('[auth] ADMIN_EMAILS is empty; denying admin access.');
  }
}

ensureAllowlist();

export function isAdminEmail(email?: string | null): boolean {
  if (!email) {
    return false;
  }
  if (!ADMIN_EMAILS.size) {
    return false;
  }
  return ADMIN_EMAILS.has(email.toLowerCase());
}

export function getAdminEmails(): string[] {
  return Array.from(ADMIN_EMAILS.values());
}
