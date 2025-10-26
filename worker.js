// worker.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Функция LLM-проверки через DeepSeek V3.1 (бесплатно через OpenRouter)
async function checkIfIntroWithLLM(text) {
  // Экранируем кавычки, чтобы не сломать JSON
  const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');

  const prompt = `You are a strict classifier. Your task is to determine if the following user message is a self-introduction.

A self-introduction is a message where the user **voluntarily shares personal information** about themselves, such as:
- Name or nickname
- Profession, role, or field of work/study
- Interests, hobbies, or passions
- Goals, intentions, or what they're looking for
- Background, location, or experience

If the message contains **at least two** of these elements, respond with: YES  
Otherwise, respond with: NO

Respond ONLY with "YES" or "NO". Do not add any explanation, punctuation, or extra text.

Message: "${safeText}"`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000',
        'X-Title': 'Intro Matcher Bot',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat-v3.1:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1,
        temperature: 0,
        stop: ['\n', '.', ' ', ','],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ OpenRouter error:', response.status, errText);
      return false;
    }

    const data = await response.json();
    const rawAnswer = data.choices?.[0]?.message?.content?.trim();
    const answer = (rawAnswer || '').split(/\s/)[0];

    console.log(`🧠 DeepSeek: "${answer}" ← ${text.substring(0, 50)}...`);
    return answer === 'YES';
  } catch (err) {
    console.error('💥 LLM error:', err.message);
    return false;
  }
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