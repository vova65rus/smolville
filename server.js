const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const { createCanvas } = require('canvas');
const geolib = require('geolib');

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

// Env vars
const AIRTABLE_API_KEY = process.env.AIRTABLE_EVENTS_API_KEY || process.env.AIRTABLE_ADS_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const EVENTS_TABLE = process.env.AIRTABLE_EVENTS_TABLE_NAME || 'Events';
const ADS_TABLE = process.env.AIRTABLE_ADS_TABLE_NAME || 'Ads';
const POLLS_TABLE = 'Polls';
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
const ADMIN_ID = parseInt(process.env.adminId) || 366825437;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !IMGBB_API_KEY) {
  console.error('Missing env vars: Set AIRTABLE_API_KEY, AIRTABLE_BASE_ID, IMGBB_API_KEY, adminId in .env');
  process.exit(1);
}

const EVENTS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${EVENTS_TABLE}`;
const ADS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ADS_TABLE}`;
const POLLS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${POLLS_TABLE}`;

app.get('/', (req, res) => {
  res.send('Smolville Backend is running! API endpoints: /api/events, /api/ads, /api/upload, /api/polls, /api/attend');
});

// Проверка админа
app.get('/api/is-admin', (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const isAdmin = userId === ADMIN_ID;
  res.json({ isAdmin });
});

// Существующие API для events и ads (без изменений)
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

app.get('/api/ads', async (req, res) => {
  try {
    const response = await axios.get(ADS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ads GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    const response = await axios.post(ADS_URL, req.body, {
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
    const response = await axios.patch(`${ADS_URL}/${req.params.id}`, req.body, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ads PATCH error:', error.message);
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

// API для посещения ("Я пойду")
app.post('/api/attend', async (req, res) => {
  try {
    const { eventId, userId } = req.body;
    const eventRes = await axios.get(`${EVENTS_URL}/${eventId}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    let attendees = eventRes.data.fields.Attendees || [];
    if (attendees.includes(userId)) {
      return res.json({ error: 'Already attending' });
    }
    attendees.push(userId);
    await axios.patch(`${EVENTS_URL}/${eventId}`, { fields: { Attendees: attendees, AttendeesCount: attendees.length } }, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    res.json({ success: true, count: attendees.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API для голосования
app.get('/api/polls/:eventId', async (req, res) => {
  try {
    const response = await axios.get(POLLS_URL, {
      params: { filterByFormula: `{EventId}="${req.params.eventId}"` },
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    const poll = response.data.records[0]?.fields || {};
    if (poll.Nominees) poll.Nominees = JSON.parse(poll.Nominees);
    res.json(poll);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/polls', async (req, res) => {
  if (req.body.Nominees) req.body.Nominees = JSON.stringify(req.body.Nominees);
  try {
    const response = await axios.post(POLLS_URL, { fields: req.body }, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/polls/:id', async (req, res) => {
  if (req.body.Nominees) req.body.Nominees = JSON.stringify(req.body.Nominees);
  try {
    const response = await axios.patch(`${POLLS_URL}/${req.params.id}`, { fields: req.body }, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vote', async (req, res) => {
  const { eventId, nomineeId, userId, lat, lng } = req.body;
  try {
    const pollRes = await axios.get(POLLS_URL, {
      params: { filterByFormula: `{EventId}="${eventId}"` },
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    let poll = pollRes.data.records[0]?.fields;
    if (!poll || !poll.IsActive) return res.json({ error: 'Poll not active' });

    // Гео-проверка
    const eventRes = await axios.get(`${EVENTS_URL}/${eventId}`, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    const eventLoc = eventRes.data.fields;
    if (eventLoc.LocationLat && eventLoc.LocationLng) {
      const distance = geolib.getDistance({ latitude: lat, longitude: lng }, { latitude: eventLoc.LocationLat, longitude: eventLoc.LocationLng });
      if (distance > 1000) {
        return res.json({ error: 'You are not in the event area (1km radius)' });
      }
    }

    // Проверка одного голоса
    let votes = poll.Votes || {};
    if (votes[userId]) return res.json({ error: 'Already voted' });

    votes[userId] = nomineeId;
    let nominees = JSON.parse(poll.Nominees || '[]');
    const nominee = nominees.find(n => n.id === nomineeId);
    if (nominee) nominee.votes = (nominee.votes || 0) + 1;

    await axios.patch(`${POLLS_URL}/${pollRes.data.records[0].id}`, { fields: { Nominees: JSON.stringify(nominees), Votes: votes } }, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Стоп голосования и выгрузка
app.post('/api/polls/:eventId/stop', async (req, res) => {
  const { format } = req.body;
  try {
    const pollRes = await axios.get(POLLS_URL, {
      params: { filterByFormula: `{EventId}="${req.params.eventId}"` },
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    let poll = pollRes.data.records[0]?.fields;
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    // Деактивируем
    await axios.patch(`${POLLS_URL}/${pollRes.data.records[0].id}`, { fields: { IsActive: false } }, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' }
    });

    let nominees = JSON.parse(poll.Nominees || '[]');
    const sorted = nominees.sort((a, b) => b.votes - a.votes);

    if (format === 'docx') {
      const doc = new Document({
        sections: [{
          children: sorted.map(n => new Paragraph({ children: [new TextRun(`${n.name}: ${n.votes || 0} голосов`)] }))
        }]
      });
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(`./uploads/poll_results.docx`, buffer);
      res.download(`./uploads/poll_results.docx`);
    } else {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 800, 600);
      ctx.fillStyle = 'black';
      ctx.font = '20px Arial';
      let y = 20;
      sorted.forEach(n => {
        ctx.fillText(`${n.name}: ${n.votes || 0} голосов`, 10, y);
        y += 30;
      });
      const buffer = canvas.toBuffer('image/jpeg');
      fs.writeFileSync(`./uploads/poll_results.jpg`, buffer);
      res.download(`./uploads/poll_results.jpg`);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Создание папки uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
