// Env vars for SeaTable v5.3
const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN;
const SEATABLE_DTABLE_UUID = process.env.SEATABLE_DTABLE_UUID;
const EVENTS_TABLE = process.env.SEATABLE_EVENTS_TABLE_NAME || 'Events';
const ADS_TABLE = process.env.SEATABLE_ADS_TABLE_NAME || 'Ads';
const VOTINGS_TABLE = process.env.SEATABLE_VOTINGS_TABLE_NAME || 'Votings';
const SEATABLE_BASE_URL = process.env.SEATABLE_BASE_URL || 'https://cloud.seatable.io/api/v5.3'; // Поддержка кастомного URL

// Проверка переменных
if (!SEATABLE_API_TOKEN || !SEATABLE_DTABLE_UUID || !RADIKAL_API_KEY) {
  console.error('Missing env vars: Set SEATABLE_API_TOKEN, SEATABLE_DTABLE_UUID, RADIKAL_API_KEY in Render');
  process.exit(1);
}

const EVENTS_URL = `${SEATABLE_BASE_URL}/dtable/${SEATABLE_DTABLE_UUID}/rows/?table_name=${EVENTS_TABLE}`;
const ADS_URL = `${SEATABLE_BASE_URL}/dtable/${SEATABLE_DTABLE_UUID}/rows/?table_name=${ADS_TABLE}`;
const VOTINGS_URL = `${SEATABLE_BASE_URL}/dtable/${SEATABLE_DTABLE_UUID}/rows/?table_name=${VOTINGS_TABLE}`;

let baseToken = null;

async function ensureBaseToken() {
  if (!baseToken) {
    try {
      console.log('Generating Base-Token (v5.3) with API Token:', SEATABLE_API_TOKEN ? SEATABLE_API_TOKEN.slice(0, 10) + '...' : 'Missing');
      console.log('Request URL:', `${SEATABLE_BASE_URL}/auth-token/`);
      const response = await axios.get(`${SEATABLE_BASE_URL}/auth-token/`, {
        params: { api_token: SEATABLE_API_TOKEN }
      });
      baseToken = response.data.access_token;
      console.log('Base-Token generated:', baseToken.slice(0, 10) + '...');
      console.log('Returned dtable_uuid:', response.data.dtable_uuid);
      if (response.data.dtable_uuid !== SEATABLE_DTABLE_UUID) {
        console.warn('Warning: SEATABLE_DTABLE_UUID does not match returned dtable_uuid:', response.data.dtable_uuid);
      }
    } catch (error) {
      console.error('Error generating Base-Token (v5.3):', error.response?.data || error.message);
      if (error.response?.status === 404) {
        console.error('404: Check SEATABLE_API_TOKEN, SEATABLE_DTABLE_UUID, or SEATABLE_BASE_URL. Test in Postman v5.3.');
      }
      throw new Error('Failed to generate Base-Token');
    }
  }
  return baseToken;
}

// Функция для запросов с авто-регенерацией токена при 401
async function makeSeaTableRequest(method, url, data = null, params = {}) {
  let token = await ensureBaseToken();
  try {
    const config = {
      method,
      url,
      headers: { Authorization: `Token ${token}` },
      params
    };
    if (data) config.data = data;
    return await axios(config);
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('Base-Token expired (v5.3), regenerating...');
      baseToken = null;
      token = await ensureBaseToken();
      const config = {
        method,
        url,
        headers: { Authorization: `Token ${token}` },
        params
      };
      if (data) config.data = data;
      return await axios(config);
    }
    throw error;
  }
}

app.get('/', (req, res) => {
  res.send('Smolville Backend is running! API endpoints: /api/events, /api/ads, /api/votings, /api/upload (SeaTable v5.3)');
});

// [Здесь все функции Radikal API без изменений — uploadToRadikal, getRadikalFileInfo, deleteFromRadikal]

// API для админа без изменений
app.get('/api/is-admin', (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const isAdmin = userId === ADMIN_ID;
  res.json({ isAdmin });
});

// [Здесь все эндпоинты для upload без изменений — /api/upload, /api/votings/upload-option-image, /api/upload/:fileId]

// ==================== Events API (v5.3) ====================
app.get('/api/events', async (req, res) => {
  try {
    const response = await makeSeaTableRequest('GET', EVENTS_URL);
    const { rows } = response.data;
    res.json({
      records: rows.map(r => ({ id: r._id, fields: r.values }))
    });
  } catch (error) {
    console.error('Events GET error (v5.3):', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    console.log('Creating event with data:', JSON.stringify(req.body, null, 2));
    const rowData = req.body.fields || req.body;
    const postBody = { rows: [{ values: rowData }] };
    const response = await makeSeaTableRequest('POST', EVENTS_URL, postBody);
    const newRow = response.data.rows[0];
    res.json({
      id: newRow._id,
      fields: newRow.values
    });
  } catch (error) {
    console.error('Events POST error (v5.3):', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const url = `${SEATABLE_BASE_URL}/dtable/${SEATABLE_DTABLE_UUID}/rows/${req.params.id}/?table_name=${EVENTS_TABLE}`;
    const response = await makeSeaTableRequest('GET', url);
    const row = response.data;
    res.json({
      id: row._id,
      fields: row.values
    });
  } catch (error) {
    console.error('Event GET error (v5.3):', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/events/:id', async (req, res) => {
  try {
    console.log('Updating event with data:', JSON.stringify(req.body, null, 2));
    const rowData = req.body.fields || req.body;
    const patchBody = { row: rowData };
    const url = `${SEATABLE_BASE_URL}/dtable/${SEATABLE_DTABLE_UUID}/rows/${req.params.id}/?table_name=${EVENTS_TABLE}`;
    const response = await makeSeaTableRequest('PUT', url, patchBody);
    const updatedRow = response.data.row;
    res.json({
      id: req.params.id,
      fields: updatedRow.values
    });
  } catch (error) {
    console.error('Event PATCH error (v5.3):', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const url = `${SEATABLE_BASE_URL}/dtable/${SEATABLE_DTABLE_UUID}/rows/${req.params.id}/?table_name=${EVENTS_TABLE}`;
    await makeSeaTableRequest('DELETE', url);
    res.json({ id: req.params.id });
  } catch (error) {
    console.error('Event DELETE error (v5.3):', error.message);
    res.status(500).json({ error: error.message });
  }
});

// [Аналогично обновите Ads API и Votings API, заменив makeSeaTableRequest и добавив (v5.3) в логи]

// [Здесь все остальные эндпоинты без изменений: /api/events/:eventId/votings, vote, vote-status, complete, generate-results, attend, unattend, attend-status]

// Вспомогательные функции без изменений: calculateDistance, deg2rad

// Создание папки uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Запуск сервера
app.listen(port, async () => {
  try {
    await ensureBaseToken(); // Initialize on startup
  } catch (error) {
    console.error('Failed to initialize Base-Token (v5.3) on startup:', error.message);
  }
  console.log(`Server running on port ${port} (SeaTable v5.3)`);
  console.log(`Radikal API URL: ${RADIKAL_API_URL}`);
});
