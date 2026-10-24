const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// Тимчасове сховище у пам'яті сервера
const sessions = new Map();
if (!global.pendingMessages) {
    global.pendingMessages = new Map();
}

const BOT_TOKEN = process.env.BOT_TOKEN || "8989392795:AAFcrP0aSaSX6XuQhGh62pXbrYFH8pU0d1w";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "8691137994";

// 1. Прийом повідомлення з сайту -> надсилання в Telegram
app.post('/api/send-from-site', async (req, res) => {
    try {
        const { message, clientId, clientName } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const sessionId = clientId || 'guest_' + Date.now();
        const text = `💬 <b>Нове повідомлення в чаті сайту!</b>\n\n👤 Клієнт: <b>${clientName || 'Клієнт'}</b>\n📝 Повідомлення:\n${message}\n\n<i>⚠️ Натисни «Reply» (Відповісти), щоб відповісти клієнту!</i>`;

        const tgResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: ADMIN_CHAT_ID,
                text: text,
                parse_mode: 'HTML'
            })
        });

        const tgData = await tgResponse.json();
        if (tgData.ok) {
            sessions.set(tgData.result.message_id, sessionId);
            return res.json({ success: true, sessionId });
        } else {
            return res.status(500).json({ error: 'Telegram API error', details: tgData });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 2. Webhook від Telegram: коли ти відповідаєш у Telegram через Reply
app.post('/api/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;
        if (update.message && update.message.reply_to_message && update.message.text) {
            const replyToId = update.message.reply_to_message.message_id;
            const adminReplyText = update.message.text;

            const sessionId = sessions.get(replyToId);
            if (sessionId) {
                if (!global.pendingMessages.has(sessionId)) {
                    global.pendingMessages.set(sessionId, []);
                }
                global.pendingMessages.get(sessionId).push(adminReplyText);
            }
        }
        res.status(200).send('OK');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
});

// 3. Перевірка нових повідомлень сайтом
app.get('/api/check-messages/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    if (global.pendingMessages.has(sessionId)) {
        const messages = global.pendingMessages.get(sessionId);
        global.pendingMessages.delete(sessionId);
        return res.json({ messages });
    }
    return res.json({ messages: [] });
});

// Тестовий маршрут, щоб перевірити, чи живий сервер
app.get('/', (req, res) => {
    res.json({ status: "EL-Księgowość Chat Bridge is running!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Bridge server is running on port ${PORT}`);
});
