const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

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
const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN || '622c69aab356a1e53f3994f234c1e4a98f77f656';
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
  console.error('Отсутствуют обязательные переменные окружения');
  process.exit(1);
}

// ==================== SeaTable API по документации ====================

class SeaTableAPI {
  constructor(serverUrl, apiToken, baseUUID) {
    this.baseURL = `${serverUrl}/api/v2.1/dtable/app-api/${baseUUID}`;
    this.apiToken = apiToken;
  }

  getHeaders() {
    return {
      'Authorization': `Token ${this.apiToken}`,
      'Content-Type': 'application/json'
    };
  }

  async makeRequest(method, endpoint, data = null) {
    try {
      const url = `${this.baseURL}${endpoint}`;
      console.log(`SeaTable API: ${method} ${url}`);
      
      const config = {
        method,
        url,
        headers: this.getHeaders(),
        timeout: 15000
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      console.log(`✅ SeaTable API успешно: ${method} ${endpoint}`);
      return response.data;
      
    } catch (error) {
      console.error(`❌ SeaTable API ошибка (${method} ${endpoint}):`, error.message);
      
      if (error.response) {
        console.error('Статус:', error.response.status);
        console.error('Данные:', error.response.data);
        
        // Если получаем HTML - это явная ошибка конфигурации
        if (error.response.data && typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE html>')) {
          throw new Error('SeaTable возвращает HTML страницу. Проверьте API токен и Base UUID!');
        }
        
        if (error.response.status === 403) {
          throw new Error('Доступ запрещен. Проверьте API токен.');
        }
        if (error.response.status === 404) {
          throw new Error('Ресурс не найден. Проверьте Base UUID и название таблицы.');
        }
      }
      
      throw error;
    }
  }

  // Получить все строки таблицы
  async listRows(tableName) {
    return this.makeRequest('GET', `/rows/?table_name=${encodeURIComponent(tableName)}`);
  }

  // Добавить строку
  async insertRow(tableName, rowData) {
    return this.makeRequest('POST', '/rows/', {
      table_name: tableName,
      row: rowData
    });
  }

  // Обновить строку
  async updateRow(tableName, rowId, rowData) {
    return this.makeRequest('PUT', '/rows/', {
      table_name: tableName,
      row_id: rowId,
      row: rowData
    });
  }

  // Удалить строку
  async deleteRow(tableName, rowId) {
    return this.makeRequest('DELETE', '/rows/', {
      table_name: tableName,
      row_id: rowId
    });
  }
}

// Инициализация API клиента
const seatableAPI = new SeaTableAPI(SEATABLE_SERVER_URL, SEATABLE_API_TOKEN, SEATABLE_BASE_UUID);

// Вспомогательные функции
function safeJsonParse(str, defaultValue = {}) {
  try {
    if (typeof str === 'string') {
      return JSON.parse(str);
    }
    return str || defaultValue;
  } catch (error) {
    return defaultValue;
  }
}

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

// ==================== API ЭНДПОИНТЫ ====================

app.get('/', (req, res) => {
  res.send('Бэкенд Smolville запущен!');
});

// Проверка подключения к SeaTable
app.get('/api/debug/connection', async (req, res) => {
  try {
    console.log('🔍 Проверка подключения к SeaTable...');
    
    // Пробуем получить базовую информацию
    const testData = await seatableAPI.listRows(EVENTS_TABLE);
    
    res.json({
      success: true,
      message: '✅ Подключение к SeaTable успешно',
      details: {
        baseUUID: SEATABLE_BASE_UUID,
        tables: {
          events: testData.rows ? testData.rows.length : 0,
          ads: 'не проверено',
          votings: 'не проверено'
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: {
        baseURL: `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-api/${SEATABLE_BASE_UUID}`,
        apiToken: SEATABLE_API_TOKEN ? 'установлен' : 'отсутствует',
        baseUUID: SEATABLE_BASE_UUID
      },
      troubleshooting: [
        'Проверьте API токен в настройках SeaTable',
        'Убедитесь, что Base UUID правильный',
        'Проверьте, что таблицы существуют в базе'
      ]
    });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await seatableAPI.listRows(EVENTS_TABLE);
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      seatable: { connected: true }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== EVENTS API ====================

app.get('/api/events', async (req, res) => {
  try {
    const data = await seatableAPI.listRows(EVENTS_TABLE);
    res.json({ 
      records: data.rows.map(row => ({ id: row._id, fields: row }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const result = await seatableAPI.insertRow(EVENTS_TABLE, req.body.fields);
    res.json({ id: result._id, fields: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const data = await seatableAPI.listRows(EVENTS_TABLE);
    const row = data.rows.find(r => r._id === req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }
    res.json({ id: row._id, fields: row });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/events/:id', async (req, res) => {
  try {
    const result = await seatableAPI.updateRow(EVENTS_TABLE, req.params.id, req.body.fields);
    res.json({ id: result._id, fields: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    await seatableAPI.deleteRow(EVENTS_TABLE, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADS API ====================

app.get('/api/ads', async (req, res) => {
  try {
    const data = await seatableAPI.listRows(ADS_TABLE);
    res.json({ 
      records: data.rows.map(row => ({ id: row._id, fields: row }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    const result = await seatableAPI.insertRow(ADS_TABLE, req.body.fields);
    res.json({ id: result._id, fields: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/ads/:id', async (req, res) => {
  try {
    const result = await seatableAPI.updateRow(ADS_TABLE, req.params.id, req.body.fields);
    res.json({ id: result._id, fields: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    await seatableAPI.deleteRow(ADS_TABLE, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== VOTINGS API ====================

app.get('/api/votings', async (req, res) => {
  try {
    const data = await seatableAPI.listRows(VOTINGS_TABLE);
    res.json({ 
      records: data.rows.map(row => ({ id: row._id, fields: row }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/votings', async (req, res) => {
  try {
    const result = await seatableAPI.insertRow(VOTINGS_TABLE, req.body.fields);
    res.json({ id: result._id, fields: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/votings/:id', async (req, res) => {
  try {
    const result = await seatableAPI.updateRow(VOTINGS_TABLE, req.params.id, req.body.fields);
    res.json({ id: result._id, fields: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/votings/:id', async (req, res) => {
  try {
    await seatableAPI.deleteRow(VOTINGS_TABLE, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Получить голосования по ID мероприятия
app.get('/api/events/:eventId/votings', async (req, res) => {
  try {
    const data = await seatableAPI.listRows(VOTINGS_TABLE);
    const filteredVotings = data.rows.filter(row => 
      row.EventID && row.EventID.toString() === req.params.eventId.toString()
    );
    res.json({ 
      records: filteredVotings.map(row => ({ id: row._id, fields: row }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== UPLOAD API ====================

async function uploadToRadikal(fileBuffer, filename, contentType = 'image/jpeg') {
  try {
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

    const imageData = response.data.image || response.data;
    
    if (response.data.status_code === 200 || response.data.status === 200 || imageData) {
      const url = imageData.url || imageData.image_url;
      const fileId = imageData.id_encoded || imageData.name || imageData.id;
      
      if (!url) {
        throw new Error('URL не получен от Radikal API');
      }
      
      return { fileId, url, filename };
    } else {
      throw new Error(response.data.error ? response.data.error.message : 'Ошибка загрузки');
    }
  } catch (error) {
    console.error('Ошибка загрузки в Radikal API:', error.message);
    throw error;
  }
}

app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Изображение не загружено' });
    }
    
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    
    const uploadResult = await uploadToRadikal(
      fileBuffer,
      req.file.originalname || `upload_${Date.now()}.jpg`,
      req.file.mimetype
    );
    
    // Очистка временного файла
    try {
      fs.unlinkSync(filePath);
    } catch (unlinkError) {
      console.error('Ошибка удаления временного файла:', unlinkError.message);
    }
    
    res.json({ 
      url: uploadResult.url,
      fileId: uploadResult.fileId
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

// ==================== ADMIN API ====================

app.get('/api/is-admin', (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const isAdmin = userId === ADMIN_ID;
  res.json({ isAdmin });
});

// Обработка несуществующих маршрутов
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

// Запуск сервера
app.listen(port, () => {
  console.log(`🚀 Сервер запущен на порту ${port}`);
  console.log(`🔗 SeaTable Base URL: ${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-api/${SEATABLE_BASE_UUID}`);
  console.log(`🔑 API Token: ${SEATABLE_API_TOKEN.substring(0, 8)}...`);
  console.log(`📸 Radikal API: ${RADIKAL_API_KEY ? 'Установлен' : 'ОТСУТСТВУЕТ!'}`);
  console.log('');
  console.log('📋 Для диагностики подключения откройте:');
  console.log(`   http://localhost:${port}/api/debug/connection`);
  console.log('');
  console.log('⚡ Основные endpoints:');
  console.log('   GET  /api/events');
  console.log('   GET  /api/ads');
  console.log('   GET  /api/votings');
  console.log('   POST /api/upload');
});