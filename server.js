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

// Env vars - ИСПОЛЬЗУЕМ НОВЫЙ ТОКЕН!
const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN || 'a59ff211027552fe077f2a1baed66d831cf96cbf';
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

// ==================== SeaTable API ====================

class SeaTableAPI {
  constructor(serverUrl, apiToken, baseUUID) {
    this.baseURL = `${serverUrl}/api/v2.1/dtable/app-api/${baseUUID}`;
    this.apiToken = apiToken;
    this.baseUUID = baseUUID;
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
      console.log(`🌊 SeaTable API: ${method} ${url}`);
      
      const config = {
        method,
        url,
        headers: this.getHeaders(),
        timeout: 10000
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      console.log(`✅ SeaTable API успешно: ${method} ${endpoint}`);
      return response.data;
      
    } catch (error) {
      console.error(`❌ SeaTable API ошибка:`, error.message);
      
      if (error.response) {
        console.error('Статус:', error.response.status);
        
        if (error.response.data && typeof error.response.data === 'string') {
          console.error('Ответ:', error.response.data.substring(0, 200));
        } else {
          console.error('Данные:', error.response.data);
        }
      }
      
      throw error;
    }
  }

  async listRows(tableName) {
    return this.makeRequest('GET', `/rows/?table_name=${encodeURIComponent(tableName)}`);
  }

  async insertRow(tableName, rowData) {
    return this.makeRequest('POST', '/rows/', {
      table_name: tableName,
      row: rowData
    });
  }

  async updateRow(tableName, rowId, rowData) {
    return this.makeRequest('PUT', '/rows/', {
      table_name: tableName,
      row_id: rowId,
      row: rowData
    });
  }

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

// ==================== ДИАГНОСТИКА И ТЕСТ ====================

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Smolville Backend - ТЕСТ</title></head>
      <body>
        <h1>🚀 Smolville Backend - ФИНАЛЬНЫЙ ТЕСТ</h1>
        <p><strong>API Token:</strong> ${SEATABLE_API_TOKEN.substring(0, 8)}...</p>
        <p><strong>Base UUID:</strong> ${SEATABLE_BASE_UUID}</p>
        
        <h2>Тестирование:</h2>
        <ul>
          <li><a href="/api/test-connection">/api/test-connection</a> - Тест подключения</li>
          <li><a href="/api/events">/api/events</a> - Список событий</li>
          <li><a href="/api/ads">/api/ads</a> - Список объявлений</li>
          <li><a href="/api/votings">/api/votings</a> - Список голосований</li>
        </ul>

        <h2>Если все работает:</h2>
        <p>Обновите переменные в Render:</p>
        <pre>
SEATABLE_API_TOKEN=a59ff211027552fe077f2a1baed66d831cf96cbf
SEATABLE_BASE_UUID=1e24960e-ac5a-43b6-8269-e6376b16577a
RADIKAL_API_KEY=ваш_ключ_radikal
        </pre>
      </body>
    </html>
  `);
});

// Тест подключения
app.get('/api/test-connection', async (req, res) => {
  try {
    console.log('🧪 ФИНАЛЬНЫЙ ТЕСТ ПОДКЛЮЧЕНИЯ...');
    
    const tables = [EVENTS_TABLE, ADS_TABLE, VOTINGS_TABLE];
    const results = {};

    for (const table of tables) {
      try {
        const data = await seatableAPI.listRows(table);
        results[table] = {
          success: true,
          count: data.rows ? data.rows.length : 0,
          sample: data.rows ? data.rows.slice(0, 2) : []
        };
        console.log(`✅ ${table}: ${data.rows ? data.rows.length : 0} записей`);
      } catch (error) {
        results[table] = {
          success: false,
          error: error.message
        };
        console.log(`❌ ${table}: ${error.message}`);
      }
    }

    const allSuccess = Object.values(results).every(r => r.success);
    
    res.json({
      success: allSuccess,
      message: allSuccess ? '🎉 ВСЕ ТАБЛИЦЫ РАБОТАЮТ! ПРИЛОЖЕНИЕ ГОТОВО!' : 'Есть проблемы с некоторыми таблицами',
      results: results,
      config: {
        apiToken: `${SEATABLE_API_TOKEN.substring(0, 8)}...`,
        baseUUID: SEATABLE_BASE_UUID,
        tables: tables
      }
    });

  } catch (error) {
    console.error('❌ Критическая ошибка теста:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      troubleshooting: [
        'Проверьте что API токен создан для базы Smolville',
        'Убедитесь что Base UUID правильный',
        'Проверьте что таблицы существуют в базе'
      ]
    });
  }
});

// ==================== EVENTS API ====================

app.get('/api/events', async (req, res) => {
  try {
    const data = await seatableAPI.listRows(EVENTS_TABLE);
    res.json({ 
      success: true,
      records: data.rows.map(row => ({ id: row._id, fields: row }))
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const result = await seatableAPI.insertRow(EVENTS_TABLE, req.body.fields);
    res.json({ 
      success: true,
      id: result._id, 
      fields: result 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const data = await seatableAPI.listRows(EVENTS_TABLE);
    const row = data.rows.find(r => r._id === req.params.id);
    if (!row) {
      return res.status(404).json({ 
        success: false,
        error: 'Событие не найдено' 
      });
    }
    res.json({ 
      success: true,
      id: row._id, 
      fields: row 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.put('/api/events/:id', async (req, res) => {
  try {
    const result = await seatableAPI.updateRow(EVENTS_TABLE, req.params.id, req.body.fields);
    res.json({ 
      success: true,
      id: result._id, 
      fields: result 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    await seatableAPI.deleteRow(EVENTS_TABLE, req.params.id);
    res.json({ 
      success: true 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ==================== ADS API ====================

app.get('/api/ads', async (req, res) => {
  try {
    const data = await seatableAPI.listRows(ADS_TABLE);
    res.json({ 
      success: true,
      records: data.rows.map(row => ({ id: row._id, fields: row }))
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    const result = await seatableAPI.insertRow(ADS_TABLE, req.body.fields);
    res.json({ 
      success: true,
      id: result._id, 
      fields: result 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.put('/api/ads/:id', async (req, res) => {
  try {
    const result = await seatableAPI.updateRow(ADS_TABLE, req.params.id, req.body.fields);
    res.json({ 
      success: true,
      id: result._id, 
      fields: result 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    await seatableAPI.deleteRow(ADS_TABLE, req.params.id);
    res.json({ 
      success: true 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ==================== VOTINGS API ====================

app.get('/api/votings', async (req, res) => {
  try {
    const data = await seatableAPI.listRows(VOTINGS_TABLE);
    res.json({ 
      success: true,
      records: data.rows.map(row => ({ id: row._id, fields: row }))
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/votings', async (req, res) => {
  try {
    const result = await seatableAPI.insertRow(VOTINGS_TABLE, req.body.fields);
    res.json({ 
      success: true,
      id: result._id, 
      fields: result 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.put('/api/votings/:id', async (req, res) => {
  try {
    const result = await seatableAPI.updateRow(VOTINGS_TABLE, req.params.id, req.body.fields);
    res.json({ 
      success: true,
      id: result._id, 
      fields: result 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.delete('/api/votings/:id', async (req, res) => {
  try {
    await seatableAPI.deleteRow(VOTINGS_TABLE, req.params.id);
    res.json({ 
      success: true 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
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
      return res.status(400).json({ 
        success: false,
        error: 'Изображение не загружено' 
      });
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
      success: true,
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
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ==================== ADMIN API ====================

app.get('/api/is-admin', (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const isAdmin = userId === ADMIN_ID;
  res.json({ 
    success: true,
    isAdmin 
  });
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await seatableAPI.listRows(EVENTS_TABLE);
    res.json({ 
      success: true,
      status: 'OK', 
      timestamp: new Date().toISOString(),
      seatable: { connected: true }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      status: 'ERROR', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${port}`);
  console.log(`🎉 ИСПОЛЬЗУЕМ НОВЫЙ API ТОКЕН!`);
  console.log(`🔗 Base UUID: ${SEATABLE_BASE_UUID}`);
  console.log(`🔑 API Token: ${SEATABLE_API_TOKEN.substring(0, 8)}...`);
  console.log('');
  console.log('📋 ТЕСТИРУЙТЕ ПОДКЛЮЧЕНИЕ:');
  console.log(`   https://your-render-url.onrender.com/api/test-connection`);
});
