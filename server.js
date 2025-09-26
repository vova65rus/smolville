const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Парсинг multipart/form-data для загрузки файлов
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Переменные окружения
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const UPLOADCARE_PUBLIC_KEY = process.env.UPLOADCARE_PUBLIC_KEY;
const UPLOADCARE_SECRET_KEY = process.env.UPLOADCARE_SECRET_KEY;
const UPLOADCARE_CDN_DOMAIN = process.env.UPLOADCARE_CDN_DOMAIN || '62wb4q8n36.ucarecd.net'; // Твой субдомен

const EVENTS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events`;
const ADS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Ads`;
const VOTINGS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Votings`;

// Эндпоинт для загрузки изображений в Uploadcare
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const formData = new FormData();
    formData.append('image', req.file.buffer, { filename: req.file.originalname });

    const response = await axios.post('https://upload.uploadcare.com/base/', formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Uploadcare.Simple ${UPLOADCARE_PUBLIC_KEY}:${UPLOADCARE_SECRET_KEY}`,
      },
    });

    if (!response.data.file) {
      throw new Error('Uploadcare did not return a file UUID');
    }

    const fileUrl = `https://${UPLOADCARE_CDN_DOMAIN}/${response.data.file}/`;
    console.log('Image uploaded to Uploadcare:', fileUrl);

    res.json({ url: fileUrl });
  } catch (error) {
    console.error('Upload error:', error.message);
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'Uploadcare rate limit exceeded, try again later' });
    }
    if (error.response?.status === 403) {
      return res.status(403).json({ error: 'Uploadcare authorization error' });
    }
    res.status(500).json({ error: `Failed to upload image: ${error.message}` });
  }
});

// Эндпоинт для загрузки изображений номинантов голосования
app.post('/api/votings/upload-option-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const formData = new FormData();
    formData.append('image', req.file.buffer, { filename: req.file.originalname });

    const response = await axios.post('https://upload.uploadcare.com/base/', formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Uploadcare.Simple ${UPLOADCARE_PUBLIC_KEY}:${UPLOADCARE_SECRET_KEY}`,
      },
    });

    if (!response.data.file) {
      throw new Error('Uploadcare did not return a file UUID');
    }

    const fileUrl = `https://${UPLOADCARE_CDN_DOMAIN}/${response.data.file}/`;
    console.log('Option image uploaded to Uploadcare:', fileUrl);

    res.json({ url: fileUrl });
  } catch (error) {
    console.error('Option image upload error:', error.message);
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'Uploadcare rate limit exceeded, try again later' });
    }
    if (error.response?.status === 403) {
      return res.status(403).json({ error: 'Uploadcare authorization error' });
    }
    res.status(500).json({ error: `Failed to upload option image: ${error.message}` });
  }
});

// Эндпоинт для получения событий
app.get('/api/events', async (req, res) => {
  try {
    const response = await axios.get(EVENTS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching events:', error.message);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Эндпоинт для создания/обновления события
app.post('/api/events', async (req, res) => {
  try {
    const response = await axios.post(EVENTS_URL, req.body, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Event created:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error creating event:', error.message);
    res.status(500).json({ error: `Failed to create event: ${error.message}` });
  }
});

app.patch('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await axios.patch(`${EVENTS_URL}/${id}`, req.body, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Event updated:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error updating event:', error.message);
    res.status(500).json({ error: `Failed to update event: ${error.message}` });
  }
});

// Эндпоинт для удаления события
app.delete('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await axios.delete(`${EVENTS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    console.log('Event deleted:', id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting event:', error.message);
    res.status(500).json({ error: `Failed to delete event: ${error.message}` });
  }
});

// Эндпоинт для проверки статуса участия
app.get('/api/events/:id/attend-status/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;
    const response = await axios.get(`${EVENTS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    const event = response.data;
    const attendeesIDs = event.fields.AttendeesIDs || '';
    const isAttending = attendeesIDs.includes(userId);
    res.json({ isAttending });
  } catch (error) {
    console.error('Error checking attend status:', error.message);
    res.status(500).json({ error: 'Failed to check attend status' });
  }
});

// Эндпоинт для участия/отмены участия
app.post('/api/events/:id/attend', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const response = await axios.get(`${EVENTS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    let attendeesIDs = response.data.fields.AttendeesIDs || '';
    let attendeesCount = response.data.fields.AttendeesCount || 0;

    if (attendeesIDs.includes(userId)) {
      return res.status(400).json({ error: 'User already attending' });
    }

    attendeesIDs = attendeesIDs ? `${attendeesIDs},${userId}` : userId;
    attendeesCount += 1;

    const updateResponse = await axios.patch(
      `${EVENTS_URL}/${id}`,
      {
        fields: {
          AttendeesIDs: attendeesIDs,
          AttendeesCount: attendeesCount,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('User attended event:', id, userId);
    res.json(updateResponse.data);
  } catch (error) {
    console.error('Error attending event:', error.message);
    res.status(500).json({ error: `Failed to attend event: ${error.message}` });
  }
});

app.post('/api/events/:id/unattend', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const response = await axios.get(`${EVENTS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    let attendeesIDs = response.data.fields.AttendeesIDs || '';
    let attendeesCount = response.data.fields.AttendeesCount || 0;

    if (!attendeesIDs.includes(userId)) {
      return res.status(400).json({ error: 'User not attending' });
    }

    attendeesIDs = attendeesIDs
      .split(',')
      .filter((id) => id !== userId)
      .join(',');
    attendeesCount = Math.max(0, attendeesCount - 1);

    const updateResponse = await axios.patch(
      `${EVENTS_URL}/${id}`,
      {
        fields: {
          AttendeesIDs: attendeesIDs,
          AttendeesCount: attendeesCount,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('User unattended event:', id, userId);
    res.json(updateResponse.data);
  } catch (error) {
    console.error('Error unattending event:', error.message);
    res.status(500).json({ error: `Failed to unattend event: ${error.message}` });
  }
});

// Эндпоинты для рекламы
app.get('/api/ads', async (req, res) => {
  try {
    const response = await axios.get(ADS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching ads:', error.message);
    res.status(500).json({ error: 'Failed to fetch ads' });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    const response = await axios.post(ADS_URL, req.body, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Ad created:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error creating ad:', error.message);
    res.status(500).json({ error: `Failed to create ad: ${error.message}` });
  }
});

app.patch('/api/ads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await axios.patch(`${ADS_URL}/${id}`, req.body, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Ad updated:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error updating ad:', error.message);
    res.status(500).json({ error: `Failed to update ad: ${error.message}` });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await axios.delete(`${ADS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    console.log('Ad deleted:', id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting ad:', error.message);
    res.status(500).json({ error: `Failed to delete ad: ${error.message}` });
  }
});

// Эндпоинты для голосований
app.get('/api/votings', async (req, res) => {
  try {
    const response = await axios.get(VOTINGS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching votings:', error.message);
    res.status(500).json({ error: 'Failed to fetch votings' });
  }
});

app.post('/api/votings', async (req, res) => {
  try {
    const response = await axios.post(VOTINGS_URL, req.body, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Voting created:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error creating voting:', error.message);
    res.status(500).json({ error: `Failed to create voting: ${error.message}` });
  }
});

app.patch('/api/votings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await axios.patch(`${VOTINGS_URL}/${id}`, req.body, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Voting updated:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error updating voting:', error.message);
    res.status(500).json({ error: `Failed to update voting: ${error.message}` });
  }
});

app.delete('/api/votings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await axios.delete(`${VOTINGS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    console.log('Voting deleted:', id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting voting:', error.message);
    res.status(500).json({ error: `Failed to delete voting: ${error.message}` });
  }
});

// Эндпоинт для голосования пользователя
app.post('/api/votings/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, optionIndex } = req.body;

    const response = await axios.get(`${VOTINGS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    const voting = response.data;
    let votes = voting.fields.Votes ? JSON.parse(voting.fields.Votes) : {};

    if (votes[userId]) {
      return res.status(400).json({ error: 'User already voted' });
    }

    votes[userId] = optionIndex;

    const updateResponse = await axios.patch(
      `${VOTINGS_URL}/${id}`,
      {
        fields: {
          Votes: JSON.stringify(votes),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('Vote recorded:', id, userId, optionIndex);
    res.json(updateResponse.data);
  } catch (error) {
    console.error('Error recording vote:', error.message);
    res.status(500).json({ error: `Failed to record vote: ${error.message}` });
  }
});

// Эндпоинт для генерации результатов голосования
app.post('/api/votings/:id/generate-results', async (req, res) => {
  try {
    const { id } = req.params;

    // Получение записи голосования
    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    const voting = votingResponse.data;
    const options = voting.fields.Options ? voting.fields.Options.split(',') : [];
    const votes = voting.fields.Votes ? JSON.parse(voting.fields.Votes) : {};
    const optionImages = voting.fields.OptionImages || [];

    // Подсчёт голосов
    const results = {};
    options.forEach((option, index) => {
      results[index] = { option, count: 0, percentage: 0, image: optionImages[index]?.url || null };
    });
    Object.values(votes).forEach((voteIndex) => {
      if (results[voteIndex]) results[voteIndex].count++;
    });
    const totalVotes = Object.values(results).reduce((sum, result) => sum + result.count, 0);
    Object.values(results).forEach((result) => {
      result.percentage = totalVotes > 0 ? Math.round((result.count / totalVotes) * 100) : 0;
    });

    // Генерация изображения результатов
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(800, 600);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = '#000000';
    ctx.font = '30px Arial';
    ctx.fillText(`Результаты голосования: ${voting.fields.Title || 'Без названия'}`, 20, 40);

    let y = 100;
    Object.values(results).forEach((result, index) => {
      ctx.font = '20px Arial';
      ctx.fillText(`${result.option}: ${result.count} голосов (${result.percentage}%)`, 20, y);
      y += 30;
    });

    const buffer = canvas.toBuffer('image/jpeg');
    const formData = new FormData();
    formData.append('image', buffer, { filename: `results_${id}.jpg` });

    const uploadResponse = await axios.post('https://upload.uploadcare.com/base/', formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Uploadcare.Simple ${UPLOADCARE_PUBLIC_KEY}:${UPLOADCARE_SECRET_KEY}`,
      },
    });

    if (!uploadResponse.data.file) {
      throw new Error('Uploadcare did not return a file UUID');
    }

    const imageUrl = `https://${UPLOADCARE_CDN_DOMAIN}/${uploadResponse.data.file}/`;
    console.log('Results image uploaded to Uploadcare:', imageUrl);

    // Сохранение результатов и изображения в Airtable
    const updateResponse = await axios.patch(
      `${VOTINGS_URL}/${id}`,
      {
        fields: {
          Results: JSON.stringify(results),
          ResultsImage: [{ url: imageUrl, filename: `voting_results_${id}_${Date.now()}.jpg` }],
          Status: 'Completed',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('Voting results saved to Airtable:', updateResponse.data);

    res.json({ success: true, imageUrl });
  } catch (error) {
    console.error('Error generating results:', error.message);
    res.status(500).json({ error: `Failed to generate results: ${error.message}` });
  }
});

// Эндпоинт для проверки админ-прав
app.get('/api/is-admin', async (req, res) => {
  try {
    const { userId } = req.query;
    const response = await axios.get(`${AIRTABLE_BASE_ID}/Admins?filterByFormula={UserID}="${userId}"`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    const isAdmin = response.data.records.length > 0;
    res.json({ isAdmin });
  } catch (error) {
    console.error('Error checking admin status:', error.message);
    res.status(500).json({ error: 'Failed to check admin status' });
  }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
