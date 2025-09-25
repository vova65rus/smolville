const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const sharp = require('sharp');

const app = express();
const port = process.env.PORT || 3000;

// Middleware для CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const upload = multer({ dest: 'uploads/' });

// Переменные окружения
const AIRTABLE_API_KEY = process.env.AIRTABLE_EVENTS_API_KEY || process.env.AIRTABLE_ADS_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const EVENTS_TABLE = process.env.AIRTABLE_EVENTS_TABLE_NAME || 'Events';
const ADS_TABLE = process.env.AIRTABLE_ADS_TABLE_NAME || 'Ads';
const VOTINGS_TABLE = process.env.AIRTABLE_VOTINGS_TABLE_NAME || 'Votings';
const IMAGEBAN_CLIENT_ID = process.env.IMAGEBAN_CLIENT_ID;
const IMAGEBAN_SECRET_KEY = process.env.IMAGEBAN_SECRET_KEY; // Опционально для авторизованных загрузок

// Проверка переменных окружения
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !IMAGEBAN_CLIENT_ID) {
  console.error('Отсутствуют переменные окружения: Установите AIRTABLE_API_KEY, AIRTABLE_BASE_ID, IMAGEBAN_CLIENT_ID в Render');
  process.exit(1);
}

// Логирование переменных окружения (для диагностики)
console.log('Переменные окружения:', {
  AIRTABLE_API_KEY: AIRTABLE_API_KEY ? 'Установлен' : 'Отсутствует',
  AIRTABLE_BASE_ID: AIRTABLE_BASE_ID ? 'Установлен' : 'Отсутствует',
  IMAGEBAN_CLIENT_ID: IMAGEBAN_CLIENT_ID ? 'Установлен' : 'Отсутствует',
  IMAGEBAN_SECRET_KEY: IMAGEBAN_SECRET_KEY ? 'Установлен' : 'Отсутствует',
});

const EVENTS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${EVENTS_TABLE}`;
const ADS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ADS_TABLE}`;
const VOTINGS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${VOTINGS_TABLE}`;

// Хардкод ID администратора
const ADMIN_ID = 366825437;

app.get('/', (req, res) => {
  res.send('Бэкенд Smolville запущен! Эндпоинты API: /api/events, /api/ads, /api/votings, /api/upload, /api/upload-from-url');
});

// ==================== API ДЛЯ АДМИНА ====================

app.get('/api/is-admin', (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const isAdmin = userId === ADMIN_ID;
  res.json({ isAdmin });
});

// ==================== API ДЛЯ СОБЫТИЙ ====================

app.get('/api/events', async (req, res) => {
  try {
    const response = await axios.get(EVENTS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка получения событий:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    console.log('Создание события с данными:', JSON.stringify(req.body, null, 2));
    const response = await axios.post(EVENTS_URL, req.body, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка создания события:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const response = await axios.get(`${EVENTS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка получения события:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/events/:id', async (req, res) => {
  try {
    console.log('Обновление события с данными:', JSON.stringify(req.body, null, 2));
    const response = await axios.patch(`${EVENTS_URL}/${req.params.id}`, req.body, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка обновления события:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const response = await axios.delete(`${EVENTS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка удаления события:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// ==================== API ДЛЯ РЕКЛАМЫ ====================

app.get('/api/ads', async (req, res) => {
  try {
    const response = await axios.get(ADS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка получения рекламы:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    const response = await axios.post(ADS_URL, req.body, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка создания рекламы:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/ads/:id', async (req, res) => {
  try {
    const response = await axios.patch(`${ADS_URL}/${req.params.id}`, req.body, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка обновления рекламы:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    const response = await axios.delete(`${ADS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка удаления рекламы:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// ==================== API ДЛЯ ГОЛОСОВАНИЙ ====================

app.get('/api/votings', async (req, res) => {
  try {
    const response = await axios.get(VOTINGS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка получения голосований:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/votings', async (req, res) => {
  try {
    const response = await axios.post(VOTINGS_URL, req.body, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка создания голосования:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/votings/:id', async (req, res) => {
  try {
    const response = await axios.patch(`${VOTINGS_URL}/${req.params.id}`, req.body, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка обновления голосования:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/votings/:id', async (req, res) => {
  try {
    const response = await axios.delete(`${VOTINGS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка удаления голосования:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Получить голосования по ID мероприятия
app.get('/api/events/:eventId/votings', async (req, res) => {
  try {
    const { eventId } = req.params;
    const response = await axios.get(VOTINGS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      params: {
        filterByFormula: `{EventID} = '${eventId}'`,
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка получения голосований по событию:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Проголосовать
app.post('/api/votings/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, optionIndex, userLat, userLon } = req.body;

    console.log('Получен запрос на голосование:', { id, userId, optionIndex, userLat, userLon });

    if (!userId || optionIndex === undefined || userLat === undefined || userLon === undefined) {
      console.error('Отсутствуют обязательные поля');
      return res.status(400).json({ error: 'Отсутствуют обязательные поля' });
    }

    // Получаем данные голосования
    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });

    const voting = votingResponse.data;
    if (!voting.fields) {
      console.error('Голосование не найдено');
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    if (voting.fields.Status === 'Completed') {
      console.error('Голосование завершено');
      return res.status(400).json({ error: 'Голосование завершено' });
    }

    // Проверяем, голосовал ли уже пользователь
    const votedUserIds = voting.fields.VotedUserIDs || '';
    const votedUsersArray = votedUserIds.split(',').filter((id) => id && id.trim());

    if (votedUsersArray.includes(userId.toString())) {
      console.error('Пользователь уже проголосовал');
      return res.status(400).json({ error: 'Вы уже проголосовали в этом голосовании' });
    }

    // Проверяем геолокацию
    const votingLat = voting.fields.Latitude;
    const votingLon = voting.fields.Longitude;

    if (votingLat && votingLon && userLat && userLon) {
      const distance = calculateDistance(userLat, userLon, votingLat, votingLon);
      console.log('Рассчитанное расстояние:', distance);
      if (distance > 1000) {
        console.error('Пользователь слишком далеко');
        return res.status(400).json({ error: 'Вы находитесь слишком далеко от места голосования' });
      }
    }

    // Обновляем результаты голосования
    let currentVotes = voting.fields.Votes ? JSON.parse(voting.fields.Votes) : {};
    console.log('Текущие голоса:', currentVotes);

    // Добавляем голос пользователя
    currentVotes[userId] = optionIndex;
    console.log('Обновленные голоса:', currentVotes);

    // Добавляем пользователя в список проголосовавших
    const newVotedUserIDs = votedUserIds ? `${votedUserIds},${userId}` : userId.toString();

    // Обновляем запись в Airtable
    const updateData = {
      fields: {
        Votes: JSON.stringify(currentVotes),
        VotedUserIDs: newVotedUserIDs,
      },
    };

    console.log('Обновление записи голосования:', JSON.stringify(updateData, null, 2));

    const updateResponse = await axios.patch(`${VOTINGS_URL}/${id}`, updateData, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('Голос успешно обновлен:', updateResponse.data);
    res.json({ success: true, voting: updateResponse.data });
  } catch (error) {
    console.error('Ошибка голосования:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Проверить статус голосования пользователя
app.get('/api/votings/:id/vote-status/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;

    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });

    const voting = votingResponse.data;
    if (!voting.fields) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    const votedUserIds = voting.fields.VotedUserIDs || '';
    const votedUsersArray = votedUserIds.split(',').filter((id) => id && id.trim());

    const hasVoted = votedUsersArray.includes(userId.toString());
    let userVote = null;
    if (voting.fields.Votes) {
      const votes = JSON.parse(voting.fields.Votes);
      userVote = votes[userId] !== undefined ? votes[userId] : null;
    }

    res.json({ hasVoted, userVote });
  } catch (error) {
    console.error('Ошибка проверки статуса голосования:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Завершить голосование и посчитать результаты
app.post('/api/votings/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;

    // Получаем данные голосования
    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });

    const voting = votingResponse.data;
    if (!voting.fields) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    // Подсчитываем финальные результаты
    const votes = voting.fields.Votes
      ? typeof voting.fields.Votes === 'string'
        ? JSON.parse(voting.fields.Votes)
        : voting.fields.Votes
      : {};

    const results = [];

    if (voting.fields.Options) {
      const options = voting.fields.Options.split(',');

      // Считаем голоса для каждого варианта
      const voteCounts = {};
      options.forEach((option, index) => {
        voteCounts[index] = 0;
      });

      Object.values(votes).forEach((voteIndex) => {
        if (voteCounts[voteIndex] !== undefined) {
          voteCounts[voteIndex]++;
        }
      });

      // Считаем проценты
      const totalVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);

      // Создаем массив результатов
      options.forEach((option, index) => {
        const count = voteCounts[index] || 0;
        const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

        results.push({
          option: option,
          count: count,
          percentage: percentage,
        });
      });
    }

    // Обновляем голосование
    const updateResponse = await axios.patch(
      `${VOTINGS_URL}/${id}`,
      {
        fields: {
          Status: 'Completed',
          Results: JSON.stringify(results),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({ success: true, results: results, voting: updateResponse.data });
  } catch (error) {
    console.error('Ошибка завершения голосования:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Генерация изображения с результатами голосования
app.post('/api/votings/:id/generate-results', async (req, res) => {
  try {
    const { id } = req.params;

    // Получаем данные голосования
    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });

    const voting = votingResponse.data;
    if (!voting.fields) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    if (!voting.fields.Results) {
      return res.status(400).json({ error: 'Результаты голосования недоступны' });
    }

    // Парсим результаты
    let results;
    try {
      if (typeof voting.fields.Results === 'string') {
        results = JSON.parse(voting.fields.Results);
      } else {
        results = voting.fields.Results;
      }
    } catch (parseError) {
      console.error('Ошибка парсинга результатов:', parseError);
      return res.status(400).json({ error: 'Неверный формат результатов голосования' });
    }

    // Преобразуем результаты в массив
    let resultsArray = [];
    if (Array.isArray(results)) {
      resultsArray = results;
    } else if (results && typeof results === 'object') {
      resultsArray = Object.values(results);
    } else {
      return res.status(400).json({ error: 'Неверный формат результатов' });
    }

    const title = voting.fields.Title || 'Результаты голосования';
    const description = voting.fields.Description || '';

    // Обрабатываем изображения номинантов
    const optionImages = voting.fields.OptionImages || [];
    console.log('Изображения номинантов из Airtable:', JSON.stringify(optionImages, null, 2));

    // Генерируем SVG
    let height = 600;
    const hasImages = optionImages && optionImages.length > 0;
    if (hasImages) height += Math.ceil(resultsArray.length / 3) * 110;

    let svg = `
      <svg width="800" height="${height
