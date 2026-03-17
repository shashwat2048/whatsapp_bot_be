const db = require("./db");

const DEFAULTS = {
  system_prompt:
    "You are a helpful personal AI assistant on WhatsApp. Be concise, friendly, and accurate. Reply in the same language the user writes in.",
  auto_reply: "true",
  max_tokens: "1024",
  temperature: "0.7",
  history_limit: "20",
  allowed_chats: "",
  blocked_chats: "",
};

let cache = null;

async function load() {
  const stored = await db.getAllConfig();
  cache = { ...DEFAULTS, ...stored };
  return cache;
}

async function get(key) {
  if (!cache) await load();
  return cache[key] ?? DEFAULTS[key] ?? null;
}

async function set(key, value) {
  await db.setConfig(key, value);
  if (!cache) cache = { ...DEFAULTS };
  cache[key] = value;
}

async function getAll() {
  if (!cache) await load();
  return { ...cache };
}

async function seedDefaults() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const existing = await db.getConfig(key);
    if (existing === null) {
      await db.setConfig(key, value);
    }
  }
  await load();
}

function isChatAllowed(chatId) {
  if (!cache) return true;

  const blocked = cache.blocked_chats;
  if (blocked) {
    const list = blocked.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.includes(chatId)) return false;
  }

  const allowed = cache.allowed_chats;
  if (allowed) {
    const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) return list.includes(chatId);
  }

  return true;
}

function isAutoReplyEnabled() {
  if (!cache) return true;
  return cache.auto_reply === "true";
}

module.exports = {
  load,
  get,
  set,
  getAll,
  seedDefaults,
  isChatAllowed,
  isAutoReplyEnabled,
};
