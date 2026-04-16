import {
  JSONBIN_ANNOUNCEMENTS_ACCESS_KEY,
  JSONBIN_ANNOUNCEMENTS_BIN_ID,
  JSONBIN_API_BASE_URL,
} from "../config";

export type Announcement = {
  $id: string;
  title: string;
  summary: string;
  content: string;
  category: "system" | "campaign" | "maintenance" | "risk";
  pin: boolean;
  priority: number;
  createdAt: string;
};

type JsonBinPayload = {
  record?: unknown;
};

const ALLOWED_CATEGORIES = new Set<Announcement["category"]>([
  "system",
  "campaign",
  "maintenance",
  "risk",
]);

function normalizeAnnouncements(raw: unknown): Announcement[] {
  const rows = Array.isArray(raw)
    ? raw
    : (typeof raw === "object" && raw && Array.isArray((raw as any).announcements)
      ? (raw as any).announcements
      : []);

  const normalized: Announcement[] = [];
  for (let i = 0; i < rows.length; i++) {
    const item = rows[i] as Record<string, unknown>;
    if (!item || typeof item !== "object") continue;

    const title = String(item.title ?? "").trim();
    const summary = String(item.summary ?? "").trim();
    const content = String(item.content ?? "").trim();
    if (!title || !summary || !content) continue;

    const rawCategory = String(item.category ?? "system") as Announcement["category"];
    const category = ALLOWED_CATEGORIES.has(rawCategory) ? rawCategory : "system";
    const createdAt = String(item.createdAt ?? "").trim() || new Date(0).toISOString();

    normalized.push({
      $id: String(item.$id ?? item.id ?? `announcement-${i + 1}`),
      title,
      summary,
      content,
      category,
      pin: Boolean(item.pin),
      priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
      createdAt,
    });
  }

  return normalized.sort((a, b) => {
    if (a.pin !== b.pin) return a.pin ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

async function fetchFromJsonBin(): Promise<Announcement[] | null> {
  if (!JSONBIN_ANNOUNCEMENTS_BIN_ID) {
    return null;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (JSONBIN_ANNOUNCEMENTS_ACCESS_KEY) {
    headers["X-Access-Key"] = JSONBIN_ANNOUNCEMENTS_ACCESS_KEY;
  }

  try {
    const response = await fetch(
      `${JSONBIN_API_BASE_URL}/b/${JSONBIN_ANNOUNCEMENTS_BIN_ID}/latest`,
      { headers, cache: "no-store" },
    );
    if (!response.ok) return null;

    const data = (await response.json()) as JsonBinPayload | unknown;
    const payload = (data as JsonBinPayload)?.record ?? data;
    return normalizeAnnouncements(payload);
  } catch {
    return null;
  }
}

/**
 * Loads announcements from JSONBin first (if configured), then falls back to
 * the static file /announcements.json served from public/.
 */
export async function fetchPublishedAnnouncements(): Promise<Announcement[]> {
  const jsonBinRows = await fetchFromJsonBin();
  if (jsonBinRows) {
    return jsonBinRows;
  }

  try {
    const response = await fetch("/announcements.json");
    if (!response.ok) {
      return [];
    }
    const data: unknown = await response.json();
    return normalizeAnnouncements(data);
  } catch {
    return [];
  }
}

/* ═══════════════════════════════════════════════════════════════
 *  Admin write helpers — used exclusively by the Admin panel.
 *  Requires a JSONBin Master Key (entered per session, never
 *  embedded in the build).
 * ═══════════════════════════════════════════════════════════════ */

const SESSION_KEY_STORAGE = "jsonbin_admin_key";

export function getStoredMasterKey(): string {
  try { return sessionStorage.getItem(SESSION_KEY_STORAGE) ?? ""; } catch { return ""; }
}
export function setStoredMasterKey(key: string): void {
  try { sessionStorage.setItem(SESSION_KEY_STORAGE, key); } catch { /* noop */ }
}

/**
 * Overwrites the entire bin content with the given announcements array.
 */
export async function publishAnnouncementsToJsonBin(
  announcements: Announcement[],
  masterKey: string,
): Promise<void> {
  if (!JSONBIN_ANNOUNCEMENTS_BIN_ID) throw new Error("JSONBIN bin ID 未配置");
  if (!masterKey) throw new Error("请输入 JSONBin Master Key");

  const res = await fetch(
    `${JSONBIN_API_BASE_URL}/b/${JSONBIN_ANNOUNCEMENTS_BIN_ID}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": masterKey,
      },
      body: JSON.stringify({ announcements }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JSONBin 更新失败 (${res.status}): ${body}`);
  }
}

export function createEmptyAnnouncement(): Announcement {
  return {
    $id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: "",
    summary: "",
    content: "",
    category: "system",
    pin: false,
    priority: 0,
    createdAt: new Date().toISOString(),
  };
}
