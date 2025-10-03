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

// ==================== КОНФИГУРАЦИЯ ====================

const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN;
const SEATABLE_BASE_UUID = '1e24960e-ac5a-43b6-8269-e6376b16577a'; // Ваш UUID базы
const SEATABLE_SERVER_URL = 'https://cloud.seatable.io';
const EVENTS_TABLE = 'Events';
const ADS_TABLE = 'Ads'; 
const VOTINGS_TABLE = 'Votings';
const RADIKAL_API_URL = 'https://radikal.cloud/api/1';
const RADIKAL_API_KEY = process.env.RADIKAL_API_KEY;
const ADMIN_ID = 366825437;

// ==================== SeaTable API ====================

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
        console.error('Данные:', error.response.data);
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

// ==================== ГЛАВНАЯ СТРАНИЦА ====================

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Smolville - ФИНАЛЬНАЯ НАСТРОЙКА</title></head>
      <body>
        <h1>🔧 ФИНАЛЬНАЯ НАСТРОЙКА SMOLVILLE</h1>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <h2 style="color: #2e7d32;">✅ БАЗА И ТАБЛИЦЫ ГОТОВЫ!</h2>
          <p><strong>UUID базы:</strong> ${SEATABLE_BASE_UUID}</p>
          <p><strong>Таблицы:</strong> Events, Ads, Votings (по 0 записей)</p>
        </div>

        <h2>🎯 СОЗДАЙТЕ API ТОКЕН ПРАВИЛЬНО:</h2>
        
        <div style="border: 2px solid #2196f3; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3>Шаг 1: Откройте таблицу</h3>
          <p>Откройте любую таблицу в базе Smolville:</p>
          <ul>
            <li><a href="https://cloud.seatable.io/workspace/89387/dtable/Smolville/?tid=0DSB&vid=0000" target="_blank">Таблица Events</a></li>
            <li><a href="https://cloud.seatable.io/workspace/89387/dtable/Smolville/?tid=ZV18&vid=0000" target="_blank">Таблица Votings</a></li>
            <li><a href="https://cloud.seatable.io/workspace/89387/dtable/Smolville/?tid=Gf71&vid=0000" target="_blank">Таблица Ads</a></li>
          </ul>
        </div>

        <div style="border: 2px solid #4caf50; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3>Шаг 2: Создайте API токен</h3>
          <ol>
            <li>В открытой таблице нажмите на <strong>шестеренку</strong> рядом с названием таблицы</li>
            <li>Выберите <strong>"Внешние приложения"</strong></li>
            <li>Нажмите <strong>"API токен"</strong></li>
            <li>Нажмите <strong>"Создать новый API токен"</strong></li>
            <li>Скопируйте токен</li>
          </ol>
        </div>

        <div style="border: 2px solid #ff9800; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3>Шаг 3: Протестируйте токен</h3>
          <form action="/api/test-token" method="get" style="margin: 10px 0;">
            <input type="text" name="token" placeholder="Введите ваш новый API токен" 
                   style="width: 400px; padding: 10px; font-size: 16px;" required>
            <button type="submit" style="padding: 10px 20px; font-size: 16px;">Тестировать</button>
          </form>
          <p>Или: <a href="/api/test-current">Проверить текущий токен</a></p>
        </div>

        <div style="border: 2px solid #9c27b0; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3>Шаг 4: Добавьте тестовые данные</h3>
          <p>После успешного теста:</p>
          <ul>
            <li><a href="/api/add-test-data">Добавить тестовые данные автоматически</a></li>
            <li>Или добавьте данные вручную через интерфейс SeaTable</li>
          </ul>
        </div>

        <h3>📊 Статус:</h3>
        <ul>
          <li><a href="/api/status">Проверить статус базы</a></li>
          <li><a href="/health">Health check</a></li>
        </ul>
      </body>
    </html>
  `);
});

// ==================== API ЭНДПОИНТЫ ====================

// Тест текущего токена из переменных окружения
app.get('/api/test-current', async (req, res) => {
  if (!SEATABLE_API_TOKEN) {
    return res.json({
      success: false,
      error: 'SEATABLE_API_TOKEN не установлен в Render'
    });
  }

  try {
    const seatableAPI = new SeaTableAPI(SEATABLE_SERVER_URL, SEATABLE_API_TOKEN, SEATABLE_BASE_UUID);
    const data = await seatableAPI.listRows(EVENTS_TABLE);
    
    res.json({
      success: true,
      message: '✅ ТЕКУЩИЙ ТОКЕН РАБОТАЕТ!',
      eventsCount: data.rows ? data.rows.length : 0,
      config: {
        token: `${SEATABLE_API_TOKEN.substring(0, 8)}...`,
        uuid: SEATABLE_BASE_UUID
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      instructions: [
        'Текущий токен не работает',
        'Создайте новый API токен следуя инструкции на главной странице',
        'Обновите SEATABLE_API_TOKEN в Render'
      ]
    });
  }
});

// Тест с ручным вводом токена
app.get('/api/test-token', async (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.json({
      error: 'Укажите токен: /api/test-token?token=ВАШ_ТОКЕН'
    });
  }

  try {
    const seatableAPI = new SeaTableAPI(SEATABLE_SERVER_URL, token, SEATABLE_BASE_UUID);
    const data = await seatableAPI.listRows(EVENTS_TABLE);
    
    res.json({
      success: true,
      message: '✅ НОВЫЙ ТОКЕН РАБОТАЕТ!',
      eventsCount: data.rows ? data.rows.length : 0,
      config: {
        token: `${token.substring(0, 8)}...`,
        uuid: SEATABLE_BASE_UUID
      },
      nextSteps: [
        `Установите в Render: SEATABLE_API_TOKEN=${token}`,
        'Перезапустите приложение',
        'Добавьте тестовые данные'
      ]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      instructions: [
        'Токен не работает. Создайте новый:',
        '1. Откройте таблицу Events, Ads или Votings',
        '2. Шестеренка → Внешние приложения → API токен',
        '3. Создайте новый токен',
        '4. Протестируйте снова'
      ]
    });
  }
});

// Добавление тестовых данных
app.get('/api/add-test-data', async (req, res) => {
  const token = req.query.token || SEATABLE_API_TOKEN;

  if (!token) {
    return res.json({
      error: 'Укажите токен: /api/add-test-data?token=ВАШ_ТОКЕН'
    });
  }

  try {
    const seatableAPI = new SeaTableAPI(SEATABLE_SERVER_URL, token, SEATABLE_BASE_UUID);
    const results = {};

    // Тестовое событие
    try {
      const event = await seatableAPI.insertRow(EVENTS_TABLE, {
        'Название': 'Фестиваль Smolville',
        'Описание': 'Главное мероприятие года в Smolville',
        'Дата': '2024-10-15',
        'Местоположение': 'Центральная площадь',
        'AttendeesCount': 0,
        'AttendeesIDs': '',
        'Изображение': ''
      });
      results.events = { success: true, id: event._id };
    } catch (error) {
      results.events = { success: false, error: error.message };
    }

    // Тестовое объявление
    try {
      const ad = await seatableAPI.insertRow(ADS_TABLE, {
        'Заголовок': 'Добро пожаловать в Smolville!',
        'Текст': 'Присоединяйтесь к нашему сообществу',
        'Дата начала': '2024-10-01',
        'Дата окончания': '2024-12-31',
        'Активно': true
      });
      results.ads = { success: true, id: ad._id };
    } catch (error) {
      results.ads = { success: false, error: error.message };
    }

    // Тестовое голосование
    try {
      const voting = await seatableAPI.insertRow(VOTINGS_TABLE, {
        'Вопрос': 'Что улучшить в Smolville?',
        'Варианты': 'Парки,Дороги,Освещение,Мероприятия',
        'Статус': 'Active',
        'Votes': '{}',
        'VotedUserIDs': '',
        'EventID': ''
      });
      results.votings = { success: true, id: voting._id };
    } catch (error) {
      results.votings = { success: false, error: error.message };
    }

    res.json({
      message: 'Добавление тестовых данных завершено',
      results: results,
      success: Object.values(results).every(r => r.success)
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Статус базы
app.get('/api/status', async (req, res) => {
  const token = req.query.token || SEATABLE_API_TOKEN;

  if (!token) {
    return res.json({
      error: 'Укажите токен: /api/status?token=ВАШ_ТОКЕН'
    });
  }

  try {
    const seatableAPI = new SeaTableAPI(SEATABLE_SERVER_URL, token, SEATABLE_BASE_UUID);
    const tables = [EVENTS_TABLE, ADS_TABLE, VOTINGS_TABLE];
    const status = {};

    for (const table of tables) {
      try {
        const data = await seatableAPI.listRows(table);
        status[table] = {
          exists: true,
          rowCount: data.rows ? data.rows.length : 0,
          columns: data.rows && data.rows.length > 0 ? Object.keys(data.rows[0]) : []
        };
      } catch (error) {
        status[table] = {
          exists: false,
          error: error.message
        };
      }
    }

    res.json({
      baseUUID: SEATABLE_BASE_UUID,
      status: status,
      token: `${token.substring(0, 8)}...`
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'READY',
    baseUUID: SEATABLE_BASE_UUID,
    hasApiToken: !!SEATABLE_API_TOKEN,
    timestamp: new Date().toISOString()
  });
});

// ==================== ОСНОВНЫЕ API (будут работать после настройки токена) ====================

app.get('/api/events', async (req, res) => {
  if (!SEATABLE_API_TOKEN) {
    return res.status(500).json({ error: 'API токен не настроен' });
  }

  try {
    const seatableAPI = new SeaTableAPI(SEATABLE_SERVER_URL, SEATABLE_API_TOKEN, SEATABLE_BASE_UUID);
    const data = await seatableAPI.listRows(EVENTS_TABLE);
    res.json({ 
      records: data.rows.map(row => ({ id: row._id, fields: row }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ads', async (req, res) => {
  if (!SEATABLE_API_TOKEN) {
    return res.status(500).json({ error: 'API токен не настроен' });
  }

  try {
    const seatableAPI = new SeaTableAPI(SEATABLE_SERVER_URL, SEATABLE_API_TOKEN, SEATABLE_BASE_UUID);
    const data = await seatableAPI.listRows(ADS_TABLE);
    res.json({ 
      records: data.rows.map(row => ({ id: row._id, fields: row }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/votings', async (req, res) => {
  if (!SEATABLE_API_TOKEN) {
    return res.status(500).json({ error: 'API токен не настроен' });
  }

  try {
    const seatableAPI = new SeaTableAPI(SEATABLE_SERVER_URL, SEATABLE_API_TOKEN, SEATABLE_BASE_UUID);
    const data = await seatableAPI.listRows(VOTINGS_TABLE);
    res.json({ 
      records: data.rows.map(row => ({ id: row._id, fields: row }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload endpoint
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Изображение не загружено' });
    }
    
    if (!RADIKAL_API_KEY) {
      return res.status(500).json({ error: 'RADIKAL_API_KEY не установлен' });
    }
    
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    
    const formData = new FormData();
    formData.append('source', fileBuffer, {
      filename: req.file.originalname || `upload_${Date.now()}.jpg`,
      contentType: req.file.mimetype
    });

    const response = await axios.post(`${RADIKAL_API_URL}/upload`, formData, {
      headers: {
        'X-API-Key': RADIKAL_API_KEY,
        ...formData.getHeaders(),
      },
      timeout: 30000
    });

    const imageData = response.data.image || response.data;
    const url = imageData.url || imageData.image_url;
    
    if (!url) {
      throw new Error('URL не получен от Radikal API');
    }

    // Очистка временного файла
    try {
      fs.unlinkSync(filePath);
    } catch (unlinkError) {
      console.error('Ошибка удаления временного файла:', unlinkError.message);
    }
    
    res.json({ 
      url: url,
      fileId: imageData.id_encoded || imageData.name
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

app.get('/api/is-admin', (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const isAdmin = userId === ADMIN_ID;
  res.json({ isAdmin });
});

app.listen(port, () => {
  console.log(`🚀 СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${port}`);
  console.log(`🔗 UUID базы: ${SEATABLE_BASE_UUID}`);
  console.log(`🔑 Токен: ${SEATABLE_API_TOKEN ? 'установлен' : 'НЕ УСТАНОВЛЕН'}`);
  console.log('');
  console.log('📋 ИНСТРУКЦИЯ:');
  console.log('1. Откройте главную страницу');
  console.log('2. Создайте API токен для таблицы');
  console.log('3. Протестируйте токен');
  console.log('4. Обновите SEATABLE_API_TOKEN в Render');
});
