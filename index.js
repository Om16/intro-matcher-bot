// index.js — рекомендуемая версия для Telegraf 4.12+ и 5.x
require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const supabase = require('./supabase');

const app = express();
const port = process.env.PORT || 3000;

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const webhookPath = `/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// ✅ Современный способ обработки Webhook
app.use(webhookPath, express.json(), async (req, res) => {
  try {
    await bot.handleUpdate(req.body, res);
  } catch (err) {
    console.error('🚨 Ошибка в обработке Telegram-обновления:', err);
    res.status(500).end();
  }
});

bot.on('my_chat_member', async (ctx) => {
  const msg = ctx.update.my_chat_member;
  const chat = msg.chat;
  const newStatus = msg.new_chat_member?.status;

  if (newStatus === 'member' || newStatus === 'administrator') {
    try {
      const chatInfo = await ctx.telegram.getChat(chat.id);
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
        console.log('✅ Чат успешно сохранён в базу');
      }
    } catch (err) {
      console.error('💥 Ошибка при обработке события добавления в чат:', err);
    }
  }
});

const webhookUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
if (webhookUrl && process.env.TELEGRAM_BOT_TOKEN) {
  bot.telegram.setWebhook(`${webhookUrl}${webhookPath}`)
    .then(() => {
      console.log(`📡 Webhook успешно установлен на: ${webhookUrl}${webhookPath}`);
    })
    .catch((err) => {
      console.error('❌ Не удалось установить Webhook:', err);
    });
}

app.get('/', (req, res) => {
  res.send('Intro Matcher Bot (Telegraf + Render) ✅');
});

app.listen(port, () => {
  console.log(`🚀 Сервер запущен на порту ${port}`);
});