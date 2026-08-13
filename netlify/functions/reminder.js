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

      // Автоматическая отправка ДЗ сразу после окончания урока
      if (lesson.duration_minutes && lesson.homework_url) {
        const endTime = addMinutes(lesson.time, lesson.duration_minutes);
        if (endTime === currentTime) {
