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
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const upload = multer({ dest: 'uploads/' });

// Env vars для Бипиума
const BPIUM_DOMAIN = process.env.BPIUM_DOMAIN;
const BPIUM_USERNAME = process.env.BPIUM_USERNAME;
const BPIUM_PASSWORD = process.env.BPIUM_PASSWORD;
const BPIUM_CATALOG_EVENTS = process.env.BPIUM_CATALOG_EVENTS || '1';
const BPIUM_CATALOG_ADS = process.env.BPIUM_CATALOG_ADS || '2';
const BPIUM_CATALOG_VOTINGS = process.env.BPIUM_CATALOG_VOTINGS || '3';

// Radikal API конфигурация
const RADIKAL_API_URL = 'https://radikal.cloud/api/1';
const RADIKAL_API_KEY = process.env.RADIKAL_API_KEY;

// Хардкод админа
const ADMIN_ID = 366825437;

if (!BPIUM_DOMAIN || !BPIUM_USERNAME || !BPIUM_PASSWORD || !RADIKAL_API_KEY) {
  console.error('Missing env vars: Set BPIUM_DOMAIN, BPIUM_USERNAME, BPIUM_PASSWORD, RADIKAL_API_KEY');
  process.exit(1);
}

// Базовый URL для API Бипиума
const BPIUM_API_BASE = `https://${BPIUM_DOMAIN}.bpium.ru/api/v1`;

// Переменные для хранения токена
let authToken = null;
let tokenExpiry = null;

// ==================== АУТЕНТИФИКАЦИЯ БИПИУМ ====================

/**
 * Аутентификация в Бипиум и получение токена
 */
async function authenticateBpium() {
  try {
    console.log('Authenticating with Bpium...');
    
    const response = await axios.post(`${BPIUM_API_BASE}/auth/login`, {
      username: BPIUM_USERNAME,
      password: BPIUM_PASSWORD
    });

    authToken = response.data.token;
    // Токен обычно действителен 24 часа
    tokenExpiry = Date.now() + (23 * 60 * 60 * 1000); // Обновляем за час до истечения
    
    console.log('Bpium authentication successful');
    return authToken;
  } catch (error) {
    console.error('Bpium authentication error:', error.message);
    if (error.response) {
      console.error('Bpium response:', error.response.data);
    }
    throw error;
  }
}

/**
 * Получение валидного токена (обновляет при необходимости)
 */
async function getValidToken() {
  if (!authToken || !tokenExpiry || Date.now() >= tokenExpiry) {
    await authenticateBpium();
  }
  return authToken;
}

/**
 * Универсальный метод для запросов к API Бипиума
 */
async function bpiumRequest(method, url, data = null) {
  const token = await getValidToken();
  
  const config = {
    method,
    url: `${BPIUM_API_BASE}${url}`,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };

  if (data) {
    config.data = data;
  }

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`Bpium API error (${method} ${url}):`, error.message);
    if (error.response) {
      console.error('Bpium response status:', error.response.status);
      console.error('Bpium response data:', error.response.data);
    }
    throw error;
  }
}

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
    
    const uploadResult = await uploadToRadikal(
      fileBuffer,
      req.file.originalname || `option_image_${Date.now()}.jpg`,
      req.file.mimetype
    );
    
    try {
      fs.unlinkSync(filePath);
    } catch (unlinkError) {
      console.error('Error deleting temp file:', unlinkError.message);
    }
    
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

app.delete('/api/upload/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    await deleteFromRadikal(fileId);
    
    res.json({ success: true, message: `File ${fileId} deleted successfully` });
    
  } catch (error) {
    console.error('Delete file error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== EVENTS API (БИПИУМ) ====================

app.get('/api/events', async (req, res) => {
  try {
    const records = await bpiumRequest('GET', `/catalogs/${BPIUM_CATALOG_EVENTS}/records`);
    res.json(records);
  } catch (error) {
    console.error('Events GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    console.log('Creating event with data:', JSON.stringify(req.body, null, 2));
    const record = await bpiumRequest('POST', `/catalogs/${BPIUM_CATALOG_EVENTS}/records`, req.body);
    res.json(record);
  } catch (error) {
    console.error('Events POST error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const record = await bpiumRequest('GET', `/catalogs/${BPIUM_CATALOG_EVENTS}/records/${req.params.id}`);
    res.json(record);
  } catch (error) {
    console.error('Event GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/events/:id', async (req, res) => {
  try {
    console.log('Updating event with data:', JSON.stringify(req.body, null, 2));
    const record = await bpiumRequest('PATCH', `/catalogs/${BPIUM_CATALOG_EVENTS}/records/${req.params.id}`, req.body);
    res.json(record);
  } catch (error) {
    console.error('Event PATCH error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    await bpiumRequest('DELETE', `/catalogs/${BPIUM_CATALOG_EVENTS}/records/${req.params.id}`);
    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Event DELETE error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADS API (БИПИУМ) ====================

app.get('/api/ads', async (req, res) => {
  try {
    const records = await bpiumRequest('GET', `/catalogs/${BPIUM_CATALOG_ADS}/records`);
    res.json(records);
  } catch (error) {
    console.error('Ads GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    const record = await bpiumRequest('POST', `/catalogs/${BPIUM_CATALOG_ADS}/records`, req.body);
    res.json(record);
  } catch (error) {
    console.error('Ads POST error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/ads/:id', async (req, res) => {
  try {
    const record = await bpiumRequest('PATCH', `/catalogs/${BPIUM_CATALOG_ADS}/records/${req.params.id}`, req.body);
    res.json(record);
  } catch (error) {
    console.error('Ads PATCH error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    await bpiumRequest('DELETE', `/catalogs/${BPIUM_CATALOG_ADS}/records/${req.params.id}`);
    res.json({ success: true, message: 'Ad deleted successfully' });
  } catch (error) {
    console.error('Ad DELETE error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== VOTINGS API (БИПИУМ) ====================

app.get('/api/votings', async (req, res) => {
  try {
    const records = await bpiumRequest('GET', `/catalogs/${BPIUM_CATALOG_VOTINGS}/records`);
    res.json(records);
  } catch (error) {
    console.error('Votings GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/votings', async (req, res) => {
  try {
    const record = await bpiumRequest('POST', `/catalogs/${BPIUM_CATALOG_VOTINGS}/records`, req.body);
    res.json(record);
  } catch (error) {
    console.error('Votings POST error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/votings/:id', async (req, res) => {
  try {
    const record = await bpiumRequest('PATCH', `/catalogs/${BPIUM_CATALOG_VOTINGS}/records/${req.params.id}`, req.body);
    res.json(record);
  } catch (error) {
    console.error('Votings PATCH error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/votings/:id', async (req, res) => {
  try {
    await bpiumRequest('DELETE', `/catalogs/${BPIUM_CATALOG_VOTINGS}/records/${req.params.id}`);
    res.json({ success: true, message: 'Voting deleted successfully' });
  } catch (error) {
    console.error('Votings DELETE error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Получить голосования по ID мероприятия
app.get('/api/events/:eventId/votings', async (req, res) => {
  try {
    const { eventId } = req.params;
    // Предполагаем, что в Бипиуме есть поле для связи с мероприятием
    const records = await bpiumRequest('GET', `/catalogs/${BPIUM_CATALOG_VOTINGS}/records`);
    const filteredVotings = records.values.filter(record => 
      record.values && record.values.eventId === eventId
    );
    res.json({ values: filteredVotings });
  } catch (error) {
    console.error('Event votings GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ОСТАЛЬНЫЕ API (адаптированные для Бипиума) ====================

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

    const voting = await bpiumRequest('GET', `/catalogs/${BPIUM_CATALOG_VOTINGS}/records/${id}`);
    
    if (!voting || !voting.values) {
      console.error('Voting not found');
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    if (voting.values.Status === 'Completed') {
      console.error('Voting is completed');
      return res.status(400).json({ error: 'Voting is completed' });
    }

    const votedUserIds = voting.values.VotedUserIDs || '';
    const votedUsersArray = votedUserIds.split(',').filter(id => id && id.trim());
    
    if (votedUsersArray.includes(userId.toString())) {
      console.error('User has already voted');
      return res.status(400).json({ error: 'Вы уже проголосовали в этом голосовании' });
    }

    const votingLat = voting.values.Latitude;
    const votingLon = voting.values.Longitude;
    
    if (votingLat && votingLon && userLat && userLon) {
      const distance = calculateDistance(userLat, userLon, votingLat, votingLon);
      console.log('Calculated distance:', distance);
      if (distance > 1000) {
        console.error('User is too far away');
        return res.status(400).json({ error: 'Вы находитесь слишком далеко от места голосования' });
      }
    }

    let currentVotes = voting.values.Votes ? JSON.parse(voting.values.Votes) : {};
    console.log('Current votes:', currentVotes);

    currentVotes[userId] = optionIndex;
    console.log('Updated votes:', currentVotes);

    const newVotedUserIDs = votedUserIds ? `${votedUserIds},${userId}` : userId.toString();

    const updateData = {
      values: { 
        Votes: JSON.stringify(currentVotes),
        VotedUserIDs: newVotedUserIDs
      }
    };

    console.log('Updating voting record with:', JSON.stringify(updateData, null, 2));

    const updateResponse = await bpiumRequest('PATCH', `/catalogs/${BPIUM_CATALOG_VOTINGS}/records/${id}`, updateData);

    console.log('Vote updated successfully:', updateResponse);
    res.json({ success: true, voting: updateResponse });
  } catch (error) {
    console.error('Vote error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Проверить статус голосования пользователя
app.get('/api/votings/:id/vote-status/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;

    const voting = await bpiumRequest('GET', `/catalogs/${BPIUM_CATALOG_VOTINGS}/records/${id}`);
    
    if (!voting.values) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    const votedUserIds = voting.values.VotedUserIDs || '';
    const votedUsersArray = votedUserIds.split(',').filter(id => id && id.trim());
    
    const hasVoted = votedUsersArray.includes(userId.toString());
    let userVote = null;
    if (voting.values.Votes) {
      const votes = JSON.parse(voting.values.Votes);
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

    const voting = await bpiumRequest('GET', `/catalogs/${BPIUM_CATALOG_VOTINGS}/records/${id}`);
    
    if (!voting.values) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    const votes = voting.values.Votes ? 
      (typeof voting.values.Votes === 'string' ? JSON.parse(voting.values.Votes) : voting.values.Votes) 
      : {};
    
    const results = [];
    
    if (voting.values.Options) {
      const options = voting.values.Options.split(',');
      
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

    const updateResponse = await bpiumRequest('PATCH', `/catalogs/${BPIUM_CATALOG_VOTINGS}/records/${id}`, {
      values: { 
        Status: 'Completed',
        Results: JSON.stringify(results)
      }
    });

    res.json({ success: true, results: results, voting: updateResponse });
  } catch (error) {
    console.error('Complete voting error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Генерация изображения с результатами голосования
app.post('/api/votings/:id/generate-results', async (req, res) => {
  try {
    const { id } = req.params;

    const voting = await bpiumRequest('GET', `/catalogs/${BPIUM_CATALOG_VOTINGS}/records/${id}`);

    if (!voting.values) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    if (!voting.values.Results) {
      return res.status(400).json({ error: 'Результаты голосования недоступны' });
    }

    let results;
    try {
      if (typeof voting.values.Results === 'string') {
        results = JSON.parse(voting.values.Results);
      } else {
        results = voting.values.Results;
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

    const title = voting.values.Title || 'Результаты голосования';
    const description = voting.values.Description || '';
    
    const optionImages = voting.values.OptionImages || [];
    console.log('OptionImages from Bpium:', JSON.stringify(optionImages, null, 2));

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

    const uploadResult = await uploadToRadikal(
      imageBuffer, 
      `voting_results_${id}_${Date.now()}.jpg`,
      'image/jpeg'
    );

    console.log('Results image uploaded to Radikal API:', uploadResult.url);
    
    try {
      const updateResponse = await bpiumRequest('PATCH', `/catalogs/${BPIUM_CATALOG_VOTINGS}/records/${id}`, {
        values: { 
          ResultsImage: uploadResult.url
        }
      });
      
      console.log('ResultsImage saved to Bpium successfully');
    } catch (updateError) {
      console.error('Error saving ResultsImage to Bpium:', updateError.message);
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

    const event = await bpiumRequest('GET', `/catalogs/${BPIUM_CATALOG_EVENTS}/records/${eventId}`);

    if (!event.values) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const currentAttendees = event.values.AttendeesIDs || '';
    const currentCount = event.values.AttendeesCount || 0;
    
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
      values: {
        AttendeesIDs: newAttendees,
        AttendeesCount: newCount
      }
    };

    console.log('Update data:', JSON.stringify(updateData, null, 2));

    const updateResponse = await bpiumRequest('PATCH', `/catalogs/${BPIUM_CATALOG_EVENTS}/records/${eventId}`, updateData);

    console.log('Update successful:', updateResponse);
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

    const event = await bpiumRequest('GET', `/catalogs/${BPIUM_CATALOG_EVENTS}/records/${eventId}`);

    if (!event.values) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const currentAttendees = event.values.AttendeesIDs || '';
    const currentCount = event.values.AttendeesCount || 0;
    
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
      values: {
        AttendeesIDs: newAttendees,
        AttendeesCount: newCount
      }
    };

    const updateResponse = await bpiumRequest('PATCH', `/catalogs/${BPIUM_CATALOG_EVENTS}/records/${eventId}`, updateData);

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

    const event = await bpiumRequest('GET', `/catalogs/${BPIUM_CATALOG_EVENTS}/records/${eventId}`);

    if (!event.values) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const attendees = event.values.AttendeesIDs || '';
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
  console.log(`Bpium domain: ${BPIUM_DOMAIN}`);
  console.log(`Radikal API URL: ${RADIKAL_API_URL}`);
});

app.get('/', (req, res) => {
  res.send('Smolville Backend is running with Bpium! API endpoints: /api/events, /api/ads, /api/votings, /api/upload');
});
