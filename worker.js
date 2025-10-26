// worker.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Функция LLM-проверки (заглушка — замени на реальный вызов)
async function checkIfIntroWithLLM(text) {
  // ПОКА ЧТО — временно разрешаем всё (для теста)
  // Позже заменишь на вызов Ollama/OpenRouter
  console.log('🔍 Проверка через LLM (заглушка):', text.substring(0, 50) + '...');
  return true; // <-- ЗАМЕНИ ЭТО ПОЗЖЕ
}

// Обработка одной задачи
async function processJob(job) {
  try {
    const isIntro = await checkIfIntroWithLLM(job.text);
    
    if (isIntro) {
      // Сохраняем в intros (user_id UNIQUE — дубли не пройдут)
      const { error } = await supabase
        .from('intros')
        .insert({
          chat_id: job.chat_id,
          user_id: job.user_id,
          username: job.username,
          raw_text: job.text,
        });

      if (error && error.code !== '23505') { // 23505 = unique_violation
        throw new Error(`Supabase insert error: ${error.message}`);
      }
    }

    // Помечаем задачу как done
    await supabase
      .from('intro_jobs')
      .update({ status: 'done' })
      .eq('id', job.id);

    console.log(`✅ Задача ${job.id} завершена. Интро: ${isIntro ? 'ДА' : 'НЕТ'}`);
  } catch (err) {
    console.error(`💥 Ошибка обработки задачи ${job.id}:`, err.message);
    // Помечаем как failed
    await supabase
      .from('intro_jobs')
      .update({ status: 'failed' })
      .eq('id', job.id);
  }
}

// Основной цикл воркера
async function runWorker() {
  console.log('🔄 Worker запущен. Ожидаю задачи...');
  
  while (true) {
    try {
      // Безопасно получаем задачу
      const { data, error } = await supabase.rpc('fetch_next_job');
      
      if (error) {
        console.error('❌ Ошибка RPC:', error);
        await new Promise(res => setTimeout(res, 5000));
        continue;
      }

      if (data && data.length > 0) {
        await processJob(data[0]);
      } else {
        // Нет задач — ждём
        await new Promise(res => setTimeout(res, 3000));
      }
    } catch (err) {
      console.error('🚨 Критическая ошибка воркера:', err);
      await new Promise(res => setTimeout(res, 10000));
    }
  }
}

// Запуск только если файл вызван напрямую
if (require.main === module) {
  runWorker();
}

module.exports = { runWorker };