// server.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Airtable и ImgBB
const AIRTABLE_EVENTS_API_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/tbl1wzVpDRpInIpMY`;
const AIRTABLE_ADS_API_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/tblILQr1xFKmkLTKB`;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

// --- РАБОТА С СОБЫТИЯМИ ---
app.get('/events', async (req, res) => {
  try {
    const response = await fetch(AIRTABLE_EVENTS_API_URL, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_EVENTS_API_KEY}` }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/events', async (req, res) => {
  try {
    const eventData = req.body; // ожидаем { fields: {...} }
    const response = await fetch(AIRTABLE_EVENTS_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_EVENTS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventData)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- РАБОТА С РЕКЛАМОЙ ---
app.get('/ads', async (req, res) => {
  try {
    const response = await fetch(AIRTABLE_ADS_API_URL, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_ADS_API_KEY}` }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ЗАГРУЗКА ИЗОБРАЖЕНИЙ В IMGBB ---
app.post('/upload-image', async (req, res) => {
  try {
    const { imageBase64 } = req.body; // ожидаем base64 картинки
    const formData = new URLSearchParams();
    formData.append('image', imageBase64);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.error?.message || 'Ошибка загрузки изображения');
    res.json({ url: data.data.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ЗАПУСК СЕРВЕРА ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
