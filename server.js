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

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ RADIKAL API ====================

/**
 * Загружает файл в Radikal API
 */
async function uploadToRadikal(fileBuffer, filename, contentType = 'image/jpeg') {
  try {
    console.log('Starting Radikal API upload...');
    console.log('Filename:', filename);
    console.log('Content type:', contentType);
    console.log('File size:', fileBuffer.length, 'bytes');

    const formData = new FormData();
    formData.append('source', fileBuffer, {
      filename: filename,
      contentType: contentType
    });

    console.log('Radikal API Key:', RADIKAL_API_KEY ? 'Set' : 'Missing');
    console.log('API URL:', `${RADIKAL_API_URL}/upload`);

    const response = await axios.post(`${RADIKAL_API_URL}/upload`, formData, {
      headers: {
        'X-API-Key': RADIKAL_API_KEY,
        ...formData.getHeaders(),
      },
      timeout: 30000
    });

    console.log('Radikal API upload response:', response.data);

    if (response.data.status_code === 200 && response.data.image) {
      const imageData = response.data.image;
      console.log('File uploaded successfully, URL:', imageData.url);
      
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
    console.error('Radikal API upload error:', error.message);
    if (error.response) {
      console.error('Radikal API response status:', error.response.status);
      console.error('Radikal API response data:', error.response.data);
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
    console.log(`File ${fileId} deleted from Radikal API`);
  } catch (error) {
    console.error('Error deleting file from Radikal API:', error.message);
    if (error.response && error.response.status === 404) {
      console.log('Delete endpoint not available in Radikal Cloud');
      return;
    }
    throw error;
  }
}

// ==================== API ДЛЯ АДМИНА ====================

app.get('/api/is-admin', (req, res) => {
  const userId = parseInt(req.query.userId, 10);
  const isAdmin = userId === ADMIN_ID;
  res.json({ isAdmin });
});

// ==================== API ДЛЯ ЗАГРУЗКИ ИЗОБРАЖЕНИЙ ====================

// Базовый эндпоинт для загрузки изображений (возвращает URL)
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    
    console.log('Upload request received');
    console.log('Original filename:', req.file.originalname);
    console.log('Mimetype:', req.file.mimetype);
    
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
      console.error('Error deleting temp file:', unlinkError.message);
    }
    
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

// ==================== API ДЛЯ СОБЫТИЙ С URL-ИЗОБРАЖЕНИЯМИ ====================

// Получить все события (без изменений)
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

// Создать событие с изображением
app.post('/api/events', upload.single('image'), async (req, res) => {
  try {
    console.log('Creating event with image upload');
    
    let imageUrl = null;
    let fileId = null;
    
    // Если есть изображение - загружаем в Radikal Cloud
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
        console.error('Error deleting temp file:', unlinkError.message);
      }
      
      imageUrl = uploadResult.url;
      fileId = uploadResult.fileId;
      console.log('Event image uploaded, URL:', imageUrl);
    }
    
    // Подготавливаем данные для Airtable
    const eventData = {
      fields: {
        ...req.body,
        ...(imageUrl && { 
          Image: imageUrl,
          ImageFileId: fileId 
        })
      }
    };
    
    console.log('Creating event in Airtable with data:', JSON.stringify(eventData, null, 2));
    
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
    console.error('Event creation with image error:', error.message);
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

// Получить событие по ID (без изменений)
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

// Обновить событие с возможностью загрузки нового изображения
app.patch('/api/events/:id', upload.single('image'), async (req, res) => {
  try {
    console.log('Updating event with image upload');
    
    const updateData = { fields: { ...req.body } };
    let newImageUrl = null;
    let newFileId = null;
    
    // Если есть новое изображение - загружаем и добавляем URL
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
        console.error('Error deleting temp file:', unlinkError.message);
      }
      
      newImageUrl = uploadResult.url;
      newFileId = uploadResult.fileId;
      updateData.fields.Image = newImageUrl;
      updateData.fields.ImageFileId = newFileId;
      console.log('New event image uploaded, URL:', newImageUrl);
    }
    
    console.log('Updating event in Airtable with data:', JSON.stringify(updateData, null, 2));
    
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
    console.error('Event update with image error:', error.message);
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

// Удалить событие
app.delete('/api/events/:id', async (req, res) => {
  try {
    // Сначала получаем событие, чтобы удалить изображение если есть
    const eventResponse = await axios.get(`${EVENTS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    const event = eventResponse.data;
    if (event.fields && event.fields.ImageFileId) {
      try {
        await deleteFromRadikal(event.fields.ImageFileId);
      } catch (deleteError) {
        console.error('Error deleting image from Radikal:', deleteError.message);
      }
    }
    
    // Удаляем событие из Airtable
    const response = await axios.delete(`${EVENTS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Event DELETE error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== API ДЛЯ РЕКЛАМЫ С URL-ИЗОБРАЖЕНИЯМИ ====================

// Получить всю рекламу (без изменений)
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

// Создать рекламу с изображением
app.post('/api/ads', upload.single('image'), async (req, res) => {
  try {
    console.log('Creating ad with image upload');
    
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
        console.error('Error deleting temp file:', unlinkError.message);
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
    console.error('Ad creation with image error:', error.message);
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

// Обновить рекламу
app.patch('/api/ads/:id', upload.single('image'), async (req, res) => {
  try {
    console.log('Updating ad with image upload');
    
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
        console.error('Error deleting temp file:', unlinkError.message);
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
    console.error('Ad update with image error:', error.message);
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

// Удалить рекламу
app.delete('/api/ads/:id', async (req, res) => {
  try {
    // Сначала получаем рекламу, чтобы удалить изображение если есть
    const adResponse = await axios.get(`${ADS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    const ad = adResponse.data;
    if (ad.fields && ad.fields.ImageFileId) {
      try {
        await deleteFromRadikal(ad.fields.ImageFileId);
      } catch (deleteError) {
        console.error('Error deleting image from Radikal:', deleteError.message);
      }
    }
    
    const response = await axios.delete(`${ADS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Ad DELETE error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== API ДЛЯ ГОЛОСОВАНИЙ С URL-ИЗОБРАЖЕНИЯМИ ====================

// Получить все голосования (без изменений)
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

// Создать голосование с изображениями номинантов
app.post('/api/votings', upload.fields([
  { name: 'optionImages', maxCount: 10 }
]), async (req, res) => {
  try {
    console.log('Creating voting with option images');
    
    const votingData = { fields: { ...req.body } };
    let optionImagesData = [];
    
    // Обрабатываем изображения номинантов если есть
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
          console.error('Error deleting temp file:', unlinkError.message);
        }
        
        optionImagesData.push({
          url: uploadResult.url,
          fileId: uploadResult.fileId
        });
      }
      
      // Сохраняем URLs и FileIds как JSON строку
      votingData.fields.OptionImages = JSON.stringify(optionImagesData.map(img => img.url));
      votingData.fields.OptionImagesFileIds = JSON.stringify(optionImagesData.map(img => img.fileId));
      console.log('Option images uploaded:', optionImagesData);
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
    console.error('Voting creation with images error:', error.message);
    // Очистка временных файлов в случае ошибки
    if (req.files && req.files.optionImages) {
      req.files.optionImages.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkError) {
          console.error('Error deleting temp file:', unlinkError.message);
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
    console.log('Updating voting with option images');
    
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
          console.error('Error deleting temp file:', unlinkError.message);
        }
        
        newOptionImagesData.push({
          url: uploadResult.url,
          fileId: uploadResult.fileId
        });
      }
      
      // Если есть новые изображения, заменяем старые
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
    console.error('Voting update with images error:', error.message);
    if (req.files && req.files.optionImages) {
      req.files.optionImages.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkError) {
          console.error('Error deleting temp file:', unlinkError.message);
        }
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Удалить голосование
app.delete('/api/votings/:id', async (req, res) => {
  try {
    // Сначала получаем голосование, чтобы удалить изображения если есть
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
        console.error('Error deleting option images from Radikal:', deleteError.message);
      }
    }
    
    const response = await axios.delete(`${VOTINGS_URL}/${req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Votings DELETE error:', error.message);
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
    
    let optionImages = [];
    if (voting.fields.OptionImages) {
      try {
        if (typeof voting.fields.OptionImages === 'string') {
          optionImages = JSON.parse(voting.fields.OptionImages);
        } else {
          optionImages = voting.fields.OptionImages;
        }
      } catch (e) {
        console.error('Error parsing option images:', e);
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

    console.log('Results image uploaded to Radikal API:', uploadResult.url);
    
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
  console.log(`Radikal API URL: ${RADIKAL_API_URL}`);
  console.log('Image storage: URLs in Airtable, files in Radikal Cloud');
});