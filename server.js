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
jpg`,
          file.m          file.mimetype
        );
        
       imetype
        );
        
        try {
          fs.un try {
          fs.unlinkSynclinkSync(file.path);
        } catch (unlink(file.path);
        } catch (unError) {
          consolelinkError) {
          console.error('Error deleting temp file.error('Error deleting temp file:', unlinkError.message:', unlinkError.message);
        }
        
        newOption);
        }
        
        newOptionImagesData.push({
          urlImagesData.push({
          url: uploadResult.url,
         : uploadResult.url,
          fileId: uploadResult fileId: uploadResult.file.fileId
        });
Id
        });
      }
      
      // Если      }
      
      // Если есть новые изображения, есть новые изображения, заменяем стары заменяем старые
      updateData.fе
      updateData.fields.OptionImagesields.OptionImages = JSON.stringify(newOptionImages = JSON.stringify(newOptionImagesData.mapData.map(img => img.url(img => img.url));
      updateData.fields.O));
      updateData.fields.OptionImagesFileIds =ptionImagesFileIds = JSON.stringify(newOptionImagesData JSON.stringify(newOptionImagesData.map(img => img.fileId.map(img => img.file));
Id));
    }
    
    const response =    }
    
    const response = await axios.patch(`${VOTINGS_URL}/${req.params.id}`, updateData, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    
    res.json({
      ...response.data,
      ...(newOptionImagesData.length > 0 && { uploadedOptionImages: await axios.patch(`${VOTINGS_URL}/${req.params.id}`, updateData, {
      headers: { 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`, 
        'Content-Type': 'application/json' 
      }
    });
    
    res.json({
      ...response.data,
      ...(newOptionImagesData.length > 0 && { uploadedOptionImages: newOptionImagesData newOptionImagesData })
    });
    
  } catch })
    });
    
  } catch (error) {
    (error) {
    console.error('Voting update with images error:', console.error('Voting update with images error:', error.message);
    if ( error.message);
    if (req.files && reqreq.files && req.f.filesiles.optionImages) {
      req.files.option.optionImages) {
      req.files.optionImagesImages.forEach(file => {
       .forEach(file => {
        try {
          fs.unlink try {
          fs.unlinkSync(file.path);
Sync(file.path);
        } catch (un        } catch (unlinkError) {
          console.errorlinkError) {
          console.error('Error deleting temp file('Error deleting temp file:', unlinkError:', unlinkError.message);
        }
     .message);
        }
      });
    }
    res.status( });
    }
    res.status(500).json({500).json({ error: error.message error: error.message });
 });
  }
});

// У  }
});

// Удалить голосование
app.deleteдалить голосование
app.delete('/api/v('/api/votingsotings/:id',/:id', async (req async (req, res) => {
  try {
   , res) => {
 // Сначала получа  try {
    // Сначала получаем голосованиеем голосование, чтобы удалить изображения если есть, чтобы удалить изображения если есть
    const voting
    const votingResponse = await axiosResponse = await axios.get(`${VOTINGS_URL}/${.get(`${VOTINGS_URL}/${req.params.id}`, {
     req.params.id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
}` }
    });
    
    const    
    const voting = voting voting = votingResponse.data;
    if (votingResponse.data;
    if (voting.fields && voting.fields && voting.fields.fields.OptionImages.OptionImagesFileIds) {
     FileIds) {
      try {
        const fileIds try {
        const fileIds = JSON.parse(voting.fields = JSON.parse(voting.f.OptionImagesFileIdsields.OptionImagesFileIds);
        for (const file);
        for (const fileId of fileIds) {
Id of fileIds) {
          await deleteFromRadikal          await deleteFromRadikal(fileId);
        }
      } catch (deleteError)(fileId);
        }
      } catch (deleteError {
        console.error(') {
        console.error('Error deleting option images fromError deleting option images from Radikal:', deleteError.message Radikal:', deleteError.message);
      }
    }
    
);
      }
    }
    
    const response = await axios    const response = await axios.delete(`${VOTINGS_URL.delete(`${VOTINGS_URL}/${req.params.id}}/${req.params.id}`, {
      headers:`, {
      headers: { Authorization: `Bearer ${ { Authorization: `Bearer ${AIRTABLEAIRTABLE_API_KEY}` }
    });
_API_KEY}` }
    });
    
    res.json(response.data);
  }    
    res.json(response.data);
  } catch (error) {
    catch (error) {
    console.error('Votings console.error('Votings DELETE error:', error.message DELETE error:', error.message);
    res.status(500);
    res.status(500).json({ error: error).json({ error: error.message });
  }
});

//.message });
  }
});

// ==================== ОСТА ==================== ОСТАВШИЕСВШИЕСЯ API БЕЗЯ API БЕЗ ИЗМЕНЕНИЙ ИЗМЕНЕНИ ====================

//Й ====================

// Получить голос Получить голосования по ID мероприятия
appования по ID мероприятия
app.get('/api/events/:.get('/api/events/:eventId/votings',eventId/votings', async (req, res) async (req, res) => {
  try {
 => {
  try {
    const { eventId }    const { eventId } = req.params;
    const = req.params;
    const response response = await axios.get = await axios.get(VOTINGS_URL, {
(VOTINGS_URL, {
      headers: { Authorization:      headers: { Authorization: `Bearer ${AIRTABLE_API `Bearer ${AIRTABLE_API_KEY}` },
      params:_KEY}` },
      params: {
        filterByFormula: {
        filterByFormula: `{EventID `{EventID}} = '${eventId}'`
      }
    });
    res.json(response.data);
 = '${eventId}'`
      }
    });
    res.json(response.data);
  } catch (  } catch (error) {
    console.error('Event votings GET error:', errorerror) {
    console.error('Event votings GET error:', error.message);
    res.message);
    res.status(500).json({.status(500).json({ error: error.message });
  error: error.message });
  }
});

// Пр }
});

// Проголосовать
app.post('/оголосовать
app.post('/api/vapi/vototings/:id/vote', async (req,ings/:id/vote', async (req, res res) => {
  try {
    const { id } = req) => {
  try {
    const { id } = req.params;
    const { userId,.params;
    const { userId, optionIndex, userLat, optionIndex, userLat, userLon } = req userLon } = req.body;

    console.log.body;

    console('Received vote request:', { id, userId.log('Received vote request:', { id, userId, optionIndex,, optionIndex, user userLat, userLon });

    if (!Lat, userLon });

    if (!userId || optionIndex === undefineduserId || optionIndex === undefined || userLat === undefined || userLon === || userLat === undefined || userLon === undefined) undefined) {
      console.error {
      console.error('Missing required fields');
      return res('Missing required fields');
      return res.status(400)..status(400).json({ errorjson({ error: 'Missing required fields' });
   : 'Missing required fields' });
    }

    const }

    const votingResponse votingResponse = await = await axios.get(`${VOTINGS_URL}/${id} axios.get(`${VOTINGS_URL}/${id}`, {
`, {
      headers: {      headers: { Authorization: Authorization: `Bearer ${AIRTABLE_API_KEY}` }
 `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    });
    
    const voting = votingResponse.data;
    const voting =    if (!voting.f votingResponse.data;
    if (!voting.fields)ields) {
      console.error('Voting not found');
 {
      console.error('V      return res.status(404).json({ erroroting not found');
      return res.status(404).json({ error: 'Голосование не: 'Голосование не найдено' });
 найдено' });
    }

    }

    if (voting.fields.Status    if (voting.fields.Status === 'Completed === 'Completed') {
      console.error('Voting is completed');
     ') {
      console.error('Voting is completed');
      return res return res.status(400).json({ error: '.status(400).json({ error: 'VotingVoting is completed' });
 is completed' });
    }

       }

    const votedUserIds = voting.fields.V const votedUserIds = voting.fields.VotedUserIDs ||otedUserIDs || '';
    const votedUsersArray '';
    const votedUsersArray = votedUserIds.split = votedUserIds.split(',').filter(id => id(',').filter(id => id && id.trim());
    
    && id.trim());
    
    if (voted if (votedUsersArray.includes(userId.toString())) {
UsersArray.includes(userId.toString())) {
      console.error('      console.error('User has already voted');
     User has already voted');
      return res.status(400 return res.status(400).).json({ error: 'Выjson({ error: 'Вы уже проголосовали уже проголосова в этом голосовании' });
    }

   ли в этом голосовании' });
    }

    const votingLat = voting const votingLat = voting.fields.Latitude.fields.Latitude;
    const;
    const votingLon = voting.fields.Longitude;
    
    if ( votingLon = voting.fields.Longitude;
    
    if (votingvotingLat && votingLLat && votingLon && userLat && userLonon && userLat && userLon) {
     ) {
      const distance = calculateDistance(userLat, const distance = calculateDistance(userLat, userLon userLon, votingLat, votingLon);
      console.log('Calculated distance:',, votingLat, votingLon);
      console.log distance);
      if (('Calculated distance:', distance);
      if (distance > 1000) {
        console.errordistance > 1000)('User is too far away');
 {
        console.error('User is too far away');
        return res.status(400        return res.status(400).json({ error:).json({ error: 'Вы находитесь слишком далеко 'Вы находитесь слишком далеко от места голос от места голосования'ования' });
      }
    }

    let currentVotes });
      }
    }

    let currentVotes = = voting.fields.Votes voting.fields.Votes ? JSON.parse(voting.f ? JSON.parse(voting.fields.Votes) :ields.Votes) : {};
    console.log('Current votes {};
    console.log('Current votes:', currentVotes:', currentVotes);

    currentV);

    currentVotesotes[userId] = optionIndex;
    console[userId] = optionIndex;
    console.log('Updated votes.log('Updated votes:', currentVotes);

    const:', currentVotes);

    const newVotedUser newVotedUserIDs = votedIDs = votedUserIdsUserIds ? `${votedUserIds},${userId}` ? `${votedUserIds},${userId}` : userId.toString();

    const updateData = {
 : userId.toString();

    const updateData = {
      fields: { 
      fields: { 
        Votes: JSON.stringify        Votes: JSON.stringify(currentV(currentVotes),
        VotedUserIDs: newVotedUserotes),
        VotedUserIDs: newVotedUserIDs
      }
    };

    consoleIDs
      }
    };

    console.log('Up.log('Updating voting record with:', JSON.stringifydating voting record with:', JSON.stringify(updateData,(updateData, null, null, 2));

    const updateResponse = await 2));

    const updateResponse = await axios.p axios.patch(`${atch(`${VOTINGS_URL}/${id}`, updateVOTINGS_URL}/${id}`, updateData, {
     Data, {
      headers: { 
        Authorization: headers: { 
        Authorization: `Bearer ${AIR `Bearer ${AIRTABLE_APITABLE_API_KEY}`,
        'Content-Type': '_KEY}`,
        'Content-Type': 'application/json'application/json' 
      }
    });

    console.log('V 
      }
    });

    console.log('Vote updatedote updated successfully:', update successfully:', updateResponse.data);
Response.data);
    res    res.json({ success: true, voting: update.json({ success: true, voting: updateResponse.data });
Response.data });
  } catch (error) {
    console.error  } catch (error) {
    console.error('Vote('Vote error:', error error:', error.message);
   .message);
    res res.status(500)..status(500).json({ error: error.message });
 json({ error: error.message });
  }
});

// Пров }
});

// Проверитьерить статус голос статус голосования пользователя
app.get('/apiования пользователя
app.get('/api/votings/:/votings/:id/vote-statusid/vote-status/:userId/:userId', async (req, res) => {
 ', async (req, res) => {
  try {
 try {
    const { id    const { id, userId, userId } = req.params } = req.params;

    const votingResponse = await axios;

    const votingResponse = await axios.get(`${V.get(`${VOTINGSOTINGS_URL}/${id_URL}/${id}`, {
      headers: { Authorization}`, {
      headers: { Authorization: `Bearer ${: `Bearer ${AIRTABLEAIRTABLE_API_KEY_API_KEY}` }
    });
    
    const voting = voting}` }
    });
    
    const voting = votingResponse.data;
Response.data;
       if (!voting.fields) if (!voting.fields) {
      return res {
      return res.status(404).json({ error: 'Голосование не найд.status(404).json({ error: 'Голосование не найдено' });
    }

   ено' });
    }

    const votedUserIds = voting const votedUserIds = voting.fields.VotedUserIDs || '';
.fields.VotedUserIDs || '';
    const votedUsers    const votedUsersArray =Array = votedUserIds.split votedUserIds.split(',').filter(id =>(',').filter(id => id && id.trim());
    
 id && id.trim());
    
    const hasV    const hasVoted =oted = votedUsersArray.includes(userId.toString());
    let votedUsersArray.includes(userId userVote = null;
.toString());
    let userVote = null;
    if (voting.fields    if (voting.fields.Votes).Votes) {
      {
      const votes = JSON.parse const votes = JSON.parse(voting.fields.Votes);
(voting.fields.Votes);
      userVote =      userVote = votes[userId] votes[userId] !== undefined ? votes[userId !== undefined ? votes[userId] : null;
    }

    res] : null;
    }

    res.json({ hasVoted, userVote });
.json({ hasVoted, userVote });
   } catch (error) } catch (error) {
    console.error(' {
    console.error('VoteVote status error:', error status error:', error.message);
    res.message);
    res.status(500).json({ error.status(500).json({ error: error.message });
 : error.message });
  }
 }
});

// Завершить});

// Завершить голосование и посчитать голосование и посчитать результаты
app.post('/ результаты
app.post('/apiapi/votings/:/votings/:id/complete', async (id/complete', async (req, res) => {
  tryreq, res) => {
  try {
    const { id } {
    const { id } = req.params;

    = req.params;

    const const votingResponse votingResponse = await axios.get(`${VOTINGS_URL}/${ = await axios.get(`${VOTINGS_URL}/${id}`, {
id}`, {
           headers: { Authorization: headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    const voting = voting }
    });
    
    const voting = votingResponse.dataResponse.data;
    if;
    if (!v (!voting.fields) {
      return resoting.fields) {
      return res.status(.status(404).json({ error:404).json({ error: 'Голосование не найдено 'Голосование не найдено' });
   ' });
    }

 }

    const votes =    const votes = voting.fields.V voting.fields.Votes ? 
     otes ? 
      (typeof voting.fields.Votes (typeof voting.fields.V === 'string' ? JSON.parse(voting.fieldsotes === 'string' ? JSON.parse(voting.fields.Votes) : voting.f.Votes) : voting.fields.Votes) 
     ields.Votes) 
      : {};
    
    const : {};
    
    const results = [];
    
    results = [];
    
    if (v if (voting.fields.Options) {
      constoting.fields.Options) {
      const options = voting.fields.O options = voting.fields.Options.split(',');
      
     ptions.split(',');
      
      const voteCounts = {};
 const voteCounts = {};
      options.forEach((option      options.forEach((option, index), index) => {
        voteCounts[index] => {
        voteCounts[index] = 0 = 0;
      });
      
;
      });
      
           Object.values(votes).forEach(voteIndex => Object.values(votes).forEach(voteIndex => {
        if (voteCount {
        if (voteCounts[voteIndexs[voteIndex] !== undefined) {
          vote] !== undefined) {
         Counts[voteIndex voteCounts[voteIndex]++;
        }
      });

      const total]++;
        }
      });

      const totalVotes = Object.values(voteCounts).Votes = Object.values(voteCounts).reduce((sum, count)reduce((sum, count) => sum + count,  => sum + count, 0);
      
      options0);
      
      options.forEach((option, index.forEach((option, index) => {
        const count) => {
        const count = voteCounts = voteCounts[index] || 0;
        const[index] || 0;
        const percentage = totalV percentage = totalVotes >otes > 0 ? Math 0 ? Math.round((count / totalVotes.round((count / totalV) * 100)otes) * 100) : 0;
        
 : 0;
        
        results.push({
                 results.push({
          option: option,
          count option: option,
          count: count: count,
          percentage:,
          percentage: percentage
        });
      });
    }

 percentage
        });
      });
    }

    const updateResponse    const updateResponse = = await axios.patch(`${VOT await axios.patch(`${VOTINGS_URL}/${idINGS_URL}/${id}`, {
     }`, {
      fields: { 
        Status: ' fields: { 
        Status: 'Completed',
        ResultsCompleted',
        Results: JSON.stringify(results)
      }
    }, {
      headers: JSON.stringify(results)
      }
    }, {
      headers: {: { 
        Authorization 
        Authorization: `: `Bearer ${AIRTABLE_API_KEY}`Bearer ${AIRTABLE_API_KEY}`,
        'Content,
        'Content-Type': 'application/json' 
      }
    });

   -Type': 'application/json' 
      }
    });

    res res.json({ success: true.json({ success: true, results: results, voting: updateResponse.data });
 , results: results, voting: updateResponse.data });
  } catch (error) } catch (error {
    console.error('Complete voting) {
    console.error('Complete voting error:', error:', error.message error);
    res.status(500).json({ error: error.message.message);
    res.status(500).json({ error: error.message });
  }
});

// Ген });
  }
});

// Генераерация изображения с результатами голосованияция изображения с результатами голосования
app.post
app.post('/api('/api/votings/:id/generate-results', async/votings/:id/generate-results', async (req, res) => (req, res) => {
  try {
    const {
  try {
    const { id } = req.params;

    const voting { id } = req.params;

    const votingResponse = await axios.get(`${Response = await axios.get(`${VOTINGS_URL}/${id}VOTINGS_URL}/${id}`, {
      headers: { Authorization`, {
      headers: { Authorization: `Bearer ${: `Bearer ${AIRTABLEAIRTABLE_API_KEY}` }
    });

    const voting_API_KEY}` }
    });

    const voting = voting = votingResponse.data;
   Response.data;
    if (!voting.fields) {
 if (!voting.fields) {
      return res      return res.status(.status(404).json({ error: 'Гол404).json({ error: 'Голососование не найдено'ование не найдено' });
    }

    if (!voting });
    }

    if (!voting.fields.Results.fields.Results) {
) {
      return res.status(400).json      return res.status(400).json({ error({ error: 'Ре: 'Результаты голзультаты голосования недоступны'осования недоступны' });
    }

    let });
    }

    let results;
    try {
      if ( results;
    try {
      if (typeof voting.fieldstypeof voting.fields.Results.Results === 'string') === 'string') {
 {
        results = JSON.parse(voting.fields.        results = JSON.parse(voting.fields.Results);
Results);
      } else {
        results = voting.f      } else {
        resultsields.Results;
      }
 = voting.fields.Results;
      }
    }    } catch (parseError) {
      console.error(' catch (parseError) {
      console.error('Error parsing results:',Error parsing results:', parseError);
      return res.status( parseError);
      return res.status(400).json({400).json({ error error: 'Невер: 'Неверный формат результатов голосованияный формат результатов голосования' });
    }

' });
    }

    let resultsArray = [];
    if    let resultsArray = [];
    if (Array.isArray (Array.isArray(results))(results)) {
      results {
      resultsArray = results;
    } elseArray = results;
    } else if (results && if (results && typeof results typeof results === 'object') === 'object') {
      resultsArray = Object.values(results {
      resultsArray = Object.values(results);
    } else);
    } else {
      return res {
      return res.status.status(400).json(400).json({ error: 'Неверный формат результатов' });
   ({ error: 'Неверный формат результатов' });
    }

    }

    const title = voting const title = voting.fields.Title || 'Результаты.fields.Title || 'Результаты голосования голосования';
    const description = voting.fields';
    const description = voting.fields.Description ||.Description || '';
    
 '';
    
    let option    let optionImages = [];
    ifImages = [];
    if (voting.fields.O (voting.fields.OptionImages) {
      try {
ptionImages) {
      try {
        if (        if (typeof voting.ftypeof voting.fields.OptionImages === 'string') {
ields.OptionImages ===          optionImages = JSON.parse 'string') {
          optionImages = JSON.parse(voting.fields.OptionImages);
(voting.fields.OptionImages);
        } else        } else {
          option {
          optionImages = voting.fields.OptionImagesImages = voting.fields;
        }
      } catch.OptionImages;
        }
      } catch (e) {
        console.error(' (e) {
        console.error('Error parsing option imagesError parsing option images:', e:', e);
      }
    }

    let height);
      }
    }

    = 600;
    const hasImages = optionImages && let height = 600;
    const hasImages = optionImages && optionImages optionImages.length > 0.length > 0;
    if (hasImages);
    if (hasImages) height += Math height += Math.ceil(resultsArray.length / 3).ceil(resultsArray.length / 3) * 110;

    let * 110;

    let svg svg = `
      <svg width="800 = `
      <svg width="800" height="${height}" xmlns="http" height="${height}" xmlns="http://www.w3://www.w3.org/2000/s.org/2000/svg">
vg">
        <style>
                 <style>
          .title { font-family .title { font-family: Arial, sans-serif;: Arial, sans-serif; font-size: 24px font-size: 24px; font-weight: bold; fill: #000; font-weight: bold; fill: #000; }
          .description { font-family; }
          .description { font-family: A: Arial, sans-serifrial, sans-serif; font-size: 16px;; font-size: 16px; fill: # fill: #666; }
666; }
          .option { font-family: A          .option { font-family: Arial,rial, sans-serif; font-size: sans-serif; font-size: 16px; font-weight 16px; font-weight: bold; fill: bold; fill: #: #000; }
          .stats { font-family000; }
          .stats { font-family:: Arial, sans Arial, sans-serif; font-size: 16px;-serif; font-size: 16px; fill: # fill: #666;666; }
        </style>
        <rect width=" }
        </style>
        <rect width="800" height="${height}"800" height="${height}" fill="#ffffff"/>
        fill="#ffffff"/>
        <text x="400" y <text x="400" y="50" class="="50" class="title" text-anchor="middletitle" text-anchor="middle">${title}</">${title}</text>
        <texttext>
        <text x="400" y="80 x="400" y="80" class="description" text" class="description" text-anchor="middle-anchor="middle">${description}</text>
    `">${description}</text>
    `;

    let y = ;

    let y = 120;
    results120;
    resultsArray.forEach((result, indexArray.forEach((result, index) => {
      const bar) => {
      const barWidth = (result.percentage / 100) * Width = (result.percentage / 100) * 400;
      const barColor400;
      const barColor = index %  = index % 2 === 0 ? '#42 === 0 ? '#4CAF50' :CAF50' : '#2196F3';
 '#2196F3';
      
      svg += `
      
      svg += `
        <rect x="100        <rect x="100" y="${y}" width" y="${y}" width="400"="400" height="40" fill="#e height="40" fill="#0e0e0e0e0" rx="5"/>
       e0" rx="5"/>
        <rect x="100" y="${y}" width <rect x="100" y="${y}" width="${="${barWidth}" height="40" fill="${barbarWidth}" height="40" fill="${barColor}"Color}" rx="5 rx="5"/>
        <text x="20"/>
        <text x="20" y="${y + 25}" class="option">" y="${y + 25}" class="option">${result.option${result.option}</text}</text>
        <text x="520" y="${>
        <text x="520" y="${y + 25y + 25}" class="stats" text}" class="stats" text-anchor="end">${result.count-anchor="end">${result.count} голосов (${result.} голосов (${result.percentage}%)</percentage}%)</text>
text>
      `;
           `;
      y += 50;
    });

    y += 50;
    });

    if if (hasImages (hasImages) {
      y +=) {
      y += 20;
      svg += `<text x="400" 20;
      svg += `<text x="400" y="${ y="${y}" class="y}" class="description" text-anchor="middle">description" text-anchor="middleИзображения номинантов</text>`;
     ">Изображения номинантов</text>`;
      y += 30 y += 30;
;
      
      resultsArray.forEach      
      resultsArray.forEach((result, index) =>((result, index) => {
        const {
        const imageUrl = optionImages[index];
        
 imageUrl = optionImages[index];
        if (image        
        if (imageUrl) {
         Url) {
          const col const col = index % 3;
          const row = = index % 3;
          const row = Math.floor(index / 3);
          svg += `<image Math.floor(index / 3);
          svg += `<image x="${100 + x="${100 + col * 200}" y="${y col * 200}" y="${y + row + row * 110}" * 110}" width="150" height="100" href="${ width="150" height="100" href="${imageUrlimageUrl}" preserveAspect}" preserveAspectRatio="xMidYMid meet"/>Ratio="xMidYMid meet"/>`;
        }
     `;
        }
      });
    });
    }

    svg += ` }

    svg += `</svg>`;

   </svg>`;

    const svgBuffer = const svgBuffer = Buffer.from(svg);
    const imageBuffer = await sharp Buffer.from(svg);
    const imageBuffer = await sharp(svgBuffer)
      .(svgBuffer)
      .resize(800, height, {
resize(800, height, {
        fit: 'fill',
        background:        fit: 'fill',
        background: { r: 255, { r: 255, g: 255 g: 255, b: , b: 255, alpha: 1 }
     255, alpha: 1 }
      })
      .jpeg({ })
      .jpeg({ 
        quality: 90 
        quality: 90,
        chroma,
        chromaSubsampling: '4:4:4'
Subsampling: '4:4:4'
      })
      .toBuffer();

      })
      .toBuffer();

    const uploadResult = await    const uploadResult = await uploadToRadikal(
      uploadToRadikal(
      imageBuffer, 
      `voting_results_${id imageBuffer, 
      `voting_results_${id}_${Date.now()}_${Date.now()}.jpg`,
      '}.jpg`,
      'image/jpeg'
    );

    console.log('Results imageimage/jpeg'
    );

    console.log('Results image uploaded uploaded to Radikal API:', to Radikal API:', uploadResult.url);
    
    uploadResult.url);
    
    try {
      const updateResponse try {
      const updateResponse = await axios.patch(`${ = await axios.patch(`${VOTINGS_URLVOTINGS_URL}/${id}`, {
        fields}/${id}`, {
        fields: { 
         : { 
          ResultsImage: uploadResult.url,
          ResultsImageFileId: ResultsImage: uploadResult.url,
          ResultsImageFileId: uploadResult.file uploadResult.fileId
        }
      }, {
        headers: { 
         Id
        }
      }, {
        headers: { 
          Authorization: Authorization: `Bearer ${AIR `Bearer ${AIRTABLE_APITABLE_API_KEY}`,
          'Content_KEY}`,
          'Content-Type': 'application/json' 
        }
     -Type': 'application/json' });
      
      console.log('ResultsImage saved to Airt 
        }
      });
      
      console.log('ResultsImage saved to Airtable successfully');
   able successfully');
    } catch (updateError) {
      } catch (updateError) {
      console.error('Error console.error('Error saving Results saving ResultsImage to Airtable:', updateErrorImage to Airtable:', updateError.message.message);
    }

    res.json({ 
     );
    }

    res.json({ 
      success: true, success: true, 
      imageUrl: upload 
      imageUrl: uploadResult.url,
      fileId: uploadResult.fileId
Result.url,
      fileId: uploadResult.fileId
    });

  } catch (error) {
    console    });

  } catch (error) {
   .error('Generate results image error:', error.message);
    res.status console.error('Generate results image error:', error.message);
    res.status(500).(500).json({ error: error.messagejson({ error: error.message });
  }
});

// = });
  }
});

// ==================== API Д=================== API ДЛЯЛЯ "Я ПОЙДУ!" =================== "Я ПОЙДУ!" ====================

app.post('/api/=

app.post('/api/eventsevents/:eventId/attend', async (req, res)/:eventId/attend', async (req, res) => {
  try {
 => {
  try {
    const    const { eventId { eventId } = req.params;
    const { userId } = } = req.params;
    const { userId } = req.body;

    console.log(`User ${userId} attending event ${ req.body;

    console.log(`User ${userId} attendingeventId}`);

    if (!userId) {
      return event ${eventId}`);

 res.status(400).json({ error: 'User ID    if (!userId) {
      return res.status(400).json({ error: 'User ID is is required' });
 required' });
    }

    const eventResponse = await axios.get    }

    const eventResponse = await axios.get(`${EV(`${EVENTS_URL}/${eventId}`, {
     ENTS_URL}/${eventId} headers: { Authorization:`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });

    `Bearer ${AIRTABLE_API_KEY}` }
    });

    const event const event = eventResponse.data = eventResponse.data;
    
    if (!event.f;
    
    if (!event.fields) {
      returnields) {
      return res.status(404).json({ res.status(404).json({ error: 'Event error: 'Event not found' });
    }

    const current not found' });
    }

    const currentAttendAttendees = event.fields.AttendeesIDs ||ees = event.fields.AttendeesIDs || '';
    '';
    const currentCount = event.fields.Att const currentCount = event.fendeesCount || 0;
    
    console.log('ields.AttendeesCount || 0;
    
    console.log('Current attendeesCurrent attendees:', currentAttend:', currentAttendees);
ees);
    console.log('Current count:', currentCount);

    let    console.log('Current count:', currentCount);

    let attendeesArray = [];
    
    if ( attendeesArray = [];
    
    if (Array.isArray.isArray(currentArray(currentAttendees)) {
      attendeesArray = currentAttendees)) {
      attendeesAttendees.filter(id => id && id.toStringArray = currentAttendees.filter(id => id && id.toString().trim());
   ().trim());
    } else if ( } else if (typeof currentAttendees === 'stringtypeof currentAttendees === 'string') {
     ') {
      attendeesArray = currentAttendees attendeesArray = currentAttendees.split(',')..split(',').filter(id => id && id.trim());
filter(id => id && id.trim());
    }

    const    }

    const userIdStr userIdStr = userId.toString();
    if = userId.toString();
    if ( (attendeesArray.includes(userIdStr)) {
      console.log('attendeesArray.includes(userIdStr)) {
      console.log('User already attending');
      return res.statusUser already attending');
      return res.status(400).json(400).json({ error: 'User already attending'({ error: 'User already attending' });
    }

    });
    }

    attendeesArray attendeesArray.push(userIdStr);
    const new.push(userIdStr);
    const newAttendees = attendeesArray.join(',');
   Attendees = attendeesArray.join(',');
    const new const newCount = currentCountCount = currentCount + 1;

    console + 1;

    console.log('.log('New attendees:', newAttendees);
   New attendees:', newAttendees);
 console.log('New count:', newCount);

    const    console.log('New count:', newCount);

    const updateData = {
      fields: {
        AttendeesIDs updateData = {
      fields: {
        AttendeesIDs: newAttendees,
        AttendeesCount: new: newAttendees,
        AttendeesCount: newCount
      }
Count
      }
    };

    console.log('Update    };

    console.log('Update data:', JSON.stringify( data:', JSON.stringify(updateData, null, updateData, null, 2));

    const updateResponse2));

    const updateResponse = await axios.patch(`${EVENTS_URL}/${ = await axios.patch(`${EVENTS_URL}/${eventId}`, updateData, {
eventId}`, updateData, {
      headers: {      headers: { 
        Authorization: `Bearer ${AIR 
        Authorization: `Bearer ${AIRTABLE_API_KEY}`TABLE_API_KEY}`,
        'Content-Type': 'application,
        'Content-Type': 'application/json' 
     /json' 
      }
    });

    console.log }
    });

    console.log('Update successful:', updateResponse('Update successful:', updateResponse.data);
    res.json({.data);
    res.json({ success: true, count: success: true, count: newCount, attending: true newCount, attending: true });
    
  } catch });
    
  } catch (error) {
    console (error) {
    console.error('Attend error:', error.message);
    res.error('Attend error:', error.message);
    res.status(500).json.status(500).json({ error: error.message });
  }
});

app.post('/api/events/:eventId/un({ error: error.message });
  }
});

app.post('/api/events/:eventId/unattend', async (attend', async (req, res) => {
  tryreq, res) => {
  try {
    const { {
    const { eventId } eventId } = = req.params;
    const { userId } = req.body;

 req.params;
    const { userId } = req.body;

    console.log(`User ${userId}    console.log(`User ${userId} unattending event ${eventId unattending event ${eventId}`);

    if (!}`);

    if (!userId) {
      return res.statususerId) {
      return(400).json({ error: 'User ID res.status(400).json({ error: 'User ID is required' });
    }

 is required' });
    }

    const eventResponse = await    const eventResponse = await axios.get(`${EVENTS_URL}/${eventId}`, {
 axios.get(`${EVENTS_URL}/${eventId}`, {
      headers: { Authorization:      headers: { Authorization: `Bearer ${AIRTABLE `Bearer ${AIRTABLE_API_KEY}` }
    });

   _API_KEY}` }
    });

    const event = event const event = eventResponse.data;
    
    ifResponse.data;
    
    if (!event.fields) {
 (!event.fields) {
      return res.status(404      return res.status(404).json({ error:).json({ error: 'Event not found' });
    'Event not found' });
    }

    const current }

    const currentAttendees = event.fields.AttAttendees = event.fields.AttendeesIDs ||endeesIDs || '';
    const currentCount = '';
    const currentCount = event.fields.Attendees event.fields.AttendeesCount || 0;
    
Count || 0;
    
    console.log('Current attendees    console.log('Current attendees:', currentAttendees);
:', currentAttendees);
    console.log('Current    console.log('Current count:', current count:', currentCount);

    let attendeesArray = [];
Count);

    let attendeesArray = [];
    
    if (Array.is    
    if (Array.isArray(currentAttendees)) {
      attendeesArray = currentArray(currentAttendees)) {
     Attendees.filter attendeesArray = currentAttendees.filter(id => id && id.toString().trim());
    } else if (typeof(id => id && id.toString().trim());
    } else if currentAttendees === 'string') {
      attendees (typeof currentAttendees === 'string') {
      attendeesArray = currentAttArray = currentAttendeesendees.split(',').filter(id => id && id.split(',').filter(id => id && id.trim());
.trim());
    }

    const userIdStr = userId.toString    }

    const userIdStr = userId.toString();
   ();
    const newAttendeesArray = attendeesArray const newAttendeesArray = attendeesArray.filter(id => id !== userIdStr);
.filter(id => id !== userIdStr);
    const newAtt    const newAttendees = newAttendendees = newAttendeesArray.join(',');
    const newCount = Math.max(eesArray.join(',');
    const newCount =0, newAttendeesArray.length);

    console.log(' Math.max(0, newAttendeesArray.length);

    console.log('New attendees:', newAttendees);
New attendees:', newAttendees);
    console    console.log('New count.log('New count:', newCount);

    const updateData:', newCount);

    const updateData = {
      fields = {
      fields: {
        AttendeesIDs: new: {
        AttendeesIDs: newAttendAttendees,
        AttendeesCount: newCountees,
        AttendeesCount: newCount

      }
    };

    const updateResponse = await      }
    };

    const updateResponse = await axios.patch(`${EVENTS_URL}/${eventId axios.patch(`${EVENTS_URL}/${eventId}`,}`, updateData, {
      headers: { 
 updateData, {
      headers: { 
               Authorization: `Bearer ${AIRTABLE_API_KEY}` Authorization: `Bearer ${AIRTABLE_API_KEY}`,
       ,
        'Content-Type': 'Content-Type': 'application/json' 
      }
    'application/json' 
      }
    });

    console.log('Unattend successful');
 });

    console.log('Unattend successful');
    res.json({    res.json({ success: true, count: success: true, count: newCount newCount, attending: false });
    
  } catch (, attending: false });
    
  } catch (error) {
    console.error('error) {
    console.error('Unattend errorUnattend error:', error.message);
    res.status(:', error.message);
    res.status(500).json({500).json({ error: error.message });
  }
});

 error: error.message });
  }
});

// Провер// Проверяем статуяем статус участия пользователя
appс участия пользователя
app.get('/api/events/:.get('/api/events/:eventId/attend-status/:eventId/attend-status/:userId', async (req, res)userId', async (req, res) => {
  try => {
  try {
    const { eventId, userId {
    const { eventId, userId } = req.params } = req.params;

    console.log(`Checking attend status;

    console.log(`Checking attend status for user for user ${userId} ${userId} in event ${eventId}`);

    const in event ${eventId}`);

    const eventResponse = await axios.get(`${EV eventResponse = await axios.get(`${EVENTS_URLENTS_URL}/${eventId}`, {
      headers}/${eventId}`, {
      headers: { Authorization: `Bearer: { Authorization: `Bearer ${ ${AIRTABLE_API_KEYAIRTABLE}` }
    });

    const event = eventResponse.data;
    
    if (!event.fields) {
      return res.status(_API_KEY}` }
    });

    const event = eventResponse.data;
    
    if (!event.fields) {
      return res404).json({ error: 'Event not found' });
    }

   .status(404).json({ error: 'Event not found' });
    }

    const attendees = event.fields.AttendeesIDs || '';
    let attendeesArray = [];
 const attendees = event.fields.AttendeesIDs || '';
    let attendeesArray = [];
    
    if (Array.is    
    if (Array.isArray(attendees)) {
      attendeesArray =Array(attendees attendees.filter(id => id && id.toString().trim());
   )) {
      attendeesArray = attendees.filter(id => id && id.toString().trim());
    } else if ( } else if (typeof attendees === 'string') {
typeof attendees === 'string') {
      attendeesArray = attendees.split(',').      attendeesArray = attendees.split(',').filter(idfilter(id => id && id.trim());
    }
    
    => id && id.trim());
    }
    
    const const isAttending = attendeesArray.includes(userId.toString isAttending = attendeesArray.includes(userId.toString());

    console.log('Is attending());

    console.log('Is attending:', isAttending:', isAttending);
    res.json({ isAttending);
    res.json({ isAttending });
    
  } });
    
  } catch (error) {
    console.error catch (error) {
    console.error('Attend('Attend status error:', error.message);
    status error:', error.message);
    res.status(500 res.status(500).json({ error: error.message });
).json({ error: error.message });
  }
});

//  }
});

// ==================== ВСПОМОГАТЕЛЬНЫ ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЕ ФУНКЦИИ ===================ЦИИ ====================

function calculateDistance(lat=

function calculateDistance(lat1, lon1, lat1, lon1, lat2, lon2) {
2, lon2) {
  const R = 637  const R = 6371000;
 1000;
  const dLat = deg2 const dLat = deg2rad(lat2 - lat1);
  const dLrad(lat2 - lat1);
  const dLon = deg2on = deg2rad(lon2 - lon1);
rad(lon2 - lon1  const a = 
    Math.sin(dLat);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
/2) * Math.sin(dLat/2) +
    Math    Math.cos.cos(deg2rad(deg2rad(lat1)) * Math.cos(deg2rad(lat2(lat1)) * Math.cos(deg2rad(lat2)) *)) * 
    Math.sin(dLon/2) 
    Math.sin(dLon/2) * * Math.sin(dLon/2); 
  Math.sin(dLon/2); 
  const c = 2 * Math. const c = 2 * Math.atan2(Mathatan2(Math.sqrt(a), Math.sqrt(1.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

function deg2-a)); 
  return R * c;
}

function deg2rad(deg) {
rad(deg) {
  return deg * (  return deg * (Math.PI/180);
Math.PI/180);
}

// Создание}

// Создание папки uploads
const папки uploads
const uploadsDir = uploadsDir = path.join path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir))(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

, { recursive: true });
}

// Запуск// Запуск сервера
app.listen( сервера
app.listen(port, () => {
port, () => {
  console.log(`Server running  console.log(`Server running on port ${port}`);
 on port ${port}`);
  console.log(`Rad  console.log(`Radikal API URL: ${RADIKAL_API_URL}`);
ikal API URL: ${RADIKAL_API_URL}`);
  console.log('Image storage:  console.log('Image storage: URLs in URLs in Airtable, files Airtable, files in Radikal Cloud');
});
 in Radikal Cloud');
});