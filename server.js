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

// Env vars
const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN;
const SEATABLE_SERVER_URL = process.env.SEATABLE_SERVER_URL || 'https://cloud.seatable.io';
const SEATABLE_BASE_UUID = process.env.SEATABLE_BASE_UUID;
const EVENTS_TABLE = process.env.SEATABLE_EVENTS_TABLE_NAME || 'Events';
const ADS_TABLE = process.env.SEATABLE_ADS_TABLE_NAME || 'Ads';
const VOTINGS_TABLE = process.env.SEATABLE_VOTINGS_TABLE_NAME || 'Votings';

// Radikal API конфигурация
const RADIKAL_API_URL = 'https://radikal.cloud/api/1';
const RADIKAL_API_KEY = process.env.RADIKAL_API_KEY;

// Хардкод админа
const ADMIN_ID = 366825437;

if (!SEATABLE_API_TOKEN || !SEATABLE_BASE_UUID || !RADIKAL_API_KEY) {
  console.error('Отсутствуют переменные окружения: Установите SEATABLE_API_TOKEN, SEATABLE_BASE_UUID, RADIKAL_API_KEY в Render');
  process.exit(1);
}

// Функция для получения Base-Token
async function getBaseToken() {
  try {
    console.log('Попытка получить Base-Token с помощью POST...');
    const response = await axios.post(
      `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-access-token/`,
      { app_token: SEATABLE_API_TOKEN },
      { headers: { 'Content-Type': 'application/json' } }
    );
    console.log('Base-Token успешно получен:', response.data.access_token);
    return response.data.access_token;
  } catch (error) {
    console.error('Ошибка при получении Base-Token с POST:', error.message);
    console.error('Детали ошибки:', error.response ? error.response.data : error.message);
    if (error.response && error.response.status === 405) {
      console.log('Попытка с GET-методом...');
      try {
        const response = await axios.get(
          `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-access-token/`,
          {
            headers: {
              Authorization: `Token ${SEATABLE_API_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log('Base-Token успешно получен с GET:', response.data.access_token);
        return response.data.access_token;
      } catch (getError) {
        console.error('Ошибка при получении Base-Token с GET:', getError.message);
        console.error('Детали ошибки GET:', getError.response ? getError.response.data : getError.message);
        throw new Error('Не удалось получить Base-Token');
      }
    }
    throw error;
  }
}

// Базовые URL для SeaTable API
const getRowsUrl = (tableName) => `${SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${SEATABLE_BASE_UUID}/rows/?table_name=${tableName}`;
const getRowUrl = (tableName, rowId) => `${SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${SEATABLE_BASE_UUID}/rows/${rowId}/?table_name=${tableName}`;
const appendRowUrl = (tableName) => `${SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${SEATABLE_BASE_UUID}/rows/?table_name=${tableName}`;
const updateRowUrl = (tableName, rowId) => `${SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${SEATABLE_BASE_UUID}/rows/${rowId}/?table_name=${tableName}`;
const deleteRowUrl = (tableName, rowId) => `${SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${SEATABLE_BASE_UUID}/rows/${rowId}/?table_name=${tableName}`;
const getUploadLinkUrl = () => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-upload-link/`;

// Главная страница
app.get('/', (req, res) => {
  res.send('Бэкенд Smolville запущен! Конечные точки API: /api/events, /api/ads, /api/votings, /api/upload');
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ RADIKAL API ====================

async function uploadToRadikal(fileBuffer, filename, contentType = 'image/jpeg') {
  try {
    console.log('Начало загрузки в Radikal API...');
    console.log('Имя файла:', filename);
    console.log('Тип контента:', contentType);
    console.log('Размер файла:', fileBuffer.length, 'байт');

    const formData = new FormData();
    formData.append('source', fileBuffer, {
      filename: filename,
      contentType: contentType
    });

    const response = await axios.post(`${RADIKAL_API_URL}/upload`, formData, {
      headers: {
        'X-API-Key': RADIKAL_API_KEY,
        ...formData.getHeaders(),
      },
      timeout: 30000
    });

    console.log('Ответ от Radikal API:', response.data);

    if (response.data.status_code === 200 && response.data.image) {
      const imageData = response.data.image;
      console.log('Файл успешно загружен, URL:', imageData.url);
      
      return {
        fileId: imageData.id_encoded || imageData.name,
        url: imageData.url,
        filename: filename,
        imageData: response.data.image
      };
    } else {
      throw new Error(response.data.error ? response.data.error.message : (response.data.status_txt || 'Ошибка загрузки'));
    }
  } catch (error) {
    console.error('Ошибка загрузки в Radikal API:', error.message);
    if (error.response) {
      console.error('Статус ответа Radikal API:', error.response.status);
      console.error('Данные ответа Radikal API:', error.response.data);
    }
    throw error;
  }
}

async function getRadikalFileInfo(fileId) {
  try {
    console.log('Получение информации о файле:', fileId);
    
    const response = await axios.get(`${RADIKAL_API_URL}/files/${fileId}`, {
      headers: {
        'X-API-Key': RADIKAL_API_KEY
      }
    });
    
    console.log('Информация о файле успешно получена');
    return response.data;
  } catch (error) {
    console.error('Ошибка получения информации о файле из Radikal API:', error.message);
    if (error.response && error.response.status === 404) {
      console.log('Конечная точка информации о файле недоступна в Radikal Cloud');
      return null;
    }
    throw error;
  }
}

async function deleteFromRadikal(fileId) {
  try {
    await axios.delete(`${RADIKAL_API_URL}/files/${fileId}`, {
      headers: {
        'X-API-Key': RADIKAL_API_KEY
      }
    });
    console.log(`Файл ${fileId} удалён из Radikal API`);
  } catch (error) {
    console.error('Ошибка удаления файла из Radikal API:', error.message);
    if (error.response && error.response.status === 404) {
      console.log('Конечная точка удаления недоступна в Radikal Cloud');
      return;
    }
    throw error;
  }
}

// ==================== API ДЛЯ АДМИНА ====================

app.get('/api/is-admin', (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const isAdmin = userId === ADMIN_ID;
  res.json({ isAdmin });
});

// ==================== API ДЛЯ ЗАГРУЗКИ ИЗОБРАЖЕНИЙ ====================

app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Изображение не загружено' });
    }
    
    console.log('Получен запрос на загрузку');
    console.log('Оригинальное имя файла:', req.file.originalname);
    console.log('MIME-тип:', req.file.mimetype);
    console.log('Размер файла:', req.file.size, 'байт');
    
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    
    const uploadResult = await uploadToRadikal(
      fileBuffer,
      req.file.originalname || `upload_${Date.now()}.jpg`,
      req.file.mimetype
    );
    
    try {
      fs.unlinkSync(filePath);
    } catch (unlinkError) {
      console.error('Ошибка удаления временного файла:', unlinkError.message);
    }
    
    console.log('Загрузка успешна, URL:', uploadResult.url);
    
    res.json({ 
      url: uploadResult.url,
      fileId: uploadResult.fileId,
      filename: uploadResult.filename
    });
    
  } catch (error) {
    console.error('Ошибка загрузки:', error.message);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Ошибка удаления временного файла:', unlinkError.message);
      }
    }
    res.status(500).json({ error: error.message });
  }
});

// API для загрузки изображений номинантов
app.post('/api/votings/upload-option-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Изображение не загружено' });
    }
    
    console.log('Получен запрос на загрузку изображения номинанта');
    console.log('Оригинальное имя файла:', req.file.originalname);
    console.log('MIME-тип:', req.file.mimetype);
    
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const filename = req.file.originalname || `option_image_${Date.now()}.jpg`;

    // Получаем Base-Token
    const baseToken = await getBaseToken();

    // Шаг 1: Получаем upload link
    const uploadLinkResponse = await axios.get(getUploadLinkUrl(), {
      headers: {
        Authorization: `Bearer ${SEATABLE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const { upload_link, parent_path, img_relative_path } = uploadLinkResponse.data;

    // Шаг 2: Загружаем файл в SeaTable
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: filename,
      contentType: req.file.mimetype
    });
    formData.append('parent_dir', parent_path);
    formData.append('relative_path', img_relative_path);

    const uploadResponse = await axios.post(upload_link, formData, {
      headers: {
        ...formData.getHeaders()
      }
    });

    const fileUrl = uploadResponse.data[0].url; // SeaTable возвращает массив файлов

    try {
      fs.unlinkSync(filePath);
    } catch (unlinkError) {
      console.error('Ошибка удаления временного файла:', unlinkError.message);
    }

    console.log('Загрузка изображения номинанта успешна, URL:', fileUrl);

    res.json({
      url: fileUrl,
      filename: filename,
      fileId: fileUrl.split('/').pop()
    });

  } catch (error) {
    console.error('Ошибка загрузки изображения номинанта:', error.message);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Ошибка удаления временного файла:', unlinkError.message);
      }
    }
    res.status(500).json({ error: error.message });
  }
});

// Эндпоинт для удаления изображений
app.delete('/api/upload/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    await deleteFromRadikal(fileId);
    
    res.json({ success: true, message: `Файл ${fileId} успешно удалён` });
    
  } catch (error) {
    console.error('Ошибка удаления файла:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== EVENTS API ====================

app.get('/api/events', async (req, res) => {
  try {
    const baseToken = await getBaseToken();
    const response = await axios.get(getRowsUrl(EVENTS_TABLE), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });
    res.json({ records: response.data.rows.map(row => ({ id: row._id, fields: row })) });
  } catch (error) {
    console.error('Ошибка GET /api/events:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    console.log('Создание события с данными:', JSON.stringify(req.body, null, 2));
    const baseToken = await getBaseToken();
    const response = await axios.post(appendRowUrl(EVENTS_TABLE), {
      row: req.body.fields
    }, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
    });
    res.json({ id: response.data._id, fields: response.data });
  } catch (error) {
    console.error('Ошибка POST /api/events:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const baseToken = await getBaseToken();
    const response = await axios.get(getRowUrl(EVENTS_TABLE, req.params.id), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });
    res.json({ id: response.data._id, fields: response.data });
  } catch (error) {
    console.error('Ошибка GET /api/events/:id:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/events/:id', async (req, res) => {
  try {
    console.log('Обновление события с данными:', JSON.stringify(req.body, null, 2));
    const baseToken = await getBaseToken();
    const response = await axios.put(updateRowUrl(EVENTS_TABLE, req.params.id), {
      row: req.body.fields
    }, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
    });
    res.json({ id: response.data._id, fields: response.data });
  } catch (error) {
    console.error('Ошибка PATCH /api/events/:id:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const baseToken = await getBaseToken();
    await axios.delete(deleteRowUrl(EVENTS_TABLE, req.params.id), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка DELETE /api/events/:id:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADS API ====================

app.get('/api/ads', async (req, res) => {
  try {
    const baseToken = await getBaseToken();
    const response = await axios.get(getRowsUrl(ADS_TABLE), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });
    res.json({ records: response.data.rows.map(row => ({ id: row._id, fields: row })) });
  } catch (error) {
    console.error('Ошибка GET /api/ads:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    const baseToken = await getBaseToken();
    const response = await axios.post(appendRowUrl(ADS_TABLE), {
      row: req.body.fields
    }, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
    });
    res.json({ id: response.data._id, fields: response.data });
  } catch (error) {
    console.error('Ошибка POST /api/ads:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/ads/:id', async (req, res) => {
  try {
    const baseToken = await getBaseToken();
    const response = await axios.put(updateRowUrl(ADS_TABLE, req.params.id), {
      row: req.body.fields
    }, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
    });
    res.json({ id: response.data._id, fields: response.data });
  } catch (error) {
    console.error('Ошибка PATCH /api/ads/:id:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    const baseToken = await getBaseToken();
    await axios.delete(deleteRowUrl(ADS_TABLE, req.params.id), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка DELETE /api/ads/:id:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== VOTINGS API ====================

app.get('/api/votings', async (req, res) => {
  try {
    const baseToken = await getBaseToken();
    const response = await axios.get(getRowsUrl(VOTINGS_TABLE), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });
    res.json({ records: response.data.rows.map(row => ({ id: row._id, fields: row })) });
  } catch (error) {
    console.error('Ошибка GET /api/votings:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/votings', async (req, res) => {
  try {
    const baseToken = await getBaseToken();
    const response = await axios.post(appendRowUrl(VOTINGS_TABLE), {
      row: req.body.fields
    }, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
    });
    res.json({ id: response.data._id, fields: response.data });
  } catch (error) {
    console.error('Ошибка POST /api/votings:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/votings/:id', async (req, res) => {
  try {
    const baseToken = await getBaseToken();
    const response = await axios.put(updateRowUrl(VOTINGS_TABLE, req.params.id), {
      row: req.body.fields
    }, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
    });
    res.json({ id: response.data._id, fields: response.data });
  } catch (error) {
    console.error('Ошибка PATCH /api/votings/:id:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/votings/:id', async (req, res) => {
  try {
    const baseToken = await getBaseToken();
    await axios.delete(deleteRowUrl(VOTINGS_TABLE, req.params.id), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка DELETE /api/votings/:id:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Получить голосования по ID мероприятия
app.get('/api/events/:eventId/votings', async (req, res) => {
  try {
    const { eventId } = req.params;
    const baseToken = await getBaseToken();
    const response = await axios.get(getRowsUrl(VOTINGS_TABLE), {
      headers: { Authorization: `Bearer ${baseToken}` },
      params: { filter: `EventID="${eventId}"` }
    });
    res.json({ records: response.data.rows.map(row => ({ id: row._id, fields: row })) });
  } catch (error) {
    console.error('Ошибка GET /api/events/:eventId/votings:', error.message);
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

    const baseToken = await getBaseToken();
    const votingResponse = await axios.get(getRowUrl(VOTINGS_TABLE, id), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });

    const voting = votingResponse.data;
    if (!voting) {
      console.error('Голосование не найдено');
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    if (voting.Status === 'Completed') {
      console.error('Голосование завершено');
      return res.status(400).json({ error: 'Голосование завершено' });
    }

    const votedUserIds = voting.VotedUserIDs || '';
    const votedUsersArray = votedUserIds.split(',').filter(id => id && id.trim());

    if (votedUsersArray.includes(userId.toString())) {
      console.error('Пользователь уже проголосовал');
      return res.status(400).json({ error: 'Вы уже проголосовали в этом голосовании' });
    }

    const votingLat = voting.Latitude;
    const votingLon = voting.Longitude;

    if (votingLat && votingLon && userLat && userLon) {
      const distance = calculateDistance(userLat, userLon, votingLat, votingLon);
      console.log('Рассчитанное расстояние:', distance);
      if (distance > 1000) {
        console.error('Пользователь находится слишком далеко');
        return res.status(400).json({ error: 'Вы находитесь слишком далеко от места голосования' });
      }
    }

    let currentVotes = voting.Votes ? JSON.parse(voting.Votes) : {};
    console.log('Текущие голоса:', currentVotes);

    currentVotes[userId] = optionIndex;
    console.log('Обновлённые голоса:', currentVotes);

    const newVotedUserIDs = votedUserIds ? `${votedUserIds},${userId}` : userId.toString();

    const updateData = {
      row: {
        Votes: JSON.stringify(currentVotes),
        VotedUserIDs: newVotedUserIDs
      }
    };

    console.log('Обновление записи голосования:', JSON.stringify(updateData, null, 2));

    const updateResponse = await axios.put(updateRowUrl(VOTINGS_TABLE, id), updateData, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Голосование успешно обновлено:', updateResponse.data);
    res.json({ success: true, voting: { id: updateResponse.data._id, fields: updateResponse.data } });
  } catch (error) {
    console.error('Ошибка голосования:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Проверить статус голосования пользователя
app.get('/api/votings/:id/vote-status/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;

    const baseToken = await getBaseToken();
    const votingResponse = await axios.get(getRowUrl(VOTINGS_TABLE, id), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });

    const voting = votingResponse.data;
    if (!voting) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    const votedUserIds = voting.VotedUserIDs || '';
    const votedUsersArray = votedUserIds.split(',').filter(id => id && id.trim());

    const hasVoted = votedUsersArray.includes(userId.toString());
    let userVote = null;
    if (voting.Votes) {
      const votes = JSON.parse(voting.Votes);
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

    const baseToken = await getBaseToken();
    const votingResponse = await axios.get(getRowUrl(VOTINGS_TABLE, id), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });

    const voting = votingResponse.data;
    if (!voting) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    const votes = voting.Votes ? (typeof voting.Votes === 'string' ? JSON.parse(voting.Votes) : voting.Votes) : {};

    const results = [];

    if (voting.Options) {
      const options = voting.Options.split(',');

      const voteCounts = {};
      options.forEach((option, index) => {
        voteCounts[index] = 0;
      });

      Object.values(votes).forEach(voteIndex => {
        if (voteCounts[voteIndex] !== undefined) {
          voteCounts[voteIndex]++;
        }
      });

      const totalVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);

      options.forEach((option, index) => {
        const count = voteCounts[index] || 0;
        const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

        results.push({
          option: option,
          count: count,
          percentage: percentage
        });
      });
    }

    const updateResponse = await axios.put(updateRowUrl(VOTINGS_TABLE, id), {
      row: {
        Status: 'Completed',
        Results: JSON.stringify(results)
      }
    }, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({ success: true, results: results, voting: { id: updateResponse.data._id, fields: updateResponse.data } });
  } catch (error) {
    console.error('Ошибка завершения голосования:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Генерация изображения с результатами голосования
app.post('/api/votings/:id/generate-results', async (req, res) => {
  try {
    const { id } = req.params;

    const baseToken = await getBaseToken();
    const votingResponse = await axios.get(getRowUrl(VOTINGS_TABLE, id), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });

    const voting = votingResponse.data;
    if (!voting) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    if (!voting.Results) {
      return res.status(400).json({ error: 'Результаты голосования недоступны' });
    }

    let results;
    try {
      if (typeof voting.Results === 'string') {
        results = JSON.parse(voting.Results);
      } else {
        results = voting.Results;
      }
    } catch (parseError) {
      console.error('Ошибка парсинга результатов:', parseError);
      return res.status(400).json({ error: 'Неверный формат результатов голосования' });
    }

    let resultsArray = [];
    if (Array.isArray(results)) {
      resultsArray = results;
    } else if (results && typeof results === 'object') {
      resultsArray = Object.values(results);
    } else {
      return res.status(400).json({ error: 'Неверный формат результатов' });
    }

    const title = voting.Title || 'Результаты голосования';
    const description = voting.Description || '';

    const optionImages = voting.OptionImages || [];
    console.log('OptionImages из SeaTable:', JSON.stringify(optionImages, null, 2));

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

    if (hasImages) {
      y += 20;
      svg += `<text x="400" y="${y}" class="description" text-anchor="middle">Изображения номинантов</text>`;
      y += 30;

      resultsArray.forEach((result, index) => {
        let imageUrl = null;
        if (optionImages[index]) {
          if (typeof optionImages[index] === 'string') {
            imageUrl = optionImages[index];
          } else if (typeof optionImages[index] === 'object' && optionImages[index].url) {
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

    const svgBuffer = Buffer.from(svg);
    const imageBuffer = await sharp(svgBuffer)
      .resize(800, height, {
        fit: 'fill',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .jpeg({
        quality: 90,
        chromaSubsampling: '4:4:4'
      })
      .toBuffer();

    const uploadResult = await uploadToRadikal(
      imageBuffer,
      `voting_results_${id}_${Date.now()}.jpg`,
      'image/jpeg'
    );

    console.log('Изображение результатов загружено в Radikal API:', uploadResult.url);

    try {
      const updateResponse = await axios.put(updateRowUrl(VOTINGS_TABLE, id), {
        row: {
          ResultsImage: uploadResult.url
        }
      }, {
        headers: {
          Authorization: `Bearer ${baseToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('ResultsImage успешно сохранён в SeaTable');
    } catch (updateError) {
      console.error('Ошибка сохранения ResultsImage в SeaTable:', updateError.message);
    }

    res.json({
      success: true,
      imageUrl: uploadResult.url,
      fileId: uploadResult.fileId
    });

  } catch (error) {
    console.error('Ошибка генерации изображения результатов:', error.message);
    res.status(500).json({ error: error.message });
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

    const baseToken = await getBaseToken();
    const eventResponse = await axios.get(getRowUrl(EVENTS_TABLE, eventId), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });

    const event = eventResponse.data;

    if (!event) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }

    const currentAttendees = event.AttendeesIDs || '';
    const currentCount = event.AttendeesCount || 0;

    console.log('Текущие участники:', currentAttendees);
    console.log('Текущее количество:', currentCount);

    let attendeesArray = [];
    if (typeof currentAttendees === 'string') {
      attendeesArray = currentAttendees.split(',').filter(id => id && id.trim());
    }

    const userIdStr = userId.toString();
    if (attendeesArray.includes(userIdStr)) {
      console.log('Пользователь уже участвует');
      return res.status(400).json({ error: 'Пользователь уже участвует' });
    }

    attendeesArray.push(userIdStr);
    const newAttendees = attendeesArray.join(',');
    const newCount = currentCount + 1;

    console.log('Новые участники:', newAttendees);
    console.log('Новое количество:', newCount);

    const updateData = {
      row: {
        AttendeesIDs: newAttendees,
        AttendeesCount: newCount
      }
    };

    console.log('Данные для обновления:', JSON.stringify(updateData, null, 2));

    const updateResponse = await axios.put(updateRowUrl(EVENTS_TABLE, eventId), updateData, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Обновление успешно:', updateResponse.data);
    res.json({ success: true, count: newCount, attending: true });

  } catch (error) {
    console.error('Ошибка участия:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events/:eventId/unattend', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body;

    console.log(`Пользователь ${userId} отказывается от участия в событии ${eventId}`);

    if (!userId) {
      return res.status(400).json({ error: 'Требуется ID пользователя' });
    }

    const baseToken = await getBaseToken();
    const eventResponse = await axios.get(getRowUrl(EVENTS_TABLE, eventId), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });

    const event = eventResponse.data;

    if (!event) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }

    const currentAttendees = event.AttendeesIDs || '';
    const currentCount = event.AttendeesCount || 0;

    console.log('Текущие участники:', currentAttendees);
    console.log('Текущее количество:', currentCount);

    let attendeesArray = [];
    if (typeof currentAttendees === 'string') {
      attendeesArray = currentAttendees.split(',').filter(id => id && id.trim());
    }

    const userIdStr = userId.toString();
    const newAttendeesArray = attendeesArray.filter(id => id !== userIdStr);
    const newAttendees = newAttendeesArray.join(',');
    const newCount = Math.max(0, newAttendeesArray.length);

    console.log('Новые участники:', newAttendees);
    console.log('Новое количество:', newCount);

    const updateData = {
      row: {
        AttendeesIDs: newAttendees,
        AttendeesCount: newCount
      }
    };

    const updateResponse = await axios.put(updateRowUrl(EVENTS_TABLE, eventId), updateData, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Отказ от участия успешен');
    res.json({ success: true, count: newCount, attending: false });

  } catch (error) {
    console.error('Ошибка отказа от участия:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Проверяем статус участия пользователя
app.get('/api/events/:eventId/attend-status/:userId', async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    console.log(`Проверка статуса участия для пользователя ${userId} в событии ${eventId}`);

    const baseToken = await getBaseToken();
    const eventResponse = await axios.get(getRowUrl(EVENTS_TABLE, eventId), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });

    const event = eventResponse.data;

    if (!event) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }

    const attendees = event.AttendeesIDs || '';
    let attendeesArray = [];
    if (typeof attendees === 'string') {
      attendeesArray = attendees.split(',').filter(id => id && id.trim());
    }

    const isAttending = attendeesArray.includes(userId.toString());

    console.log('Участвует:', isAttending);
    res.json({ isAttending });

  } catch (error) {
    console.error('Ошибка проверки статуса участия:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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
  console.log(`URL Radikal API: ${RADIKAL_API_URL}`);
  console.log('Убедитесь, что переменные SEATABLE_API_TOKEN, SEATABLE_BASE_UUID и RADIKAL_API_KEY установлены в переменных окружения');
});
