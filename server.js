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

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Smolville - Поиск API токена</title></head>
      <body>
        <h1>🔍 ГДЕ НАЙТИ API ТОКЕН В SeaTable</h1>
        
        <div style="background: #fff3e0; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <h2 style="color: #f57c00;">📌 НОВЫЙ ИНТЕРФЕЙС SEA TABLE</h2>
          <p>Расположение настроек изменилось. Вот несколько способов:</p>
        </div>

        <h2>🎯 СПОСОБ 1: Через настройки базы</h2>
        <div style="border: 2px solid #2196f3; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3>1. Откройте базу Smolville</h3>
          <p><a href="https://cloud.seatable.io/workspace/89387/dtable/Smolville/" target="_blank">Открыть базу Smolville</a></p>
          
          <h3>2. Найдите меню настроек</h3>
          <p>Ищите в правом верхнем углу:</p>
          <ul>
            <li><strong>Три точки (⋯)</strong> - меню действий</li>
            <li><strong>Шестеренка (⚙️)</strong> - настройки</li>
            <li><strong>Иконка "i"</strong> - информация о базе</li>
          </ul>

          <h3>3. Ищите в меню:</h3>
          <ul>
            <li>"API Token"</li>
            <li>"Внешние приложения"</li>
            <li>"App integrations"</li>
            <li>"Developer"</li>
            <li>"API Settings"</li>
          </ul>
        </div>

        <h2>🔧 СПОСОБ 2: Через URL напрямую</h2>
        <div style="border: 2px solid #4caf50; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p>Попробуйте эти прямые ссылки:</p>
          <ul>
            <li><a href="https://cloud.seatable.io/workspace/89387/dtable/Smolville/plugins/" target="_blank">Плагины и приложения</a></li>
            <li><a href="https://cloud.seatable.io/workspace/89387/dtable/Smolville/settings/" target="_blank">Настройки базы</a></li>
            <li><a href="https://cloud.seatable.io/workspace/89387/dtable/Smolville/api-token/" target="_blank">API Token (возможный путь)</a></li>
          </ul>
        </div>

        <h2>📱 СПОСОБ 3: Через мобильное приложение</h2>
        <div style="border: 2px solid #9c27b0; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p>Если в веб-версии не нашли, попробуйте в мобильном приложении SeaTable:</p>
          <ol>
            <li>Откройте базу Smolville в мобильном приложении</li>
            <li>Найдите меню настроек базы</li>
            <li>Ищите "API Token" или "Внешние приложения"</li>
          </ol>
        </div>

        <h2>🚀 СПОСОБ 4: Создать новую базу</h2>
        <div style="border: 2px solid #ff9800; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p>Если не нашли в текущей базе:</p>
          <ol>
            <li>Создайте <strong>новую базу</strong> в SeaTable</li>
            <li>Назовите "Smolville-Test"</li>
            <li>Создайте таблицы Events, Ads, Votings</li>
            <li>В новой базе настройки могут быть доступнее</li>
          </ol>
        </div>

        <h2>🧪 ТЕСТИРОВАНИЕ</h2>
        <div style="border: 2px solid #607d8b; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p>Когда найдете API токен, протестируйте его:</p>
          <form action="/api/test-token" method="get">
            <input type="text" name="token" placeholder="Введите найденный API токен" 
                   style="width: 400px; padding: 10px; font-size: 16px; margin: 10px 0;">
            <br>
            <button type="submit" style="padding: 10px 20px; font-size: 16px;">Протестировать токен</button>
          </form>
        </div>

        <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3>💡 Подсказки:</h3>
          <ul>
            <li>API токен обычно выглядит как длинная строка из букв и цифр</li>
            <li>Токен должен быть связан с конкретной базой (Smolville)</li>
            <li>Если не нашли - создайте новую базу, там настройки проще</li>
          </ul>
        </div>

        <h3>📊 Проверка текущего статуса:</h3>
        <ul>
          <li><a href="/api/check-base">Проверить доступ к базе</a></li>
          <li><a href="/api/test-current">Проверить текущий токен</a></li>
        </ul>
      </body>
    </html>
  `);
});

// Проверка базы без токена
app.get('/api/check-base', async (req, res) => {
  try {
    // Попробуем разные endpoints чтобы понять структуру API
    const endpoints = [
      'https://cloud.seatable.io/api/v2.1/dtable/app-api/1e24960e-ac5a-43b6-8269-e6376b16577a/',
      'https://cloud.seatable.io/api/v2.1/workspaces/',
      'https://cloud.seatable.io/'
    ];

    const results = [];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(endpoint, { timeout: 5000 });
        results.push({
          endpoint: endpoint,
          status: 'SUCCESS',
          statusCode: response.status,
          data: typeof response.data
        });
      } catch (error) {
        results.push({
          endpoint: endpoint,
          status: 'ERROR', 
          error: error.message,
          statusCode: error.response?.status
        });
      }
    }

    res.json({
      baseUUID: '1e24960e-ac5a-43b6-8269-e6376b16577a',
      results: results,
      conclusion: 'База существует, нужен правильный API токен'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Тест токена
app.get('/api/test-token', async (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.json({ error: 'Укажите токен: /api/test-token?token=ВАШ_ТОКЕН' });
  }

  try {
    const response = await axios.get(
      'https://cloud.seatable.io/api/v2.1/dtable/app-api/1e24960e-ac5a-43b6-8269-e6376b16577a/rows/?table_name=Events',
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
      message: '🎉 ТОКЕН РАБОТАЕТ!',
      eventsCount: response.data.rows ? response.data.rows.length : 0,
      nextSteps: [
        `Установите в Render: SEATABLE_API_TOKEN=${token}`,
        'Перезапустите приложение',
        'Добавьте данные в таблицы'
      ]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      instructions: [
        'Токен не работает. Возможные причины:',
        '1. Токен не для этой базы',
        '2. Токен не имеет прав доступа', 
        '3. Неправильный формат токена',
        '4. Создайте новый токен в настройках базы'
      ]
    });
  }
});

// Проверка текущего токена
app.get('/api/test-current', (req, res) => {
  const token = process.env.SEATABLE_API_TOKEN;
  
  if (!token) {
    return res.json({
      hasToken: false,
      message: 'SEATABLE_API_TOKEN не установлен в Render'
    });
  }

  res.json({
    hasToken: true,
    tokenPreview: `${token.substring(0, 8)}...`,
    message: 'Токен установлен, но не проверен',
    testLink: `/api/test-token?token=${token}`
  });
});

app.listen(port, () => {
  console.log(`🚀 Сервер запущен на порту ${port}`);
  console.log('');
  console.log('🔍 ИНСТРУКЦИЯ ПО ПОИСКУ API ТОКЕНА:');
  console.log('1. Откройте главную страницу');
  console.log('2. Попробуйте разные способы найти API токен');
  console.log('3. Протестируйте найденный токен');
  console.log('4. Обновите переменную в Render');
});
