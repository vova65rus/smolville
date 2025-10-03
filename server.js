const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

// UUID базы который мы нашли!
const SEA_TABLE_BASE_UUID = '1e24960e-ac5a-43b6-8269-e6376b16577a';
const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN || '622c69aab356a1e53f3994f234c1e4a98f77f656';

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Smolville - Создание API токена</title></head>
      <body>
        <h1>🔑 Создайте новый API токен</h1>
        <p><strong>UUID базы:</strong> ${SEA_TABLE_BASE_UUID}</p>
        
        <h2>Инструкция:</h2>
        <ol>
          <li>Откройте базу: <a href="https://cloud.seatable.io/workspace/89387/dtable/Smolville/" target="_blank">Smolville</a></li>
          <li>Настройки (шестеренка) → <strong>Внешние приложения</strong></li>
          <li>Нажмите <strong>API токен</strong></li>
          <li>Нажмите <strong>Создать новый API токен</strong></li>
          <li>Скопируйте новый токен</li>
          <li>Обновите переменную в Render</li>
        </ol>
        
        <h3>Тест текущего токена:</h3>
        <p><a href="/api/test-current">Проверить текущий токен</a></p>
        
        <h3>Тест с новым токеном:</h3>
        <form action="/api/test-token" method="get">
          <input type="text" name="token" placeholder="Введите новый API токен" style="width: 300px; padding: 8px;">
          <button type="submit" style="padding: 8px 16px;">Протестировать</button>
        </form>
      </body>
    </html>
  `);
});

// Тест текущего токена
app.get('/api/test-current', async (req, res) => {
  try {
    console.log('🧪 Тестируем текущий API токен...');
    
    const response = await axios.get(
      `https://cloud.seatable.io/api/v2.1/dtable/app-api/${SEA_TABLE_BASE_UUID}/rows/?table_name=Events`,
      {
        headers: {
          'Authorization': `Token ${SEATABLE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    res.json({
      success: true,
      message: '✅ Текущий токен РАБОТАЕТ!',
      eventsCount: response.data.rows ? response.data.rows.length : 0,
      data: response.data.rows ? response.data.rows.slice(0, 2) : []
    });
    
  } catch (error) {
    console.error('❌ Ошибка теста:', error.message);
    
    let diagnosis = '';
    if (error.response && error.response.status === 403) {
      diagnosis = 'Токен не имеет доступа к базе';
    } else if (error.response && error.response.status === 404) {
      diagnosis = 'База или таблица не найдена';
    } else if (error.code === 'ECONNABORTED') {
      diagnosis = 'Таймаут - токен не действителен';
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
      diagnosis: diagnosis,
      instructions: [
        '1. Создайте НОВЫЙ API токен для базы Smolville',
        '2. Убедитесь что создаете токен для правильной базы',
        '3. Токен должен иметь права на чтение/запись',
        '4. Обновите переменную SEATABLE_API_TOKEN в Render'
      ]
    });
  }
});

// Тест с новым токеном
app.get('/api/test-token', async (req, res) => {
  const newToken = req.query.token;
  
  if (!newToken) {
    return res.json({
      error: 'Укажите токен: /api/test-token?token=ВАШ_НОВЫЙ_ТОКЕН'
    });
  }

  try {
    console.log('🧪 Тестируем новый API токен...');
    
    const response = await axios.get(
      `https://cloud.seatable.io/api/v2.1/dtable/app-api/${SEA_TABLE_BASE_UUID}/rows/?table_name=Events`,
      {
        headers: {
          'Authorization': `Token ${newToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    res.json({
      success: true,
      message: '✅ Новый токен РАБОТАЕТ!',
      eventsCount: response.data.rows ? response.data.rows.length : 0,
      nextSteps: [
        `Обновите в Render: SEATABLE_API_TOKEN=${newToken}`,
        `SEATABLE_BASE_UUID=${SEA_TABLE_BASE_UUID}`,
        'Перезапустите приложение в Render'
      ],
      sampleData: response.data.rows ? response.data.rows.slice(0, 2) : []
    });
    
  } catch (error) {
    console.error('❌ Ошибка теста нового токена:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      troubleshooting: [
        '1. Убедитесь что создали токен для базы Smolville',
        '2. Проверьте что скопировали токен полностью',
        '3. Попробуйте создать еще один токен',
        '4. Убедитесь что таблица "Events" существует в базе'
      ]
    });
  }
});

// Проверка таблиц в базе
app.get('/api/check-tables', async (req, res) => {
  const testToken = req.query.token || SEATABLE_API_TOKEN;
  const tables = ['Events', 'Ads', 'Votings'];
  const results = {};

  for (const table of tables) {
    try {
      const response = await axios.get(
        `https://cloud.seatable.io/api/v2.1/dtable/app-api/${SEA_TABLE_BASE_UUID}/rows/?table_name=${table}`,
        {
          headers: {
            'Authorization': `Token ${testToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );

      results[table] = {
        exists: true,
        rowCount: response.data.rows ? response.data.rows.length : 0
      };
    } catch (error) {
      results[table] = {
        exists: false,
        error: error.message
      };
    }
  }

  res.json({
    baseUUID: SEA_TABLE_BASE_UUID,
    tables: results,
    recommendations: Object.values(results).some(r => !r.exists) ? [
      'Создайте отсутствующие таблицы в базе Smolville',
      'Таблицы должны называться: Events, Ads, Votings'
    ] : ['✅ Все таблицы существуют!']
  });
});

app.listen(port, () => {
  console.log(`🚀 Сервер запущен на порту ${port}`);
  console.log(`🔗 UUID базы: ${SEA_TABLE_BASE_UUID}`);
  console.log(`🔑 Текущий токен: ${SEATABLE_API_TOKEN.substring(0, 8)}...`);
  console.log('');
  console.log('📋 Инструкция:');
  console.log('1. Откройте главную страницу для создания нового API токена');
  console.log('2. Протестируйте новый токен через /api/test-token');
  console.log('3. Обновите переменные в Render');
});
