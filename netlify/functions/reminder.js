// netlify/functions/reminder.js
//
// Scheduled Netlify Function — просыпается сама по расписанию (см. cron внизу файла)
// и шлёт ученикам напоминания об уроках и дедлайнах ДЗ через Telegram Bot API.
//
// НАСТРОЙКА ПЕРЕД ДЕПЛОЕМ:
// 1. В Netlify: Site settings → Environment variables → добавить BOT_TOKEN (токен от BotFather)
// 2. Заполнить schedule.json именами, chat_id и расписанием учеников
// 3. Задеплоить — Netlify сам подхватит расписание из строки schedule внизу файла

const schedule = require('../../schedule.json');

exports.handler = async function () {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error('BOT_TOKEN не задан в переменных окружения Netlify');
    return { statusCode: 500, body: 'Missing BOT_TOKEN' };
  }

  const now = new Date();
  const remindersSentTo = [];

  for (const student of schedule.students) {
    // Переводим текущее время в локальное время ученика
    const localNow = new Date(now.getTime() + student.timezone_offset_hours * 60 * 60 * 1000);
    const weekday = localNow.getUTCDay();
    const hh = String(localNow.getUTCHours()).padStart(2, '0');
    const mm = String(localNow.getUTCMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;

    // Проверяем напоминания об уроках (за N минут до начала, см. reminders_before_lesson_minutes)
    for (const lesson of student.lessons || []) {
      if (lesson.weekday !== weekday) continue;
      for (const minsBefore of schedule.reminders_before_lesson_minutes) {
        const reminderTime = subtractMinutes(lesson.time, minsBefore);
        if (reminderTime === currentTime) {
          const text = minsBefore >= 60
            ? `Напоминание: у тебя урок завтра/сегодня в ${lesson.time}. Ссылка на урок: ${lesson.lesson_url}`
            : `Урок начинается через ${minsBefore} минут (в ${lesson.time}). Ссылка: ${lesson.lesson_url}`;
          await sendTelegramMessage(BOT_TOKEN, student.chat_id, text);
          remindersSentTo.push(`${student.name}: lesson reminder`);
        }
      }
    }

    // Проверяем дедлайны ДЗ
    for (const hw of student.homework_deadlines || []) {
      if (hw.weekday !== weekday) continue;
      if (hw.time === currentTime) {
        const text = `Напоминание: дедлайн по домашнему заданию сегодня в ${hw.time}. Ссылка: ${hw.homework_url}`;
        await sendTelegramMessage(BOT_TOKEN, student.chat_id, text);
        remindersSentTo.push(`${student.name}: homework deadline`);
      }
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ checkedAt: now.toISOString(), remindersSentTo }),
  };
};

function subtractMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m - minutes;
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(normalized / 60)).padStart(2, '0');
  const mm = String(normalized % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function sendTelegramMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    console.error('Telegram send error:', await res.text());
  }
}

// Netlify Scheduled Function: запускать каждые 15 минут
exports.config = {
  schedule: '*/15 * * * *',
};
