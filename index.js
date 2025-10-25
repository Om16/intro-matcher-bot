// index.js
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// Убираем webhook: true — инициализируем без него
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

// Нужно для парсинга JSON в webhook
app.use(express.json());

// Webhook endpoint: /bot<TOKEN>
const webhookPath = `/bot${process.env.TELEGRAM_BOT_TOKEN}`;
app.post(webhookPath, (req, res) => {
  // Передаём обновление Telegram боту
  bot.processUpdate(req.body);
  res.sendStatus(200); // Telegram ждёт 200 OK
});

// Обработчик события добавления бота в чат
bot.on('my_chat_member', async (msg) => {
  const chat = msg.chat;
  const newStatus = msg.new_chat_member?.status;

  if (newStatus === 'member' || newStatus === 'administrator') {
    try {
      const chatInfo = await bot.getChat(chat.id);
      console.log('ℹ️ Получен чат:', chatInfo.title || chatInfo.id);

      const { error } = await supabase
        .from('chats')
        .insert({
          telegram_chat_id: chatInfo.id,
          title: chatInfo.title || 'Untitled',
          type: chatInfo.type,
        });

      if (error) {
        console.error('❌ Supabase insert error:', error);
      } else {
        console.log('✅ Чат сохранён в базу');
      }
    } catch (err) {
      console.error('💥 Ошибка при обработке чата:', err);
    }
  }
});

// Health-check
app.get('/', (req, res) => {
  res.send('Intro Matcher Bot is running on Render ✅');
});

// Устанавливаем Webhook при запуске сервера
const webhookUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
if (webhookUrl && process.env.TELEGRAM_BOT_TOKEN) {
  bot.setWebHook(`${webhookUrl}${webhookPath}`)
    .then(() => console.log(`📡 Webhook установлен на: ${webhookUrl}${webhookPath}`))
    .catch(err => console.error('❌ Не удалось установить Webhook:', err));
}

app.listen(port, () => {
  console.log(`🚀 Сервер запущен на порту ${port}`);
});