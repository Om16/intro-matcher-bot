// index.js
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// Инициализация Telegram-бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

// Пока что просто логируем все события
bot.on('my_chat_member', async (msg) => {
  console.log('📥 Бот добавлен в чат:', msg);
  
  const chat = msg.chat;
  const newStatus = msg.new_chat_member?.status;
  
  // Бот добавлен в чат (статус стал 'member' или 'administrator')
  if (newStatus === 'member' || newStatus === 'administrator') {
    try {
      // Получаем полные метаданные чата
      const chatInfo = await bot.getChat(chat.id);
      console.log('ℹ️ Метаданные чата:', {
        id: chatInfo.id,
        title: chatInfo.title,
        type: chatInfo.type,
      });

      // 🔜 Сюда позже добавим сохранение в Supabase
      console.log('✅ Чат готов к регистрации в системе');
    } catch (err) {
      console.error('❌ Ошибка получения данных чата:', err);
    }
  }
});

// Health-check эндпоинт (нужен для Railway)
app.get('/', (req, res) => {
  res.send('Intro Matcher Bot is running!');
});

app.listen(port, () => {
  console.log(`🚀 Сервер запущен на порту ${port}`);
});