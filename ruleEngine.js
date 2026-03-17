const db = require("./db");

async function getCurrentMode() {
  const mode = await db.getConfig("mode");
  return mode || "OFF";
}

async function shouldReply(msg) {
  if (msg.from.endsWith("@g.us")) return false;
  if (msg.hasMedia) return false;
  if (!msg.body || !msg.body.trim()) return false;

  const contact = await msg.getContact();
  const normalizedId = contact.number + "@c.us";

  const allowed = await db.isUserAllowed(normalizedId);
  if (!allowed) return false;

  const mode = await getCurrentMode();
  if (mode === "OFF") return false;

  return true;
}

module.exports = { shouldReply, getCurrentMode };
