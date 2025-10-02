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

// SeaTable API конфигурация - используем новый API Gateway
const SEATABLE_API_URL = process.env.SEATABLE_API_URL || 'https://api.seatable.io';
const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN;
const SEATABLE_BASE_UUID = process.env.SEATABLE_BASE_UUID;

// Названия таблиц в SeaTable
const EVENTS_TABLE = process.env.EVENTS_TABLE || 'Events';
const ADS_TABLE = process.env.ADS_TABLE || 'Ads';
const VOTINGS_TABLE = process.env.VOTINGS_TABLE || 'Votings';

// Radikal API конфигурация
const RADIKAL_API_URL = 'https://radikal.cloud/api/1';
const RADIKAL_API_KEY = process.env.RADIKAL_API_KEY;

// Хардкод админа
const ADMIN_ID = 366825437;

if (!SEATABLE_API_TOKEN || !SEATABLE_BASE_UUID || !RADIKAL_API_KEY) {
  console.error('Missing env vars: Set SEATABLE_API_TOKEN, SEATABLE_BASE_UUID, RADIKAL_API_KEY in Render');
  process.exit(1);
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ SEATABLE API (исправленные) ====================

/**
 * Получает заголовки авторизации для нового SeaTable API
 */
function getSeaTableHeaders() {
  return {
    'Authorization': `Token ${SEATABLE_API_TOKEN}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
}

/**
 * Получает базовый URL для работы с таблицей через новый API Gateway
 */
function getSeaTableBaseUrl() {
  return `${SEATABLE_API_URL}/api/v2.1/dtable-server/api/v1/dtables/${SEATABLE_BASE_UUID}`;
}

/**
 * Получает записи из таблицы SeaTable через новый API
 */
async function getSeaTableRecords(tableName) {
  try {
    const url = `${getSeaTableBaseUrl()}/rows/`;
    console.log(`SeaTable GET URL: ${url}`);
    console.log(`Table: ${tableName}`);
    
    const response = await axios.get(url, {
      headers: getSeaTableHeaders(),
      params: {
        table_name: tableName
      },
      timeout: 10000
    });
    
    console.log(`SeaTable GET successful for ${tableName}`);
    return response.data;
  } catch (error) {
    console.error(`SeaTable GET error for ${tableName}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
      // Логируем только начало ответа чтобы избежать огромных логов
      const responseData = error.response.data;
      if (typeof responseData === 'string' && responseData.length > 500) {
        console.error('Response data (first 500 chars):', responseData.substring(0, 500));
      } else {
        console.error('Response data:', responseData);
      }
    }
    throw error;
  }
}

/**
 * Создает запись в SeaTable через новый API
 */
async function createSeaTableRecord(tableName, data) {
  try {
    const url = `${getSeaTableBaseUrl()}/rows/`;
    console.log(`SeaTable POST URL: ${url}`);
    
    const requestData = {
      table_name: tableName,
      row: data
    };
    
    console.log('Request data:', JSON.stringify(requestData, null, 2));
    
    const response = await axios.post(url, requestData, {
      headers: getSeaTableHeaders(),
      timeout: 10000
    });
    
    console.log('SeaTable POST successful');
    return response.data;
  } catch (error) {
    console.error(`SeaTable POST error for ${tableName}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      if (error.response.data) {
        const responseData = error.response.data;
        if (typeof responseData === 'string' && responseData.length > 500) {
          console.error('Response data (first 500 chars):', responseData.substring(0, 500));
        } else {
          console.error('Response data:', responseData);
        }
      }
    }
    throw error;
  }
}

/**
 * Обновляет запись в SeaTable через новый API
 */
async function updateSeaTableRecord(tableName, rowId, data) {
  try {
    const url = `${getSeaTableBaseUrl()}/rows/`;
    console.log(`SeaTable PUT URL: ${url}`);
    
    const requestData = {
      table_name: tableName,
      row_id: rowId,
      row: data
    };
    
    console.log('Request data:', JSON.stringify(requestData, null, 2));
    
    const response = await axios.put(url, requestData, {
      headers: getSeaTableHeaders(),
      timeout: 10000
    });
    
    console.log('SeaTable PUT successful');
    return response.data;
  } catch (error) {
    console.error(`SeaTable PUT error for ${tableName}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      if (error.response.data) {
        const responseData = error.response.data;
        if (typeof responseData === 'string' && responseData.length > 500) {
          console.error('Response data (first 500 chars):', responseData.substring(0, 500));
        } else {
          console.error('Response data:', responseData);
        }
      }
    }
    throw error;
  }
}

/**
 * Удаляет запись из SeaTable через новый API
 */
async function deleteSeaTableRecord(tableName, rowId) {
  try {
    const url = `${getSeaTableBaseUrl()}/rows/`;
    console.log(`SeaTable DELETE URL: ${url}`);
    
    const response = await axios.delete(url, {
      headers: getSeaTableHeaders(),
      data: {
        table_name: tableName,
        row_ids: [rowId]
      },
      timeout: 10000
    });
    
    console.log('SeaTable DELETE successful');
    return response.data;
  } catch (error) {
    console.error(`SeaTable DELETE error for ${tableName}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      if (error.response.data) {
        const responseData = error.response.data;
        if (typeof responseData === 'string' && responseData.length > 500) {
          console.error('Response data (first 500 chars):', responseData.substring(0, 500));
        } else {
          console.error('Response data:', responseData);
        }
      }
    }
    throw error;
  }
}

/**
 * Получает одну запись по ID
 */
async function getSeaTableRecordById(tableName, rowId) {
  try {
    // В новом SeaTable API также получаем все записи и фильтруем
    const data = await getSeaTableRecords(tableName);
    const record = data.rows.find(row => row._id === rowId);
    
    if (!record) {
      throw new Error(`Record with id ${rowId} not found in table ${tableName}`);
    }
    
    return record;
  } catch (error) {
    console.error(`SeaTable GET by ID error for ${tableName}:`, error.message);
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
      timeout: 30000
    });

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

// Эндпоинт для удаления изображений
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

// ==================== EVENTS API ====================

app.get('/api/events', async (req, res) => {
  try {
    const data = await getSeaTableRecords(EVENTS_TABLE);
    res.json({ records: data.rows || [] });
  } catch (error) {
    console.error('Events GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    console.log('Creating event with data:', JSON.stringify(req.body, null, 2));
    const response = await createSeaTableRecord(EVENTS_TABLE, req.body.fields || req.body);
    res.json(response);
  } catch (error) {
    console.error('Events POST error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const record = await getSeaTableRecordById(EVENTS_TABLE, req.params.id);
    res.json(record);
  } catch (error) {
    console.error('Event GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/events/:id', async (req, res) => {
  try {
    console.log('Updating event with data:', JSON.stringify(req.body, null, 2));
    const response = await updateSeaTableRecord(EVENTS_TABLE, req.params.id, req.body.fields || req.body);
    res.json(response);
  } catch (error) {
    console.error('Event PATCH error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const response = await deleteSeaTableRecord(EVENTS_TABLE, req.params.id);
    res.json(response);
  } catch (error) {
    console.error('Event DELETE error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADS API ====================

app.get('/api/ads', async (req, res) => {
  try {
    const data = await getSeaTableRecords(ADS_TABLE);
    res.json({ records: data.rows || [] });
  } catch (error) {
    console.error('Ads GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    const response = await createSeaTableRecord(ADS_TABLE, req.body.fields || req.body);
    res.json(response);
  } catch (error) {
    console.error('Ads POST error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/ads/:id', async (req, res) => {
  try {
    const response = await updateSeaTableRecord(ADS_TABLE, req.params.id, req.body.fields || req.body);
    res.json(response);
  } catch (error) {
    console.error('Ads PATCH error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    const response = await deleteSeaTableRecord(ADS_TABLE, req.params.id);
    res.json(response);
  } catch (error) {
    console.error('Ad DELETE error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== VOTINGS API ====================

app.get('/api/votings', async (req, res) => {
  try {
    const data = await getSeaTableRecords(VOTINGS_TABLE);
    res.json({ records: data.rows || [] });
  } catch (error) {
    console.error('Votings GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/votings', async (req, res) => {
  try {
    const response = await createSeaTableRecord(VOTINGS_TABLE, req.body.fields || req.body);
    res.json(response);
  } catch (error) {
    console.error('Votings POST error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/votings/:id', async (req, res) => {
  try {
    const response = await updateSeaTableRecord(VOTINGS_TABLE, req.params.id, req.body.fields || req.body);
    res.json(response);
  } catch (error) {
    console.error('Votings PATCH error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/votings/:id', async (req, res) => {
  try {
    const response = await deleteSeaTableRecord(VOTINGS_TABLE, req.params.id);
    res.json(response);
  } catch (error) {
    console.error('Votings DELETE error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Получить голосования по ID мероприятия
app.get('/api/events/:eventId/votings', async (req, res) => {
  try {
    const { eventId } = req.params;
    const data = await getSeaTableRecords(VOTINGS_TABLE);
    
    // Фильтруем голосования по EventID
    const filteredVotings = data.rows.filter(row => row.EventID === eventId);
    res.json({ records: filteredVotings });
  } catch (error) {
    console.error('Event votings GET error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ФУНКЦИИ ДЛЯ ГОЛОСОВАНИЯ ====================

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

    // Получаем данные голосования из SeaTable
    const voting = await getSeaTableRecordById(VOTINGS_TABLE, id);

    if (voting.Status === 'Completed') {
      console.error('Voting is completed');
      return res.status(400).json({ error: 'Voting is completed' });
    }

    const votedUserIds = voting.VotedUserIDs || '';
    const votedUsersArray = votedUserIds.split(',').filter(id => id && id.trim());
    
    if (votedUsersArray.includes(userId.toString())) {
      console.error('User has already voted');
      return res.status(400).json({ error: 'Вы уже проголосовали в этом голосовании' });
    }

    const votingLat = voting.Latitude;
    const votingLon = voting.Longitude;
    
    if (votingLat && votingLon && userLat && userLon) {
      const distance = calculateDistance(userLat, userLon, votingLat, votingLon);
      console.log('Calculated distance:', distance);
      if (distance > 1000) {
        console.error('User is too far away');
        return res.status(400).json({ error: 'Вы находитесь слишком далеко от места голосования' });
      }
    }

    let currentVotes = voting.Votes ? (typeof voting.Votes === 'string' ? JSON.parse(voting.Votes) : voting.Votes) : {};
    console.log('Current votes:', currentVotes);

    currentVotes[userId] = optionIndex;
    console.log('Updated votes:', currentVotes);

    const newVotedUserIDs = votedUserIds ? `${votedUserIds},${userId}` : userId.toString();

    const updateData = {
      Votes: JSON.stringify(currentVotes),
      VotedUserIDs: newVotedUserIDs
    };

    console.log('Updating voting record with:', JSON.stringify(updateData, null, 2));

    const updateResponse = await updateSeaTableRecord(VOTINGS_TABLE, id, updateData);

    console.log('Vote updated successfully');
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

    const voting = await getSeaTableRecordById(VOTINGS_TABLE, id);
    const votedUserIds = voting.VotedUserIDs || '';
    const votedUsersArray = votedUserIds.split(',').filter(id => id && id.trim());
    
    const hasVoted = votedUsersArray.includes(userId.toString());
    let userVote = null;
    if (voting.Votes) {
      const votes = typeof voting.Votes === 'string' ? JSON.parse(voting.Votes) : voting.Votes;
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

    const voting = await getSeaTableRecordById(VOTINGS_TABLE, id);
    const votes = voting.Votes ? 
      (typeof voting.Votes === 'string' ? JSON.parse(voting.Votes) : voting.Votes) 
      : {};
    
    const results = [];
    
    if (voting.Options) {
      const options = voting.Options.split(',');
      
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

    const updateResponse = await updateSeaTableRecord(VOTINGS_TABLE, id, {
      Status: 'Completed',
      Results: JSON.stringify(results)
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

    const voting = await getSeaTableRecordById(VOTINGS_TABLE, id);
    if (!voting.Results) {
      return res.status(400).json({ error: 'Результаты голосования недоступны' });
    }

    let results;
    try {
      if (typeof voting.Results === 'string') {
        results = JSON.parse(voting.Results);
      } else {
        results = voting.Results;
      }
    } catch (parseError) {
      console.error('Error parsing results:', parseError);
      return res.status(400).json({ error: 'Неверный формат результатов голосования' });
    }

    let resultsArray = [];
       let resultsArray = [];
    if (Array if (Array.isArray(results)) {
      resultsArray = results;
    } else.isArray(results)) {
      resultsArray = results;
    } else if (results && typeof results === 'object') {
 if (results && typeof results      resultsArray = Object.values(results);
    } else {
 === 'object') {
      resultsArray = Object.values(results);
    } else {
           return res.status(400).json({ error: return res.status(400).json({ error: ' 'Неверный формат результатов' });
    }

   Неверный формат результатов' });
    }

    const title const title = voting.Title || 'Результаты голос = voting.Title || 'Результаты голосования';
    const description = voting.Description || '';
    
ования';
    const description = voting.Description || '';
    
       const optionImages = voting const optionImages = voting.OptionImages || [];

    let.OptionImages || [];

    height = 600;
    const hasImages = option let height = 600;
    const hasImages = optionImages && optionImages.length > 0;
    if (Images && optionImages.length > 0;
   hasImages) height += Math if (hasImages) height.ceil(resultsArray.length / 3) * += Math.ceil(resultsArray.length 110;

    let svg = `
      <svg width / 3) * 110;

    let svg = `
      <svg="800" height="${height}" xmlns="http:// width="800" height="${height}" xmlns="http://www.w3www.w3.org/2000/svg">
       .org/2000/svg">
        <style>
 <style>
          .title { font-family: Arial,          .title { font-family: A sans-serif; font-size: 24px; fontrial, sans-serif; font-size: 24px;-weight: bold; fill: #000; }
          font-weight: bold; fill .description { font: #000; }
          .description { font-family: A-family: Arial, sans-serifrial, sans-serif; font; font-size: 16px; fill: #666; }
          .option { font-family: Arial-size: 16px; fill: #666; }
          .option { font-family: Arial, sans, sans-serif; font-size:-serif; font-size: 16 16px; font-weight: bold; fill:px; font-weight: bold; fill: #000; }
          .stats { #000; }
          .stats { font-family: A font-family: Arial,rial, sans-serif; font-size: 16px; sans-serif; font-size: 16px; fill: fill: #666; }
        </style>
 #666; }
        </style>
        <rect width        <rect width="800" height="${height}" fill="#ffffff"/>
       ="800" height="${height}" fill="# <text x="400" y="50" classffffff"/>
        <text x="400" y="50" class="title"="title" text-anchor text-anchor="middle">${title}</text>
       ="middle">${title}</ <text x="400" y="80" class="text>
        <text x="400" y="80" class="description" textdescription" text-anchor="-anchor="middle">middle">${description}</text>
    `;

    let${description}</text>
    `;

    let y = y = 120;
    resultsArray.forEach((result 120;
   , index) => {
      const barWidth = (result resultsArray.forEach((result, index) => {
      const barWidth.percentage / 100 = (result.percentage / 100) * 400) * 400;
      const barColor = index %;
      const barColor = index % 2 ===  2 === 0 ? '#4CAF50'0 ? '# : '#2196F3';
      
     4CAF50' : '#2196F3 svg += `
        <rect x="100" y="${';
      
      svg += `
        <rect x="y}" width="400" height100" y="${y}" width="400" height="="40" fill="#e0e0e0"40" fill="#e0e0e0" rx rx="5"/>
        <rect x="5"/>
        <rect x="100" y="${y}" width="${bar="100" y="${y}" width="${barWidth}" height="40" fill="${barColor}" rx="Width}" height="40" fill="${barColor}" rx5"/>
        <text="5"/>
        <text x="20" y="${y + x="20" y="${ 25}" class="option">${result.optiony + 25}" class="option">${result.}</text>
        <text x="option}</text>
        <text x="520" y520" y="${y="${y + 25}" class + 25}" class="stats" text="stats"-anchor="end">${result.count} голосов (${result.percentage}%)</text>
      ` text-anchor="end">${result.count} голосов (${result.percentage}%)</text>
      `;
      y += 50;
    });

    if (;
      y += 50;
    });

    ifhasImages) {
      y +=  (hasImages) {
      y += 20;
      svg += `<text20;
      svg += x="400" y="${y}" class="description" `<text x="400" y="${y}" class=" text-anchor="middle">description" text-anchor="Изображения номинантов</text>`;
     middle">Изображения номинантов</text y += 30;
      
      resultsArray.forEach((result>`;
      y += 30;
      
      results, index) => {
        let imageUrl = nullArray.forEach((result, index) => {
        let imageUrl = null;
        if;
        if (optionImages (optionImages[index]) {
          if (typeof optionImages[index]) {
          if (typeof optionImages[index] ===[index] === 'object' 'object' && option && optionImages[index].url) {
            imageUrl =Images[index].url) {
            imageUrl = optionImages[index].url;
          } optionImages[index].url;
          } else if (Array.isArray else if (Array.isArray(optionImages) && optionImages[index] && optionImages(optionImages) && optionImages[index] && optionImages[index].url) {
            imageUrl[index].url) {
            imageUrl = optionImages[index]. = optionImages[index].url;
          }
        }
        
        if (imageUrl) {
url;
          }
        }
        
        if (imageUrl) {
          const col = index %          const col = index % 3;
          const row = Math 3;
          const row.floor(index / 3);
          svg += `<image = Math.floor(index / 3);
          svg += x="${100 + col * 200 `<image x="${100 + col * 200}" y="${y + row * }" y="${y + row110}" width="150" height="100" href * 110}" width="150" height="100" href="${imageUrl}"="${imageUrl}" preserveAspectRatio="xMid preserveAspectRatio="xYMid meet"/>`;
        }
      });
    }

   MidYMid meet"/>`;
        }
      });
    svg += `</svg }

    svg += `>`;

    const svgBuffer = Buffer.from(svg</svg>`;

    const svgBuffer = Buffer.from(svg);
    const image);
    const imageBuffer = await sharp(svgBuffer = await sharp(svgBuffer)
      .resize(800, height, {
        fitBuffer)
      .resize(800,: 'fill',
        background: { r:  height, {
        fit: 'fill',
        background: { r: 255, g255, g: 255: 255, b: , b: 255, alpha: 1 }
      })
      .jpeg({ 
255, alpha: 1 }
             quality: 90,
        chromaSubsampling: ' })
      .jpeg({ 
        quality: 90,
        chromaSubsampling: '4:4:4:4'
      })
      .toBuffer4:4'
      })
();

    const uploadResult =      .toBuffer();

    const uploadResult = await upload await uploadToRadikal(
      imageToRadikal(
      imageBuffer, 
      `vBuffer, 
      `voting_results_${id}_${Dateoting_results_${id}_${Date.now()}..now()}.jpg`,
      'image/jpeg'
   jpg`,
      'image/jpeg'
    );

    console );

    console.log('Results image uploaded to Rad.log('Results image uploaded to Radikal API:', uploadResult.url);
    
    tryikal API:', uploadResult.url);
 {
      await updateSeaTableRecord(VOTINGS_TABLE    
    try {
      await updateSeaTableRecord(VOTINGS, id, {
        ResultsImage: uploadResult.url
_TABLE, id, {
        Results      });
      
      console.logImage: uploadResult.url
      });
      
      console.log('Results('ResultsImage saved to SeaTable successfully');
    } catch (updateImage saved to SeaTable successfully');
    } catch (updateError) {
      console.error('Error saving ResultsImage toError) {
      console.error('Error saving ResultsImage to SeaTable:', updateError.message);
    }

    res.json SeaTable:', updateError.message);
    }

    res.json({ 
      success: true, 
({ 
      success: true, 
      imageUrl:      imageUrl: uploadResult uploadResult.url,
      fileId: uploadResult.file.url,
      fileId: uploadResult.fileId
    });

  }Id
    });

  catch (error) {
    console.error('Generate results } catch (error) {
    console.error('Generate results image error:', error.message);
    res image error:', error.message);
    res.status(500).json({ error:.status(500).json({ error error.message });
  }
});

// ==================== API ДЛЯ "Я ПОЙДУ!": error.message });
  }
});

// ==================== API ДЛЯ "Я ПОЙДУ ====================

app.post('/api/events/:!" ====================

app.post('/api/events/:eventId/attend', async (reqeventId/attend', async (req, res) => {
  try {
    const, res) => {
  try {
    const { eventId } = req.params;
    const { userId { eventId } = req.params;
    const { userId } = req.body;

    console.log(`User } = req.body;

    console.log(`User ${userId} attending event ${event ${userId} attending event ${eventId}`);

    if (!Id}`);

    if (!userId) {
      return res.status(400).jsonuserId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

({ error: 'User ID is required' });
    }

    const event = await getSeaTableRecordById(EV    const event = await getSeaTableRecordById(EVENTS_TABLE,ENTS_TABLE, eventId);
    const eventId);
    currentAttendees = event.AttendeesIDs || '';
    const const currentAttendees = event.AttendeesIDs || '';
    currentCount = event.AttendeesCount || 0;
    
 const currentCount = event.AttendeesCount || 0;
    console.log('Current attendees:', currentAttendees);
    
    console.log('Current attendees:', currentAttend    console.log('Current count:', currentCount);

ees);
    console.log('Current count:', currentCount);

    let attendeesArray = [];
    
       let attendeesArray = [];
    
    if (Array.is if (ArrayArray(currentAttendees)) {
      attendeesArray = currentAttendees.filter(id => id &&.isArray(currentAttendees)) {
      attendeesArray = currentAttendees.filter(id id.toString().trim());
    } else if (typeof currentAttendees === => id && id.toString().trim());
    } else if (typeof currentAttend 'string') {
      attendeesArray = currentAttendeesees === 'string') {
      attendeesArray = currentAttend.split(',').filter(id => id && id.trim());
ees.split(',').filter(id => id && id.trim());
    }

    const userIdStr    }

    const userIdStr = userId.toString();
    if (attendeesArray.includes(user = userId.toString();
    if (attendeesArray.includes(userIdStr)) {
IdStr)) {
           console.log('User already attending');
      return res.status(400).json({ error console.log('User already attending');
      return res.status(400).json({ error: 'User already attending' });
: 'User already attending'    }

    attendeesArray.push(userIdStr);
    });
    }

    attendeesArray.push(userIdStr);
    const newAttendees = attendeesArray.join(',');
    const const newAttendees = attendeesArray.join(',');
    const newCount = newCount = currentCount + 1;

    console.log currentCount + 1;

    console.log('New('New attendees:', newAttendees);
    console attendees:', newAttendees);
    console.log.log('New count:', newCount);

    const updateData = {
      Attend('New count:', newCount);

    const updateData = {
      AttendeesIDseesIDs: newAttendees,
      AttendeesCount: newAttendees,
      AttendeesCount: newCount
    };

    console.log('Update: newCount
    };

    console.log('Update data:', JSON data:', JSON.stringify(updateData, null, 2));

    const updateResponse.stringify(updateData, null, 2 = await updateSeaTableRecord(EVENTS_TABLE));

    const updateResponse = await updateSeaTableRecord(EVENTS, eventId, updateData);

    console.log('_TABLE, eventId, updateData);

    consoleUpdate successful');
    res.json({ success: true, count:.log('Update successful');
    res.json({ success: true newCount,, count: newCount, attending: true });
    
  } catch attending: true });
    
  } catch (error) (error) {
    console.error('Attend error:', error.message);
    res.status(500). {
    console.error('Attend error:', error.message);
    res.status(500).json({ error:json({ error: error.message });
  }
});

app.post('/api/ error.message });
  }
});

app.post('/api/events/:events/:eventId/unattend', async (req, reseventId/unattend', async (req, res) => {
) => {
  try {
    const { eventId }  try {
    const { eventId } = req.params;
    const { userId = req.params;
    const } = req.body;

    console.log(`User ${userId} unatt { userId } = req.body;

    console.log(`User ${userId} unattending eventending event ${eventId}`);

    if (!userId) ${eventId}`);

    if (!userId) {
      {
      return res.status(400).json({ error: return res.status(400).json({ error: ' 'User ID isUser ID is required' });
    }

    const event = await getSeaTableRecordById(EVENTS required' });
    }

    const event = await getSeaTableRecord_TABLE, eventId);
    const currentAttendById(EVENTS_TABLE, eventId);
    const currentAttendees = eventees = event.AttendeesIDs || '';
    const currentCount.AttendeesIDs || = event.AttendeesCount || 0;
    
    '';
    const currentCount = event.AttendeesCount || 0;
    
    console console.log('Current attendees:',.log('Current attendees:', currentAttendees);
    console.log('Current count currentAttendees);
    console.log('Current count:', currentCount);

:', currentCount);

    let    let attendeesArray = [];
    
    if (Array.isArray(currentAttendees)) {
      attendeesArray = currentAttendees.filter(id attendeesArray = [];
    
    if (Array.isArray(currentAttendees)) {
      attendees => id && id.toString().trim());
    } else if (Array = currentAttendees.filter(id => id && id.toString().trimtypeof currentAttendees === 'string') {
      attendees());
    } else if (typeof currentAttendees === 'string') {
      attendeesArray =Array = currentAttendees.split(',').filter currentAttendees.split(',').filter(id => id(id => id && id.trim());
    && id.trim());
    }

 }

    const userIdStr = userId.toString();
    const newAttendeesArray    const userIdStr = userId.toString();
    const newAttendeesArray = attendeesArray.filter(id => id !== = attendeesArray.filter(id => userIdStr);
    const newAttendees = newAtt id !== userIdStr);
    const newAttendeesendeesArray.join(',');
    const newCount = Math = newAttendeesArray.join(',');
    const newCount = Math.max(0,.max(0, newAttendeesArray.length);

    newAttendeesArray.length);

    console.log('New console.log('New attendees:', newAttendees);
    console.log('New count attendees:', newAttendees);
    console:', newCount);

    const updateData = {
.log('New count:', newCount);

    const updateData      AttendeesIDs: newAttendees,
      AttendeesCount: = {
      AttendeesIDs: newAttendees,
      Attendees newCount
    };

    const updateResponse = await updateCount: newCount
    };

    const updateResponse =SeaTableRecord(EVENTS_TABLE, eventId, await updateSeaTableRecord(EVENTS_TABLE, event updateData);

    console.log('Unattend successful');
   Id, updateData);

    console.log('Unattend successful');
    res.json({ success res.json({ success: true, count: newCount: true, count: newCount, attending:, attending: false });
    
  } catch (error) {
    false });
    
  } catch (error) {
 console.error('    console.error('UnattendUnattend error:', error.message);
    res.status(500).json({ error: error:', error.message);
    res.status(500).json({ error: error error.message });
  }
});

// Проверяем статус участия пользователя
app.get.message });
  }
});

// Проверяем статус участия пользователя
app.get('/('/api/events/:eventapi/events/:eventIdId/attend-status/:userId', async (req, res) => {
  try/attend-status/:userId', async (req, res) => {
  try {
    const { eventId, userId } = req.params {
    const { eventId, userId } = req.params;

    console.log(`Checking attend status for user ${userId;

    console.log(`Checking attend status for user ${userId} in event ${eventId} in event ${eventId}`);

    const event =}`);

    const event = await getSeaTableRecordById(EVENTS_TABLE, eventId);
 await getSeaTableRecordById(EVENTS_TABLE,    const attendees = event.AttendeesIDs || '';
    eventId);
    const attendees = event.AttendeesIDs || '';
    let attendeesArray let attendeesArray = [];
    
    if (Array.isArray( = [];
    
    if (Array.isArray(attendees)) {
      attendeesArray =attendees)) {
      attendeesArray = attendees.filter(id => id && id.toString attendees.filter(id => id && id.toString().trim());
   ().trim());
    } else } else if (typeof attendees === 'string') {
      attendeesArray = attendees if (typeof attendees === 'string') {
      attendeesArray.split(',').filter(id => id && id.trim());
 = attendees.split(',').filter(id => id && id    }
    
    const isAttending = attendeesArray.includes.trim());
    }
    
    const isAttending = attendees(userId.toString());

    console.log('Is attending:', isArray.includes(userId.toString());

    console.log('Is attending:', isAttending);
Attending);
    res.json({ isAttending });
    
  } catch (error)    res.json({ isAttending });
    
  } {
    console.error('Attend status error:', error.message catch (error) {
    console.error('Attend status error:', error.message);
    res.status);
    res.status(500(500).json({ error: error.message });
  }
).json({ error: error.message });
  }
});

// =});

// ==================== ВСПОМОГАТЕЛЬНЫЕ Ф=================== ВСПОМОГАТЕЛЬУННЫЕ ФУНКЦИИКЦИИ ====================

function calculateDistance(lat1, ====================

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const d lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
Lat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(l  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2on2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat(deg2rad(lat1)) * Math.cos(deg2rad(lat22)) * 
    Math)) * 
    Math.sin(dLon/2.sin(dLon/2) * Math.sin(dLon/2); 
 ) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 const c = 2 * Math.atan2(Math.sqrt-a)); 
  return R * c;
}

function(a), Math.sqrt(1-a)); 
  return R * c;
}

function deg deg2rad(deg) {
  return deg * (2rad(deg) {
  return deg * (MathMath.PI/180);
}

.PI/180);
}

// Корневой эндпоин// Корневой эндпоинт
т
app.get('/', (req, res) => {
app.get('/', (req, res) => {
  res  res.send('Smolville Backend is running! API endpoints: /api/.send('Smolville Backend is running! API endpointsevents, /api/ads, /api/votings: /api/events, /api/ads, /api/votings,, /api/upload');
});

// Создание /api/upload');
});

// Создание пап папки uploads
const uploadsDir = path.join(__dirname, 'ки uploads
const uploaduploads');
if (!fs.existsSync(uploadsDirsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
)) {
  fs.mkdirSync  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Запуск сервера(uploadsDir, { recursive: true });
}

// Запуск сервера
app.listen(port, () => {
  console.log(`Server running on port ${
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`SeaTable API URLport}`);
  console.log(`SeaTable API: ${SEATABLE_API_URL}`);
  console.log(`Sea URL: ${SEATABLE_API_URL}`);
  console.log(`SeaTable Base UUID: ${SEATABLE_BASE_UUID}`);
  console.log('MakeTable Base UUID: ${SEATABLE_BASE_UUID}`);
  console.log('Make sure sure SEATABLE_API_TOKEN is set in environment variables');
 SEATABLE_API_TOKEN is set in environment variables');
});
});