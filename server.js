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

// ==================== НАСТРОЙКИ SEA TABLE ====================

// ВАЖНО: Получите новый API токен для базы Smolville!
const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN || 'ВАШ_НОВЫЙ_API_ТОКЕН_ЗДЕСЬ';
const SEATABLE_SERVER_URL = process.env.SEATABLE_SERVER_URL || 'https://cloud.seatable.io';

// Base UUID - из URL вашей базы
// Из URL: https://cloud.seatable.io/workspace/89387/dtable/Smolville/?tid=Gf71&vid=0000
// Base UUID обычно выглядит как длинная строка символов, а не имя базы
const SEATABLE_BASE_UUID = process.env.SEATABLE_BASE_UUID || 'UUID_ВАШЕЙ_БАЗЫ_ЗДЕСЬ';

// Названия таблиц
const EVENTS_TABLE = process.env.SEATABLE_EVENTS_TABLE_NAME || 'Events';
const ADS_TABLE = process.env.SEATABLE_ADS_TABLE_NAME || 'Ads';
const VOTINGS_TABLE = process.env.SEATABLE_VOTINGS_TABLE_NAME || 'Votings';

// Radikal API конфигурация
const RADIKAL_API_URL = 'https://radikal.cloud/api/1';
const RADIKAL_API_KEY = process.env.RADIKAL_API_KEY;

// Хардкод админа
const ADMIN_ID = 366825437;

if (!SEATABLE_API_TOKEN || !SEATABLE_BASE_UUID || !RADIKAL_API_KEY) {
  console.error('❌ Отсутствуют обязательные переменные окружения');
  console.error('SEATABLE_API_TOKEN:', SEATABLE_API_TOKEN ? 'есть' : 'НЕТ');
  console.error('SEATABLE_BASE_UUID:', SEATABLE_BASE_UUID ? 'есть' : 'НЕТ');
  console.error('RADIKAL_API_KEY:', RADIKAL_API_KEY ? 'есть' : 'НЕТ');
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
        
        if (error.response.data) {
          const responseStr = JSON.stringify(error.response.data).substring(0, 200);
          console.error('Данные:', responseStr + '...');
        }
        
        if (error.response.status === 403) {
          throw new Error('Доступ запрещен. Проверьте API токен.');
        }
        if (error.response.status === 404) {
          throw new Error('Ресурс не найден. Проверьте Base UUID и название таблицы.');
        }
      }
      
      if (error.code === 'ECONNABORTED') {
        throw new Error('Таймаут запроса. SeaTable не отвечает.');
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

// ==================== ДИАГНОСТИЧЕСКИЕ API ====================

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Smolville Backend</title></head>
      <body>
        <h1>🚀 Smolville Backend запущен!</h1>
        <p>Для диагностики используйте:</p>
        <ul>
          <li><a href="/api/debug/connection">/api/debug/connection</a> - Проверка подключения</li>
          <li><a href="/api/debug/env">/api/debug/env</a> - Переменные окружения</li>
          <li><a href="/api/debug/find-uuid">/api/debug/find-uuid</a> - Поиск UUID базы</li>
        </ul>
      </body>
    </html>
  `);
});

// Поиск UUID базы с помощью Account Token
app.get('/api/debug/find-uuid', async (req, res) => {
  try {
    const ACCOUNT_TOKEN = 'd146dc5b1b1fd51aafdbf5dbae1c00babf2f927d';
    
    console.log('🔍 Ищем UUID базы Smolville через Account API...');
    
    // Получаем список рабочих пространств
    const workspacesResponse = await axios.get(
      'https://cloud.seatable.io/api/v2.1/workspace/',
      {
        headers: {
          'Authorization': `Token ${ACCOUNT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    let baseUUID = null;
    
    // Ищем в каждом workspace базу Smolville
    for (const workspace of workspacesResponse.data.workspace_list) {
      try {
        const tablesResponse = await axios.get(
          `https://cloud.seatable.io/api/v2.1/workspace/${workspace.id}/dtable/`,
          {
            headers: {
              'Authorization': `Token ${ACCOUNT_TOKEN}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        const smolvilleBase = tablesResponse.data.find(table => table.name === 'Smolville');
        if (smolvilleBase) {
          baseUUID = smolvilleBase.uuid;
          console.log(`✅ Найдена база Smolville: ${baseUUID}`);
          break;
        }
      } catch (error) {
        console.log(`ℹ️ Workspace ${workspace.id}: нет доступа или нет базы`);
      }
    }

    if (baseUUID) {
      res.json({
        success: true,
        baseUUID: baseUUID,
        currentConfig: {
          apiToken: SEATABLE_API_TOKEN ? `установлен (${SEATABLE_API_TOKEN.substring(0, 8)}...)` : 'НЕТ',
          currentBaseUUID: SEATABLE_BASE_UUID,
          foundBaseUUID: baseUUID
        },
        instructions: [
          '1. Скопируйте найденный UUID базы',
          '2. Обновите переменную SEATABLE_BASE_UUID в Render',
          '3. Убедитесь, что используете API Token (не Account Token)',
          '4. Проверьте подключение через /api/debug/connection'
        ]
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'База Smolville не найдена в аккаунте',
        instructions: [
          '1. Убедитесь, что база Smolville существует',
          '2. Проверьте правильность Account Token',
          '3. Создайте новый API Token для базы Smolville'
        ]
      });
    }
    
  } catch (error) {
    console.error('Ошибка поиска UUID:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      instructions: [
        '1. Проверьте Account Token',
        '2. Убедитесь, что база Smolville существует',
        '3. Создайте новый API Token для базы'
      ]
    });
  }
});

// Проверка подключения
app.get('/api/debug/connection', async (req, res) => {
  try {
    console.log('🔍 Проверка подключения к SeaTable...');
    
    const testData = await seatableAPI.listRows(EVENTS_TABLE);
    
    res.json({
      success: true,
      message: '✅ Подключение к SeaTable успешно!',
      details: {
        baseUUID: SEATABLE_BASE_UUID,
        baseURL: `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-api/${SEATABLE_BASE_UUID}`,
        tables: {
          events: testData.rows ? testData.rows.length : 0
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: {
        baseUUID: SEATABLE_BASE_UUID,
        baseURL: `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-api/${SEATABLE_BASE_UUID}`,
        apiToken: SEATABLE_API_TOKEN ? 'установлен' : 'отсутствует'
      },
      troubleshooting: [
        '1. Используйте /api/debug/find-uuid чтобы найти правильный UUID базы',
        '2. Создайте новый API Token для базы Smolville',
        '3. Убедитесь, что таблица "Events" существует в базе'
      ]
    });
  }
});

// Остальной код (Events, Ads, Votings API) остается таким же...
// [Здесь должен быть остальной ваш код...]

app.listen(port, () => {
  console.log(`🚀 Сервер запущен на порту ${port}`);
  console.log(`🔗 Для диагностики откройте: http://localhost:${port}/api/debug/find-uuid`);
});