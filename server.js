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
    fileSize: 10 * 1024 * 1024, // 10MB лимит
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

// Функция для получения Base-Token
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
    return response.data.access_token;
  } catch (error) {
    console.error('Ошибка при получении Base-Token с GET:', error.message);
    console.error('Детали ошибки:', error.response ? error.response.data : error.message);
    throw new Error('Не удалось получить Base-Token');
  }
}

// Правильные URL для SeaTable API v2.1
const getRecordsUrl = (tableName) => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-tables/${SEATABLE_BASE_UUID}/rows/?table_name=${tableName}`;
const getRecordUrl = (tableName, rowId) => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-tables/${SEATABLE_BASE_UUID}/rows/${rowId}/?table_name=${tableName}`;
const appendRecordsUrl = (tableName) => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-tables/${SEATABLE_BASE_UUID}/rows/?table_name=${tableName}`;
const updateRecordUrl = (tableName, rowId) => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-tables/${SEATABLE_BASE_UUID}/rows/${rowId}/?table_name=${tableName}`;
const deleteRecordUrl = (tableName, rowId) => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-tables/${SEATABLE_BASE_UUID}/rows/${rowId}/?table_name=${tableName}`;
const getUploadLinkUrl = () => `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-upload-link/`;

// Вспомогательная функция для получения токена
async function getValidatedToken() {
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
    version: '1.0.0'
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

// Остальные функции Radikal API и endpoints остаются без изменений...

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

// Остальные endpoints для VOTINGS, UPLOAD и других функций остаются без изменений...

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
  console.log(`SeaTable Base UUID: ${SEATABLE_BASE_UUID}`);
  console.log(`URL Radikal API: ${RADIKAL_API_URL}`);
  console.log('Убедитесь, что переменные SEATABLE_API_TOKEN, SEATABLE_BASE_UUID и RADIKAL_API_KEY установлены в переменных окружения');
});