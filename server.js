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

// Uploadcare конфигурация
const UPLOADCARE_PUB_KEY = process.env.UPLOADCARE_PUB_KEY;
const UPLOADCARE_SECRET_KEY = process.env.UPLOADCARE_SECRET_KEY;
const UPLOADCARE_CDN_BASE = process.env.UPLOADCARE_CDN_BASE || 'https://62wb4q8n36.ucarecd.net';

// Хардкод админа
const ADMIN_ID = 366825437;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !UPLOADCARE_PUB_KEY || !UPLOADCARE_SECRET_KEY) {
  console.error('Missing env vars: Set AIRTABLE_API_KEY, AIRTABLE_BASE_ID, UPLOADCARE_PUB_KEY, UPLOADCARE_SECRET_KEY in Render');
  process.exit(1);
}

const EVENTS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${EVENTS_TABLE}`;
const ADS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ADS_TABLE}`;
const VOTINGS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${VOTINGS_TABLE}`;

// Uploadcare API endpoints
const UPLOADCARE_UPLOAD_URL = 'https://upload.uploadcare.com/base/';
const UPLOADCARE_FILES_URL = 'https://api.uploadcare.com/files/';

app.get('/', (req, res) => {
  res.send('Smolville Backend is running! API endpoints: /api/events, /api/ads, /api/votings, /api/upload');
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ UPLOADCARE ====================

/**
 * Генерирует CDN URL согласно документации Uploadcare CDN
 * Формат: https://cdn.mydomain.com/{uuid}/{operation1}/{operation2}/.../{filename}
 */
function generateUploadcareCDNUrl(fileId, operations = [], filename = null) {
  // Базовый URL с кастомным CDN доменом
  let cdnUrl = `${UPLOADCARE_CDN_BASE}/${fileId}`;
  
  // Добавляем операции
  if (operations && operations.length > 0) {
    operations.forEach(operation => {
      cdnUrl += `/${operation}`;
    });
  }
  
  // Добавляем имя файла если указано
  if (filename) {
    cdnUrl += `/${encodeURIComponent(filename)}`;
  }
  
  return cdnUrl;
}

/**
 * Генерирует URL для операций с изображениями
 */
function generateImageUrlWithOperations(fileId, operations = {}) {
  const ops = [];
  
  // Ресайз
  if (operations.resize) {
    ops.push(`-/resize/${operations.resize}/`);
  }
  
  // Кроп
  if (operations.crop) {
    ops.push(`-/crop/${operations.crop}/`);
  }
  
  // Формат
  if (operations.format) {
    ops.push(`-/format/${operations.format}/`);
  }
  
  // Качество
  if (operations.quality) {
    ops.push(`-/quality/${operations.quality}/`);
  }
  
  // Превью
  if (operations.preview) {
    ops.push(`-/preview/${operations.preview}/`);
  }
  
  // Умный ресайз
  if (operations.smartResize) {
    ops.push(`-/smart_resize/${operations.smartResize}/`);
  }
  
  // Установить размер
  if (operations.setSize) {
    ops.push(`-/set_size/${operations.setSize}/`);
  }
  
  // Обрезать по размеру
  if (operations.cropSize) {
    ops.push(`-/crop_size/${operations.cropSize}/`);
  }
  
  // Масштабировать
  if (operations.scale) {
    ops.push(`-/scale_crop/${operations.scale}/`);
  }
  
  return generateUploadcareCDNUrl(fileId, ops, operations.filename);
}

/**
 * Загружает файл в Uploadcare
 */
async function uploadToUploadcare(fileBuffer, filename, contentType = 'image/jpeg') {
  try {
    console.log('Starting Uploadcare upload...');
    console.log('Filename:', filename);
    console.log('Content type:', contentType);
    console.log('File size:', fileBuffer.length, 'bytes');
    
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: filename,
      contentType: contentType
    });
    formData.append('UPLOADCARE_PUB_KEY', UPLOADCARE_PUB_KEY);
    formData.append('UPLOADCARE_STORE', '1');
    
    console.log('Uploadcare Public Key:', UPLOADCARE_PUB_KEY ? 'Set' : 'Missing');
    console.log('CDN Base:', UPLOADCARE_CDN_BASE);

    const response = await axios.post(UPLOADCARE_UPLOAD_URL, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000
    });

    console.log('Uploadcare upload response:', response.data);

    if (response.data.file) {
      const fileId = response.data.file;
      console.log('File uploaded successfully, file ID:', fileId);
      
      // Генерируем CDN URL с кастомным доменом
      const cdnUrl = generateUploadcareCDNUrl(fileId, [], filename);
      
      console.log('Generated CDN URL:', cdnUrl);
      
      return {
        fileId: fileId,
        url: cdnUrl,
        filename: filename,
        cdnUrl: cdnUrl
      };
    } else {
      throw new Error('Uploadcare response missing file ID');
    }
  } catch (error) {
    console.error('Uploadcare upload error:', error.message);
    if (error.response) {
      console.error('Uploadcare response status:', error.response.status);
      console.error('Uploadcare response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Получает информацию о файле из Uploadcare
 */
async function getUploadcareFileInfo(fileId) {
  try {
    console.log('Getting file info for:', fileId);
    
    const response = await axios.get(`${UPLOADCARE_FILES_URL}${fileId}/`, {
      headers: {
        'Authorization': `Uploadcare.Simple ${UPLOADCARE_PUB_KEY}:${UPLOADCARE_SECRET_KEY}`,
        'Accept': 'application/vnd.uploadcare-v0.7+json'
      }
    });
    
    console.log('File info retrieved successfully');
    return response.data;
  } catch (error) {
    console.error('Error getting file info from Uploadcare:', error.message);
    if (error.response) {
      console.error('File info error response:', error.response.data);
    }
    throw error;
  }
}

/**
 * Удаляет файл из Uploadcare
 */
async function deleteFromUploadcare(fileId) {
  try {
    await axios.delete(`${UPLOADCARE_FILES_URL}${fileId}/storage/`, {
      headers: {
        'Authorization': `Uploadcare.Simple ${UPLOADCARE_PUB_KEY}:${UPLOADCARE_SECRET_KEY}`,
        'Accept': 'application/vnd.uploadcare-v0.7+json'
      }
    });
    console.log(`File ${fileId} deleted from Uploadcare`);
  } catch (error) {
    console.error('Error deleting file from Uploadcare:', error.message);
  }
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
    
    console.log('Upload request received');
    console.log('Original filename:', req.file.originalname);
    console.log('Mimetype:', req.file.mimetype);
    console.log('File size:', req.file.size, 'bytes');
    
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    
    // Загружаем в Uploadcare
    const uploadResult = await uploadToUploadcare(
      fileBuffer,
      req.file.originalname || `upload_${Date.now()}.jpg`,
      req.file.mimetype
    );
    
    fs.unlinkSync(filePath);
    
    console.log('Upload successful, URL:', uploadResult.url);
    
    res.json({ 
      url: uploadResult.url,
      fileId: uploadResult.fileId,
      filename: uploadResult.filename
    });
    
  } catch (error) {
    console.error('Upload error:', error.message);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting temp file:', unlinkError.message);
      }
    }
    res.status(500).json({ error: error.message });
  }
});

// API для загрузки изображений номинантов
app.post('/api/votings/upload-option-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    
    console.log('Option image upload request received');
    console.log('Original filename:', req.file.originalname);
    console.log('Mimetype:', req.file.mimetype);
    
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    
    // Загружаем в Uploadcare
    const uploadResult = await uploadToUploadcare(
      fileBuffer,
      req.file.originalname || `option_image_${Date.now()}.jpg`,
      req.file.mimetype
    );
    
    fs.unlinkSync(filePath);
    
    console.log('Option image upload successful, URL:', uploadResult.url);
    
    res.json({ 
      url: uploadResult.url,
      filename: uploadResult.filename,
      fileId: uploadResult.fileId
    });
    
  } catch (error) {
    console.error('Option image upload error:', error.message);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting temp file:', unlinkError.message);
      }
    }
    res.status(500).json({ error: error.message });
  }
});

// Новый эндпоинт для генерации URL с операциями над изображением
app.get('/api/upload/:fileId/url', (req, res) => {
  try {
    const { fileId } = req.params;
    const { 
      resize, 
      crop, 
      format, 
      quality, 
      preview, 
      smartResize,
      setSize,
      cropSize,
      scale,
      filename 
    } = req.query;
    
    const operations = {
      ...(resize && { resize }),
      ...(crop && { crop }),
      ...(format && { format }),
      ...(quality && { quality }),
      ...(preview && { preview }),
      ...(smartResize && { smartResize }),
      ...(setSize && { setSize }),
      ...(cropSize && { cropSize }),
      ...(scale && { scale }),
      ...(filename && { filename })
    };
    
    const url = generateImageUrlWithOperations(fileId, operations);
    
    res.json({
      fileId: fileId,
      url: url,
      operations: operations,
      cdnBase: UPLOADCARE_CDN_BASE
    });
  } catch (error) {
    console.error('Generate URL error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Эндпоинт для удаления изображений
app.delete('/api/upload/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    await deleteFromUploadcare(fileId);
    
    res.json({ success: true, message: `File ${fileId} deleted successfully` });
    
  } catch (error) {
    console.error('Delete file error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ПРИМЕРЫ CDN ОПЕРАЦИЙ ====================

app.get('/api/upload/examples/:fileId', (req, res) => {
  const { fileId } = req.params;
  
  const examples = {
    original: generateUploadcareCDNUrl(fileId),
    
    // Ресайз
    resize_800x600: generateImageUrlWithOperations(fileId, { resize: '800x600' }),
    resize_50percent: generateImageUrlWithOperations(fileId, { resize: '50x/' }),
    
    // Кроп
    crop_300x300: generateImageUrlWithOperations(fileId, { crop: '300x300' }),
    crop_center: generateImageUrlWithOperations(fileId, { crop: '300x300/center' }),
    
    // Форматы
    webp: generateImageUrlWithOperations(fileId, { format: 'webp' }),
    avif: generateImageUrlWithOperations(fileId, { format: 'avif' }),
    
    // Качество
    quality_light: generateImageUrlWithOperations(fileId, { quality: 'lightest' }),
    quality_best: generateImageUrlWithOperations(fileId, { quality: 'best' }),
    
    // Превью
    preview_100x100: generateImageUrlWithOperations(fileId, { preview: '100x100' }),
    
    // Комбинированные операции
    optimized_web: generateImageUrlWithOperations(fileId, { 
      resize: '1200x630',
      format: 'webp',
      quality: 'smart'
    }),
    
    thumbnail: generateImageUrlWithOperations(fileId, {
      smartResize: '300x300',
      format: 'webp'
    })
  };
  
  res.json({
    fileId: fileId,
    cdnBase: UPLOADCARE_CDN_BASE,
    examples: examples
  });
});

// ==================== API ДЛЯ СОБЫТИЙ ====================

app.get('/api/events', async (req, res) => {
  try {
    const response = await axios.get(EVENTS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Events GET error:', error.message);
    if (error.response) {
      console.error('Airtable response:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    console.log('Creating event with data:', JSON.stringify(req.body, null, 2));
    
    const response = await axios.post(EVENTS_URL, req.body, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Events POST error:', error.message);
    if (error.response) {
      console.error('Airtable response:', error.response.data);
    }
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
    if (error.response) {
      console.error('Airtable response:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/events/:id', async (req, res) => {
  try {
    console.log('Updating event with data:', JSON.stringify(req.body, null, 2));
    
    const response = await axios.patch(`${EVENTS_URL}/${req.params.id}`, req.body, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Event PATCH error:', error.message);
    if (error.response) {
      console.error('Airtable response:', error.response.data);
    }
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
    if (error.response) {
      console.error('Airtable response:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// ==================== API ДЛЯ РЕКЛАМЫ ====================

app.get('/api/ads', async (req, res) => {
  try {
    const response = await axios.get(ADS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ads GET error:', error.message);
    if (error.response) {
      console.error('Airtable response:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    const response = await axios.post(ADS_URL, req.body, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ads POST error:', error.message);
    if (error.response) {
      console.error('Airtable response:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/ads/:id', async (req, res) => {
  try {
    const response = await axios.patch(`${ADS_URL}/${req.params.id}`, req.body, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Ads PATCH error:', error.message);
    if (error.response) {
      console.error('Airtable response:', error.response.data);
    }
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
    console.error('Ad DELETE error:', error.message);
    if (error.response) {
      console.error('Airtable response:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// ==================== API ДЛЯ ГОЛОСОВАНИЙ ====================

app.get('/api/votings', async (req, res) => {
  try {
    const response = await axios.get(VOTINGS_URL, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Votings GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/votings', async (req, res) => {
  try {
    const response = await axios.post(VOTINGS_URL, req.body, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Votings POST error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/votings/:id', async (req, res) => {
  try {
    const response = await axios.patch(`${VOTINGS_URL}/${req.params.id}`, req.body, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Votings PATCH error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/votings/:id', async (req, res) => {
  try {
    const response = await axios.delete(`${VOTINGS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Votings DELETE error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

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
    console.error('Event votings GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Проголосовать
app.post('/api/votings/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, optionIndex, userLat, userLon } = req.body;

    console.log('Received vote request:', { id, userId, optionIndex, userLat, userLon });

    if (!userId || optionIndex === undefined || userLat === undefined || userLon === undefined) {
      console.error('Missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    const voting = votingResponse.data;
    if (!voting.fields) {
      console.error('Voting not found');
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    if (voting.fields.Status === 'Completed') {
      console.error('Voting is completed');
      return res.status(400).json({ error: 'Voting is completed' });
    }

    const votedUserIds = voting.fields.VotedUserIDs || '';
    const votedUsersArray = votedUserIds.split(',').filter(id => id && id.trim());
    
    if (votedUsersArray.includes(userId.toString())) {
      console.error('User has already voted');
      return res.status(400).json({ error: 'Вы уже проголосовали в этом голосовании' });
    }

    const votingLat = voting.fields.Latitude;
    const votingLon = voting.fields.Longitude;
    
    if (votingLat && votingLon && userLat && userLon) {
      const distance = calculateDistance(userLat, userLon, votingLat, votingLon);
      console.log('Calculated distance:', distance);
      if (distance > 1000) {
        console.error('User is too far away');
        return res.status(400).json({ error: 'Вы находитесь слишком далеко от места голосования' });
      }
    }

    let currentVotes = voting.fields.Votes ? JSON.parse(voting.fields.Votes) : {};
    console.log('Current votes:', currentVotes);

    currentVotes[userId] = optionIndex;
    console.log('Updated votes:', currentVotes);

    const newVotedUserIDs = votedUserIds ? `${votedUserIds},${userId}` : userId.toString();

    const updateData = {
      fields: { 
        Votes: JSON.stringify(currentVotes),
        VotedUserIDs: newVotedUserIDs
      }
    };

    console.log('Updating voting record with:', JSON.stringify(updateData, null, 2));

    const updateResponse = await axios.patch(`${VOTINGS_URL}/${id}`, updateData, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json' 
      }
    });

    console.log('Vote updated successfully:', updateResponse.data);
    res.json({ success: true, voting: updateResponse.data });
  } catch (error) {
    console.error('Vote error:', error.message);
    if (error.response) {
      console.error('Airtable response:', error.response.data);
    }
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
    console.error('Vote status error:', error.message);
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
    console.error('Complete voting error:', error.message);
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
      console.error('Error parsing results:', parseError);
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
    
    const optionImages = voting.fields.OptionImages || [];
    console.log('OptionImages from Airtable:', JSON.stringify(optionImages, null, 2));

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
        let imageUrl = null;
        if (optionImages[index]) {
          if (typeof optionImages[index] === 'object' && optionImages[index].url) {
            imageUrl = optionImages[index].url;
          } else if (Array.isArray(optionImages) && optionImages[index] && optionImages[index].url) {
            imageUrl = optionImages[index].url;
          }
        }
        
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

    const uploadResult = await uploadToUploadcare(
      imageBuffer, 
      `voting_results_${id}_${Date.now()}.jpg`,
      'image/jpeg'
    );

    console.log('Results image uploaded to Uploadcare:', uploadResult.url);
    
    try {
      const updateResponse = await axios.patch(`${VOTINGS_URL}/${id}`, {
        fields: { 
          ResultsImage: uploadResult.url
        }
      }, {
        headers: { 
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json' 
        }
      });
      
      console.log('ResultsImage saved to Airtable successfully');
    } catch (updateError) {
      console.error('Error saving ResultsImage to Airtable:', updateError.message);
    }

    res.json({ 
      success: true, 
      imageUrl: uploadResult.url,
      fileId: uploadResult.fileId
    });

  } catch (error) {
    console.error('Generate results image error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== API ДЛЯ "Я ПОЙДУ!" ====================

app.post('/api/events/:eventId/attend', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body;

    console.log(`User ${userId} attending event ${eventId}`);

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
    
    console.log('Current attendees:', currentAttendees);
    console.log('Current count:', currentCount);

    let attendeesArray = [];
    
    if (Array.isArray(currentAttendees)) {
      attendeesArray = currentAttendees.filter(id => id && id.toString().trim());
    } else if (typeof currentAttendees === 'string') {
      attendeesArray = currentAttendees.split(',').filter(id => id && id.trim());
    }

    const userIdStr = userId.toString();
    if (attendeesArray.includes(userIdStr)) {
      console.log('User already attending');
      return res.status(400).json({ error: 'User already attending' });
    }

    attendeesArray.push(userIdStr);
    const newAttendees = attendeesArray.join(',');
    const newCount = currentCount + 1;

    console.log('New attendees:', newAttendees);
    console.log('New count:', newCount);

    const updateData = {
      fields: {
        AttendeesIDs: newAttendees,
        AttendeesCount: newCount
      }
    };

    console.log('Update data:', JSON.stringify(updateData, null, 2));

    const updateResponse = await axios.patch(`${EVENTS_URL}/${eventId}`, updateData, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json' 
      }
    });

    console.log('Update successful:', updateResponse.data);
    res.json({ success: true, count: newCount, attending: true });
    
  } catch (error) {
    console.error('Attend error:', error.message);
    if (error.response) {
      console.error('Airtable response status:', error.response.status);
      console.error('Airtable response data:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events/:eventId/unattend', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body;

    console.log(`User ${userId} unattending event ${eventId}`);

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
    
    console.log('Current attendees:', currentAttendees);
    console.log('Current count:', currentCount);

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

    console.log('New attendees:', newAttendees);
    console.log('New count:', newCount);

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

    console.log('Unattend successful');
    res.json({ success: true, count: newCount, attending: false });
    
  } catch (error) {
    console.error('Unattend error:', error.message);
    if (error.response) {
      console.error('Airtable response:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Проверяем статус участия пользователя
app.get('/api/events/:eventId/attend-status/:userId', async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    console.log(`Checking attend status for user ${userId} in event ${eventId}`);

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

    console.log('Is attending:', isAttending);
    res.json({ isAttending });
    
  } catch (error) {
    console.error('Attend status error:', error.message);
    if (error.response) {
      console.error('Airtable response:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

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

// Создание папки uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Запуск сервера
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Uploadcare CDN Base: ${UPLOADCARE_CDN_BASE}`);
  console.log('CDN URL format: ' + UPLOADCARE_CDN_BASE + '/{file_id}/{operations}/{filename}');
  console.log('Examples:');
  console.log('- Original: ' + UPLOADCARE_CDN_BASE + '/{file_id}');
  console.log('- Resized: ' + UPLOADCARE_CDN_BASE + '/{file_id}/-/resize/800x600/');
  console.log('- WebP: ' + UPLOADCARE_CDN_BASE + '/{file_id}/-/format/webp/');
});
