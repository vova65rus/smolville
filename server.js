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
      <svg width="800" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .title { font-family: Arial, sans-serif; font-size: 24px; font-weight: bold; fill: #000; }
          .description { font-family: Arial, sans-serif; font-size: 16px; fill: #666; }
          .option { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; fill: #000; }
          .stats { font-family: Arial, sans-serif; font-size: 16px; fill: #666; }
        </style>
        <rect width="800" height="${height}" fill="#ffffff"/>
        <text x="400" y="50" class="title" text-anchor="middle">${title}</text>
        <text x="400" y="80" class="description" text-anchor="middle">${description}</text>
    `;

    let y = 120;
    resultsArray.forEach((result, index) => {
      const barWidth = (result.percentage / 100) * 400;
      const barColor = index % 2 === 0 ? '#4CAF50' : '#2196F3';

      svg += `
        <rect x="100" y="${y}" width="400" height="40" fill="#e0e0e0" rx="5"/>
        <rect x="100" y="${y}" width="${barWidth}" height="40" fill="${barColor}" rx="5"/>
        <text x="20" y="${y + 25}" class="option">${result.option}</text>
        <text x="520" y="${y + 25}" class="stats" text-anchor="end">${result.count} голосов (${result.percentage}%)</text>
      `;
      y += 50;
    });

    // Добавляем изображения номинантов, если они есть
    if (hasImages) {
      y += 20;
      svg += `<text x="400" y="${y}" class="description" text-anchor="middle">Изображения номинантов</text>`;
      y += 30;

      resultsArray.forEach((result, index) => {
        let imageUrl = null;
        if (optionImages[index]) {
          if (typeof optionImages[index] === 'object' && optionImages[index].url) {
            imageUrl = optionImages[index].url;
          } else if (Array.isArray(optionImages) && optionImages[index] && optionImages[index].url) {
            imageUrl = optionImages[index].url;
          }
        }

        if (imageUrl) {
          const col = index % 3;
          const row = Math.floor(index / 3);
          svg += `<image x="${100 + col * 200}" y="${y + row * 110}" width="150" height="100" href="${imageUrl}" preserveAspectRatio="xMidYMid meet"/>`;
        }
      });
    }

    svg += `</svg>`;

    // Конвертируем SVG в JPG
    const svgBuffer = Buffer.from(svg);
    const imageBuffer = await sharp(svgBuffer)
      .resize(800, height, {
        fit: 'fill',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .jpeg({
        quality: 90,
        chromaSubsampling: '4:4:4',
      })
      .toBuffer();

    // Проверяем размер файла
    if (imageBuffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Размер сгенерированного изображения превышает лимит 10 МБ' });
    }

    // Загружаем на ImageBan.ru
    const formData = new FormData();
    formData.append('image', imageBuffer, {
      filename: `voting_results_${id}_${Date.now()}.jpg`,
      contentType: 'image/jpeg',
    });

    const headers = {
      ...formData.getHeaders(),
      Authorization: IMAGEBAN_SECRET_KEY
        ? `Bearer ${IMAGEBAN_SECRET_KEY}`
        : `TOKEN ${IMAGEBAN_CLIENT_ID}`,
    };

    const imagebanResponse = await axios.post('https://api.imageban.ru/v1', formData, { headers });

    // Проверяем успешность ответа
    if (!imagebanResponse.data.success || !imagebanResponse.data.data || !imagebanResponse.data.data[0]) {
      console.error('Неверный ответ от ImageBan:', imagebanResponse.data);
      return res.status(500).json({
        error: imagebanResponse.data.error?.message || 'Ошибка загрузки на ImageBan: неверный формат ответа',
        code: imagebanResponse.data.error?.code || 'Unknown',
      });
    }

    console.log('Изображение загружено на ImageBan:', imagebanResponse.data.data[0].link);

    // Сохраняем URL изображения в Airtable
    const imageUrl = imagebanResponse.data.data[0].link;

    try {
      const updateResponse = await axios.patch(
        `${VOTINGS_URL}/${id}`,
        {
          fields: {
            ResultsImage: imageUrl,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('ResultsImage успешно сохранен в Airtable');
    } catch (updateError) {
      console.error('Ошибка сохранения ResultsImage в Airtable:', updateError.message);
    }

    res.json({
      success: true,
      imageUrl: imageUrl,
      imageId: imagebanResponse.data.data[0].id,
    });
  } catch (error) {
    console.error('Ошибка генерации изображения результатов:', error.message);
    if (error.response) {
      console.error('Ответ Airtable/ImageBan:', error.response.data);
    }
    res.status(500).json({
      error: error.response?.data?.error?.message || error.message,
      code: error.response?.data?.error?.code || 'Неизвестно',
    });
  }
});

// Тестовый эндпоинт для проверки сохранения ResultsImage
app.post('/api/votings/:id/test-save', async (req, res) => {
  try {
    const { id } = req.params;
    const testUrl = 'https://via.placeholder.com/600x400/0000FF/FFFFFF?text=Test+Image';

    const updateResponse = await axios.patch(
      `${VOTINGS_URL}/${id}`,
      {
        fields: {
          ResultsImage: testUrl,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Ответ тестового сохранения:', updateResponse.data);
    res.json({ success: true, data: updateResponse.data });
  } catch (error) {
    console.error('Ошибка тестового сохранения:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Упрощенная версия для тестирования
app.post('/api/votings/:id/generate-results-simple', async (req, res) => {
  try {
    const { id } = req.params;

    // Просто возвращаем тестовое изображение
    const testImageUrl = 'https://via.placeholder.com/800x600/007bff/ffffff?text=Results+Placeholder';

    // Сохраняем в Airtable
    await axios.patch(
      `${VOTINGS_URL}/${id}`,
      {
        fields: {
          ResultsImage: testImageUrl,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({
      success: true,
      imageUrl: testImageUrl,
      message: 'Тестовое изображение успешно сохранено',
    });
  } catch (error) {
    console.error('Ошибка упрощенной генерации:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API для загрузки изображений номинантов
app.post('/api/votings/upload-option-image', upload.single('image'), async (req, res) => {
  let filePath; // Объявляем filePath вне try, чтобы использовать в catch
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл изображения не загружен' });
    }

    filePath = req.file.path;
    // Проверяем размер файла (лимит ImageBan.ru: 10 МБ)
    const fileSize = fs.statSync(filePath).size;
    if (fileSize > 10 * 1024 * 1024) {
      fs.unlinkSync(filePath);
      filePath = null; // Помечаем файл как удалённый
      return res.status(400).json({ error: 'Размер изображения превышает лимит 10 МБ' });
    }

    // Проверяем формат файла
    const allowedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedFormats.includes(req.file.mimetype)) {
      fs.unlinkSync(filePath);
      filePath = null; // Помечаем файл как удалённый
      return res.status(400).json({ error: 'Неподдерживаемый формат изображения. Используйте JPEG, JPG, PNG или GIF' });
    }

    const formData = new FormData();
    formData.append('image', fs.createReadStream(filePath));
    // Опционально: добавляем имя или альбом
    if (req.body.name) {
      formData.append('name', req.body.name);
    }
    if (req.body.album && IMAGEBAN_SECRET_KEY) {
      formData.append('album', req.body.album);
    }

    const headers = {
      ...formData.getHeaders(),
      Authorization: IMAGEBAN_SECRET_KEY
        ? `Bearer ${IMAGEBAN_SECRET_KEY}`
        : `TOKEN ${IMAGEBAN_CLIENT_ID}`,
    };

    const response = await axios.post('https://api.imageban.ru/v1', formData, { headers });

    // Проверяем успешность ответа
    if (!response.data.success || !response.data.data || !response.data.data[0]) {
      console.error('Неверный ответ от ImageBan:', response.data);
      fs.unlinkSync(filePath);
      filePath = null;
      return res.status(500).json({
        error: response.data.error?.message || 'Ошибка загрузки на ImageBan: неверный формат ответа',
        code: response.data.error?.code || 'Unknown',
      });
    }

    fs.unlinkSync(filePath);
    filePath = null; // Помечаем файл как удалённый

    res.json({
      url: response.data.data[0].link,
      filename: response.data.data[0].img_name || `option_image_${Date.now()}.jpg`,
    });
  } catch (error) {
    console.error('Ошибка загрузки изображения номинанта:', error.message);
    if (error.response) {
      console.error('Ответ ImageBan:', error.response.data);
    }
    // Удаляем файл только если он существует
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    // Специфическая обработка ошибок ImageBan
    let status = 500;
    let errorMessage = error.response?.data?.error?.message || error.message;
    const errorCode = error.response?.data?.error?.code || 'Неизвестно';

    if (['100', '105', '110'].includes(errorCode)) {
      status = 401; // Проблемы с авторизацией
      errorMessage = errorMessage || 'Ошибка авторизации в ImageBan';
    } else if (['108', '109'].includes(errorCode)) {
      status = 429; // Превышен лимит загрузок
      errorMessage = errorMessage || 'Превышен дневной лимит загрузок';
    }

    res.status(status).json({
      error: errorMessage,
      code: errorCode,
    });
  }
});

// ==================== API ДЛЯ ЗАГРУЗКИ ИЗОБРАЖЕНИЙ ====================

app.post('/api/upload', upload.single('image'), async (req, res) => {
  let filePath; // Объявляем filePath вне try
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл изображения не загружен' });
    }

    filePath = req.file.path;
    // Проверяем размер файла (лимит ImageBan.ru: 10 МБ)
    const fileSize = fs.statSync(filePath).size;
    if (fileSize > 10 * 1024 * 1024) {
      fs.unlinkSync(filePath);
      filePath = null;
      return res.status(400).json({ error: 'Размер изображения превышает лимит 10 МБ' });
    }

    // Проверяем формат файла
    const allowedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedFormats.includes(req.file.mimetype)) {
      fs.unlinkSync(filePath);
      filePath = null;
      return res.status(400).json({ error: 'Неподдерживаемый формат изображения. Используйте JPEG, JPG, PNG или GIF' });
    }

    const formData = new FormData();
    formData.append('image', fs.createReadStream(filePath));
    if (req.body.name) {
      formData.append('name', req.body.name);
    }

    const response = await axios.post('https://api.imageban.ru/v1', formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `TOKEN ${IMAGEBAN_CLIENT_ID}`,
      },
    });

    // Проверяем успешность ответа
    if (!response.data.success || !response.data.data || !response.data.data[0]) {
      console.error('Неверный ответ от ImageBan:', response.data);
      fs.unlinkSync(filePath);
      filePath = null;
      return res.status(500).json({
        error: response.data.error?.message || 'Ошибка загрузки на ImageBan: неверный формат ответа',
        code: response.data.error?.code || 'Unknown',
      });
    }

    fs.unlinkSync(filePath);
    filePath = null;

    res.json({ url: response.data.data[0].link });
  } catch (error) {
    console.error('Ошибка загрузки:', error.message);
    if (error.response) {
      console.error('Ответ ImageBan:', error.response.data);
    }
    // Удаляем файл только если он существует
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    // Специфическая обработка ошибок ImageBan
    let status = 500;
    let errorMessage = error.response?.data?.error?.message || error.message;
    const errorCode = error.response?.data?.error?.code || 'Неизвестно';

    if (['100', '105', '110'].includes(errorCode)) {
      status = 401;
      errorMessage = errorMessage || 'Ошибка авторизации в ImageBan';
    } else if (['108', '109'].includes(errorCode)) {
      status = 429;
      errorMessage = errorMessage || 'Превышен дневной лимит загрузок';
    }

    res.status(status).json({
      error: errorMessage,
      code: errorCode,
    });
  }
});

// API для загрузки изображения по URL
app.post('/api/upload-from-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL не предоставлен' });
    }

    const formData = new FormData();
    formData.append('url', url);

    const response = await axios.post('https://api.imageban.ru/v1', formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `TOKEN ${IMAGEBAN_CLIENT_ID}`,
      },
    });

    // Проверяем успешность ответа
    if (!response.data.success || !response.data.data || !response.data.data[0]) {
      console.error('Неверный ответ от ImageBan:', response.data);
      return res.status(500).json({
        error: response.data.error?.message || 'Ошибка загрузки на ImageBan: неверный формат ответа',
        code: response.data.error?.code || 'Unknown',
      });
    }

    res.json({ url: response.data.data[0].link });
  } catch (error) {
    console.error('Ошибка загрузки по URL:', error.message);
    if (error.response) {
      console.error('Ответ ImageBan:', error.response.data);
    }
    // Специфическая обработка ошибок ImageBan
    let status = 500;
    let errorMessage = error.response?.data?.error?.message || error.message;
    const errorCode = error.response?.data?.error?.code || 'Неизвестно';

    if (['100', '105', '110'].includes(errorCode)) {
      status = 401;
      errorMessage = errorMessage || 'Ошибка авторизации в ImageBan';
    } else if (['108', '109'].includes(errorCode)) {
      status = 429;
      errorMessage = errorMessage || 'Превышен дневной лимит загрузок';
    }

    res.status(status).json({
      error: errorMessage,
      code: errorCode,
    });
  }
});

// ==================== API ДЛЯ "Я ПОЙДУ!" ====================

app.post('/api/events/:eventId/attend', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body;

    console.log(`Пользователь ${userId} участвует в событии ${eventId}`);

    if (!userId) {
      return res.status(400).json({ error: 'Требуется ID пользователя' });
    }

    // Получаем текущее событие
    const eventResponse = await axios.get(`${EVENTS_URL}/${eventId}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });

    const event = eventResponse.data;

    if (!event.fields) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }

    const currentAttendees = event.fields.AttendeesIDs || '';
    const currentCount = event.fields.AttendeesCount || 0;

    console.log('Текущие участники:', currentAttendees);
    console.log('Текущее количество:', currentCount);

    // Обрабатываем разные форматы данных
    let attendeesArray = [];

    if (Array.isArray(currentAttendees)) {
      attendeesArray = currentAttendees.filter((id) => id && id.toString().trim());
    } else if (typeof currentAttendees === 'string') {
      attendeesArray = currentAttendees.split(',').filter((id) => id && id.trim());
    }

    // Проверяем, не записан ли уже пользователь
    const userIdStr = userId.toString();
    if (attendeesArray.includes(userIdStr)) {
      console.log('Пользователь уже участвует');
      return res.status(400).json({ error: 'Пользователь уже участвует' });
    }

    // Добавляем пользователя
    attendeesArray.push(userIdStr);
    const newAttendees = attendeesArray.join(',');
    const newCount = currentCount + 1;

    console.log('Новые участники:', newAttendees);
    console.log('Новое количество:', newCount);

    // Обновляем запись
    const updateData = {
      fields: {
        AttendeesIDs: newAttendees,
        AttendeesCount: newCount,
      },
    };

    console.log('Данные для обновления:', JSON.stringify(updateData, null, 2));

    const updateResponse = await axios.patch(`${EVENTS_URL}/${eventId}`, updateData, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('Обновление успешно:', updateResponse.data);
    res.json({ success: true, count: newCount, attending: true });
  } catch (error) {
    console.error('Ошибка участия:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events/:eventId/unattend', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body;

    console.log(`Пользователь ${userId} отменяет участие в событии ${eventId}`);

    if (!userId) {
      return res.status(400).json({ error: 'Требуется ID пользователя' });
    }

    // Получаем текущее событие
    const eventResponse = await axios.get(`${EVENTS_URL}/${eventId}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });

    const event = eventResponse.data;

    if (!event.fields) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }

    const currentAttendees = event.fields.AttendeesIDs || '';
    const currentCount = event.fields.AttendeesCount || 0;

    console.log('Текущие участники:', currentAttendees);
    console.log('Текущее количество:', currentCount);

    // Обрабатываем разные форматы данных
    let attendeesArray = [];

    if (Array.isArray(currentAttendees)) {
      attendeesArray = currentAttendees.filter((id) => id && id.toString().trim());
    } else if (typeof currentAttendees === 'string') {
      attendeesArray = currentAttendees.split(',').filter((id) => id && id.trim());
    }

    // Удаляем пользователя
    const userIdStr = userId.toString();
    const newAttendeesArray = attendeesArray.filter((id) => id !== userIdStr);
    const newAttendees = newAttendeesArray.join(',');
    const newCount = Math.max(0, newAttendeesArray.length);

    console.log('Новые участники:', newAttendees);
    console.log('Новое количество:', newCount);

    // Обновляем запись
    const updateData = {
      fields: {
        AttendeesIDs: newAttendees,
        AttendeesCount: newCount,
      },
    };

    const updateResponse = await axios.patch(`${EVENTS_URL}/${eventId}`, updateData, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('Отмена участия успешна');
    res.json({ success: true, count: newCount, attending: false });
  } catch (error) {
    console.error('Ошибка отмены участия:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Проверяем статус участия пользователя
app.get('/api/events/:eventId/attend-status/:userId', async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    console.log(`Проверка статуса участия пользователя ${userId} в событии ${eventId}`);

    const eventResponse = await axios.get(`${EVENTS_URL}/${eventId}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });

    const event = eventResponse.data;

    if (!event.fields) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }

    const attendees = event.fields.AttendeesIDs || '';
    let attendeesArray = [];

    if (Array.isArray(attendees)) {
      attendeesArray = attendees.filter((id) => id && id.toString().trim());
    } else if (typeof attendees === 'string') {
      attendeesArray = attendees.split(',').filter((id) => id && id.trim());
    }

    const isAttending = attendeesArray.includes(userId.toString());

    console.log('Участвует:', isAttending);
    res.json({ isAttending });
  } catch (error) {
    console.error('Ошибка проверки статуса участия:', error.message);
    if (error.response) {
      console.error('Ответ Airtable:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Радиус Земли в метрах
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// Создание папки uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
  console.log(`URL событий: ${EVENTS_URL}`);
  console.log(`URL рекламы: ${ADS_URL}`);
  console.log(`URL голосований: ${VOTINGS_URL}`);
  console.log('Убедитесь, что в Airtable есть следующие столбцы:');
  console.log('- Events: AttendeesIDs, AttendeesCount');
  console.log('- Votings: Options, Votes, VotedUserIDs, Latitude, Longitude, Status, Results, OptionImages, ResultsImage');
});
