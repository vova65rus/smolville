require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Настройка загрузки изображений через multer
const upload = multer({ storage: multer.memoryStorage() });

// Переменные из .env
const {
  AIRTABLE_EVENTS_API_KEY,
  AIRTABLE_ADS_API_KEY,
  AIRTABLE_BASE_ID,
  IMGBB_API_KEY,
  ADMIN_ID
} = process.env;

const EVENTS_TABLE = 'tbl1wzVpDRpInIpMY';
const ADS_TABLE = 'tblILQr1xFKmkLTKB';
const AIRTABLE_EVENTS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${EVENTS_TABLE}`;
const AIRTABLE_ADS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ADS_TABLE}`;

// --- Получение событий ---
app.get('/events', async (req, res) => {
  try {
    const response = await axios.get(AIRTABLE_EVENTS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_EVENTS_API_KEY}` }
    });
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения событий' });
  }
});

// --- Добавление события (админ) ---
app.post('/events', async (req, res) => {
  const { userId, title, type, date, location, description, imageUrl } = req.body;
  if (Number(userId) !== Number(ADMIN_ID)) return res.status(403).json({ error: 'Нет доступа' });

  const eventData = {
    fields: {
      ID: String(Math.floor(Math.random() * 1000000)),
      Title: title,
      Type: type,
      Date: date,
      Location: location,
      Description: description,
      Image: imageUrl ? [{ url: imageUrl }] : []
    }
  };

  try {
    const response = await axios.post(AIRTABLE_EVENTS_URL, eventData, {
      headers: { Authorization: `Bearer ${AIRTABLE_EVENTS_API_KEY}`, 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка добавления события' });
  }
});

// --- Редактирование события ---
app.patch('/events/:id', async (req, res) => {
  const { userId, title, type, date, location, description, imageUrl } = req.body;
  if (Number(userId) !== Number(ADMIN_ID)) return res.status(403).json({ error: 'Нет доступа' });

  const eventData = {
    fields: {
      Title: title,
      Type: type,
      Date: date,
      Location: location,
      Description: description,
      Image: imageUrl ? [{ url: imageUrl }] : []
    }
  };

  try {
    const response = await axios.patch(`${AIRTABLE_EVENTS_URL}/${req.params.id}`, eventData, {
      headers: { Authorization: `Bearer ${AIRTABLE_EVENTS_API_KEY}`, 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка редактирования события' });
  }
});

// --- Удаление события ---
app.delete('/events/:id', async (req, res) => {
  const userId = req.body.userId;
  if (Number(userId) !== Number(ADMIN_ID)) return res.status(403).json({ error: 'Нет доступа' });

  try {
    const response = await axios.delete(`${AIRTABLE_EVENTS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_EVENTS_API_KEY}` }
    });
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления события' });
  }
});

// --- Получение рекламы ---
app.get('/ads', async (req, res) => {
  try {
    const response = await axios.get(AIRTABLE_ADS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_ADS_API_KEY}` }
    });
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения рекламы' });
  }
});

// --- Загрузка изображения на ImgBB ---
app.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  try {
    const base64 = req.file.buffer.toString('base64');
    const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, null, {
      params: { image: base64 }
    });
    res.json({ url: response.data.data.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки изображения' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
