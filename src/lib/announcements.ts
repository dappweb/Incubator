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

export type FrontendFeatureToggles = {
  showHomeMachine: boolean;
  showMarket: boolean;
  showSwap: boolean;
  showAdmin: boolean;
};

export const DEFAULT_FRONTEND_FEATURE_TOGGLES: FrontendFeatureToggles = {
  showHomeMachine: true,
  showMarket: true,
  showSwap: true,
  showAdmin: true,
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

function normalizeFrontendFeatureToggles(raw: unknown): FrontendFeatureToggles {
  const source = (typeof raw === "object" && raw && typeof (raw as any).featureToggles === "object")
    ? (raw as any).featureToggles
    : raw;

  if (!source || typeof source !== "object") {
    return { ...DEFAULT_FRONTEND_FEATURE_TOGGLES };
  }

  const next = {
    ...DEFAULT_FRONTEND_FEATURE_TOGGLES,
    ...source,
  } as Record<string, unknown>;

  return {
    showHomeMachine: Boolean(next.showHomeMachine),
    showMarket: Boolean(next.showMarket),
    showSwap: Boolean(next.showSwap),
    showAdmin: Boolean(next.showAdmin),
  };
}

async function fetchJsonBinPayload(): Promise<unknown | null> {
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
    if (!response.ok) {
      console.warn(`[announcements] JSONBin fetch failed: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as JsonBinPayload | unknown;
    const payload = (data as JsonBinPayload)?.record ?? data;
    return payload;
  } catch (err) {
    console.warn("[announcements] JSONBin fetch error:", err);
    return null;
  }
}

async function fetchStaticPayload(): Promise<unknown | null> {
  try {
    const response = await fetch("/announcements.json");
    if (!response.ok) {
      console.warn(`[announcements] static file fetch failed: ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (err) {
    console.warn("[announcements] static file fetch error:", err);
    return null;
  }
}

/**
 * Loads announcements from JSONBin first (if configured), then falls back to
 * the static file /announcements.json served from public/.
 */
export async function fetchPublishedAnnouncements(): Promise<Announcement[]> {
  const jsonBinPayload = await fetchJsonBinPayload();
  const jsonBinRows = normalizeAnnouncements(jsonBinPayload);
  if (jsonBinRows && jsonBinRows.length > 0) {
    console.info(`[announcements] JSONBin returned ${jsonBinRows.length} announcements`);
    return jsonBinRows;
  }

  const staticPayload = await fetchStaticPayload();
  const staticRows = normalizeAnnouncements(staticPayload);
  console.info(`[announcements] static fallback returned ${staticRows.length} announcements`);
  return staticRows.length > 0 ? staticRows : [];
}

export async function fetchFrontendFeatureToggles(): Promise<FrontendFeatureToggles> {
  const jsonBinPayload = await fetchJsonBinPayload();
  if (jsonBinPayload) {
    return normalizeFrontendFeatureToggles(jsonBinPayload);
  }

  const staticPayload = await fetchStaticPayload();
  if (staticPayload) {
    return normalizeFrontendFeatureToggles(staticPayload);
  }

  return { ...DEFAULT_FRONTEND_FEATURE_TOGGLES };
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
  featureToggles: FrontendFeatureToggles = DEFAULT_FRONTEND_FEATURE_TOGGLES,
): Promise<void> {
  if (!JSONBIN_ANNOUNCEMENTS_BIN_ID) throw new Error("JSONBIN bin ID 未配置");
  if (!masterKey) throw new Error("请输入 JSONBin Master Key");

  const url = `${JSONBIN_API_BASE_URL}/b/${JSONBIN_ANNOUNCEMENTS_BIN_ID}`;
  console.info(`[announcements] Publishing ${announcements.length} announcements to JSONBin...`);
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": masterKey,
    },
    body: JSON.stringify({ announcements, featureToggles }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[announcements] JSONBin publish failed (${res.status}):`, body);
    throw new Error(`JSONBin 更新失败 (${res.status}): ${body}`);
  }
  console.info("[announcements] Published successfully.");
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
