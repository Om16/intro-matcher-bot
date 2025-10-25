// index.js
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// Инициализация Telegram-бота в режиме webhook
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  webHook: true,
});

// Middleware для обработки входящих обновлений
app.use(bot.webhookCallback(`/bot${process.env.TELEGRAM_BOT_TOKEN}`));

// Обработчик добавления бота в чат
bot.on('my_chat_member', async (msg) => {
  console.log('📥 Бот добавлен в чат:', msg);
  
  const chat = msg.chat;
  const newStatus = msg.new_chat_member?.status;
  
  if (newStatus === 'member' || newStatus === 'administrator') {
    try {
      const chatInfo = await bot.getChat(chat.id);
      console.log('ℹ️ Метаданные чата:', {
        id: chatInfo.id,
        title: chatInfo.title,
        type: chatInfo.type,
      });
      console.log('✅ Чат готов к регистрации в системе');
    } catch (err) {
      console.error('❌ Ошибка получения данных чата:', err);
    }
  }
});

// Health-check
app.get('/', (req, res) => {
  res.send('Intro Matcher Bot is running!');
});

// Запуск сервера
app.listen(port, async () => {
  console.log(`🚀 Сервер запущен на порту ${port}`);
  
  // Устанавливаем webhook ТОЛЬКО после запуска сервера
  const webhookUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
  try {
    await bot.setWebHook(`${webhookUrl}/bot${process.env.TELEGRAM_BOT_TOKEN}`);
    console.log(`✅ Webhook установлен на: ${webhookUrl}/bot${process.env.TELEGRAM_BOT_TOKEN}`);
  } catch (err) {
    console.error('❌ Не удалось установить webhook:', err);
  }
});