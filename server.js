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
const IMAGEBAN_API_KEY = process.env.IMAGEBAN_API_KEY; // Изменили название переменной

// Хардкод админа
const ADMIN_ID = 366825437;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !IMAGEBAN_API_KEY) {
  console.error('Missing env vars: Set AIRTABLE_API_KEY, AIRTABLE_BASE_ID, IMAGEBAN_API_KEY in Render');
  process.exit(1);
}

const EVENTS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${EVENTS_TABLE}`;
const ADS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ADS_TABLE}`;
const VOTINGS_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${VOTINGS_TABLE}`;
const IMAGEBAN_UPLOAD_URL = 'https://imageban.ru/api/v1/upload'; // URL для загрузки

app.get('/', (req, res) => {
  res.send('Smolville Backend is running! API endpoints: /api/events, /api/ads, /api/votings, /api/upload');
});

// ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С IMAGEBAN ====================

/**
 * Загружает изображение на ImageBan.ru
 * @param {Buffer|Stream} imageData - Данные изображения
 * @param {string} filename - Имя файла
 * @returns {Promise<string>} URL загруженного изображения
 */
async function uploadToImageBan(imageData, filename = 'image.jpg') {
  try {
    const formData = new FormData();
    
    // Добавляем изображение
    if (Buffer.isBuffer(imageData)) {
      formData.append('image', imageData, {
        filename: filename,
        contentType: 'image/jpeg'
      });
    } else {
      formData.append('image', imageData);
    }
    
    // Добавляем API ключ
    formData.append('key', IMAGEBAN_API_KEY);

    const response = await axios.post(IMAGEBAN_UPLOAD_URL, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000 // 30 секунд таймаут
    });

    console.log('ImageBan response:', response.data);

    if (response.data && response.data.success) {
      return response.data.data.link; // URL загруженного изображения
    } else {
      throw new Error(response.data.error || 'Unknown error from ImageBan');
    }
  } catch (error) {
    console.error('ImageBan upload error:', error.message);
    if (error.response) {
      console.error('ImageBan response data:', error.response.data);
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

    // Получаем данные голосования
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

    // Проверяем, голосовал ли уже пользователь
    const votedUserIds = voting.fields.VotedUserIDs || '';
    const votedUsersArray = votedUserIds.split(',').filter(id => id && id.trim());
    
    if (votedUsersArray.includes(userId.toString())) {
      console.error('User has already voted');
      return res.status(400).json({ error: 'Вы уже проголосовали в этом голосовании' });
    }

    // Проверяем геолокацию
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

    // Обновляем результаты голосования
    let currentVotes = voting.fields.Votes ? JSON.parse(voting.fields.Votes) : {};
    console.log('Current votes:', currentVotes);

    // Добавляем голос пользователя
    currentVotes[userId] = optionIndex;
    console.log('Updated votes:', currentVotes);

    // Добавляем пользователя в список проголосовавших
    const newVotedUserIDs = votedUserIds ? `${votedUserIds},${userId}` : userId.toString();

    // Обновляем запись в Airtable
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

    // Получаем данные голосования
    const votingResponse = await axios.get(`${VOTINGS_URL}/${id}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    
    const voting = votingResponse.data;
    if (!voting.fields) {
      return res.status(404).json({ error: 'Голосование не найдено' });
    }

    // Подсчитываем финальные результаты
    const votes = voting.fields.Votes ? 
      (typeof voting.fields.Votes === 'string' ? JSON.parse(voting.fields.Votes) : voting.fields.Votes) 
      : {};
    
    const results = [];
    
    if (voting.fields.Options) {
      const options = voting.fields.Options.split(',');
      
      // Считаем голоса для каждого варианта
      const voteCounts = {};
      options.forEach((option, index) => {
        voteCounts[index] = 0;
      });
      
      Object.values(votes).forEach(voteIndex => {
        if (voteCounts[voteIndex] !== undefined) {
          voteCounts[voteIndex]++;
        }
      });

      // Считаем проценты
      const totalVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);
      
      // Создаем массив результатов
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

    // Обновляем голосование
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

    // Получаем данные голосования
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

    // Парсим результаты
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

    // Преобразуем результаты в массив
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
    
    // Обрабатываем изображения номинантов
    const optionImages = voting.fields.OptionImages || [];
    console.log('OptionImages from Airtable:', JSON.stringify(optionImages, null, 2));

    // Генерируем SVG
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

    // Добавляем изображения номинантов, если они есть
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

    // Конвертируем SVG в JPG
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

    // Загружаем на ImageBan.ru используя нашу функцию
    try {
      const imageUrl = await uploadToImageBan(imageBuffer, `voting_results_${id}_${Date.now()}.jpg`);
      console.log('Image uploaded to ImageBan:', imageUrl);
      
      // Сохраняем URL изображения в Airtable
      try {
        const updateResponse = await axios.patch(`${VOTINGS_URL}/${id}`, {
          fields: { 
            ResultsImage: imageUrl
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
        // Продолжаем выполнение даже если сохранение не удалось
      }

      res.json({ 
        success: true, 
        imageUrl: imageUrl
      });
    } catch (uploadError) {
      console.error('ImageBan upload failed:', uploadError.message);
      res.status(500).json({ error: 'Failed to upload image to ImageBan: ' + uploadError.message });
    }
  } catch (error) {
    console.error('Generate results image error:', error.message);
    if (error.response) {
      console.error('Airtable response:', error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// ==================== API ДЛЯ ЗАГРУЗКИ ИЗОБРАЖЕНИЙ ====================

app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    
    const filePath = req.file.path;
    
    try {
      // Используем нашу функцию для загрузки на ImageBan
      const imageUrl = await uploadToImageBan(fs.createReadStream(filePath), req.file.originalname);
      
      // Удаляем временный файл
      fs.unlinkSync(filePath);
      
      res.json({ url: imageUrl });
    } catch (uploadError) {
      // Удаляем временный файл в случае ошибки
      fs.unlinkSync(filePath);
      throw uploadError;
    }
  } catch (error) {
    console.error('Upload error:', error.message);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
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
    
    const filePath = req.file.path;
    
    try {
      // Используем нашу функцию для загрузки на ImageBan
      const imageUrl = await uploadToImageBan(fs.createReadStream(filePath), req.file.originalname);
      
      // Удаляем временный файл
      fs.unlinkSync(filePath);
      
      // Для Attachment поля возвращаем объект с url
      res.json({ 
        url: imageUrl,
        filename: req.file.originalname || `option_image_${Date.now()}.jpg`
      });
    } catch (uploadError) {
      // Удаляем временный файл в случае ошибки
      fs.unlinkSync(filePath);
      throw uploadError;
    }
  } catch (error) {
    console.error('Option image upload error:', error.message);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
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

    // Получаем текущее событие
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

    // Обрабатываем разные форматы данных
    let attendeesArray = [];
    
    if (Array.isArray(currentAttendees)) {
      attendeesArray = currentAttendees.filter(id => id && id.toString().trim());
    } else if (typeof currentAttendees === 'string') {
      attendeesArray = currentAttendees.split(',').filter(id => id && id.trim());
    }

    // Проверяем, не записан ли уже пользователь
    const userIdStr = userId.toString();
    if (attendeesArray.includes(userIdStr)) {
      console.log('User already attending');
      return res.status(400).json({ error: 'User already attending' });
    }

    // Добавляем пользователя
    attendeesArray.push(userIdStr);
    const newAttendees = attendeesArray.join(',');
    const newCount = currentCount + 1;

    console.log('New attendees:', newAttendees);
    console.log('New count:', newCount);

    // Обновляем запись
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

    // Получаем текущее событие
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

    // Обрабатываем разные форматы данных
    let attendeesArray = [];
    
    if (Array.isArray(currentAttendees)) {
      attendeesArray = currentAttendees.filter(id => id && id.toString().trim());
    } else if (typeof currentAttendees === 'string') {
      attendeesArray = currentAttendees.split(',').filter(id => id && id.trim());
    }

    // Удаляем пользователя
    const userIdStr = userId.toString();
    const newAttendeesArray = attendeesArray.filter(id => id !== userIdStr);
    const newAttendees = newAttendeesArray.join(',');
    const newCount = Math.max(0, newAttendeesArray.length);

    console.log('New attendees:', newAttendees);
    console.log('New count:', newCount);

    // Обновляем запись
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
  const R = 6371000; // Earth radius in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const distance = R * c;
  return distance;
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
  console.log(`Events URL: ${EVENTS_URL}`);
  console.log(`Ads URL: ${ADS_URL}`);
  console.log(`Votings URL: ${VOTINGS_URL}`);
  console.log('ImageBan API configured');
  console.log('Make sure you have these columns in Airtable:');
  console.log('- Events: AttendeesIDs, AttendeesCount');
  console.log('- Votings: Options, Votes, VotedUserIDs, Latitude, Longitude, Status, Results, OptionImages, ResultsImage');
});