const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

const sessions = new Map();
if (!global.pendingMessages) {
    global.pendingMessages = new Map();
}

// 1. Прийом повідомлення з сайту -> надсилання в Telegram
app.post('/api/send-from-site', async (req, res) => {
    try {
        const { message, clientId, clientName } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const sessionId = clientId || 'guest_' + Date.now();
        const text = `💬 <b>Нове повідомлення в чаті сайту!</b>\n\n👤 Клієнт: <b>${clientName || 'Клієнт'}</b>\n🔑 Сесія: <code>${sessionId}</code>\n📝 Повідомлення:\n${text || message}\n\n<i>⚠️ Натисни «Reply» (Відповісти), щоб відповісти!</i>`;

        // Виправляємо дрібницю зі змінною тексту
        const tgText = `💬 <b>Нове повідомлення в чаті сайту!</b>\n\n👤 Клієнт: <b>${clientName || 'Клієнт'}</b>\n🔑 Сесія: <code>${sessionId}</code>\n📝 Повідомлення:\n${message}\n\n<i>⚠️ Натисни «Reply» (Відповісти), щоб відповісти!</i>`;

        const tgResponse = await fetch(`https://api.telegram.org/bot8989392795:AAFcrP0aSaSX6XuQhGh62pXbrYFH8pU0d1w/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: "8691137994",
                text: tgText,
                parse_mode: 'HTML'
            })
        });

        const tgData = await tgResponse.json();
        if (tgData.ok) {
            sessions.set(tgData.result.message_id, sessionId);
            console.log(`✅ Повідомлено Telegram. Зв'язано message_id ${tgData.result.message_id} з сесією ${sessionId}`);
            return res.json({ success: true, sessionId });
        } else {
            console.log('❌ Помилка Telegram API:', tgData);
            return res.status(500).json({ error: 'Telegram API error' });
        }
    } catch (err) {
        console.error('❌ Помилка сервера /api/send-from-site:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 2. ВЕБХУК ВІД TELEGRAM (З ПОВНИМ ЛОГУВАННЯМ)
app.post('/api/telegram-webhook', async (req, res) => {
    console.gn = console.log;
    console.log('🔔 ОТРИМАНО ЗАПИТ ВІД TELEGRAM WEBHOOK:', JSON.stringify(req.body, null, 2));

    try {
        const update = req.body;
        if (update.message && update.message.reply_to_message && update.message.text) {
            const replyToId = update.message.reply_to_message.message_id;
            const adminReplyText = update.message.text;

            console.log(`🔍 Шукаю сесію для message_id: ${replyToId}`);
            const sessionId = sessions.get(replyToId);
            
            if (sessionId) {
                console.log(`✨ Знайдено сесію! Додаю відповідь для ${sessionId}: "${adminReplyText}"`);
                if (!global.pendingMessages.has(sessionId)) {
                    global.pendingMessages.set(sessionId, []);
                }
                global.pendingMessages.get(sessionId).push(adminReplyText);
            } else {
                console.log(`⚠️ Сесію для message_id ${replyToId} не знайдено в пам'яті! (Можливо, сервер перезавантажувався).`);
            }
        }
        res.status(200).send('OK');
    } catch (err) {
        console.error('❌ Помилка у вебхуці:', err);
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

app.get('/', (req, res) => {
    res.json({ status: "EL-Księgowość Chat Bridge is running!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Bridge server is running on port ${PORT}`);
});
