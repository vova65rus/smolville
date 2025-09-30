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
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const upload = multer({ dest: 'uploads/' });

// Env vars
const AIRTABLE_API_KEY = process.env.AIRTABLE_EVENTS_API_KEY || process.env.AIRTABLE_ADS_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const EVENTS_TABLE = process.env.AIRTABLE_EVENTS_TABLE_NAME || 'Events';
const ADS_TABLE = process.env.AIRTABLE_ADS_TABLE_NAME || 'Ads';
const VOTINGS_TABLE = process.env.AIRTABLE_VOTINGS_TABLE_NAME || 'Votings';

// Radikal API конфигурация
const RADIKAL_API_URL = 'https://radikal.cloud/api/1';
const RADIKAL_API_KEY = process.env.RADIKAL_API_KEY;

// Хардкод админа
const ADMIN_ID = 366825437;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !RADIKAL_API_KEY) {
  console.error('Missing env vars: Set AIRTABLE_API_KEY, AIRTABLE_BASE_ID, RADIKAL_API_KEY in Render');
  process.exit(1);
}

const EVENTS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${EVENTS_TABLE}`;
const ADS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ADS_TABLE}`;
const VOTINGS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${VOTINGS_TABLE}`;

app.get('/', (req, res) => {
  res.send('Smolville Backend is running! API endpoints: /api/events, /api/ads, /api/votings, /api/upload');
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Валидация ID
 */
function isValidId(id) {
  return id && typeof id === 'string' && id.length > 0;
}

/**
 * Логирование
 */
const logger = {
  info: (message, meta = {}) => {
    console.log(JSON.stringify({ level: 'info', message, timestamp: new Date().toISOString(), ...meta }));
  },
  error: (message, error = null, meta = {}) => {
    console.error(JSON.stringify({ 
      level: 'error', 
      message, 
      error: error?.message, 
      stack: error?.stack,
      timestamp: new Date().toISOString(), 
      ...meta 
    }));
  }
};

/**
 * Загружает файл в Radikal API
 */
async function uploadToRadikal(fileBuffer, filename, contentType = 'image/jpeg') {
  try {
    logger.info('Starting Radikal API upload', { filename, contentType, fileSize: fileBuffer.length });

    // Проверка размера файла
    if (fileBuffer.length > 10 * 1024 * 1024) {
      throw new Error('File size exceeds 10MB limit');
    }

    const formData = new FormData();
    formData.append('source', fileBuffer, {
      filename: filename,
      contentType: contentType
    });

    const response = await axios.post(`${RADIKAL_API_URL}/upload`, formData, {
      headers: {
        'X-API-Key': RADIKAL_API_KEY,
        ...formData.getHeaders(),
      },
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024
    });

    logger.info('Radikal API upload response', { status: response.status, data: response.data });

    if (response.data.status_code === 200 && response.data.image) {
      const imageData = response.data.image;
      logger.info('File uploaded successfully', { url: imageData.url });
      
      return {
        fileId: imageData.id_encoded || imageData.name,
        url: imageData.url,
        filename: filename,
        imageData: response.data.image
      };
    } else {
      throw new Error(response.data.error ? response.data.error.message : (response.data.status_txt || 'Upload failed'));
    }
  } catch (error) {
    logger.error('Radikal API upload error', error);
    if (error.code === 'ENOTFOUND') {
      throw new Error('Radikal API is unreachable');
    } else if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        throw new Error('Invalid Radikal API key');
      } else if (status === 413) {
        throw new Error('File too large for Radikal API');
      } else {
        throw new Error(`Radikal API error: ${status} - ${error.response.data?.error?.message || 'Unknown error'}`);
      }
    }
    throw error;
  }
}

/**
 * Удаляет файл из Radikal API
 */
async function deleteFromRadikal(fileId) {
  try {
    await axios.delete(`${RADIKAL_API_URL}/files/${fileId}`, {
      headers: {
        'X-API-Key': RADIKAL_API_KEY
      }
    });
    logger.info('File deleted from Radikal API', { fileId });
  } catch (error) {
    logger.error('Error deleting file from Radikal API', error);
    if (error.response && error.response.status === 404) {
      logger.info('Delete endpoint not available in Radikal Cloud');
      return;
    }
    throw error;
  }
}

/**
 * Расчет расстояния между координатами
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

// ==================== API ДЛЯ АДМИНА ====================

app.get('/api/is-admin', (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const isAdmin = userId === ADMIN_ID;
  res.json({ isAdmin });
});

// ==================== API ДЛЯ ЗАГРУЗКИ ИЗОБРАЖЕНИЙ ====================

app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    
    logger.info('Upload request received', { 
      filename: req.file.originalname,
      mimetype: req.file.mimetype 
    });
    
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    
    const uploadResult = await uploadToRadikal(
      fileBuffer,
      req.file.originalname || `upload_${Date.now()}.jpg`,
      req.file.mimetype
    );
    
    try {
      fs.unlinkSync(filePath);
    } catch (unlinkError) {
      logger.error('Error deleting temp file', unlinkError);
    }
    
    logger.info('Upload successful', { url: uploadResult.url });
    
    res.json({ 
      url: uploadResult.url,
      fileId: uploadResult.fileId,
      filename: uploadResult.filename
    });
    
  } catch (error) {
    logger.error('Upload error', error);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        logger.error('Error deleting temp file', unlinkError);
      }
    }
    res.status(500).json({ error: error.message });
  }
});

// ==================== API ДЛЯ СОБЫТИЙ С URL-ИЗОБРАЖЕНИЯМИ ====================

// Получить все события
app.get('/api/events', async (req, res) => {
  try {
    const response = await axios.get(EVENTS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    logger.error('Events GET error', error);
    res.status(500).json({ error: error.message });
  }
});

// Создать событие с изображением
app.post('/api/events', upload.single('image'), async (req, res) => {
  try {
    logger.info('Creating event with image upload');
    
    let imageUrl = null;
    let fileId = null;
    
    if (req.file) {
      const filePath = req.file.path;
      const fileBuffer = fs.readFileSync(filePath);
      
      const uploadResult = await uploadToRadikal(
        fileBuffer,
        req.file.originalname || `event_${Date.now()}.jpg`,
        req.file.mimetype
      );
      
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        logger.error('Error deleting temp file', unlinkError);
      }
      
      imageUrl = uploadResult.url;
      fileId = uploadResult.fileId;
      logger.info('Event image uploaded', { url: imageUrl });
    }
    
    const eventData = {
      fields: {
        ...req.body,
        ...(imageUrl && { 
          Image: imageUrl,
          ImageFileId: fileId 
        })
      }
    };
    
    logger.info('Creating event in Airtable', { data: eventData });
    
    const response = await axios.post(EVENTS_URL, eventData, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    
    res.json({
      ...response.data,
      uploadedImage: imageUrl ? { url: imageUrl, fileId: fileId } : null
    });
    
  } catch (error) {
    logger.error('Event creation with image error', error);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        logger.error('Error deleting temp file', unlinkError);
      }
    }
    res.status(500).json({ error: error.message });
  }
});

// Получить событие по ID
app.get('/api/events/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const response = await axios.get(`${EVENTS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    logger.error('Event GET error', error);
    res.status(500).json({ error: error.message });
  }
});

// Обновить событие с возможностью загрузки нового изображения
app.patch('/api/events/:id', upload.single('image'), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    logger.info('Updating event with image upload', { eventId: req.params.id });
    
    const updateData = { fields: { ...req.body } };
    let newImageUrl = null;
    let newFileId = null;
    
    if (req.file) {
      const filePath = req.file.path;
      const fileBuffer = fs.readFileSync(filePath);
      
      const uploadResult = await uploadToRadikal(
        fileBuffer,
        req.file.originalname || `event_${Date.now()}.jpg`,
        req.file.mimetype
      );
      
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        logger.error('Error deleting temp file', unlinkError);
      }
      
      newImageUrl = uploadResult.url;
      newFileId = uploadResult.fileId;
      updateData.fields.Image = newImageUrl;
      updateData.fields.ImageFileId = newFileId;
      logger.info('New event image uploaded', { url: newImageUrl });
    }
    
    logger.info('Updating event in Airtable', { data: updateData });
    
    const response = await axios.patch(`${EVENTS_URL}/${req.params.id}`, updateData, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    
    res.json({
      ...response.data,
      ...(newImageUrl && { uploadedImage: { url: newImageUrl, fileId: newFileId } })
    });
    
  } catch (error) {
    logger.error('Event update with image error', error);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        logger.error('Error deleting temp file', unlinkError);
      }
    }
    res.status(500).json({ error: error.message });
  }
});

// Удалить событие
app.delete('/api/events/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const eventResponse = await axios.get(`${EVENTS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    const event = eventResponse.data;
    if (event.fields && event.fields.ImageFileId) {
      try {
        await deleteFromRadikal(event.fields.ImageFileId);
      } catch (deleteError) {
        logger.error('Error deleting image from Radikal', deleteError);
      }
    }
    
    const response = await axios.delete(`${EVENTS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    res.json(response.data);
  } catch (error) {
    logger.error('Event DELETE error', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== API ДЛЯ РЕКЛАМЫ С URL-ИЗОБРАЖЕНИЯМИ ====================

// Получить всю рекламу
app.get('/api/ads', async (req, res) => {
  try {
    const response = await axios.get(ADS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    logger.error('Ads GET error', error);
    res.status(500).json({ error: error.message });
  }
});

// Создать рекламу с изображением
app.post('/api/ads', upload.single('image'), async (req, res) => {
  try {
    logger.info('Creating ad with image upload');
    
    let imageUrl = null;
    let fileId = null;
    
    if (req.file) {
      const filePath = req.file.path;
      const fileBuffer = fs.readFileSync(filePath);
      
      const uploadResult = await uploadToRadikal(
        fileBuffer,
        req.file.originalname || `ad_${Date.now()}.jpg`,
        req.file.mimetype
      );
      
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        logger.error('Error deleting temp file', unlinkError);
      }
      
      imageUrl = uploadResult.url;
      fileId = uploadResult.fileId;
    }
    
    const adData = {
      fields: {
        ...req.body,
        ...(imageUrl && { 
          Image: imageUrl,
          ImageFileId: fileId 
        })
      }
    };
    
    const response = await axios.post(ADS_URL, adData, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    
    res.json({
      ...response.data,
      uploadedImage: imageUrl ? { url: imageUrl, fileId: fileId } : null
    });
    
  } catch (error) {
    logger.error('Ad creation with image error', error);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        logger.error('Error deleting temp file', unlinkError);
      }
    }
    res.status(500).json({ error: error.message });
  }
});

// Обновить рекламу
app.patch('/api/ads/:id', upload.single('image'), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid ad ID' });
    }

    logger.info('Updating ad with image upload', { adId: req.params.id });
    
    const updateData = { fields: { ...req.body } };
    let newImageUrl = null;
    let newFileId = null;
    
    if (req.file) {
      const filePath = req.file.path;
      const fileBuffer = fs.readFileSync(filePath);
      
      const uploadResult = await uploadToRadikal(
        fileBuffer,
        req.file.originalname || `ad_${Date.now()}.jpg`,
        req.file.mimetype
      );
      
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        logger.error('Error deleting temp file', unlinkError);
      }
      
      newImageUrl = uploadResult.url;
      newFileId = uploadResult.fileId;
      updateData.fields.Image = newImageUrl;
      updateData.fields.ImageFileId = newFileId;
    }
    
    const response = await axios.patch(`${ADS_URL}/${req.params.id}`, updateData, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    
    res.json({
      ...response.data,
      ...(newImageUrl && { uploadedImage: { url: newImageUrl, fileId: newFileId } })
    });
    
  } catch (error) {
    logger.error('Ad update with image error', error);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        logger.error('Error deleting temp file', unlinkError);
      }
    }
    res.status(500).json({ error: error.message });
  }
});

// Удалить рекламу
app.delete('/api/ads/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid ad ID' });
    }

    const adResponse = await axios.get(`${ADS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    const ad = adResponse.data;
    if (ad.fields && ad.fields.ImageFileId) {
      try {
        await deleteFromRadikal(ad.fields.ImageFileId);
      } catch (deleteError) {
        logger.error('Error deleting image from Radikal', deleteError);
      }
    }
    
    const response = await axios.delete(`${ADS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    res.json(response.data);
  } catch (error) {
    logger.error('Ad DELETE error', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== API ДЛЯ ГОЛОСОВАНИЙ С URL-ИЗОБРАЖЕНИЯМИ ====================

// Получить все голосования
app.get('/api/votings', async (req, res) => {
  try {
    const response = await axios.get(VOTINGS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    logger.error('Votings GET error', error);
    res.status(500).json({ error: error.message });
  }
});

// Создать голосование с изображениями номинантов
app.post('/api/votings', upload.fields([
  { name: 'optionImages', maxCount: 10 }
]), async (req, res) => {
  try {
    logger.info('Creating voting with option images');
    
    const votingData = { fields: { ...req.body } };
    let optionImagesData = [];
    
    if (req.files && req.files.optionImages) {
      for (const file of req.files.optionImages) {
        const fileBuffer = fs.readFileSync(file.path);
        const uploadResult = await uploadToRadikal(
          fileBuffer,
          file.originalname || `option_${Date.now()}.jpg`,
          file.mimetype
        );
        
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkError) {
          logger.error('Error deleting temp file', unlinkError);
        }
        
        optionImagesData.push({
          url: uploadResult.url,
          fileId: uploadResult.fileId
        });
      }
      
      votingData.fields.OptionImages = JSON.stringify(optionImagesData.map(img => img.url));
      votingData.fields.OptionImagesFileIds = JSON.stringify(optionImagesData.map(img => img.fileId));
      logger.info('Option images uploaded', { count: optionImagesData.length });
    }
    
    const response = await axios.post(VOTINGS_URL, votingData, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    
    res.json({
      ...response.data,
      uploadedOptionImages: optionImagesData
    });
    
  } catch (error) {
    logger.error('Voting creation with images error', error);
    if (req.files && req.files.optionImages) {
      req.files.optionImages.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkError) {
          logger.error('Error deleting temp file', unlinkError);
        }
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Обновить голосование
app.patch('/api/votings/:id', upload.fields([
  { name: 'optionImages', maxCount: 10 }
]), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid voting ID' });
    }

    logger.info('Updating voting with option images', { votingId: req.params.id });
    
    const updateData = { fields: { ...req.body } };
    let newOptionImagesData = [];
    
    if (req.files && req.files.optionImages) {
      for (const file of req.files.optionImages) {
        const fileBuffer = fs.readFileSync(file.path);
        const uploadResult = await uploadToRadikal(
          fileBuffer,
          file.originalname || `option_${Date.now()}.jpg`,
          file.mimetype
        );
        
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkError) {
          logger.error('Error deleting temp file', unlinkError);
        }
        
        newOptionImagesData.push({
          url: uploadResult.url,
          fileId: uploadResult.fileId
        });
      }
      
      updateData.fields.OptionImages = JSON.stringify(newOptionImagesData.map(img => img.url));
      updateData.fields.OptionImagesFileIds = JSON.stringify(newOptionImagesData.map(img => img.fileId));
    }
    
    const response = await axios.patch(`${VOTINGS_URL}/${req.params.id}`, updateData, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    
    res.json({
      ...response.data,
      ...(newOptionImagesData.length > 0 && { uploadedOptionImages: newOptionImagesData })
    });
    
  } catch (error) {
    logger.error('Voting update with images error', error);
    if (req.files && req.files.optionImages) {
      req.files.optionImages.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkError) {
          logger.error('Error deleting temp file', unlinkError);
        }
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Удалить голосование
app.delete('/api/votings/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid voting ID' });
    }

    const votingResponse = await axios.get(`${VOTINGS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    const voting = votingResponse.data;
    if (voting.fields && voting.fields.OptionImagesFileIds) {
      try {
        const fileIds = JSON.parse(voting.fields.OptionImagesFileIds);
        for (const fileId of fileIds) {
          await deleteFromRadikal(fileId);
        }
      } catch (deleteError) {
        logger.error('Error deleting option images from Radikal', deleteError);
      }
    }
    
    const response = await axios.delete(`${VOTINGS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    res.json(response.data);
  } catch (error) {
    logger.error('Votings DELETE error', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ОСТАВШИЕСЯ API БЕЗ ИЗМЕНЕНИЙ ====================

// Получить голосования по ID мероприятия
app.get('/api/events/:eventId/votings', async (req, res) => {
  try {
    const { eventId } = req.params;
    const response = await axios.get(VOTINGS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      params: {
        filterByFormula: `{EventID} = '${eventId}'`
      }
    });
    res.json(response.data);
  } catch (error) {
    logger.error('Event votings GET error', error);
    res.status(500).json({ error: error.message });
  }
});

// Проголосовать
app.post('/api/votings/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, optionIndex, userLat, userLon } = req.body;

    logger.info('Received vote request', { id, userId, optionIndex, userLat, userLon });

    if (!userId || optionIndex === undefined || userLat === undefined || userLon === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    const voting = votingResponse.data;
    if (!voting.fields) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    if (voting.fields.Status === 'Completed') {
      return res.status(400).json({ error: 'Voting is completed' });
    }

    const votedUserIds = voting.fields.VotedUserIDs || '';
    const votedUsersArray = votedUserIds.split(',').filter(id => id && id.trim());
    
    if (votedUsersArray.includes(userId.toString())) {
      return res.status(400).json({ error: 'Вы уже проголосовали в этом голосовании' });
    }

    const votingLat = voting.fields.Latitude;
    const votingLon = voting.fields.Longitude;
    
    if (votingLat && votingLon && userLat && userLon) {
      const distance = calculateDistance(userLat, userLon, votingLat, votingLon);
      logger.info('Calculated distance', { distance });
      if (distance > 1000) {
        return res.status(400).json({ error: 'Вы находитесь слишком далеко от места голосования' });
      }
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

    logger.info('Updating voting record', { updateData });

    const updateResponse = await axios.patch(`${VOTINGS_URL}/${id}`, updateData, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json' 
      }
    });

    logger.info('Vote updated successfully');
    res.json({ success: true, voting: updateResponse.data });
  } catch (error) {
    logger.error('Vote error', error);
    res.status(500).json({ error: error.message });
  }
});

// Проверить статус голосования пользователя
app.get('/api/votings/:id/vote-status/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;

    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    const voting = votingResponse.data;
    if (!voting.fields) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    const votedUserIds = voting.fields.VotedUserIDs || '';
    const votedUsersArray = votedUserIds.split(',').filter(id => id && id.trim());
    
    const hasVoted = votedUsersArray.includes(userId.toString());
    let userVote = null;
    if (voting.fields.Votes) {
      const votes = JSON.parse(voting.fields.Votes);
      userVote = votes[userId] !== undefined ? votes[userId] : null;
    }

    res.json({ hasVoted, userVote });
  } catch (error) {
    logger.error('Vote status error', error);
    res.status(500).json({ error: error.message });
  }
});

// Завершить голосование и посчитать результаты
app.post('/api/votings/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;

    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    const voting = votingResponse.data;
    if (!voting.fields) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    const votes = voting.fields.Votes ? 
      (typeof voting.fields.Votes === 'string' ? JSON.parse(voting.fields.Votes) : voting.fields.Votes) 
      : {};
    
    const results = [];
    
    if (voting.fields.Options) {
      const options = voting.fields.Options.split(',');
      
      const voteCounts = {};
      options.forEach((option, index) => {
        voteCounts[index] = 0;
      });
      
      Object.values(votes).forEach(voteIndex => {
        if (voteCounts[voteIndex] !== undefined) {
          voteCounts[voteIndex]++;
        }
      });

      const totalVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);
      
      options.forEach((option, index) => {
        const count = voteCounts[index] || 0;
        const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        
        results.push({
          option: option,
          count: count,
          percentage: percentage
        });
      });
    }

    const updateResponse = await axios.patch(`${VOTINGS_URL}/${id}`, {
      fields: { 
        Status: 'Completed',
        Results: JSON.stringify(results)
      }
    }, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json' 
      }
    });

    res.json({ success: true, results: results, voting: updateResponse.data });
  } catch (error) {
    logger.error('Complete voting error', error);
    res.status(500).json({ error: error.message });
  }
});

// Генерация изображения с результатами голосования
app.post('/api/votings/:id/generate-results', async (req, res) => {
  try {
    const { id } = req.params;

    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });

    const voting = votingResponse.data;
    if (!voting.fields) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    if (!voting.fields.Results) {
      return res.status(400).json({ error: 'Результаты голосования недоступны' });
    }

    let results;
    try {
      if (typeof voting.fields.Results === 'string') {
        results = JSON.parse(voting.fields.Results);
      } else {
        results = voting.fields.Results;
      }
    } catch (parseError) {
      logger.error('Error parsing results', parseError);
      return res.status(400).json({ error: 'Неверный формат результатов голосования' });
    }

    let resultsArray = [];
    if (Array.isArray(results)) {
      resultsArray = results;
    } else if (results && typeof results === 'object') {
      resultsArray = Object.values(results);
    } else {
      return res.status(400).json({ error: 'Неверный формат результатов' });
    }

    const title = voting.fields.Title || 'Результаты голосования';
    const description = voting.fields.Description || '';
    
    let optionImages = [];
    if (voting.fields.OptionImages) {
      try {
        if (typeof voting.fields.OptionImages === 'string') {
          optionImages = JSON.parse(voting.fields.OptionImages);
        } else {
          optionImages = voting.fields.OptionImages;
        }
      } catch (e) {
        logger.error('Error parsing option images', e);
      }
    }

    let height = 600;
    const hasImages = optionImages && optionImages.length > 0;
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
        <text x="400" y="50" class="title" text-anchor="middle">${title}</text>
        <text x="400" y="80" class="description" text-anchor="middle">${description}</text>
    `;

    let y = 120;
    resultsArray.forEach((result, index) => {
      const barWidth = (result.percentage / 100) * 400;
      const barColor = index % 2 === 0 ? '#4CAF50' : '#2196F3';
      
      svg += `
        <rect x="100" y="${y}" width="400" height="40" fill="#e0e0e0" rx="5"/>
        <rect x="100" y="${y}" width="${barWidth}" height="40" fill="${barColor}" rx="5"/>
        <text x="20" y="${y + 25}" class="option">${result.option}</text>
        <text x="520" y="${y + 25}" class="stats" text-anchor="end">${result.count} голосов (${result.percentage}%)</text>
      `;
      y += 50;
    });

    if (hasImages) {
      y += 20;
      svg += `<text x="400" y="${y}" class="description" text-anchor="middle">Изображения номинантов</text>`;
      y += 30;
      
      resultsArray.forEach((result, index) => {
        const imageUrl = optionImages[index];
        if (imageUrl) {
          const col = index % 3;
          const row = Math.floor(index / 3);
          svg += `<image x="${100 + col * 200}" y="${y + row * 110}" width="150" height="100" href="${imageUrl}" preserveAspectRatio="xMidYMid meet"/>`;
        }
      });
    }

    svg += `</svg>`;

    const svgBuffer = Buffer.from(svg);
    const imageBuffer = await sharp(svgBuffer)
      .resize(800, height, {
        fit: 'fill',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .jpeg({ 
        quality: 90,
        chromaSubsampling: '4:4:4'
      })
      .toBuffer();

    const uploadResult = await uploadToRadikal(
      imageBuffer, 
      `voting_results_${id}_${Date.now()}.jpg`,
      'image/jpeg'
    );

    logger.info('Results image uploaded to Radikal API', { url: uploadResult.url });
    
    try {
      const updateResponse = await axios.patch(`${VOTINGS_URL}/${id}`, {
        fields: { 
          ResultsImage: uploadResult.url,
          ResultsImageFileId: uploadResult.fileId
        }
      }, {
        headers: { 
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json' 
        }
      });
      
      logger.info('ResultsImage saved to Airtable successfully');
    } catch (updateError) {
      logger.error('Error saving ResultsImage to Airtable', updateError);
    }

    res.json({ 
      success: true, 
      imageUrl: uploadResult.url,
      fileId: uploadResult.fileId
    });

  } catch (error) {
    logger.error('Generate results image error', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== API ДЛЯ "Я ПОЙДУ!" ====================

app.post('/api/events/:eventId/attend', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body;

    logger.info(`User ${userId} attending event ${eventId}`);

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const eventResponse = await axios.get(`${EVENTS_URL}/${eventId}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });

    const event = eventResponse.data;
    if (!event.fields) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const currentAttendees = event.fields.AttendeesIDs || '';
    const currentCount = event.fields.AttendeesCount || 0;
    
    let attendeesArray = [];
    if (Array.isArray(currentAttendees)) {
      attendeesArray = currentAttendees.filter(id => id && id.toString().trim());
    } else if (typeof currentAttendees === 'string') {
      attendeesArray = currentAttendees.split(',').filter(id => id && id.trim());
    }

    const userIdStr = userId.toString();
    if (attendeesArray.includes(userIdStr)) {
      return res.status(400).json({ error: 'User already attending' });
    }

    attendeesArray.push(userIdStr);
    const newAttendees = attendeesArray.join(',');
    const newCount = currentCount + 1;

    const updateData = {
      fields: {
        AttendeesIDs: newAttendees,
        AttendeesCount: newCount
      }
    };

    const updateResponse = await axios.patch(`${EVENTS_URL}/${eventId}`, updateData, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json' 
      }
    });

    logger.info('Update successful');
    res.json({ success: true, count: newCount, attending: true });
    
  } catch (error) {
    logger.error('Attend error', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events/:eventId/unattend', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body;

    logger.info(`User ${userId} unattending event ${eventId}`);

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const eventResponse = await axios.get(`${EVENTS_URL}/${eventId}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });

    const event = eventResponse.data;
    if (!event.fields) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const currentAttendees = event.fields.AttendeesIDs || '';
    const currentCount = event.fields.AttendeesCount || 0;
    
    let attendeesArray = [];
    if (Array.isArray(currentAttendees)) {
      attendeesArray = currentAttendees.filter(id => id && id.toString().trim());
    } else if (typeof currentAttendees === 'string') {
      attendeesArray = currentAttendees.split(',').filter(id => id && id.trim());
    }

    const userIdStr = userId.toString();
    const newAttendeesArray = attendeesArray.filter(id => id !== userIdStr);
    const newAttendees = newAttendeesArray.join(',');
    const newCount = Math.max(0, newAttendeesArray.length);

    const updateData = {
      fields: {
        AttendeesIDs: newAttendees,
        AttendeesCount: newCount
      }
    };

    const updateResponse = await axios.patch(`${EVENTS_URL}/${eventId}`, updateData, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json' 
      }
    });

    logger.info('Unattend successful');
    res.json({ success: true, count: newCount, attending: false });
    
  } catch (error) {
    logger.error('Unattend error', error);
    res.status(500).json({ error: error.message });
  }
});

// Проверяем статус участия пользователя
app.get('/api/events/:eventId/attend-status/:userId', async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    logger.info(`Checking attend status for user ${userId} in event ${eventId}`);

    const eventResponse = await axios.get(`${EVENTS_URL}/${eventId}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });

    const event = eventResponse.data;
    if (!event.fields) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const attendees = event.fields.AttendeesIDs || '';
    let attendeesArray = [];
    if (Array.isArray(attendees)) {
      attendeesArray = attendees.filter(id => id && id.toString().trim());
    } else if (typeof attendees === 'string') {
      attendeesArray = attendees.split(',').filter(id => id && id.trim());
    }
    
    const isAttending = attendeesArray.includes(userId.toString());

    logger.info('Is attending', { isAttending });
    res.json({ isAttending });
    
  } catch (error) {
    logger.error('Attend status error', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ЗАВЕРШЕНИЕ НАСТРОЙКИ СЕРВЕРА ====================

// Создание папки uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Запуск сервера
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Radikal API URL: ${RADIKAL_API_URL}`);
  console.log('Image storage: URLs in Airtable, files in Radikal Cloud');
});