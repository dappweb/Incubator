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

/**
 * Loads announcements from the static file /announcements.json (served from public/).
 * To add or update announcements, edit public/announcements.json — no rebuild required.
 */
export async function fetchPublishedAnnouncements(): Promise<Announcement[]> {
  try {
    const response = await fetch("/announcements.json");
    if (!response.ok) {
      return [];
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }
    return data as Announcement[];
  } catch {
    return [];
  }
}
