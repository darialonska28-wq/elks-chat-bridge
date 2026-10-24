
const express = require("express");
const app = express();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID || "8691137994";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const SETUP_KEY = process.env.SETUP_KEY;
const SITE_ORIGIN =
  process.env.SITE_ORIGIN || "https://xn--el-ksigowo-zhb5s46a.pl";

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin === SITE_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "20kb" }));

// Тимчасова черга відповідей.
// Для постійного збереження після перезапуску потрібна база даних.
const pendingMessages = new Map();

function validSessionId(value) {
  return typeof value === "string" &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

async function telegram(method, body) {
  if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN is not configured");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error("Telegram API request failed");
  }

  return data.result;
}

// 1. Сайт -> Telegram
app.post("/api/send-from-site", async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();
    const sessionId = String(req.body.clientId || "");
    const clientName = String(req.body.clientName || "Клієнт")
      .replace(/[\r\n]/g, " ")
      .slice(0, 100);

    if (!message || message.length > 4000 ||
        !validSessionId(sessionId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid message or session"
      });
    }

    const telegramMessage =
      `💬 Нове повідомлення в чаті EL-Księgowość\n\n` +
      `👤 Клієнт: ${clientName}\n` +
      `📝 Повідомлення:\n${message}\n\n` +
      `[SID:${sessionId}]\n\n` +
      `↩️ Натисніть «Відповісти» саме на це повідомлення.`;

    await telegram("sendMessage", {
      chat_id: CHAT_ID,
      text: telegramMessage
    });

    return res.json({ success: true, sessionId });
  } catch (error) {
    console.error("send-from-site error:", error.message);

    return res.status(502).json({
      success: false,
      error: "Не вдалося надіслати повідомлення"
    });
  }
});

// 2. Відповідь адміністратора з Telegram -> черга клієнта
app.post("/api/telegram-webhook", async (req, res) => {
  if (!WEBHOOK_SECRET ||
      req.get("X-Telegram-Bot-Api-Secret-Token") !== WEBHOOK_SECRET) {
    return res.sendStatus(403);
  }

  try {
    const update = req.body;
    const message = update.message;

    if (!message?.text ||
        String(message.chat?.id) !== CHAT_ID ||
        !message.reply_to_message?.text) {
      return res.sendStatus(200);
    }

    const originalText = message.reply_to_message.text;
    const match = originalText.match(/\[SID:([a-zA-Z0-9_-]{1,80})\]/);

    if (!match) {
      return res.sendStatus(200);
    }

    const sessionId = match[1];
    const replyText = message.text.trim();

    if (!replyText) {
      return res.sendStatus(200);
    }

    if (!pendingMessages.has(sessionId)) {
      pendingMessages.set(sessionId, []);
    }

    pendingMessages.get(sessionId).push({
      id: update.update_id,
      text: replyText
    });

    console.log("Telegram reply received for session:", sessionId);

    return res.sendStatus(200);
  } catch (error) {
    console.error("telegram-webhook error:", error.message);
    return res.sendStatus(500);
  }
});

// 3. Сайт отримує відповіді для конкретної сесії
app.get("/api/check-messages/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;

  if (!validSessionId(sessionId)) {
    return res.status(400).json({ messages: [] });
  }

  const messages = pendingMessages.get(sessionId) || [];

  pendingMessages.delete(sessionId);

  // Залишаємо сумісність із віджетом, який очікує масив текстів.
  return res.json({
    messages: messages.map(message => message.text)
  });
});

// 4. Одноразове налаштування Telegram webhook
app.get("/api/setup-webhook", async (req, res) => {
  if (!SETUP_KEY || req.query.key !== SETUP_KEY) {
    return res.sendStatus(403);
  }

  try {
    if (!WEBHOOK_SECRET) {
      return res.status(500).json({
        success: false,
        error: "TELEGRAM_WEBHOOK_SECRET is missing"
      });
    }

    const baseUrl =
      process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;

    if (!baseUrl) {
      return res.status(500).json({
        success: false,
        error: "Render public URL is missing"
      });
    }

    await telegram("setWebhook", {
      url: `${baseUrl.replace(/\/$/, "")}/api/telegram-webhook`,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ["message"]
    });

    return res.json({ success: true, webhookConfigured: true });
  } catch (error) {
    console.error("setup-webhook error:", error.message);

    return res.status(502).json({
      success: false,
      error: "Не вдалося налаштувати Telegram webhook"
    });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "EL-Księgowość Chat Bridge is running!" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`EL-Księgowość Chat Bridge listening on ${PORT}`);
});
