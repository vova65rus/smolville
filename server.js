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
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const upload = multer({ dest: 'uploads/' });

// Env vars (Render использует process.env напрямую)
const AIRTABLE_API_KEY = process.env.AIRTABLE_EVENTS_API_KEY || process.env.AIRTABLE_ADS_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const EVENTS_TABLE = process.env.AIRTABLE_EVENTS_TABLE_NAME || 'Events';
const ADS_TABLE = process.env.AIRTABLE_ADS_TABLE_NAME || 'Ads';
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

// Хардкод админа (можно перенести в env var ADMIN_ID)
const ADMIN_ID = 366825437; // Замените на ваш ID или используйте process.env.ADMIN_ID

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !IMGBB_API_KEY) {
  console.error('Missing env vars: Set AIRTABLE_API_KEY, AIRTABLE_BASE_ID, IMGBB_API_KEY in Render');
  process.exit(1);
}

const EVENTS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${EVENTS_TABLE}`;
const ADS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ADS_TABLE}`;

app.get('/', (req, res) => {
  res.send('Smolville Backend is running! API endpoints: /api/events, /api/ads, /api/upload');
});

// Эндпоинт для проверки админа
app.get('/api/is-admin', (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const isAdmin = userId === ADMIN_ID;
  res.json({ isAdmin });
});

// API для событий
app.get('/api/events', async (req, res) => {
  try {
    const response = await axios.get(EVENTS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Events GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const response = await axios.post(EVENTS_URL, req.body, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Events POST error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const response = await axios.get(`${EVENTS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Event GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/events/:id', async (req, res) => {
  try {
    const response = await axios.patch(`${EVENTS_URL}/${req.params.id}`, req.body, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Event PATCH error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const response = await axios.delete(`${EVENTS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Event DELETE error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API для рекламы (поля ID, IMG, URL)
app.get('/api/ads', async (req, res) => {
  try {
    console.log('Getting ads from Airtable...');
    const response = await axios.get(ADS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    console.log('Ads response:', response.data.records.length, 'records');
    res.json(response.data);
  } catch (error) {
    console.error('Ads GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    console.log('Posting ad to Airtable:', req.body.fields);
    const adData = {
      fields: {
        ID: req.body.fields.ID,
        IMG: req.body.fields.IMG,
        URL: req.body.fields.URL
      }
    };
    const response = await axios.post(ADS_URL, adData, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ads POST error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/ads/:id', async (req, res) => {
  try {
    console.log('Patching ad:', req.params.id, req.body.fields);
    const adData = {
      fields: {
        ID: req.body.fields.ID,
        IMG: req.body.fields.IMG,
        URL: req.body.fields.URL
      }
    };
    const response = await axios.patch(`${ADS_URL}/${req.params.id}`, adData, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ads PATCH error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    console.log('Deleting ad:', req.params.id);
    const response = await axios.delete(`${ADS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ads DELETE error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API для загрузки изображений
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    const filePath = req.file.path;
    const formData = new FormData();
    formData.append('image', fs.createReadStream(filePath));
    const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, formData, {
      headers: formData.getHeaders()
    });
    fs.unlinkSync(filePath);
    if (response.data.success) {
      console.log('Image uploaded successfully:', response.data.data.url);
      res.json({ url: response.data.data.url });
    } else {
      res.status(500).json({ error: 'ImgBB upload failed' });
    }
  } catch (error) {
    console.error('Upload error:', error.message);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

// Создание папки uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Запуск сервера
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Events URL: ${EVENTS_URL}`);
  console.log(`Ads URL: ${ADS_URL}`);
});
