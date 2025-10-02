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
const EVENTS_TABLE = process.env.SEATABLE_EVENTS_TABLE_NAME || 'Events';
const ADS_TABLE = process.env.SEATABLE_ADS_TABLE_NAME || 'Ads';
const VOTINGS_TABLE = process.env.SEATABLE_VOTINGS_TABLE_NAME || 'Votings';

// Radikal API конфигурация
const RADIKAL_API_URL = 'https://radikal.cloud/api/1';
const RADIKAL_API_KEY = process.env.RADIKAL_API_KEY;

// Хардкод админа
const ADMIN_ID = 366825437;

if (!SEATABLE_API_TOKEN || !RADIKAL_API_KEY) {
  console.error('Отсутствуют переменные окружения: Установите SEATABLE_API_TOKEN и RADIKAL_API_KEY в Render');
  process.exit(1);
}

// Переменная для хранения Base UUID из токена
let SEATABLE_BASE_UUID = null;

// Функция для получения Base-Token и Base UUID
async function getBaseToken() {
  try {
    console.log('Попытка получить Base-Token с помощью GET...');
    const response = await axios.get(
      `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-access-token/`,
      {
        headers: {
          Authorization: `Bearer ${SEATABLE_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Base-Token успешно получен:', response.data.access_token);
    
    // Сохраняем Base UUID из ответа
    if (response.data.dtable_uuid) {
      SEATABLE_BASE_UUID = response.data.dtable_uuid;
      console.log('Base UUID получен из токена:', SEATABLE_BASE_UUID);
    } else {
      console.error('Base UUID не получен в ответе:', response.data);
      throw new Error('Не удалось получить Base UUID');
    }
    
    return response.data.access_token;
  } catch (error) {
    console.error('Ошибка при получении Base-Token с GET:', error.message);
    console.error('Детали ошибки:', error.response ? error.response.data : error.message);
    throw new Error('Не удалось получить Base-Token');
  }
}

// ПРАВИЛЬНЫЕ URL для SeaTable API v2.1
const getRecordsUrl = (tableName) => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/${SEATABLE_BASE_UUID}/rows/?table_name=${tableName}`;
const getRecordUrl = (tableName, rowId) => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/${SEATABLE_BASE_UUID}/rows/${rowId}/?table_name=${tableName}`;
const appendRecordsUrl = (tableName) => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/${SEATABLE_BASE_UUID}/rows/?table_name=${tableName}`;
const updateRecordUrl = (tableName, rowId) => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/${SEATABLE_BASE_UUID}/rows/${rowId}/?table_name=${tableName}`;
const deleteRecordUrl = (tableName, rowId) => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/${SEATABLE_BASE_UUID}/rows/${rowId}/?table_name=${tableName}`;
const getUploadLinkUrl = () => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-upload-link/`;

// Вспомогательная функция для получения токена с проверкой Base UUID
async function getValidatedToken() {
  if (!SEATABLE_BASE_UUID) {
    // Если Base UUID еще не получен, получаем токен (и UUID)
    return await getBaseToken();
  }
  // Если Base UUID уже есть, просто получаем свежий токен
  return await getBaseToken();
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
    seatableBaseUUID: SEATABLE_BASE_UUID
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
    const response = await axios.get(getRecordsUrl(EVENTS_TABLE), {
      headers: { Authorization: `Bearer ${baseToken}` }
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
    const response = await axios.post(appendRecordsUrl(EVENTS_TABLE), {
      rows: [req.body.fields]
    }, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
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
    const response = await axios.get(getRecordUrl(EVENTS_TABLE, req.params.id), {
      headers: { Authorization: `Bearer ${baseToken}` }
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
    const response = await axios.put(updateRecordUrl(EVENTS_TABLE, req.params.id), {
      row: req.body.fields
    }, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
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
    await axios.delete(deleteRecordUrl(EVENTS_TABLE, req.params.id), {
      headers: { Authorization: `Bearer ${baseToken}` }
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
    const response = await axios.get(getRecordsUrl(ADS_TABLE), {
      headers: { Authorization: `Bearer ${baseToken}` }
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
    const response = await axios.post(appendRecordsUrl(ADS_TABLE), {
      rows: [req.body.fields]
    }, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
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
    const response = await axios.put(updateRecordUrl(ADS_TABLE, req.params.id), {
      row: req.body.fields
    }, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
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
    await axios.delete(deleteRecordUrl(ADS_TABLE, req.params.id), {
      headers: { Authorization: `Bearer ${baseToken}` }
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
    const response = await axios.get(getRecordsUrl(VOTINGS_TABLE), {
      headers: { Authorization: `Bearer ${baseToken}` }
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
    const response = await axios.post(appendRecordsUrl(VOTINGS_TABLE), {
      rows: [req.body.fields]
    }, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
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
    const response = await axios.put(updateRecordUrl(VOTINGS_TABLE, req.params.id), {
      row: req.body.fields
    }, {
      headers: {
        Authorization: `Bearer ${baseToken}`,
        'Content-Type': 'application/json'
      }
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
    await axios.delete(deleteRecordUrl(VOTINGS_TABLE, req.params.id), {
      headers: { Authorization: `Bearer ${baseToken}` }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка DELETE /api/votings/:id:', error.message, error.response?.data || {});
    res.status(500).json({ error: 'Ошибка удаления голосования' });
  }
});

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
  console.log(`URL Radikal API: ${RADIKAL_API_URL}`);
  console.log('Убедитесь, что переменные SEATABLE_API_TOKEN и RADIKAL_API_KEY установлены в переменных окружения');
});