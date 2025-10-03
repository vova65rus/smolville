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

const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN || '622c69aab356a1e53f3994f234c1e4a98f77f656';

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>SeaTable UUID Finder</title></head>
      <body>
        <h1>🔍 Поиск UUID базы Smolville</h1>
        <p>Используйте:</p>
        <ul>
          <li><a href="/api/find-uuid">/api/find-uuid</a> - Автоматический поиск UUID</li>
          <li><a href="/api/test-connection">/api/test-connection</a> - Тест подключения</li>
        </ul>
      </body>
    </html>
  `);
});

// Автоматический поиск UUID через Account API
app.get('/api/find-uuid', async (req, res) => {
  try {
    console.log('🔍 Ищем UUID базы Smolville...');
    
    // Используем Account Token для получения списка баз
    const ACCOUNT_TOKEN = 'd146dc5b1b1fd51aafdbf5dbae1c00babf2f927d';
    
    // Попробуем разные endpoints для получения списка баз
    const endpoints = [
      'https://cloud.seatable.io/api/v2.1/workspaces/',
      'https://cloud.seatable.io/api/v2.1/workspace/',
      'https://cloud.seatable.io/api/v2.1/admin/workspaces/',
      'https://cloud.seatable.io/api/v2.1/dtables/'
    ];

    let foundUUID = null;
    let workspaceData = null;

    for (const endpoint of endpoints) {
      try {
        console.log(`Пробуем endpoint: ${endpoint}`);
        const response = await axios.get(endpoint, {
          headers: {
            'Authorization': `Token ${ACCOUNT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });

        workspaceData = response.data;
        console.log(`✅ Endpoint сработал: ${endpoint}`);
        break;
      } catch (error) {
        console.log(`❌ Endpoint не сработал: ${endpoint} - ${error.message}`);
      }
    }

    if (!workspaceData) {
      throw new Error('Не удалось получить данные через Account API');
    }

    // Парсим ответ чтобы найти базу Smolville
    console.log('Полученные данные:', JSON.stringify(workspaceData, null, 2));

    // Пробуем разные структуры ответа
    if (workspaceData.workspaces) {
      for (const workspace of workspaceData.workspaces) {
        if (workspace.dtables) {
          const smolvilleBase = workspace.dtables.find(d => d.name === 'Smolville');
          if (smolvilleBase) {
            foundUUID = smolvilleBase.uuid;
            break;
          }
        }
      }
    }

    if (workspaceData.workspace_list && !foundUUID) {
      for (const workspace of workspaceData.workspace_list) {
        // Получаем базы для каждого workspace
        try {
          const dtablesResponse = await axios.get(
            `https://cloud.seatable.io/api/v2.1/workspace/${workspace.id}/dtables/`,
            {
              headers: {
                'Authorization': `Token ${ACCOUNT_TOKEN}`,
                'Content-Type': 'application/json'
              },
              timeout: 5000
            }
          );

          const smolvilleBase = dtablesResponse.data.find(d => d.name === 'Smolville');
          if (smolvilleBase) {
            foundUUID = smolvilleBase.uuid;
            break;
          }
        } catch (error) {
          console.log(`Не удалось получить базы для workspace ${workspace.id}`);
        }
      }
    }

    if (foundUUID) {
      // Тестируем найденный UUID с API токеном
      try {
        const testResponse = await axios.get(
          `https://cloud.seatable.io/api/v2.1/dtable/app-api/${foundUUID}/rows/?table_name=Events`,
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
          message: '✅ UUID найден и работает с API токеном!',
          baseUUID: foundUUID,
          testResult: {
            status: 'SUCCESS',
            tables: {
              events: testResponse.data.rows ? testResponse.data.rows.length : 0
            }
          },
          nextSteps: [
            `1. Установите в Render переменную: SEATABLE_BASE_UUID=${foundUUID}`,
            '2. Проверьте работу приложения',
            '3. Если что-то не работает - создайте новый API токен'
          ]
        });

      } catch (testError) {
        res.json({
          success: true,
          message: '✅ UUID найден, но нужна проверка API токена',
          baseUUID: foundUUID,
          testResult: {
            status: 'ERROR',
            error: testError.message
          },
          recommendations: [
            'Создайте новый API токен для базы Smolville',
            `Используйте UUID: ${foundUUID}`,
            'Обновите SEATABLE_API_TOKEN в Render'
          ]
        });
      }
    } else {
      // Если автоматический поиск не сработал, используем альтернативные методы
      res.json({
        success: false,
        message: '❌ Не удалось автоматически найти UUID',
        alternativeMethods: [
          {
            method: 'Через интерфейс браузера',
            steps: [
              '1. Откройте базу Smolville в SeaTable',
              '2. Нажмите F12 → Вкладка Network',
              '3. Обновите страницу (F5)',
              '4. Найдите запросы с "dtable" в URL',
              '5. В URL будет UUID базы'
            ]
          },
          {
            method: 'Создать новую базу',
            steps: [
              '1. Создайте новую базу в SeaTable',
              '2. Назовите ее "Smolville-New"',
              '3. Создайте таблицы Events, Ads, Votings',
              '4. Создайте новый API токен',
              '5. Используйте имя базы как UUID'
            ]
          }
        ]
      });
    }

  } catch (error) {
    console.error('Ошибка поиска UUID:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      manualMethods: [
        'Метод 1: Через браузер',
        '1. Откройте базу Smolville → F12 → Network',
        '2. Найдите запрос к API (ищите "dtable" в URL)',
        '3. UUID будет в URL запроса',
        '',
        'Метод 2: Создать новую базу',
        '1. Новая база → "Smolville-Test"',
        '2. Создайте таблицы Events, Ads, Votings', 
        '3. Новый API токен',
        '4. Используйте имя базы как UUID'
      ]
    });
  }
});

// Тест подключения с возможными UUID
app.get('/api/test-connection', async (req, res) => {
  const possibleUUIDs = [
    'Smolville',
    '89387',
    'Gf71', 
    '0000',
    'fc9ad3d2b00b40b5919efa7e58e68220'
  ];

  const results = [];

  for (const uuid of possibleUUIDs) {
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

      results.push({
        uuid: uuid,
        status: 'SUCCESS',
        data: response.data.rows ? `${response.data.rows.length} записей` : 'нет данных'
      });
    } catch (error) {
      results.push({
        uuid: uuid,
        status: 'ERROR',
        error: error.message
      });
    }
  }

  res.json({
    apiToken: SEATABLE_API_TOKEN ? `установлен (${SEATABLE_API_TOKEN.substring(0, 8)}...)` : 'НЕТ',
    results: results
  });
});

app.listen(port, () => {
  console.log(`🚀 Сервер поиска UUID запущен на порту ${port}`);
  console.log(`🔗 Откройте http://localhost:${port}/api/find-uuid`);
});