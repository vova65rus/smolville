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

// ==================== ПЕРЕМЕННЫЕ ====================

// ПОПРОБУЙТЕ ЭТИ ВАРИАНТЫ UUID:
const POSSIBLE_UUIDS = [
  '1e24960e-ac5a-43b6-8269-e6376b16577a', // старый UUID
  '89387', // ID из URL workspace
  'Gf71',  // tid из URL
  '0000',  // vid из URL
  'Smolville' // имя базы
];

const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN || '622c69aab356a1e53f3994f234c1e4a98f77f656';
const RADIKAL_API_KEY = process.env.RADIKAL_API_KEY;

// ==================== ДИАГНОСТИКА ====================

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>SeaTable Diagnostic</title></head>
      <body>
        <h1>🔧 SeaTable Diagnostic Tool</h1>
        <p>Используйте:</p>
        <ul>
          <li><a href="/api/test-all">/api/test-all</a> - Тест всех возможных UUID</li>
          <li><a href="/api/create-token-guide">/api/create-token-guide</a> - Инструкция по созданию токена</li>
        </ul>
      </body>
    </html>
  `);
});

// Тест всех возможных UUID
app.get('/api/test-all', async (req, res) => {
  const results = [];
  
  for (const uuid of POSSIBLE_UUIDS) {
    try {
      console.log(`🧪 Тестируем UUID: ${uuid}`);
      
      const response = await axios.get(
        `https://cloud.seatable.io/api/v2.1/dtable/app-api/${uuid}/rows/?table_name=Events`,
        {
          headers: {
            'Authorization': `Token ${SEATABLE_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );

      results.push({
        uuid: uuid,
        status: 'SUCCESS',
        statusCode: response.status,
        dataLength: response.data.rows ? response.data.rows.length : 0,
        message: '✅ РАБОТАЕТ!'
      });
      
    } catch (error) {
      let errorInfo = {
        uuid: uuid,
        status: 'ERROR',
        error: error.message
      };

      if (error.response) {
        errorInfo.statusCode = error.response.status;
        if (error.response.data && typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE html>')) {
          errorInfo.message = 'HTML response - неверный UUID';
        } else {
          errorInfo.message = `HTTP ${error.response.status}`;
        }
      } else if (error.code === 'ECONNABORTED') {
        errorInfo.message = 'Timeout - возможно неверный API Token';
      }

      results.push(errorInfo);
    }
  }

  // Анализ результатов
  const workingUUIDs = results.filter(r => r.status === 'SUCCESS');
  
  res.json({
    summary: {
      tested: results.length,
      working: workingUUIDs.length,
      apiToken: SEATABLE_API_TOKEN ? `установлен (${SEATABLE_API_TOKEN.substring(0, 8)}...)` : 'НЕТ'
    },
    results: results,
    recommendations: workingUUIDs.length > 0 ? [
      `✅ Используйте UUID: ${workingUUIDs[0].uuid}`,
      'Обновите переменную SEATABLE_BASE_UUID в Render'
    ] : [
      '❌ Ни один UUID не сработал',
      '1. Создайте новый API Token для базы Smolville',
      '2. Найдите правильный UUID через интерфейс SeaTable',
      '3. Проверьте инструкцию: /api/create-token-guide'
    ]
  });
});

// Инструкция по созданию API Token
app.get('/api/create-token-guide', (req, res) => {
  res.json({
    steps: [
      {
        step: 1,
        action: 'Откройте базу Smolville в SeaTable',
        details: 'https://cloud.seatable.io/workspace/89387/dtable/Smolville/'
      },
      {
        step: 2, 
        action: 'Нажмите на шестеренку (Настройки) в правом верхнем углу',
        details: 'Это иконка настроек базы'
      },
      {
        step: 3,
        action: 'Выберите "Внешние приложения"',
        details: 'В меню настроек'
      },
      {
        step: 4,
        action: 'Нажмите "API токен"',
        details: 'Создайте новый токен если старый не работает'
      },
      {
        step: 5,
        action: 'Скопируйте новый токен',
        details: 'И обновите переменную SEATABLE_API_TOKEN в Render'
      },
      {
        step: 6,
        action: 'Найдите UUID базы',
        details: 'В настройках базы или через F12 → Network'
      }
    ],
    current_token: SEATABLE_API_TOKEN ? `установлен (${SEATABLE_API_TOKEN.substring(0, 8)}...)` : 'НЕТ',
    troubleshooting: [
      'Если токен не работает - создайте новый',
      'Убедитесь что вы создаете токен для правильной базы (Smolville)',
      'Токен должен иметь права на чтение и запись'
    ]
  });
});

// Простой тест с конкретным UUID
app.get('/api/test-uuid/:uuid', async (req, res) => {
  const uuid = req.params.uuid;
  
  try {
    const response = await axios.get(
      `https://cloud.seatable.io/api/v2.1/dtable/app-api/${uuid}/rows/?table_name=Events`,
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
      uuid: uuid,
      statusCode: response.status,
      data: response.data,
      message: '✅ Отлично! Этот UUID работает.'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      uuid: uuid,
      error: error.message,
      details: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null,
      message: '❌ Этот UUID не работает.'
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 Диагностический сервер запущен на порту ${port}`);
  console.log(`🔗 Откройте http://localhost:${port}/api/test-all`);
});