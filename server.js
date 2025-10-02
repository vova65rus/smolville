const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
const cors = require('cors');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;

// ========= CONFIG =========
const SEATABLE_SERVER_URL = 'https://cloud.seatable.io';
const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN;
const SEATABLE_BASE_UUID = process.env.SEATABLE_BASE_UUID;
const RADIKAL_API_URL = 'https://radikal.ru/api/v1';
const RADIKAL_API_KEY = process.env.RADIKAL_API_KEY;

// таблицы
const EVENTS_TABLE = 'Events';
const ADS_TABLE = 'Ads';
const VOTINGS_TABLE = 'Votings';

// ========= MIDDLEWARE =========
app.use(express.json());
app.use(cors());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const upload = multer({ dest: 'uploads/' });

// ========= HELPERS =========
async function getBaseToken() {
  const url = `${SEATABLE_SERVER_URL}/api/v2.1/dtable/app-access-token/`;
  const response = await axios.get(url, {
    headers: { Authorization: `Token ${SEATABLE_API_TOKEN}` },
    params: { dtable_uuid: SEATABLE_BASE_UUID },
  });
  return { token: response.data.access_token, uuid: response.data.dtable_uuid };
}

function getRowsUrl(uuid) {
  return `${SEATABLE_SERVER_URL}/dtable-server/api/v1/dtables/${uuid}/rows/`;
}

async function getRows(tableName) {
  const { token, uuid } = await getBaseToken();
  const url = getRowsUrl(uuid);
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    params: { table_name: tableName },
  });
  return response.data.rows;
}

async function addRow(tableName, fields) {
  const { token, uuid } = await getBaseToken();
  const url = getRowsUrl(uuid);
  const response = await axios.post(url, {
    table_name: tableName,
    row: fields,
  }, { headers: { Authorization: `Bearer ${token}` } });
  return response.data;
}

async function updateRow(tableName, rowId, fields) {
  const { token, uuid } = await getBaseToken();
  const url = getRowsUrl(uuid);
  const response = await axios.put(url, {
    table_name: tableName,
    row_id: rowId,
    row: fields,
  }, { headers: { Authorization: `Bearer ${token}` } });
  return response.data;
}

async function deleteRow(tableName, rowId) {
  const { token, uuid } = await getBaseToken();
  const url = getRowsUrl(uuid);
  const response = await axios.delete(url, {
    headers: { Authorization: `Bearer ${token}` },
    data: { table_name: tableName, row_id: rowId },
  });
  return response.data;
}

// ========= ROUTES =========
// --- Events
app.get('/api/events', async (req, res) => {
  try {
    const rows = await getRows(EVENTS_TABLE);
    res.json({ records: rows.map(r => ({ id: r._id, fields: r })) });
  } catch (err) {
    console.error('Ошибка GET /api/events:', err.response?.data || err.message);
    res.status(500).json({ error: 'Ошибка загрузки Events' });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const result = await addRow(EVENTS_TABLE, req.body.fields);
    res.json(result);
  } catch (err) {
    console.error('Ошибка POST /api/events:', err.response?.data || err.message);
    res.status(500).json({ error: 'Ошибка добавления Event' });
  }
});

app.patch('/api/events/:id', async (req, res) => {
  try {
    const result = await updateRow(EVENTS_TABLE, req.params.id, req.body.fields);
    res.json(result);
  } catch (err) {
    console.error('Ошибка PATCH /api/events:', err.response?.data || err.message);
    res.status(500).json({ error: 'Ошибка обновления Event' });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const result = await deleteRow(EVENTS_TABLE, req.params.id);
    res.json(result);
  } catch (err) {
    console.error('Ошибка DELETE /api/events:', err.response?.data || err.message);
    res.status(500).json({ error: 'Ошибка удаления Event' });
  }
});

// --- Ads
app.get('/api/ads', async (req, res) => {
  try {
    const rows = await getRows(ADS_TABLE);
    res.json({ records: rows.map(r => ({ id: r._id, fields: r })) });
  } catch (err) {
    console.error('Ошибка GET /api/ads:', err.response?.data || err.message);
    res.status(500).json({ error: 'Ошибка загрузки Ads' });
  }
});

// --- Votings
app.get('/api/votings', async (req, res) => {
  try {
    const rows = await getRows(VOTINGS_TABLE);
    res.json({ records: rows.map(r => ({ id: r._id, fields: r })) });
  } catch (err) {
    console.error('Ошибка GET /api/votings:', err.response?.data || err.message);
    res.status(500).json({ error: 'Ошибка загрузки Votings' });
  }
});

app.post('/api/votings', async (req, res) => {
  try {
    const result = await addRow(VOTINGS_TABLE, req.body.fields);
    res.json(result);
  } catch (err) {
    console.error('Ошибка POST /api/votings:', err.response?.data || err.message);
    res.status(500).json({ error: 'Ошибка добавления Voting' });
  }
});

// --- Votings by EventID
app.get('/api/events/:eventId/votings', async (req, res) => {
  try {
    const { token, uuid } = await getBaseToken();
    const url = getRowsUrl(uuid);
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        table_name: VOTINGS_TABLE,
        filters: JSON.stringify([
          { column_name: 'EventID', filter_predicate: '=', filter_term: req.params.eventId }
        ]),
      },
    });
    res.json({ records: response.data.rows.map(r => ({ id: r._id, fields: r })) });
  } catch (err) {
    console.error('Ошибка /api/events/:eventId/votings:', err.response?.data || err.message);
    res.status(500).json({ error: 'Ошибка выборки Votings по EventID' });
  }
});

// ========= FILE UPLOAD (Radikal) =========
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path));
    const response = await axios.post(`${RADIKAL_API_URL}/upload`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${RADIKAL_API_KEY}` },
    });
    fs.unlinkSync(req.file.path);
    res.json(response.data);
  } catch (err) {
    console.error('Ошибка загрузки файла:', err.response?.data || err.message);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// ========= GENERATE RESULTS (sharp) =========
app.post('/api/votings/:id/generate-results', async (req, res) => {
  try {
    const votingId = req.params.id;
    const rows = await getRows(VOTINGS_TABLE);
    const voting = rows.find(r => r._id === votingId);
    if (!voting) return res.status(404).json({ error: 'Voting not found' });

    const options = JSON.parse(voting.Options || '[]');
    const counts = JSON.parse(voting.Results || '{}');

    let svg = `<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<style> text{font:14px sans-serif;} </style>`;
    options.forEach((opt, i) => {
      const count = counts[opt] || 0;
      svg += `<text x="10" y="${30 + i * 25}">${opt}: ${count}</text>`;
    });
    svg += `</svg>`;

    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();

    // upload to Radikal
    const form = new FormData();
    form.append('file', buffer, { filename: `results-${votingId}.png` });
    const response = await axios.post(`${RADIKAL_API_URL}/upload`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${RADIKAL_API_KEY}` },
    });

    res.json({ imageUrl: response.data.url });
  } catch (err) {
    console.error('Ошибка генерации результатов:', err.response?.data || err.message);
    res.status(500).json({ error: 'Ошибка генерации результатов' });
  }
});

// ========= START =========
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
