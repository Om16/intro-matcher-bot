// index.js — безопасная, production-ready версия с secret_token для Render + Telegraf
require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const supabase = require('./supabase');

// === Проверка обязательных переменных окружения ===
const requiredEnv = [
  'TELEGRAM_BOT_TOKEN',
  'WEBHOOK_SECRET',        // будет использован как secret_token (должен быть 16–256 символов)
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY'
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`❌ Отсутствует обязательная переменная окружения: ${key}`);
  }
}

// Проверка длины secret_token (Telegram требует 16–256 ASCII символов)
const secretToken = process.env.WEBHOOK_SECRET;
if (secretToken.length < 16 || secretToken.length > 256) {
  throw new Error('❌ WEBHOOK_SECRET должен быть длиной от 16 до 256 символов');
}

const app = express();
const port = process.env.PORT || 3000;
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const webhookPath = '/webhook'; // путь может быть фиксированным и публичным

// === Middleware: проверка secret_token из заголовка ===
const verifyTelegramSecret = (req, res, next) => {
  const token = req.headers['x-telegram-bot-api-secret-token'];
  if (token !== secretToken) {
    console.warn('⚠️ Отклонён запрос без валидного X-Telegram-Bot-Api-Secret-Token');
    return res.status(401).end();
  }
  next();
};

// === Обработка вебхуков с проверкой заголовка ===
app.use(webhookPath, express.json(), verifyTelegramSecret, async (req, res) => {
  try {
    await bot.handleUpdate(req.body, res);
  } catch (err) {
    console.error('🚨 Ошибка при обработке Telegram-обновления:', err);
    res.status(500).end();
  }
});

// === Обработчик добавления бота в чат ===
bot.on('my_chat_member', async (ctx) => {
  const { my_chat_member: msg } = ctx.update;
  const { chat } = msg;
  const newStatus = msg.new_chat_member?.status;

  if (newStatus === 'member' || newStatus === 'administrator') {
    try {
      const chatInfo = await ctx.telegram.getChat(chat.id);
      console.log('ℹ️ Новый чат обнаружен:', chatInfo.title || chatInfo.id);

      const { error } = await supabase
        .from('chats')
        .insert({
          telegram_chat_id: chatInfo.id,
          title: chatInfo.title || 'Untitled',
          type: chatInfo.type,
        });

      if (error) {
        console.error('❌ Ошибка Supabase при сохранении чата:', error.message);
      } else {
        console.log('✅ Чат успешно сохранён в базу');
      }
    } catch (err) {
      console.error('💥 Исключение при обработке события my_chat_member:', err.message);
    }
  }
});

// === Обработчик текстовых сообщений для анализа интро ===
bot.on('message', async (ctx) => {
  const msg = ctx.message;
  if (!msg.text || msg.from?.is_bot || msg.reply_to_message) return;

  const words = msg.text.trim().split(/\s+/);
  if (words.length < 10) return;

  const { chat, from } = msg;
  const userId = from.id;
  const chatId = chat.id;

  // === Проверка: уже есть интро от этого пользователя в этом чате? ===
  const { data: existingIntro, error: selectError } = await supabase
    .from('intros')
    .select('id')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .maybeSingle(); // Возвращает null, если не найдено

  if (selectError) {
    console.error('❌ Ошибка проверки существующего интро:', selectError);
    return;
  }

  if (existingIntro) {
    console.log(`⏭️ Пользователь ${userId} уже отправил интро в чат ${chatId} — пропускаем.`);
    return;
  }

  // === Формируем username для логов ===
  const username = from.username 
    ? `@${from.username}` 
    : from.first_name 
      ? from.first_name 
      : `id${userId}`;

  // === Сохраняем в очередь (таблица intro_jobs) ===
  const { error: insertError } = await supabase
    .from('intro_jobs')
    .insert({
      chat_id: chatId,
      user_id: userId,
      username: from.username || from.first_name || `id${userId}`,
      text: msg.text,
      message_id: msg.message_id,
    });

  if (insertError) {
    console.error('❌ Ошибка добавления в очередь:', insertError);
  } else {
    console.log(`📨 Сообщение от ${username} поставлено в очередь`);
  }
});




// === Глобальный обработчик ошибок Telegraf ===
bot.catch((err, ctx) => {
  console.error('🚨 Telegraf поймал ошибку:', err);
  // Можно добавить отправку в лог-чат или Sentry
});

// === Установка вебхука с secret_token ===
const isProduction = !!process.env.RENDER_EXTERNAL_URL;
const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;

if (!baseUrl) {
  throw new Error('❌ Не удалось определить базовый URL для вебхука');
}

const webhookUrl = `${baseUrl}${webhookPath}`;

bot.telegram.setWebhook(webhookUrl, { secret_token: secretToken })
  .then(() => {
    console.log(`📡 Telegram вебхук установлен на: ${webhookUrl}`);
    console.log(`🔑 Используется secret_token (длина: ${secretToken.length})`);
  })
  .catch((err) => {
    console.error('❌ Не удалось установить Telegram вебхук:', err.message);
  });

// === Health-check для Render ===
app.get('/', (req, res) => {
  res.status(200).send('Intro Matcher Bot ✅ (с secret_token)');
});

// === Запуск сервера ===
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${port}`);
});



if (process.env.NODE_ENV !== 'development') {
  const { runWorker } = require('./worker');
  runWorker().catch(console.error);
}