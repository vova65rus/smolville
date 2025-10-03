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

// ==================== SeaTable REST API функции ====================

// Получить заголовки для авторизации
function getSeaTableHeaders() {
  return {
    'Authorization': `Token ${SEATABLE_API_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

// Базовый URL для API
function getSeaTableBaseURL() {
  return `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-api/dtables/${SEATABLE_BASE_UUID}`;
}

// Получить все строки таблицы
async function listRows(tableName) {
  try {
    console.log(`Запрос строк таблицы ${tableName} из SeaTable...`);
    
    const response = await axios.get(
      `${getSeaTableBaseURL()}/rows/?table_name=${encodeURIComponent(tableName)}`,
      { 
        headers: getSeaTableHeaders(),
        timeout: 10000
      }
    );
    
    console.log(`Получено ${response.data.rows ? response.data.rows.length : 0} строк из таблицы ${tableName}`);
    return response.data.rows || [];
  } catch (error) {
    console.error(`Ошибка получения строк таблицы ${tableName}:`, error.message);
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные ответа:', error.response.data);
      
      // Попробуем альтернативный API endpoint
      if (error.response.status === 404) {
        console.log('Пробуем альтернативный endpoint...');
        return await listRowsAlternative(tableName);
      }
    }
    throw new Error(`Не удалось получить данные из таблицы ${tableName}: ${error.message}`);
  }
}

// Альтернативный метод для получения строк (старая версия API)
async function listRowsAlternative(tableName) {
  try {
    const response = await axios.get(
      `${SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${SEATABLE_BASE_UUID}/rows/?table_name=${encodeURIComponent(tableName)}`,
      { 
        headers: getSeaTableHeaders(),
        timeout: 10000
      }
    );
    
    console.log(`Альтернативный метод: получено ${response.data.rows ? response.data.rows.length : 0} строк`);
    return response.data.rows || [];
  } catch (error) {
    console.error(`Ошибка альтернативного метода для таблицы ${tableName}:`, error.message);
    throw error;
  }
}

// Получить конкретную строку
async function getRow(tableName, rowId) {
  try {
    const rows = await listRows(tableName);
    const row = rows.find(row => row._id === rowId || row.id === rowId) || null;
    
    if (!row) {
      console.log(`Строка ${rowId} не найдена в таблице ${tableName}`);
    }
    
    return row;
  } catch (error) {
    console.error(`Ошибка получения строки ${rowId} из таблицы ${tableName}:`, error.message);
    throw error;
  }
}

// Добавить строку
async function insertRow(tableName, rowData) {
  try {
    console.log(`Добавление строки в таблицу ${tableName}:`, JSON.stringify(rowData, null, 2));
    
    const response = await axios.post(
      `${getSeaTableBaseURL()}/rows/`,
      {
        table_name: tableName,
        row: rowData
      },
      { 
        headers: getSeaTableHeaders(),
        timeout: 10000
      }
    );
    
    console.log('Строка успешно добавлена:', response.data);
    return response.data;
  } catch (error) {
    console.error(`Ошибка добавления строки в таблицу ${tableName}:`, error.message);
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные ответа:', error.response.data);
    }
    throw error;
  }
}

// Обновить строку
async function updateRow(tableName, rowId, rowData) {
  try {
    console.log(`Обновление строки ${rowId} в таблице ${tableName}:`, JSON.stringify(rowData, null, 2));
    
    const response = await axios.put(
      `${getSeaTableBaseURL()}/rows/`,
      {
        table_name: tableName,
        row_id: rowId,
        row: rowData
      },
      { 
        headers: getSeaTableHeaders(),
        timeout: 10000
      }
    );
    
    console.log('Строка успешно обновлена:', response.data);
    return response.data;
  } catch (error) {
    console.error(`Ошибка обновления строки ${rowId} в таблице ${tableName}:`, error.message);
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные ответа:', error.response.data);
    }
    throw error;
  }
}

// Удалить строку
async function deleteRow(tableName, rowId) {
  try {
    console.log(`Удаление строки ${rowId} из таблицы ${tableName}`);
    
    await axios.delete(
      `${getSeaTableBaseURL()}/rows/`,
      {
        headers: getSeaTableHeaders(),
        data: {
          table_name: tableName,
          row_id: rowId
        },
        timeout: 10000
      }
    );
    
    console.log(`Строка ${rowId} успешно удалена`);
    return { success: true };
  } catch (error) {
    console.error(`Ошибка удаления строки ${rowId} из таблицы ${tableName}:`, error.message);
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные ответа:', error.response.data);
    }
    throw error;
  }
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

// Health check с проверкой SeaTable
app.get('/health', async (req, res) => {
  try {
    // Проверяем подключение к SeaTable
    const testData = await listRows(EVENTS_TABLE).catch(() => []);
    
    res.status(200).json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      seatable: {
        baseUUID: SEATABLE_BASE_UUID,
        server: SEATABLE_SERVER_URL,
        connected: true,
        tables: {
          events: testData.length
        }
      }
    });
  } catch (error) {
    res.status(200).json({ 
      status: 'DEGRADED', 
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      seatable: {
        baseUUID: SEATABLE_BASE_UUID,
        server: SEATABLE_SERVER_URL,
        connected: false,
        error: error.message
      },
      warning: 'SeaTable недоступен, но сервер работает'
    });
  }
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
    
    const rows = await listRows(EVENTS_TABLE);
    console.log('Данные событий получены:', rows.length, 'записей');
    
    res.json({ records: rows.map(row => ({ id: row._id, fields: row })) });
  } catch (error) {
    console.error('Ошибка GET /api/events:', error.message);
    res.status(500).json({ error: 'Ошибка загрузки событий: ' + error.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    console.log('Создание события с данными:', JSON.stringify(req.body, null, 2));
    
    const result = await insertRow(EVENTS_TABLE, req.body.fields);
    console.log('Событие создано:', result);
    
    res.json({ id: result._id, fields: result });
  } catch (error) {
    console.error('Ошибка POST /api/events:', error.message);
    res.status(500).json({ error: 'Ошибка создания события: ' + error.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    console.log(`Получен запрос к /api/events/${req.params.id}`);
    
    const row = await getRow(EVENTS_TABLE, req.params.id);
    
    if (!row) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }
    
    res.json({ id: row._id, fields: row });
  } catch (error) {
    console.error('Ошибка GET /api/events/:id:', error.message);
    res.status(500).json({ error: 'Ошибка получения события: ' + error.message });
  }
});

app.put('/api/events/:id', async (req, res) => {
  try {
    console.log('Обновление события с данными:', JSON.stringify(req.body, null, 2));
    
    const result = await updateRow(EVENTS_TABLE, req.params.id, req.body.fields);
    console.log('Событие обновлено:', result);
    
    res.json({ id: result._id, fields: result });
  } catch (error) {
    console.error('Ошибка PUT /api/events/:id:', error.message);
    res.status(500).json({ error: 'Ошибка обновления события: ' + error.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    console.log(`Удаление события ${req.params.id}`);
    
    await deleteRow(EVENTS_TABLE, req.params.id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка DELETE /api/events/:id:', error.message);
    res.status(500).json({ error: 'Ошибка удаления события: ' + error.message });
  }
});

// ==================== ADS API ====================

app.get('/api/ads', async (req, res) => {
  try {
    console.log(`Получен запрос к /api/ads, таблица: ${ADS_TABLE}`);
    
    const rows = await listRows(ADS_TABLE);
    console.log('Данные объявлений получены:', rows.length, 'записей');
    
    res.json({ records: rows.map(row => ({ id: row._id, fields: row })) });
  } catch (error) {
    console.error('Ошибка GET /api/ads:', error.message);
    res.status(500).json({ error: 'Ошибка загрузки объявлений: ' + error.message });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    console.log('Создание объявления с данными:', JSON.stringify(req.body, null, 2));
    
    const result = await insertRow(ADS_TABLE, req.body.fields);
    console.log('Объявление создано:', result);
    
    res.json({ id: result._id, fields: result });
  } catch (error) {
    console.error('Ошибка POST /api/ads:', error.message);
    res.status(500).json({ error: 'Ошибка создания объявления: ' + error.message });
  }
});

app.put('/api/ads/:id', async (req, res) => {
  try {
    console.log('Обновление объявления с данными:', JSON.stringify(req.body, null, 2));
    
    const result = await updateRow(ADS_TABLE, req.params.id, req.body.fields);
    console.log('Объявление обновлено:', result);
    
    res.json({ id: result._id, fields: result });
  } catch (error) {
    console.error('Ошибка PUT /api/ads/:id:', error.message);
    res.status(500).json({ error: 'Ошибка обновления объявления: ' + error.message });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    console.log(`Удаление объявления ${req.params.id}`);
    
    await deleteRow(ADS_TABLE, req.params.id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка DELETE /api/ads/:id:', error.message);
    res.status(500).json({ error: 'Ошибка удаления объявления: ' + error.message });
  }
});

// ==================== VOTINGS API ====================

app.get('/api/votings', async (req, res) => {
  try {
    console.log(`Получен запрос к /api/votings, таблица: ${VOTINGS_TABLE}`);
    
    const rows = await listRows(VOTINGS_TABLE);
    console.log('Данные голосований получены:', rows.length, 'записей');
    
    res.json({ records: rows.map(row => ({ id: row._id, fields: row })) });
  } catch (error) {
    console.error('Ошибка GET /api/votings:', error.message);
    res.status(500).json({ error: 'Ошибка загрузки голосований: ' + error.message });
  }
});

app.post('/api/votings', async (req, res) => {
  try {
    console.log('Создание голосования с данными:', JSON.stringify(req.body, null, 2));
    
    const result = await insertRow(VOTINGS_TABLE, req.body.fields);
    console.log('Голосование создано:', result);
    
    res.json({ id: result._id, fields: result });
  } catch (error) {
    console.error('Ошибка POST /api/votings:', error.message);
    res.status(500).json({ error: 'Ошибка создания голосования: ' + error.message });
  }
});

app.put('/api/votings/:id', async (req, res) => {
  try {
    console.log('Обновление голосования с данными:', JSON.stringify(req.body, null, 2));
    
    const result = await updateRow(VOTINGS_TABLE, req.params.id, req.body.fields);
    console.log('Голосование обновлено:', result);
    
    res.json({ id: result._id, fields: result });
  } catch (error) {
    console.error('Ошибка PUT /api/votings/:id:', error.message);
    res.status(500).json({ error: 'Ошибка обновления голосования: ' + error.message });
  }
});

app.delete('/api/votings/:id', async (req, res) => {
  try {
    console.log(`Удаление голосования ${req.params.id}`);
    
    await deleteRow(VOTINGS_TABLE, req.params.id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка DELETE /api/votings/:id:', error.message);
    res.status(500).json({ error: 'Ошибка удаления голосования: ' + error.message });
  }
});

// Получить голосования по ID мероприятия
app.get('/api/events/:eventId/votings', async (req, res) => {
  try {
    const { eventId } = req.params;
    console.log(`Получен запрос к /api/events/${eventId}/votings, таблица: ${VOTINGS_TABLE}`);
    
    const rows = await listRows(VOTINGS_TABLE);
    
    const filteredVotings = rows.filter(row => 
      row.EventID && row.EventID.toString() === eventId.toString()
    );
    
    console.log('Отфильтрованные голосования для события:', filteredVotings.length);
    res.json({ records: filteredVotings.map(row => ({ id: row._id, fields: row })) });
  } catch (error) {
    console.error('Ошибка GET /api/events/:eventId/votings:', error.message);
    res.status(500).json({ error: 'Ошибка загрузки голосований для события: ' + error.message });
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

    const voting = await getRow(VOTINGS_TABLE, id);

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
      Votes: JSON.stringify(currentVotes),
      VotedUserIDs: newVotedUserIDs
    };

    console.log('Обновление записи голосования:', JSON.stringify(updateData, null, 2));

    const updateResponse = await updateRow(VOTINGS_TABLE, id, updateData);

    console.log('Голосование успешно обновлено');
    res.json({ success: true, voting: { id: updateResponse._id, fields: updateResponse } });
  } catch (error) {
    console.error('Ошибка голосования:', error.message);
    res.status(500).json({ error: 'Ошибка при голосовании: ' + error.message });
  }
});

// Проверить статус голосования пользователя
app.get('/api/votings/:id/vote-status/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;

    console.log(`Проверка статуса голосования для пользователя ${userId}, ID голосования: ${id}`);
    const voting = await getRow(VOTINGS_TABLE, id);

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
    console.error('Ошибка проверки статуса голосования:', error.message);
    res.status(500).json({ error: 'Ошибка проверки статуса голосования: ' + error.message });
  }
});

// Завершить голосование и посчитать результаты
app.post('/api/votings/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`Завершение голосования ${id}`);
    const voting = await getRow(VOTINGS_TABLE, id);

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
      Status: 'Completed',
      Results: JSON.stringify(results)
    };

    const updateResponse = await updateRow(VOTINGS_TABLE, id, updateData);

    res.json({ success: true, results: results, voting: { id: updateResponse._id, fields: updateResponse } });
  } catch (error) {
    console.error('Ошибка завершения голосования:', error.message);
    res.status(500).json({ error: 'Ошибка завершения голосования: ' + error.message });
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

    const event = await getRow(EVENTS_TABLE, eventId);

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
      AttendeesIDs: newAttendees,
      AttendeesCount: newCount
    };

    console.log('Данные для обновления:', JSON.stringify(updateData, null, 2));

    const updateResponse = await updateRow(EVENTS_TABLE, eventId, updateData);

    console.log('Обновление успешно');
    res.json({ success: true, count: newCount, attending: true });

  } catch (error) {
    console.error('Ошибка участия:', error.message);
    res.status(500).json({ error: 'Ошибка при регистрации на событие: ' + error.message });
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

    const event = await getRow(EVENTS_TABLE, eventId);

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
      AttendeesIDs: newAttendees,
      AttendeesCount: newCount
    };

    const updateResponse = await updateRow(EVENTS_TABLE, eventId, updateData);

    console.log('Отказ от участия успешен');
    res.json({ success: true, count: newCount, attending: false });

  } catch (error) {
    console.error('Ошибка отказа от участия:', error.message);
    res.status(500).json({ error: 'Ошибка при отмене участия: ' + error.message });
  }
});

// Проверяем статус участия пользователя
app.get('/api/events/:eventId/attend-status/:userId', async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    console.log(`Проверка статуса участия для пользователя ${userId} в событии ${eventId}`);

    const event = await getRow(EVENTS_TABLE, eventId);

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
    res.status(500).json({ error: 'Ошибка проверки статуса участия: ' + error.message });
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
  console.log(`SeaTable Server URL: ${SEATABLE_SERVER_URL}`);
  console.log(`URL Radikal API: ${RADIKAL_API_URL}`);
  console.log('Проверка переменных окружения...');
  console.log('SEATABLE_API_TOKEN:', SEATABLE_API_TOKEN ? 'Установлен' : 'ОТСУТСТВУЕТ!');
  console.log('SEATABLE_BASE_UUID:', SEATABLE_BASE_UUID);
  console.log('RADIKAL_API_KEY:', RADIKAL_API_KEY ? 'Установлен' : 'ОТСУТСТВУЕТ!');
});