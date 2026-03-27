import { Client, Databases, Query } from "appwrite";
import {
  APPWRITE_ANNOUNCEMENTS_COLLECTION_ID,
  APPWRITE_DATABASE_ID,
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
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

const client = new Client();

if (APPWRITE_ENDPOINT && APPWRITE_PROJECT_ID) {
  client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
}

const databases = new Databases(client);

export async function fetchPublishedAnnouncements() {
  if (
    !APPWRITE_DATABASE_ID ||
    !APPWRITE_ANNOUNCEMENTS_COLLECTION_ID ||
    !APPWRITE_ENDPOINT ||
    !APPWRITE_PROJECT_ID
  ) {
    return [] as Announcement[];
  }

  const nowIso = new Date().toISOString();
  const result = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_ANNOUNCEMENTS_COLLECTION_ID,
    [
      Query.equal("status", "published"),
      Query.or([Query.isNull("startAt"), Query.lessThanEqual("startAt", nowIso)]),
      Query.or([Query.isNull("endAt"), Query.greaterThan("endAt", nowIso)]),
      Query.orderDesc("pin"),
      Query.orderDesc("priority"),
      Query.orderDesc("createdAt"),
      Query.limit(20),
    ],
  );

  return result.documents as unknown as Announcement[];
}
