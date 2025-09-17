require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const FormData = require('form-data');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
const upload = multer();

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_EVENTS_TABLE_NAME = process.env.AIRTABLE_EVENTS_TABLE_NAME || 'Events';
const AIRTABLE_ADS_TABLE_NAME = process.env.AIRTABLE_ADS_TABLE_NAME || 'Ads';
const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const EVENTS_URL = `${BASE_URL}/${AIRTABLE_EVENTS_TABLE_NAME}`;
const ADS_URL = `${BASE_URL}/${AIRTABLE_ADS_TABLE_NAME}`;

app.get('/api/is-admin', (req, res) => {
  const userId = req.query.userId;
  const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
  res.json({ isAdmin: adminIds.includes(userId) });
});

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
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Events POST error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/events/:id', async (req, res) => {
  try {
    const response = await axios.patch(`${EVENTS_URL}/${req.params.id}`, req.body, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Events PATCH error:', error.message);
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
    console.error('Events DELETE error:', error.message);
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
    const adData = {
      fields: {
        ID: req.body.fields.ID,
        IMG: req.body.fields.Image,
        URL: req.body.fields.Link
      }
    };
    const response = await axios.post(ADS_URL, adData, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ads POST error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/ads/:id', async (req, res) => {
  try {
    const adData = {
      fields: {
        ID: req.body.fields.ID,
        IMG: req.body.fields.Image,
        URL: req.body.fields.Link
      }
    };
    const response = await axios.patch(`${ADS_URL}/${req.params.id}`, adData, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ads PATCH error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    const response = await axios.delete(`${ADS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ads DELETE error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    const form = new FormData();
    form.append('file', req.file.buffer, req.file.originalname);
    const uploadResponse = await axios.post('https://api.imgur.com/3/image', form, {
      headers: { Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}` }
    });
    res.json({ url: uploadResponse.data.data.link });
  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
