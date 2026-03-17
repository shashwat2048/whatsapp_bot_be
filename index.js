require("dotenv").config();

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");
const cors = require("cors");

const db = require("./db");
const { shouldReply, getCurrentMode } = require("./ruleEngine");
const { generateReply } = require("./ai");
const { logInfo, logWarn, logError } = require("./logger");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VALID_MODES = ["OFF", "AWAY", "GYM", "WORK", "SLEEP", "CUSTOM"];
const MAX_REPLIES_PER_USER = 3;
const REPLY_WINDOW_MS = 30 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────

const replyTracker = {};

const fallbackReplies = {
  GYM: "Gym, will get back to you later.",
  WORK: "Working, will get back to you later.",
  AWAY: "Busy, will get back to you later.",
  SLEEP: "Sleeping, will get back to you later.",
  CUSTOM: "Doing something, will get back to you later.",
};

function randomDelay(min, max) {
  const ms = (Math.random() * (max - min) + min) * 1000;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── WhatsApp Client ──────────────────────────────────────────────

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true, args: ["--no-sandbox"] },
});

client.on("qr", (qr) => {
  console.log("Scan QR code to log in:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("Bot Ready");
});

client.on("disconnected", (reason) => {
  console.log("Disconnected:", reason);
});

// ── Message Handler ──────────────────────────────────────────────

client.on("message", async (msg) => {
  try {
    if (msg.from.endsWith("@g.us")) {
      logInfo("MESSAGE_IGNORED", { from: msg.from, reason: "group_message" });
      return;
    }
    if (msg.hasMedia || !msg.body || !msg.body.trim()) return;

    const contact = await msg.getContact();
    const normalizedId = contact.number + "@c.us";

    logInfo("MESSAGE_RECEIVED", {
      from: msg.from,
      normalizedId,
      body: msg.body,
    });

    const allowed = await db.isUserAllowed(normalizedId);
    if (!allowed) {
      logWarn("MESSAGE_IGNORED", { normalizedId, reason: "not_allowed" });
      return;
    }

    const mode = await db.getConfig("mode");
    if (!mode || mode === "OFF") {
      logInfo("MESSAGE_IGNORED", { normalizedId, reason: "mode_off" });
      return;
    }

    const basePrompt = (await db.getConfig("base_prompt")) || "";
    const rawActivity = (await db.getConfig("custom_activity")) || "";
    const customActivity = (mode === "CUSTOM") ? rawActivity : null;
    const userRecord = await db.getUserByPhone(normalizedId);
    const userDescription = userRecord?.description || "";

    logInfo("MODE_APPLIED", { phone: normalizedId, mode });

    if (mode === "CUSTOM" && !rawActivity) {
      logWarn("CUSTOM_MODE_NO_ACTIVITY", { phone: normalizedId });
    }

    if (userDescription) {
      logInfo("USER_CONTEXT_APPLIED", { phone: normalizedId, description: userDescription });
    }

    const now = Date.now();
    if (!replyTracker[normalizedId] || now - replyTracker[normalizedId].lastReset > REPLY_WINDOW_MS) {
      replyTracker[normalizedId] = { count: 0, lastReset: now };
    }
    let replyText;
    if (replyTracker[normalizedId].count >= MAX_REPLIES_PER_USER) {
      logWarn("REPLY_LIMIT_REACHED", { phone: normalizedId });
      if (mode === "CUSTOM" && customActivity) {
        replyText = `Abhi ${customActivity}. Baad me properly reply karta hoon.`;
      } else {
        replyText = fallbackReplies[mode] || "Will reply later.";
      }
    } else {
      try {
        replyText = await generateReply(msg.body, basePrompt, mode, userDescription, customActivity);
      } catch (aiErr) {
        logError("AI_GENERATION_FAILED", aiErr);
        if (mode === "CUSTOM" && customActivity) {
          replyText = `Abhi ${customActivity}. Baad me properly reply karta hoon.`;
        } else {
          replyText = fallbackReplies[mode] || "Will reply later.";
        }
        logWarn("MODE_FALLBACK_USED", { mode });
      }
    }

    await msg.reply(replyText);
    replyTracker[normalizedId].count++;

    logInfo("AUTO_REPLY_SENT", {
      phone: normalizedId,
      mode,
      reply_text: replyText,
    });
  } catch (err) {
    logError("MESSAGE_HANDLER_ERROR", err);
  }
});

// ── Express API ──────────────────────────────────────────────────

app.post("/add-user", async (req, res) => {
  try {
    let { phone, description } = req.body;
    description = (typeof description === "string") ? description.trim() : "";
    logInfo("USER_ADD_REQUEST", { phone, description });

    if (!phone) {
      logWarn("USER_ADD_FAILED", { phone, reason: "missing_phone" });
      return res.status(400).json({ error: "phone is required" });
    }

    phone = String(phone).replace(/^\+/, "");
    if (!/^\d{7,15}$/.test(phone)) {
      logWarn("USER_ADD_FAILED", { phone, reason: "invalid_format" });
      return res.status(400).json({ error: "Invalid phone — must be numeric (e.g. 919876543210)" });
    }

    const numberId = await client.getNumberId(phone);
    if (!numberId) {
      logWarn("USER_ADD_FAILED", { phone, reason: "not_on_whatsapp" });
      return res.status(400).json({ error: "Number not registered on WhatsApp" });
    }

    const storedId = numberId._serialized;
    await db.addAllowedUser(storedId, description);
    logInfo("USER_ADDED_SUCCESS", { phone, storedId, description });
    res.json({ ok: true, phone, whatsapp_id: storedId, description });
  } catch (err) {
    logError("API_ERROR", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/remove-user", async (req, res) => {
  try {
    const { phone } = req.body;
    logInfo("USER_REMOVE_REQUEST", { phone });

    if (!phone || !/^\d{7,15}$/.test(phone)) {
      logWarn("USER_ADD_FAILED", { phone, reason: "invalid_format" });
      return res.status(400).json({ error: "Invalid phone — provide digits only (e.g. 919876543210)" });
    }

    const numberId = await client.getNumberId(phone);
    if (!numberId) {
      logWarn("USER_ADD_FAILED", { phone, reason: "not_on_whatsapp" });
      return res.status(404).json({ error: "Number not on WhatsApp" });
    }

    const waId = numberId._serialized;
    await db.removeAllowedUser(waId);
    logInfo("USER_REMOVED", { phone });
    res.json({ ok: true, phone, whatsapp_id: waId });
  } catch (err) {
    logError("API_ERROR", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/set-mode", async (req, res) => {
  try {
    const { mode } = req.body;
    logInfo("MODE_CHANGE_REQUEST", { newMode: mode });

    if (!mode || !VALID_MODES.includes(mode)) {
      logWarn("MODE_CHANGE_REQUEST", { newMode: mode, reason: "invalid_mode" });
      return res.status(400).json({
        error: `Invalid mode — must be one of: ${VALID_MODES.join(", ")}`,
      });
    }

    await db.setConfig("mode", mode);
    logInfo("MODE_CHANGED", { newMode: mode });
    res.json({ ok: true, mode });
  } catch (err) {
    logError("API_ERROR", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/set-custom-activity", async (req, res) => {
  try {
    const { activity } = req.body;
    const value = (typeof activity === "string") ? activity.trim() : "";

    await db.setConfig("custom_activity", value);
    logInfo("CUSTOM_ACTIVITY_UPDATED", { activity: value });
    res.json({ ok: true, activity: value });
  } catch (err) {
    logError("API_ERROR", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/update-user-description", async (req, res) => {
  try {
    const { phone, description } = req.body;
    logInfo("USER_DESCRIPTION_UPDATE_REQUEST", { phone });

    if (!phone) {
      logWarn("USER_DESCRIPTION_UPDATE_FAILED", { phone, reason: "missing_phone" });
      return res.status(400).json({ error: "phone is required" });
    }

    const user = await db.getUserByPhone(phone);
    if (!user) {
      logWarn("USER_DESCRIPTION_UPDATE_FAILED", { phone, reason: "user_not_found" });
      return res.status(404).json({ error: "User not found" });
    }

    const newDescription = (typeof description === "string") ? description.trim() : "";
    await db.updateUserDescription(phone, newDescription);
    logInfo("USER_DESCRIPTION_UPDATED", { phone, description: newDescription });
    res.json({ ok: true, phone, description: newDescription });
  } catch (err) {
    logError("API_ERROR", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/update-prompt", async (req, res) => {
  try {
    const { base_prompt } = req.body;
    if (!base_prompt || !base_prompt.trim()) {
      return res.status(400).json({ error: "base_prompt is required" });
    }
    await db.setConfig("base_prompt", base_prompt.trim());
    res.json({ ok: true, base_prompt: base_prompt.trim() });
  } catch (err) {
    logError("API_ERROR", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/set-custom-activity", async (req, res) => {
  try {
    const { activity } = req.body;
    const value = (typeof activity === "string") ? activity.trim() : "";
    await db.setConfig("custom_activity", value);
    logInfo("CUSTOM_ACTIVITY_UPDATED", { activity: value });
    res.json({ ok: true, activity: value });
  } catch (err) {
    logError("API_ERROR", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/status", async (_req, res) => {
  try {
    const mode = await db.getConfig("mode");
    const customActivity = await db.getConfig("custom_activity");
    const users = await db.getActiveUsers();

    const payload = {
      mode: mode || "OFF",
      custom_activity: customActivity || "",
      allowed_users: users.map((u) => ({ phone: u.phone, description: u.description || "" })),
    };

    logInfo("STATUS_CHECK", {});
    res.json(payload);
  } catch (err) {
    logError("API_ERROR", err);
    res.status(500).json({ error: err.message });
  }
});

const path = require("path");

// Serve React build
app.use(express.static(
  path.join(__dirname, "../wa-dashboard/dist")
));

app.get("/{*splat}", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../wa-dashboard/dist/index.html")
  );
});

// ── Bootstrap ────────────────────────────────────────────────────

async function start() {
  await db.initialize();

  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
  });

  console.log("Starting WhatsApp client...");
  client.initialize();
}

start().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\nShutting down...");
  client.destroy();
  db.close();
  process.exit(0);
});
