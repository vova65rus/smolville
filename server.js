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

const SEATABLE_API_TOKEN = 'a59ff211027552fe077f2a1baed66d831cf96cbf';
const SEA_TABLE_BASE_UUID = '1e24960e-ac5a-43b6-8269-e6376b16577a';

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>SeaTable API Diagnostic</title></head>
      <body>
        <h1>🔧 Диагностика SeaTable API</h1>
        <p><strong>Проблема:</strong> SeaTable возвращает HTML вместо JSON</p>
        
        <h2>Возможные причины:</h2>
        <ol>
          <li>API токен создан неправильно</li>
          <li>Base UUID неверный</li>
          <li>Таблицы не существуют</li>
          <li>Неверный API endpoint</li>
        </ol>

        <h3>Тесты:</h3>
        <ul>
          <li><a href="/api/test-endpoints">/api/test-endpoints</a> - Тест всех возможных endpoints</li>
          <li><a href="/api/check-token">/api/check-token</a> - Проверка токена</li>
          <li><a href="/api/create-token-instructions">/api/create-token-instructions</a> - Инструкция по созданию токена</li>
        </ul>
      </body>
    </html>
  `);
});

// Тест всех возможных API endpoints
app.get('/api/test-endpoints', async (req, res) => {
  const endpoints = [
    // Основные endpoints
    `https://cloud.seatable.io/api/v2.1/dtable/app-api/${SEA_TABLE_BASE_UUID}/rows/?table_name=Events`,
    `https://cloud.seatable.io/dtable-server/api/v1/dtables/${SEA_TABLE_BASE_UUID}/rows/?table_name=Events`,
    
    // Альтернативные endpoints
    `https://cloud.seatable.io/api/v2.1/dtables/${SEA_TABLE_BASE_UUID}/rows/?table_name=Events`,
    `https://cloud.seatable.io/api/v2.1/dtable/app-api/rows/?table_name=Events&dtable_uuid=${SEA_TABLE_BASE_UUID}`,
    
    // Base name вместо UUID
    `https://cloud.seatable.io/api/v2.1/dtable/app-api/Smolville/rows/?table_name=Events`,
    
    // Старые endpoints
    `https://cloud.seatable.io/dtable-server/api/v1/rows/?table_name=Events&dtable_uuid=${SEA_TABLE_BASE_UUID}`
  ];

  const results = [];

  for (const endpoint of endpoints) {
    try {
      console.log(`🧪 Тестируем: ${endpoint}`);
      
      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Token ${SEATABLE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      results.push({
        endpoint: endpoint,
        status: 'SUCCESS',
        statusCode: response.status,
        dataType: typeof response.data,
        hasRows: response.data.rows ? true : false,
        rowCount: response.data.rows ? response.data.rows.length : 0
      });

    } catch (error) {
      let errorType = 'UNKNOWN';
      if (error.response) {
        if (typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE html>')) {
          errorType = 'HTML_RESPONSE';
        } else if (error.response.status === 404) {
          errorType = 'NOT_FOUND';
        } else if (error.response.status === 403) {
          errorType = 'FORBIDDEN';
        }
      }

      results.push({
        endpoint: endpoint,
        status: 'ERROR',
        errorType: errorType,
        statusCode: error.response?.status,
        error: error.message
      });
    }
  }

  res.json({
    config: {
      apiToken: `${SEATABLE_API_TOKEN.substring(0, 8)}...`,
      baseUUID: SEA_TABLE_BASE_UUID
    },
    results: results,
    analysis: {
      totalTests: results.length,
      successCount: results.filter(r => r.status === 'SUCCESS').length,
      htmlResponses: results.filter(r => r.errorType === 'HTML_RESPONSE').length
    }
  });
});

// Проверка токена через Account API
app.get('/api/check-token', async (req, res) => {
  try {
    // Попробуем проверить токен через разные методы
    
    const tests = [
      {
        name: 'Base API Access',
        url: `https://cloud.seatable.io/api/v2.1/dtable/app-api/${SEA_TABLE_BASE_UUID}/`
      },
      {
        name: 'Workspace List',
        url: 'https://cloud.seatable.io/api/v2.1/workspaces/'
      },
      {
        name: 'Account Info',
        url: 'https://cloud.seatable.io/api/v2.1/account/info/'
      }
    ];

    const results = [];

    for (const test of tests) {
      try {
        const response = await axios.get(test.url, {
          headers: {
            'Authorization': `Token ${SEATABLE_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });

        results.push({
          test: test.name,
          status: 'SUCCESS',
          statusCode: response.status,
          data: Object.keys(response.data)
        });

      } catch (error) {
        results.push({
          test: test.name,
          status: 'ERROR',
          statusCode: error.response?.status,
          error: error.message
        });
      }
    }

    res.json({
      token: `${SEATABLE_API_TOKEN.substring(0, 8)}...`,
      results: results,
      conclusion: results.some(r => r.status === 'SUCCESS') ? 
        'Токен валидный, но нет доступа к базе' : 
        'Токен невалидный'
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Инструкция по созданию токена
app.get('/api/create-token-instructions', (req, res) => {
  res.json({
    steps: [
      {
        step: 1,
        action: 'Откройте конкретную таблицу в базе Smolville',
        details: 'НЕ настройки базы, а откройте конкретно таблицу Events, Ads или Votings'
      },
      {
        step: 2,
        action: 'Нажмите на шестеренку рядом с названием таблицы',
        details: 'Это настройки таблицы, а не базы'
      },
      {
        step: 3, 
        action: 'Выберите "Внешние приложения"',
        details: 'В меню настроек таблицы'
      },
      {
        step: 4,
        action: 'Нажмите "API токен"',
        details: 'Создайте новый токен'
      },
      {
        step: 5,
        action: 'Убедитесь что токен создан для правильной таблицы',
        details: 'Должна быть указана таблица Events/Ads/Votings'
      }
    ],
    commonMistakes: [
      'Создание токена в настройках базы вместо настроек таблицы',
      'Использование Account Token вместо API Token',
      'Токен создан для неправильной таблицы',
      'Base UUID не соответствует базе'
    ],
    immediateAction: 'Создайте новый API токен открыв конкретную таблицу и используя настройки таблицы (не базы!)'
  });
});

// Тест с ручным вводом токена и UUID
app.get('/api/test-manual', async (req, res) => {
  const token = req.query.token || SEATABLE_API_TOKEN;
  const uuid = req.query.uuid || SEA_TABLE_BASE_UUID;
  const table = req.query.table || 'Events';

  if (!token || !uuid) {
    return res.json({
      error: 'Используйте: /api/test-manual?token=ВАШ_ТОКЕН&uuid=ВАШ_UUID&table=Events'
    });
  }

  try {
    const response = await axios.get(
      `https://cloud.seatable.io/api/v2.1/dtable/app-api/${uuid}/rows/?table_name=${table}`,
      {
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    res.json({
      success: true,
      message: '✅ РАБОТАЕТ!',
      config: {
        token: `${token.substring(0, 8)}...`,
        uuid: uuid,
        table: table
      },
      data: {
        rowCount: response.data.rows ? response.data.rows.length : 0,
        sample: response.data.rows ? response.data.rows.slice(0, 2) : []
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      config: {
        token: `${token.substring(0, 8)}...`,
        uuid: uuid,
        table: table
      },
      diagnosis: error.response?.status === 404 ? 'Неверный токен, UUID или таблица не существует' : 'Другая ошибка'
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 Диагностический сервер запущен на порту ${port}`);
  console.log(`🔗 Тестируем токен: ${SEATABLE_API_TOKEN.substring(0, 8)}...`);
  console.log(`🔗 Base UUID: ${SEA_TABLE_BASE_UUID}`);
  console.log('');
  console.log('📋 Для диагностики откройте:');
  console.log('   /api/test-endpoints - тест всех endpoints');
  console.log('   /api/check-token - проверка токена');
  console.log('   /api/create-token-instructions - инструкция');
});
