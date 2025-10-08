// server.js — Airtable + Radikal backend с автоматическим проксированием attachment ссылок
const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const sharp = require('sharp');

const app = express();
const port = process.env.PORT || 3000;

// Middleware для CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const upload = multer({ dest: 'uploads/' });

// Env vars (оставлены как в твоём оригинальном коде)
const AIRTABLE_API_KEY = process.env.AIRTABLE_EVENTS_API_KEY || process.env.AIRTABLE_ADS_API_KEY || process.env.AIRTABLE_VOTINGS_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const EVENTS_TABLE = process.env.AIRTABLE_EVENTS_TABLE_NAME || 'Events';
const ADS_TABLE = process.env.AIRTABLE_ADS_TABLE_NAME || 'Ads';
const VOTINGS_TABLE = process.env.AIRTABLE_VOTINGS_TABLE_NAME || 'Votings';

// Radikal API конфигурация
const RADIKAL_API_URL = 'https://radikal.cloud/api/1';
const RADIKAL_API_KEY = process.env.RADIKAL_API_KEY;

// Админ
const ADMIN_ID = 366825437;

// Проверки env (оставим как было)
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !RADIKAL_API_KEY) {
  console.error('Missing env vars: Set AIRTABLE_API_KEY (events/ads/votings), AIRTABLE_BASE_ID, RADIKAL_API_KEY in Render');
  process.exit(1);
}

const EVENTS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(EVENTS_TABLE)}`;
const ADS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(ADS_TABLE)}`;
const VOTINGS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(VOTINGS_TABLE)}`;

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

// Построение базового адреса прокси — если SERVER_DOMAIN задан в env, используем его, иначе строим от запроса
function buildProxyBase(req) {
  if (process.env.SERVER_DOMAIN && process.env.SERVER_DOMAIN.trim()) {
    return process.env.SERVER_DOMAIN.replace(/\/$/, '');
  }
  // fallback к динамическому домену (должно работать в Render)
  const proto = req.protocol;
  const host = req.get('host');
  return `${proto}://${host}`;
}

// Рекурсивно обходим объект/массив и заменяем airtableusercontent ссылки на проксированные
function replaceImageUrls(obj, req) {
  if (Array.isArray(obj)) {
    return obj.map(item => replaceImageUrls(item, req));
  } else if (obj && typeof obj === 'object') {
    // если это объект attachment вида {id, url, filename, size, type}
    if (obj.url && typeof obj.url === 'string' && obj.url.includes('v5.airtableusercontent.com')) {
      const base = buildProxyBase(req);
      return {
        ...obj,
        // заменяем url на прокси (оставляем оригинал в originalUrl)
        originalUrl: obj.url,
        url: `${base}/api/proxy-image?url=${encodeURIComponent(obj.url)}`
      };
    }
    const newObj = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = replaceImageUrls(obj[key], req);
    }
    return newObj;
  } else if (typeof obj === 'string' && obj.includes('v5.airtableusercontent.com')) {
    const base = buildProxyBase(req);
    return `${base}/api/proxy-image?url=${encodeURIComponent(obj)}`;
  }
  return obj;
}

// Универсальная обёртка для обработки ответов Airtable (массив/объект)
function processAirtableResponseData(data, req) {
  // Airtable responses часто имеют { records: [ { id, fields, ... } ], offset }
  if (!data) return data;
  const cloned = JSON.parse(JSON.stringify(data)); // простая клонировка
  return replaceImageUrls(cloned, req);
}

// ========== RADIKAL API ФУНКЦИИ ==========
async function uploadToRadikal(fileBuffer, filename, contentType = 'image/jpeg') {
  try {
    const formData = new FormData();
    formData.append('source', fileBuffer, {
      filename,
      contentType
    });

    const response = await axios.post(`${RADIKAL_API_URL}/upload`, formData, {
      headers: {
        'X-API-Key': RADIKAL_API_KEY,
        ...formData.getHeaders()
      },
      timeout: 30000
    });

    if (response.data && (response.data.status_code === 200 || response.data.status_code === '200') && response.data.image) {
      const imageData = response.data.image;
      return {
        fileId: imageData.id_encoded || imageData.name,
        url: imageData.url,
        filename,
        imageData: response.data.image
      };
    } else {
      throw new Error(response.data && response.data.error ? response.data.error.message || JSON.stringify(response.data) : 'Radikal upload failed');
    }
  } catch (err) {
    console.error('Radikal upload error:', err.message);
    if (err.response) {
      console.error('Radikal response:', err.response.status, err.response.data);
    }
    throw err;
  }
}

async function deleteFromRadikal(fileId) {
  try {
    await axios.delete(`${RADIKAL_API_URL}/files/${fileId}`, {
      headers: { 'X-API-Key': RADIKAL_API_KEY }
    });
  } catch (err) {
    console.error('Radikal delete error:', err.message);
    if (err.response && err.response.status === 404) {
      return;
    }
    throw err;
  }
}

async function getRadikalFileInfo(fileId) {
  try {
    const response = await axios.get(`${RADIKAL_API_URL}/files/${fileId}`, {
      headers: { 'X-API-Key': RADIKAL_API_KEY }
    });
    return response.data;
  } catch (err) {
    console.error('Radikal file info error:', err.message);
    if (err.response && err.response.status === 404) {
      return null;
    }
    throw err;
  }
}

// ========== ПРОКСИ ДЛЯ AIRTABLE ATTACHMENTS ==========
app.get('/api/proxy-image', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing url' });
    }
    // Простая валидация — только v5.airtableusercontent.com разрешаем
    if (!url.includes('v5.airtableusercontent.com')) {
      return res.status(400).json({ error: 'Only v5.airtableusercontent.com URLs are allowed' });
    }

    // Используем stream, чтобы не держать весь файл в памяти (axios stream)
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SmolvilleApp/1.0)',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      },
      timeout: 20000
    });

    // Прокинем content-type и cache-control
    if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // кэш на сутки
    // Можно добавить ETag/Last-Modified тут при необходимости

    response.data.pipe(res);
    response.data.on('error', (err) => {
      console.error('Stream error while proxying image:', err.message);
      try { res.end(); } catch (e) {}
    });
  } catch (err) {
    console.error('Proxy image error:', err.message);
    // Если Airtable временно блокирует, вернём 502 для клиента
    res.status(502).json({ error: 'Failed to fetch image from Airtable' });
  }
});

// ========== API ДЛЯ АДМИНА ==========
app.get('/api/is-admin', (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const isAdmin = userId === ADMIN_ID;
  res.json({ isAdmin });
});

// ========== API ЗАГРУЗКИ ИЗОБРАЖЕНИЙ (Radikal) ==========
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });

    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);

    const uploadResult = await uploadToRadikal(fileBuffer, req.file.originalname || `upload_${Date.now()}.jpg`, req.file.mimetype);

    // удаляем temp
    try { fs.unlinkSync(filePath); } catch (e) { console.error('unlink error', e.message); }

    res.json({ url: uploadResult.url, fileId: uploadResult.fileId, filename: uploadResult.filename });
  } catch (err) {
    console.error('Upload error:', err.message);
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) { console.error('unlink error', e.message); }
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/votings/upload-option-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });

    const fileBuffer = fs.readFileSync(req.file.path);
    const uploadResult = await uploadToRadikal(fileBuffer, req.file.originalname || `option_image_${Date.now()}.jpg`, req.file.mimetype);

    try { fs.unlinkSync(req.file.path); } catch (e) { console.error('unlink error', e.message); }

    res.json({ url: uploadResult.url, filename: uploadResult.filename, fileId: uploadResult.fileId });
  } catch (err) {
    console.error('Option upload error:', err.message);
    try { if (req.file) fs.unlinkSync(req.file.path); } catch (e) {}
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/upload/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    await deleteFromRadikal(fileId);
    res.json({ success: true, message: `File ${fileId} deleted successfully` });
  } catch (err) {
    console.error('Delete file error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== HELPERS ДЛЯ AIRTABLE ВЫЗОВОВ ==========
function airtableHeaders() {
  return { Authorization: `Bearer ${AIRTABLE_API_KEY}` };
}

// Универсальная обёртка GET по Airtable (list)
async function airtableGet(url, req, res, params = {}) {
  try {
    const response = await axios.get(url, { headers: airtableHeaders(), params });
    const processed = processAirtableResponseData(response.data, req);
    return res.json(processed);
  } catch (err) {
    console.error('Airtable GET error:', err.message);
    if (err.response) {
      console.error('Airtable response', err.response.status, err.response.data);
      return res.status(err.response.status).json({ error: err.response.data });
    }
    res.status(500).json({ error: err.message });
  }
}

// Универсальная обёртка POST/PATCH (которые возвращают данные от Airtable)
async function airtableSend(method, url, body, req, res) {
  try {
    const response = await axios({
      method,
      url,
      headers: { ...airtableHeaders(), 'Content-Type': 'application/json' },
      data: body
    });
    const processed = processAirtableResponseData(response.data, req);
    res.json(processed);
  } catch (err) {
    console.error(`Airtable ${method} error:`, err.message);
    if (err.response) {
      console.error('Airtable response', err.response.status, err.response.data);
      return res.status(err.response.status).json({ error: err.response.data });
    }
    res.status(500).json({ error: err.message });
  }
}

// ========== EVENTS API ==========
app.get('/api/events', (req, res) => airtableGet(EVENTS_URL, req, res, req.query));
app.post('/api/events', (req, res) => airtableSend('post', EVENTS_URL, req.body, req, res));
app.get('/api/events/:id', (req, res) => airtableGet(`${EVENTS_URL}/${req.params.id}`, req, res));
app.patch('/api/events/:id', (req, res) => airtableSend('patch', `${EVENTS_URL}/${req.params.id}`, req.body, req, res));
app.delete('/api/events/:id', async (req, res) => {
  try {
    const response = await axios.delete(`${EVENTS_URL}/${req.params.id}`, { headers: airtableHeaders() });
    // Airtable delete returns { deleted: true, id: 'rec...' }
    res.json(response.data);
  } catch (err) {
    console.error('Event DELETE error:', err.message);
    if (err.response) return res.status(err.response.status).json({ error: err.response.data });
    res.status(500).json({ error: err.message });
  }
});

// ========== ADS API ==========
app.get('/api/ads', (req, res) => airtableGet(ADS_URL, req, res, req.query));
app.post('/api/ads', (req, res) => airtableSend('post', ADS_URL, req.body, req, res));
app.get('/api/ads/:id', (req, res) => airtableGet(`${ADS_URL}/${req.params.id}`, req, res));
app.patch('/api/ads/:id', (req, res) => airtableSend('patch', `${ADS_URL}/${req.params.id}`, req.body, req, res));
app.delete('/api/ads/:id', async (req, res) => {
  try {
    const response = await axios.delete(`${ADS_URL}/${req.params.id}`, { headers: airtableHeaders() });
    res.json(response.data);
  } catch (err) {
    console.error('Ad DELETE error:', err.message);
    if (err.response) return res.status(err.response.status).json({ error: err.response.data });
    res.status(500).json({ error: err.message });
  }
});

// ========== VOTINGS API ==========
app.get('/api/votings', (req, res) => airtableGet(VOTINGS_URL, req, res, req.query));
app.post('/api/votings', (req, res) => airtableSend('post', VOTINGS_URL, req.body, req, res));
app.get('/api/votings/:id', (req, res) => airtableGet(`${VOTINGS_URL}/${req.params.id}`, req, res));
app.patch('/api/votings/:id', (req, res) => airtableSend('patch', `${VOTINGS_URL}/${req.params.id}`, req.body, req, res));
app.delete('/api/votings/:id', async (req, res) => {
  try {
    const response = await axios.delete(`${VOTINGS_URL}/${req.params.id}`, { headers: airtableHeaders() });
    res.json(response.data);
  } catch (err) {
    console.error('Votings DELETE error:', err.message);
    if (err.response) return res.status(err.response.status).json({ error: err.response.data });
    res.status(500).json({ error: err.message });
  }
});

// Получить голосования по ID мероприятия
app.get('/api/events/:eventId/votings', async (req, res) => {
  try {
    const { eventId } = req.params;
    const response = await axios.get(VOTINGS_URL, {
      headers: airtableHeaders(),
      params: { filterByFormula: `{EventID} = '${eventId}'` }
    });
    const processed = processAirtableResponseData(response.data, req);
    res.json(processed);
  } catch (err) {
    console.error('Event votings GET error:', err.message);
    if (err.response) return res.status(err.response.status).json({ error: err.response.data });
    res.status(500).json({ error: err.message });
  }
});

// ========== VOTING ACTIONS (vote, status, complete, generate-results) ==========
app.post('/api/votings/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, optionIndex, userLat, userLon } = req.body;

    if (!userId || optionIndex === undefined || userLat === undefined || userLon === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, { headers: airtableHeaders() });
    const voting = votingResponse.data;
    if (!voting.fields) return res.status(404).json({ error: 'Голосование не найдено' });
    if (voting.fields.Status === 'Completed') return res.status(400).json({ error: 'Voting is completed' });

    const votedUserIds = voting.fields.VotedUserIDs || '';
    const votedUsersArray = (typeof votedUserIds === 'string' ? votedUserIds.split(',') : votedUserIds).filter(Boolean);

    if (votedUsersArray.includes(userId.toString())) return res.status(400).json({ error: 'Вы уже проголосовали в этом голосовании' });

    const votingLat = voting.fields.Latitude;
    const votingLon = voting.fields.Longitude;
    if (votingLat && votingLon && userLat && userLon) {
      const distance = calculateDistance(userLat, userLon, votingLat, votingLon);
      if (distance > 1000) return res.status(400).json({ error: 'Вы находитесь слишком далеко от места голосования' });
    }

    let currentVotes = voting.fields.Votes ? JSON.parse(voting.fields.Votes) : {};
    currentVotes[userId] = optionIndex;
    const newVotedUserIDs = votedUserIds ? `${votedUserIds},${userId}` : userId.toString();

    const updateData = {
      fields: {
        Votes: JSON.stringify(currentVotes),
        VotedUserIDs: newVotedUserIDs
      }
    };

    const updateResponse = await axios.patch(`${VOTINGS_URL}/${id}`, updateData, {
      headers: { ...airtableHeaders(), 'Content-Type': 'application/json' }
    });

    const processed = processAirtableResponseData(updateResponse.data, req);
    res.json({ success: true, voting: processed });
  } catch (err) {
    console.error('Vote error:', err.message);
    if (err.response) return res.status(err.response.status).json({ error: err.response.data });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/votings/:id/vote-status/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;
    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, { headers: airtableHeaders() });
    const voting = votingResponse.data;
    if (!voting.fields) return res.status(404).json({ error: 'Голосование не найдено' });

    const votedUserIds = voting.fields.VotedUserIDs || '';
    const votedUsersArray = (typeof votedUserIds === 'string' ? votedUserIds.split(',') : votedUserIds).filter(Boolean);
    const hasVoted = votedUsersArray.includes(userId.toString());
    let userVote = null;
    if (voting.fields.Votes) {
      const votes = JSON.parse(voting.fields.Votes);
      userVote = votes[userId] !== undefined ? votes[userId] : null;
    }

    res.json({ hasVoted, userVote });
  } catch (err) {
    console.error('Vote status error:', err.message);
    if (err.response) return res.status(err.response.status).json({ error: err.response.data });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/votings/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, { headers: airtableHeaders() });
    const voting = votingResponse.data;
    if (!voting.fields) return res.status(404).json({ error: 'Голосование не найдено' });

    const votes = voting.fields.Votes ? (typeof voting.fields.Votes === 'string' ? JSON.parse(voting.fields.Votes) : voting.fields.Votes) : {};
    const results = [];

    if (voting.fields.Options) {
      const options = typeof voting.fields.Options === 'string' ? voting.fields.Options.split(',') : voting.fields.Options;
      const voteCounts = {};
      options.forEach((opt, idx) => voteCounts[idx] = 0);
      Object.values(votes).forEach(voteIndex => {
        if (voteCounts[voteIndex] !== undefined) voteCounts[voteIndex]++;
      });
      const totalVotes = Object.values(voteCounts).reduce((s, c) => s + c, 0);
      options.forEach((option, index) => {
        const count = voteCounts[index] || 0;
        const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        results.push({ option, count, percentage });
      });
    }

    const updateResponse = await axios.patch(`${VOTINGS_URL}/${id}`, {
      fields: { Status: 'Completed', Results: JSON.stringify(results) }
    }, { headers: { ...airtableHeaders(), 'Content-Type': 'application/json' } });

    const processed = processAirtableResponseData(updateResponse.data, req);
    res.json({ success: true, results, voting: processed });
  } catch (err) {
    console.error('Complete voting error:', err.message);
    if (err.response) return res.status(err.response.status).json({ error: err.response.data });
    res.status(500).json({ error: err.message });
  }
});

// Генерация изображения с результатами голосования (с учётом проксированных ссылок)
app.post('/api/votings/:id/generate-results', async (req, res) => {
  try {
    const { id } = req.params;
    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, { headers: airtableHeaders() });
    const voting = votingResponse.data;
    if (!voting.fields) return res.status(404).json({ error: 'Голосование не найдено' });
    if (!voting.fields.Results) return res.status(400).json({ error: 'Результаты голосования недоступны' });

    let results;
    try {
      results = typeof voting.fields.Results === 'string' ? JSON.parse(voting.fields.Results) : voting.fields.Results;
    } catch (e) {
      console.error('Error parsing results:', e.message);
      return res.status(400).json({ error: 'Неверный формат результатов голосования' });
    }

    let resultsArray = Array.isArray(results) ? results : Object.values(results || {});
    const title = voting.fields.Title || 'Результаты голосования';
    const description = voting.fields.Description || '';

    // Получаем option images — могут прийти в виде attachment array [{url, filename, ...}, ...]
    const optionImages = voting.fields.OptionImages || [];
    // Проксируем локально для встраивания в svg — используем текущий req для buildProxyBase
    const processedOptionImages = Array.isArray(optionImages) ? optionImages.map(img => {
      if (img && img.url && typeof img.url === 'string' && img.url.includes('v5.airtableusercontent.com')) {
        const base = buildProxyBase(req);
        return { ...img, url: `${base}/api/proxy-image?url=${encodeURIComponent(img.url)}` };
      }
      return img;
    }) : optionImages;

    let height = 600;
    const hasImages = processedOptionImages && processedOptionImages.length > 0;
    if (hasImages) height += Math.ceil(resultsArray.length / 3) * 110;

    let svg = `
      <svg width="800" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .title { font-family: Arial, sans-serif; font-size: 24px; font-weight: bold; fill: #000; }
          .description { font-family: Arial, sans-serif; font-size: 16px; fill: #666; }
          .option { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; fill: #000; }
          .stats { font-family: Arial, sans-serif; font-size: 16px; fill: #666; }
        </style>
        <rect width="800" height="${height}" fill="#ffffff"/>
        <text x="400" y="50" class="title" text-anchor="middle">${escapeXml(title)}</text>
        <text x="400" y="80" class="description" text-anchor="middle">${escapeXml(description)}</text>
    `;

    let y = 120;
    resultsArray.forEach((result, index) => {
      const barWidth = (result.percentage / 100) * 400;
      const barColor = index % 2 === 0 ? '#4CAF50' : '#2196F3';
      svg += `
        <rect x="100" y="${y}" width="400" height="40" fill="#e0e0e0" rx="5"/>
        <rect x="100" y="${y}" width="${barWidth}" height="40" fill="${barColor}" rx="5"/>
        <text x="20" y="${y + 25}" class="option">${escapeXml(result.option)}</text>
        <text x="520" y="${y + 25}" class="stats" text-anchor="end">${result.count} голосов (${result.percentage}%)</text>
      `;
      y += 50;
    });

    if (hasImages) {
      y += 20;
      svg += `<text x="400" y="${y}" class="description" text-anchor="middle">Изображения номинантов</text>`;
      y += 30;
      resultsArray.forEach((result, index) => {
        const imgObj = processedOptionImages[index];
        if (imgObj && imgObj.url) {
          const col = index % 3;
          const row = Math.floor(index / 3);
          svg += `<image x="${100 + col * 200}" y="${y + row * 110}" width="150" height="100" href="${imgObj.url}" preserveAspectRatio="xMidYMid meet"/>`;
        }
      });
    }

    svg += `</svg>`;

    const svgBuffer = Buffer.from(svg);
    const imageBuffer = await sharp(svgBuffer)
      .resize(800, height, { fit: 'fill', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
      .toBuffer();

    const uploadResult = await uploadToRadikal(imageBuffer, `voting_results_${id}_${Date.now()}.jpg`, 'image/jpeg');

    // Сохраним ResultsImage в Airtable
    try {
      await axios.patch(`${VOTINGS_URL}/${id}`, {
        fields: { ResultsImage: uploadResult.url }
      }, {
        headers: { ...airtableHeaders(), 'Content-Type': 'application/json' }
      });
    } catch (updateError) {
      console.error('Error saving ResultsImage to Airtable:', updateError.message);
    }

    res.json({ success: true, imageUrl: uploadResult.url, fileId: uploadResult.fileId });
  } catch (err) {
    console.error('Generate results image error:', err.message);
    if (err.response) return res.status(err.response.status).json({ error: err.response.data });
    res.status(500).json({ error: err.message });
  }
});

// ========== API ДЛЯ "Я ПОЙДУ!" ==========
app.post('/api/events/:eventId/attend', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const eventResponse = await axios.get(`${EVENTS_URL}/${eventId}`, { headers: airtableHeaders() });
    const event = eventResponse.data;
    if (!event.fields) return res.status(404).json({ error: 'Event not found' });

    let currentAttendees = event.fields.AttendeesIDs || '';
    let currentCount = event.fields.AttendeesCount || 0;

    let attendeesArray = Array.isArray(currentAttendees) ? currentAttendees.filter(Boolean) : (typeof currentAttendees === 'string' ? currentAttendees.split(',').filter(Boolean) : []);
    const userIdStr = userId.toString();
    if (attendeesArray.includes(userIdStr)) return res.status(400).json({ error: 'User already attending' });

    attendeesArray.push(userIdStr);
    const newAttendees = attendeesArray.join(',');
    const newCount = (Number(currentCount) || 0) + 1;

    const updateData = { fields: { AttendeesIDs: newAttendees, AttendeesCount: newCount } };
    const updateResponse = await axios.patch(`${EVENTS_URL}/${eventId}`, updateData, { headers: { ...airtableHeaders(), 'Content-Type': 'application/json' } });

    const processed = processAirtableResponseData(updateResponse.data, req);
    res.json({ success: true, count: newCount, attending: true, event: processed });
  } catch (err) {
    console.error('Attend error:', err.message);
    if (err.response) return res.status(err.response.status).json({ error: err.response.data });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/:eventId/unattend', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const eventResponse = await axios.get(`${EVENTS_URL}/${eventId}`, { headers: airtableHeaders() });
    const event = eventResponse.data;
    if (!event.fields) return res.status(404).json({ error: 'Event not found' });

    let currentAttendees = event.fields.AttendeesIDs || '';
    let attendeesArray = Array.isArray(currentAttendees) ? currentAttendees.filter(Boolean) : (typeof currentAttendees === 'string' ? currentAttendees.split(',').filter(Boolean) : []);
    const userIdStr = userId.toString();
    const newAttendeesArray = attendeesArray.filter(id => id !== userIdStr);
    const newAttendees = newAttendeesArray.join(',');
    const newCount = Math.max(0, newAttendeesArray.length);

    const updateData = { fields: { AttendeesIDs: newAttendees, AttendeesCount: newCount } };
    const updateResponse = await axios.patch(`${EVENTS_URL}/${eventId}`, updateData, { headers: { ...airtableHeaders(), 'Content-Type': 'application/json' } });

    const processed = processAirtableResponseData(updateResponse.data, req);
    res.json({ success: true, count: newCount, attending: false, event: processed });
  } catch (err) {
    console.error('Unattend error:', err.message);
    if (err.response) return res.status(err.response.status).json({ error: err.response.data });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events/:eventId/attend-status/:userId', async (req, res) => {
  try {
    const { eventId, userId } = req.params;
    const eventResponse = await axios.get(`${EVENTS_URL}/${eventId}`, { headers: airtableHeaders() });
    const event = eventResponse.data;
    if (!event.fields) return res.status(404).json({ error: 'Event not found' });

    const attendees = event.fields.AttendeesIDs || '';
    const attendeesArray = Array.isArray(attendees) ? attendees.filter(Boolean) : (typeof attendees === 'string' ? attendees.split(',').filter(Boolean) : []);
    const isAttending = attendeesArray.includes(userId.toString());
    res.json({ isAttending });
  } catch (err) {
    console.error('Attend status error:', err.message);
    if (err.response) return res.status(err.response.status).json({ error: err.response.data });
    res.status(500).json({ error: err.message });
  }
});

// ========== УТИЛИТЫ ==========
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
function deg2rad(deg) { return deg * (Math.PI/180); }

// Простая XML-эскейп функция для svg-текста
function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Создание папки uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Корневой маршрут
app.get('/', (req, res) => {
  res.send('Smolville Backend is running! API endpoints: /api/events, /api/ads, /api/votings, /api/upload, /api/proxy-image');
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Radikal API URL: ${RADIKAL_API_URL}`);
  console.log('Make sure RADIKAL_API_KEY and AIRTABLE_* env vars are set in environment variables');
});
