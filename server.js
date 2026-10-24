const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// Дозволяємо доступ з будь-якого сайту
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
});

const BOT_TOKEN = "8989392795:AAFcrP0aSaSX6XuQhGh62pXbrYFH8pU0d1w";
const ADMIN_CHAT_ID = "8691137994";
let lastAdminReply = null;

// Головна сторінка — щоб не було "Cannot GET /"
app.get('/', (req, res) => {
    res.send('EL-Księgowość Chat Bridge is active!');
});

// 1. Отримання повідомлення з сайту і перенаправлення в Telegram
app.post('/api/send-from-site', async (req, res) => {
    try {
        const { message, clientName } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const text = `💬 <b>Нове повідомлення в чаті сайту!</b>\n\n👤 Клієнт: <b>${clientName || 'Гість'}</b>\n📝 Повідомлення:\n${message}\n\n<i>⚠️ Натисни «Reply» (Відповісти), щоб написати клієнту!</i>`;

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
            return res.json({ success: true });
        } else {
            return res.status(500).json({ error: 'Telegram error', details: tgData });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 2. Отримання відповіді від тебе з Telegram (через Reply)
app.post('/api/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;
        if (update.message && update.message.reply_to_message && update.message.text) {
            lastAdminReply = update.message.text;
        }
        res.status(200).send('OK');
    } catch (err) {
        res.status(500).send('Error');
    }
});

// 3. Сайт перевіряє, чи є відповідь від тебе
app.get('/api/check-messages', (req, res) => {
    if (lastAdminReply) {
        const reply = lastAdminReply;
        lastAdminReply = null; // очищуємо після відправки на сайт
        return res.json({ messages: [reply] });
    }
    return res.json({ messages: [] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
