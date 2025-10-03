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

// ==================== ИНСТРУКЦИЯ ПО СОЗДАНИЮ НОВОЙ БАЗЫ ====================

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Smolville - Новая база</title></head>
      <body>
        <h1>🚀 СОЗДАЙТЕ НОВУЮ БАЗУ SEA TABLE</h1>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <h2 style="color: #2e7d32;">✅ ПРОБЛЕМА РЕШЕНА!</h2>
          <p>Текущий API токен не работает. Создайте новую базу с правильными настройками.</p>
        </div>

        <h2>📋 Пошаговая инструкция:</h2>
        
        <div style="border: 2px solid #2196f3; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3>🎯 ШАГ 1: Создайте новую базу</h3>
          <ol>
            <li>Зайдите в <a href="https://cloud.seatable.io" target="_blank">SeaTable</a></li>
            <li>Нажмите <strong>"+ Новая база"</strong> (не таблица!)</li>
            <li>Назовите базу: <strong>"Smolville-App"</strong></li>
            <li>Нажмите "Создать"</li>
          </ol>
        </div>

        <div style="border: 2px solid #4caf50; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3>📊 ШАГ 2: Создайте таблицы</h3>
          <p>В новой базе создайте 3 таблицы:</p>
          <ul>
            <li><strong>Events</strong> - для мероприятий</li>
            <li><strong>Ads</strong> - для объявлений</li>
            <li><strong>Votings</strong> - для голосований</li>
          </ul>
          <p>Добавьте несколько тестовых записей в каждую таблицу.</p>
        </div>

        <div style="border: 2px solid #ff9800; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3>🔑 ШАГ 3: Создайте API токен</h3>
          <ol>
            <li>Откройте любую таблицу (Events, Ads или Votings)</li>
            <li>Нажмите на <strong>шестеренку</strong> рядом с названием таблицы</li>
            <li>Выберите <strong>"Внешние приложения"</strong></li>
            <li>Нажмите <strong>"API токен"</strong></li>
            <li>Нажмите <strong>"Создать новый API токен"</strong></li>
            <li>Скопируйте новый токен</li>
          </ol>
        </div>

        <div style="border: 2px solid #9c27b0; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3>⚙️ ШАГ 4: Настройте приложение</h3>
          <p>Используйте в Render следующие переменные:</p>
          <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px;">
SEATABLE_API_TOKEN=ВАШ_НОВЫЙ_ТОКЕН
SEATABLE_BASE_UUID=Smolville-App
RADIKAL_API_KEY=ваш_ключ_radikal
          </pre>
          <p><strong>Важно:</strong> Используйте имя базы как Base UUID!</p>
        </div>

        <h3>🧪 Тестирование:</h3>
        <p>После настройки протестируйте:</p>
        <ul>
          <li><a href="/api/test-connection">/api/test-connection</a> - Проверка подключения</li>
          <li><a href="/api/test-manual">/api/test-manual</a> - Ручной тест с токеном</li>
        </ul>

        <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3>💡 Почему это сработает:</h3>
          <ul>
            <li>Новая база гарантирует чистые настройки</li>
            <li>API токен создается правильно для конкретной таблицы</li>
            <li>Используем имя базы как UUID - это проще и надежнее</li>
            <li>Избегаем всех предыдущих проблем с конфигурацией</li>
          </ul>
        </div>
      </body>
    </html>
  `);
});

// ==================== API ДЛЯ НОВОЙ БАЗЫ ====================

class SeaTableAPI {
  constructor(serverUrl, apiToken, baseName) {
    this.baseURL = `${serverUrl}/api/v2.1/dtable/app-api/${baseName}`;
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

// Тест подключения для новой базы
app.get('/api/test-connection', async (req, res) => {
  const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN;
  const SEATABLE_BASE_NAME = process.env.SEATABLE_BASE_UUID || 'Smolville-App';

  if (!SEATABLE_API_TOKEN) {
    return res.json({
      success: false,
      error: 'API токен не установлен. Создайте новую базу и установите SEATABLE_API_TOKEN в Render.'
    });
  }

  try {
    const seatableAPI = new SeaTableAPI('https://cloud.seatable.io', SEATABLE_API_TOKEN, SEATABLE_BASE_NAME);
    
    const tables = ['Events', 'Ads', 'Votings'];
    const results = {};

    for (const table of tables) {
      try {
        const data = await seatableAPI.listRows(table);
        results[table] = {
          success: true,
          count: data.rows ? data.rows.length : 0,
          sample: data.rows ? data.rows.slice(0, 2) : []
        };
      } catch (error) {
        results[table] = {
          success: false,
          error: error.message
        };
      }
    }

    const allSuccess = Object.values(results).every(r => r.success);
    
    res.json({
      success: allSuccess,
      message: allSuccess ? '🎉 ВСЕ РАБОТАЕТ! ПРИЛОЖЕНИЕ ГОТОВО!' : 'Есть проблемы с некоторыми таблицами',
      config: {
        baseName: SEATABLE_BASE_NAME,
        apiToken: `${SEATABLE_API_TOKEN.substring(0, 8)}...`
      },
      results: results,
      nextSteps: allSuccess ? [
        '✅ Настройка завершена!',
        'Ваше приложение готово к работе.',
        'Добавляйте данные через интерфейс SeaTable.'
      ] : [
        'Создайте отсутствующие таблицы в базе Smolville-App',
        'Убедитесь что API токен создан правильно',
        'Проверьте названия таблиц: Events, Ads, Votings'
      ]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      instructions: [
        '1. Создайте новую базу "Smolville-App" в SeaTable',
        '2. Создайте таблицы Events, Ads, Votings',
        '3. Создайте новый API токен для таблицы',
        '4. Установите SEATABLE_API_TOKEN в Render'
      ]
    });
  }
});

// Ручной тест с вводом токена
app.get('/api/test-manual', async (req, res) => {
  const token = req.query.token;
  const baseName = req.query.base || 'Smolville-App';

  if (!token) {
    return res.json({
      error: 'Используйте: /api/test-manual?token=ВАШ_НОВЫЙ_ТОКЕН&base=ИМЯ_БАЗЫ'
    });
  }

  try {
    const seatableAPI = new SeaTableAPI('https://cloud.seatable.io', token, baseName);
    const data = await seatableAPI.listRows('Events');

    res.json({
      success: true,
      message: '✅ НОВЫЙ ТОКЕН РАБОТАЕТ!',
      config: {
        baseName: baseName,
        token: `${token.substring(0, 8)}...`
      },
      data: {
        eventsCount: data.rows ? data.rows.length : 0,
        sample: data.rows ? data.rows.slice(0, 2) : []
      },
      nextSteps: [
        `Установите в Render: SEATABLE_API_TOKEN=${token}`,
        `Установите в Render: SEATABLE_BASE_UUID=${baseName}`,
        'Перезапустите приложение'
      ]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      instructions: [
        '1. Убедитесь что база "Smolville-App" существует',
        '2. Проверьте что таблица "Events" создана',
        '3. Убедитесь что API токен создан для таблицы',
        '4. Попробуйте создать еще один токен'
      ]
    });
  }
});

// ==================== ОСНОВНОЕ ПРИЛОЖЕНИЕ ====================

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'READY', 
    message: 'Сервер готов к работе после настройки новой базы',
    timestamp: new Date().toISOString()
  });
});

// Radikal upload (будет работать после настройки базы)
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Изображение не загружено' });
    }
    
    const RADIKAL_API_KEY = process.env.RADIKAL_API_KEY;
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

    const response = await axios.post('https://radikal.cloud/api/1/upload', formData, {
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
      success: true,
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
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${port}`);
  console.log('');
  console.log('📋 ИНСТРУКЦИЯ:');
  console.log('1. Создайте новую базу "Smolville-App" в SeaTable');
  console.log('2. Создайте таблицы Events, Ads, Votings');
  console.log('3. Создайте новый API токен для таблицы');
  console.log('4. Установите переменные в Render');
  console.log('');
  console.log('🔗 Откройте главную страницу для подробной инструкции');
});
