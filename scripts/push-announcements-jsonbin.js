#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const API_BASE = process.env.JSONBIN_API_BASE_URL || "https://api.jsonbin.io/v3";
const BIN_ID = process.env.JSONBIN_ANNOUNCEMENTS_BIN_ID || process.env.VITE_JSONBIN_ANNOUNCEMENTS_BIN_ID;
const MASTER_KEY = process.env.JSONBIN_API_KEY || process.env.JSONBIN_MASTER_KEY;
const INPUT_FILE = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(process.cwd(), "public/announcements.json");

const ALLOWED_CATEGORIES = new Set(["system", "campaign", "maintenance", "risk"]);

function normalizeAnnouncements(raw) {
  if (!Array.isArray(raw)) {
    throw new Error("公告文件必须是 JSON 数组");
  }

  return raw.map((item, idx) => {
    if (!item || typeof item !== "object") {
      throw new Error(`第 ${idx + 1} 条公告格式无效`);
    }

    const title = String(item.title || "").trim();
    const summary = String(item.summary || "").trim();
    const content = String(item.content || "").trim();
    if (!title || !summary || !content) {
      throw new Error(`第 ${idx + 1} 条公告缺少 title/summary/content`);
    }

    const category = ALLOWED_CATEGORIES.has(String(item.category || ""))
      ? String(item.category)
      : "system";

    return {
      $id: String(item.$id || item.id || `announcement-${idx + 1}`),
      title,
      summary,
      content,
      category,
      pin: Boolean(item.pin),
      priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
      createdAt: String(item.createdAt || new Date().toISOString()),
    };
  });
}

async function main() {
  if (!BIN_ID) {
    throw new Error("缺少 JSONBIN_ANNOUNCEMENTS_BIN_ID（或 VITE_JSONBIN_ANNOUNCEMENTS_BIN_ID）");
  }
  if (!MASTER_KEY) {
    throw new Error("缺少 JSONBIN_API_KEY（或 JSONBIN_MASTER_KEY）");
  }
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`公告文件不存在: ${INPUT_FILE}`);
  }

  const rawText = fs.readFileSync(INPUT_FILE, "utf8");
  const parsed = JSON.parse(rawText);
  const announcements = normalizeAnnouncements(parsed);
  const payload = { announcements };

  const response = await fetch(`${API_BASE}/b/${BIN_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": MASTER_KEY,
      "X-Bin-Name": "incubator-announcements",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`JSONBin 更新失败 (${response.status}): ${text}`);
  }

  console.log("JSONBin 公告已更新成功。");
  console.log(`binId: ${BIN_ID}`);
  try {
    const data = JSON.parse(text);
    if (data?.metadata?.modifiedAt) {
      console.log(`modifiedAt: ${data.metadata.modifiedAt}`);
    }
  } catch {
    // ignore non-json response
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
