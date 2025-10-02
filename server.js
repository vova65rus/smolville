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
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024,
  }
});

// Env vars
const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN;
const SEATABLE_SERVER_URL = process.env.SEATABLE_SERVER_URL || 'https://cloud.seatable.io';
const SEATABLE_BASE_UUID = process.env.SEATABLE_BASE_UUID || '1e24960e-ac5a-43b6-8269-e6376b16577a';
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

// Правильные URL для SeaTable API
const getBaseTokenUrl = () => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-access-token/`;
const getRecordsUrl = (tableName) => `${SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${SEATABLE_BASE_UUID}/rows/?table_name=${tableName}`;
const getRecordUrl = (tableName, rowId) => `${SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${SEATABLE_BASE_UUID}/rows/${rowId}/?table_name=${tableName}`;
const appendRecordsUrl = (tableName) => `${SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${SEATABLE_BASE_UUID}/rows/?table_name=${tableName}`;
const updateRecordUrl = (tableName, rowId) => `${SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${SEATABLE_BASE_UUID}/rows/${rowId}/?table_name=${tableName}`;
const deleteRecordUrl = (tableName, rowId) => `${SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${SEATABLE_BASE_UUID}/rows/${rowId}/?table_name=${tableName}`;
const getUploadLinkUrl = () => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-upload-link/`;

// Переменные для хранения токена
let currentAccessToken = null;

// Функция для получения Base-Token
async function getBaseToken() {
  try {
    console.log('Попытка получить Base-Token...');
    const response = await axios.get(getBaseTokenUrl(), {
      headers: {
        Authorization: `Bearer ${SEATABLE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    currentAccessToken = response.data.access_token;
    
    console.log('Base-Token успешно получен:', currentAccessToken);
    
    return currentAccessToken;
  } catch (error) {
    console.error('Ошибка при получении Base-Token:', error.message);
    console.error('Детали ошибки:', error.response ? error.response.data : error.message);
    throw new Error('Не удалось получить Base-Token');
  }
}

// Функция для получения валидного токена
async function getValidatedToken() {
  if (!currentAccessToken) {
    return await getBaseToken();
  }
  return currentAccessToken;
}

// Получить заголовки для SeaTable API
function getSeatableHeaders(token) {
  return {
    'Authorization': `Token ${token}`,
    'Content-Type': 'application/json'
  };
}

// Вспомогательная функция для безопасного парсинга JSON
function safeJsonParse(str, defaultValue = {}) {
  try {
    if (typeof str === 'string') {
      return JSON.parse(str);
    }
    return str || defaultValue;
  } catch (error) {
    console.error('Ошибка парсинга JSON:', error.message);
    return defaultValue;
  }
}

// Главная страница
app.get('/', (req, res) => {
  res.send('Бэкенд Smolville запущен! Конечные точки API: /api/events, /api/ads, /api/votings, /api/upload');
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    seatable: {
      baseUUID: SEATABLE_BASE_UUID,
      hasToken: !!currentAccessToken
    }
  });
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ RADIKAL API ====================

async function uploadToRadikal(fileBuffer, filename, contentType = 'image/jpeg') {
  try {
    console.log('Начало загрузки в Radikal API...');
    
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

    // Более гибкая проверка ответа
    const imageData = response.data.image || response.data;
    
    if (response.data.status_code === 200 || response.data.status === 200 || imageData) {
      const url = imageData.url || imageData.image_url;
      const fileId = imageData.id_encoded || imageData.name || imageData.id;
      
      if (!url) {
        throw new Error('URL не получен от Radikal API');
      }
      
      console.log('Файл успешно загружен, URL:', url);
      
      return {
        fileId: fileId,
        url: url,
        filename: filename,
        imageData: imageData
      };
    } else {
      throw new Error(response.data.error ? response.data.error.message : 
                    (response.data.status_txt || 'Ошибка загрузки'));
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
    
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const filename = req.file.originalname || `option_image_${Date.now()}.jpg`;

    // Получаем Base-Token
    const baseToken = await getValidatedToken();

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

    const fileUrl = uploadResponse.data[0].url;

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
    console.log(`Получен запрос к /api/events, таблица: ${EVENTS_TABLE}`);
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const response = await axios.get(getRecordsUrl(EVENTS_TABLE), {
      headers: headers
    });
    
    console.log('Данные событий получены:', response.data);
    res.json({ records: response.data.rows.map(row => ({ id: row._id, fields: row })) });
  } catch (error) {
    console.error('Ошибка GET /api/events:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка загрузки событий' });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    console.log('Создание события с данными:', JSON.stringify(req.body, null, 2));
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const response = await axios.post(appendRecordsUrl(EVENTS_TABLE), {
      rows: [req.body.fields]
    }, {
      headers: headers
    });
    
    res.json({ id: response.data.rows[0]._id, fields: response.data.rows[0] });
  } catch (error) {
    console.error('Ошибка POST /api/events:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка создания события' });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    console.log(`Получен запрос к /api/events/${req.params.id}`);
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const response = await axios.get(getRecordUrl(EVENTS_TABLE, req.params.id), {
      headers: headers
    });
    
    res.json({ id: response.data._id, fields: response.data });
  } catch (error) {
    console.error('Ошибка GET /api/events/:id:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка получения события' });
  }
});

app.put('/api/events/:id', async (req, res) => {
  try {
    console.log('Обновление события с данными:', JSON.stringify(req.body, null, 2));
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const response = await axios.put(updateRecordUrl(EVENTS_TABLE, req.params.id), {
      row: req.body.fields
    }, {
      headers: headers
    });
    
    res.json({ id: response.data._id, fields: response.data });
  } catch (error) {
    console.error('Ошибка PUT /api/events/:id:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка обновления события' });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    console.log(`Удаление события ${req.params.id}`);
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    await axios.delete(deleteRecordUrl(EVENTS_TABLE, req.params.id), {
      headers: headers
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка DELETE /api/events/:id:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка удаления события' });
  }
});

// ==================== ADS API ====================

app.get('/api/ads', async (req, res) => {
  try {
    console.log(`Получен запрос к /api/ads, таблица: ${ADS_TABLE}`);
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const response = await axios.get(getRecordsUrl(ADS_TABLE), {
      headers: headers
    });
    
    console.log('Данные объявлений получены:', response.data);
    res.json({ records: response.data.rows.map(row => ({ id: row._id, fields: row })) });
  } catch (error) {
    console.error('Ошибка GET /api/ads:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка загрузки объявлений' });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    console.log('Создание объявления с данными:', JSON.stringify(req.body, null, 2));
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const response = await axios.post(appendRecordsUrl(ADS_TABLE), {
      rows: [req.body.fields]
    }, {
      headers: headers
    });
    
    res.json({ id: response.data.rows[0]._id, fields: response.data.rows[0] });
  } catch (error) {
    console.error('Ошибка POST /api/ads:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка создания объявления' });
  }
});

app.put('/api/ads/:id', async (req, res) => {
  try {
    console.log('Обновление объявления с данными:', JSON.stringify(req.body, null, 2));
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const response = await axios.put(updateRecordUrl(ADS_TABLE, req.params.id), {
      row: req.body.fields
    }, {
      headers: headers
    });
    
    res.json({ id: response.data._id, fields: response.data });
  } catch (error) {
    console.error('Ошибка PUT /api/ads/:id:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка обновления объявления' });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    console.log(`Удаление объявления ${req.params.id}`);
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    await axios.delete(deleteRecordUrl(ADS_TABLE, req.params.id), {
      headers: headers
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка DELETE /api/ads/:id:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка удаления объявления' });
  }
});

// ==================== VOTINGS API ====================

app.get('/api/votings', async (req, res) => {
  try {
    console.log(`Получен запрос к /api/votings, таблица: ${VOTINGS_TABLE}`);
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const response = await axios.get(getRecordsUrl(VOTINGS_TABLE), {
      headers: headers
    });
    
    console.log('Данные голосований получены:', response.data);
    res.json({ records: response.data.rows.map(row => ({ id: row._id, fields: row })) });
  } catch (error) {
    console.error('Ошибка GET /api/votings:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка загрузки голосований' });
  }
});

app.post('/api/votings', async (req, res) => {
  try {
    console.log('Создание голосования с данными:', JSON.stringify(req.body, null, 2));
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const response = await axios.post(appendRecordsUrl(VOTINGS_TABLE), {
      rows: [req.body.fields]
    }, {
      headers: headers
    });
    
    res.json({ id: response.data.rows[0]._id, fields: response.data.rows[0] });
  } catch (error) {
    console.error('Ошибка POST /api/votings:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка создания голосования' });
  }
});

app.put('/api/votings/:id', async (req, res) => {
  try {
    console.log('Обновление голосования с данными:', JSON.stringify(req.body, null, 2));
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const response = await axios.put(updateRecordUrl(VOTINGS_TABLE, req.params.id), {
      row: req.body.fields
    }, {
      headers: headers
    });
    
    res.json({ id: response.data._id, fields: response.data });
  } catch (error) {
    console.error('Ошибка PUT /api/votings/:id:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка обновления голосования' });
  }
});

app.delete('/api/votings/:id', async (req, res) => {
  try {
    console.log(`Удаление голосования ${req.params.id}`);
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    await axios.delete(deleteRecordUrl(VOTINGS_TABLE, req.params.id), {
      headers: headers
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка DELETE /api/votings/:id:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка удаления голосования' });
  }
});

// Получить голосования по ID мероприятия
app.get('/api/events/:eventId/votings', async (req, res) => {
  try {
    const { eventId } = req.params;
    console.log(`Получен запрос к /api/events/${eventId}/votings, таблица: ${VOTINGS_TABLE}`);
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    // Получаем все голосования и фильтруем на стороне сервера
    const response = await axios.get(getRecordsUrl(VOTINGS_TABLE), {
      headers: headers
    });
    
    const filteredVotings = response.data.rows.filter(row => 
      row.EventID && row.EventID.toString() === eventId.toString()
    );
    
    console.log('Отфильтрованные голосования для события:', filteredVotings);
    res.json({ records: filteredVotings.map(row => ({ id: row._id, fields: row })) });
  } catch (error) {
    console.error('Ошибка GET /api/events/:eventId/votings:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка загрузки голосований для события' });
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

    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const votingResponse = await axios.get(getRecordUrl(VOTINGS_TABLE, id), {
      headers: headers
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

    let currentVotes = safeJsonParse(voting.Votes, {});
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

    const updateResponse = await axios.put(updateRecordUrl(VOTINGS_TABLE, id), updateData, {
      headers: headers
    });

    console.log('Голосование успешно обновлено:', updateResponse.data);
    res.json({ success: true, voting: { id: updateResponse.data._id, fields: updateResponse.data } });
  } catch (error) {
    console.error('Ошибка голосования:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка при голосовании' });
  }
});

// Проверить статус голосования пользователя
app.get('/api/votings/:id/vote-status/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;

    console.log(`Проверка статуса голосования для пользователя ${userId}, ID голосования: ${id}`);
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const votingResponse = await axios.get(getRecordUrl(VOTINGS_TABLE, id), {
      headers: headers
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
      const votes = safeJsonParse(voting.Votes, {});
      userVote = votes[userId] !== undefined ? votes[userId] : null;
    }

    res.json({ hasVoted, userVote });
  } catch (error) {
    console.error('Ошибка проверки статуса голосования:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка проверки статуса голосования' });
  }
});

// Завершить голосование и посчитать результаты
app.post('/api/votings/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`Завершение голосования ${id}`);
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const votingResponse = await axios.get(getRecordUrl(VOTINGS_TABLE, id), {
      headers: headers
    });

    const voting = votingResponse.data;
    if (!voting) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    const votes = safeJsonParse(voting.Votes, {});

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

    const updateData = {
      row: {
        Status: 'Completed',
        Results: JSON.stringify(results)
      }
    };

    const updateResponse = await axios.put(updateRecordUrl(VOTINGS_TABLE, id), updateData, {
      headers: headers
    });

    res.json({ success: true, results: results, voting: { id: updateResponse.data._id, fields: updateResponse.data } });
  } catch (error) {
    console.error('Ошибка завершения голосования:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка завершения голосования' });
  }
});

// Генерация изображения с результатами голосования
app.post('/api/votings/:id/generate-results', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`Генерация изображения результатов для голосования ${id}`);
    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const votingResponse = await axios.get(getRecordUrl(VOTINGS_TABLE, id), {
      headers: headers
    });

    const voting = votingResponse.data;
    if (!voting) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    if (!voting.Results) {
      return res.status(400).json({ error: 'Результаты голосования недоступны' });
    }

    let results = safeJsonParse(voting.Results, []);

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

    const optionImages = safeJsonParse(voting.OptionImages, []);
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
    
    let imageBuffer;
    try {
      imageBuffer = await sharp(svgBuffer)
        .resize(800, height, {
          fit: 'fill',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .jpeg({
          quality: 90,
          chromaSubsampling: '4:4:4'
        })
        .toBuffer();
    } catch (sharpError) {
      console.error('Ошибка генерации изображения sharp:', sharpError.message);
      throw new Error('Ошибка создания изображения результатов');
    }

    const uploadResult = await uploadToRadikal(
      imageBuffer,
      `voting_results_${id}_${Date.now()}.jpg`,
      'image/jpeg'
    );

    console.log('Изображение результатов загружено в Radikal API:', uploadResult.url);

    try {
      const updateData = {
        row: {
          ResultsImage: uploadResult.url
        }
      };
      const updateResponse = await axios.put(updateRecordUrl(VOTINGS_TABLE, id), updateData, {
        headers: headers
      });
      console.log('ResultsImage успешно сохранён в SeaTable:', updateResponse.data);
    } catch (updateError) {
      console.error('Ошибка сохранения ResultsImage в SeaTable:', updateError.message);
    }

    res.json({
      success: true,
      imageUrl: uploadResult.url,
      fileId: uploadResult.fileId
    });

  } catch (error) {
    console.error('Ошибка генерации изображения результатов:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка генерации изображения результатов' });
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

    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const eventResponse = await axios.get(getRecordUrl(EVENTS_TABLE, eventId), {
      headers: headers
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

    const updateResponse = await axios.put(updateRecordUrl(EVENTS_TABLE, eventId), updateData, {
      headers: headers
    });

    console.log('Обновление успешно:', updateResponse.data);
    res.json({ success: true, count: newCount, attending: true });

  } catch (error) {
    console.error('Ошибка участия:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка при регистрации на событие' });
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

    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const eventResponse = await axios.get(getRecordUrl(EVENTS_TABLE, eventId), {
      headers: headers
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

    const updateResponse = await axios.put(updateRecordUrl(EVENTS_TABLE, eventId), updateData, {
      headers: headers
    });

    console.log('Отказ от участия успешен');
    res.json({ success: true, count: newCount, attending: false });

  } catch (error) {
    console.error('Ошибка отказа от участия:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка при отмене участия' });
  }
});

// Проверяем статус участия пользователя
app.get('/api/events/:eventId/attend-status/:userId', async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    console.log(`Проверка статуса участия для пользователя ${userId} в событии ${eventId}`);

    const baseToken = await getValidatedToken();
    const headers = getSeatableHeaders(baseToken);
    
    const eventResponse = await axios.get(getRecordUrl(EVENTS_TABLE, eventId), {
      headers: headers
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
    console.error('Ошибка проверки статуса участия:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка проверки статуса участия' });
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

// Обработка несуществующих маршрутов
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

// Глобальный обработчик ошибок
app.use((error, req, res, next) => {
  console.error('Необработанная ошибка:', error);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
  console.log(`SeaTable Base UUID: ${SEATABLE_BASE_UUID}`);
  console.log(`URL Radikal API: ${RADIKAL_API_URL}`);
  console.log('Убедитесь, что переменные SEATABLE_API_TOKEN, SEATABLE_BASE_UUID и RADIKAL_API_KEY установлены в переменных окружения');
});