// server.js
import express from 'express';
import axios from 'axios';
import FormData from 'form-data';
import multer from 'multer';
import fs from 'fs';
import Airtable from 'airtable';
import sharp from 'sharp';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* ==============================
   Airtable Config
================================= */
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

/* ==============================
   ImageBan Config
================================= */
const IMAGEBAN_API_KEY = process.env.IMAGEBAN_API_KEY;
const IMAGEBAN_UPLOAD_URL = 'https://api.imageban.ru/v1';

/* ==============================
   Multer Config
================================= */
const upload = multer({ dest: 'uploads/' });

/* ==============================
   Utils
================================= */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // радиус Земли в метрах
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

async function uploadToImageBan(imageData, filename) {
  const formData = new FormData();
  formData.append('image', imageData, { filename });

  try {
    const response = await axios.post(IMAGEBAN_UPLOAD_URL, formData, {
      headers: {
        Authorization: `TOKEN ${IMAGEBAN_API_KEY}`, // или Bearer, если используешь SECRET_KEY
        ...formData.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    if (response.data && response.data.success && response.data.data?.[0]?.link) {
      return response.data.data[0].link;
    } else {
      throw new Error('ImageBan API error: ' + JSON.stringify(response.data));
    }
  } catch (error) {
    console.error('ImageBan upload failed:', error.response?.data || error.message);
    throw new Error('Image upload failed');
  }
}

/* ==============================
   Routes
================================= */

// Healthcheck
app.get('/', (req, res) => {
  res.send('Backend is running 🚀');
});

// Загрузка картинки в ImageBan
app.post('/upload', upload.single('image'), async (req, res) => {
  const filePath = req.file.path;

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const link = await uploadToImageBan(fileBuffer, req.file.originalname);
    res.json({ url: link });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

// Генерация превью (sharp + upload to ImageBan)
app.post('/generate-preview', upload.single('image'), async (req, res) => {
  const filePath = req.file.path;

  try {
    const previewBuffer = await sharp(filePath)
      .resize(300, 200, { fit: 'cover' })
      .toBuffer();

    const previewLink = await uploadToImageBan(previewBuffer, 'preview.jpg');
    res.json({ preview: previewLink });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

// Получение событий из Airtable
app.get('/events', async (req, res) => {
  try {
    const records = await base('Events').select({ view: 'Grid view' }).all();
    const events = records.map(r => ({ id: r.id, ...r.fields }));
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Отметка "я пойду"
app.post('/going', async (req, res) => {
  const { eventId, userId } = req.body;
  try {
    await base('Going').create([{ fields: { Event: [eventId], UserId: userId } }]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Подать заявку
app.post('/apply', async (req, res) => {
  const { eventId, userId, details } = req.body;
  try {
    await base('Applications').create([
      { fields: { Event: [eventId], UserId: userId, Details: details } },
    ]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Создание голосования
app.post('/voting', async (req, res) => {
  const { question, options } = req.body;
  try {
    const record = await base('Voting').create([
      { fields: { Question: question, Options: options } },
    ]);
    res.json({ id: record[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Голосование
app.post('/vote', async (req, res) => {
  const { votingId, option, userId } = req.body;
  try {
    await base('Votes').create([{ fields: { Voting: [votingId], Option: option, UserId: userId } }]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Результаты голосования
app.get('/voting/:id/results', async (req, res) => {
  const votingId = req.params.id;
  try {
    const voting = await base('Voting').find(votingId);
    const votes = await base('Votes')
      .select({ filterByFormula: `{Voting} = '${votingId}'` })
      .all();

    const options = (voting.fields.Options || '').split(',');
    const optionImages =
      Array.isArray(voting.fields.OptionImages) && voting.fields.OptionImages.length > 0
        ? voting.fields.OptionImages.map(img => img.url || img)
        : [];

    const results = {};
    options.forEach((opt, i) => {
      results[opt] = { count: 0, image: optionImages[i] || null };
    });

    votes.forEach(v => {
      const opt = v.fields.Option;
      if (results[opt]) results[opt].count++;
    });

    res.json({ question: voting.fields.Question, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin-only: approve event
app.post('/admin/events/:id/approve', async (req, res) => {
  try {
    await base('Events').update(req.params.id, { Approved: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ==============================
   Start Server
================================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
