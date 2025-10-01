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

// Env vars для Бипиума - УБЕРИТЕ ПРОТОКОЛ ИЗ ДОМЕНА!
const BPIUM_DOMAIN = process.env.BPIUM_DOMAIN ? process.env.BPIUM_DOMAIN.replace(/https?:\/\//, '') : '';
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

// ВАЖНО: Проверяем переменные окружения
console.log('Environment variables check:');
console.log('BPIUM_DOMAIN:', BPIUM_DOMAIN ? 'Set' : 'Missing');
console.log('BPIUM_USERNAME:', BPIUM_USERNAME ? 'Set' : 'Missing');
console.log('BPIUM_PASSWORD:', BPIUM_PASSWORD ? 'Set' : 'Missing');
console.log('RADIKAL_API_KEY:', RADIKAL_API_KEY ? 'Set' : 'Missing');

if (!BPIUM_DOMAIN || !BPIUM_USERNAME || !BPIUM_PASSWORD || !RADIKAL_API_KEY) {
  console.error('Missing env vars: Set BPIUM_DOMAIN, BPIUM_USERNAME, BPIUM_PASSWORD, RADIKAL_API_KEY');
  console.error('Current BPIUM_DOMAIN:', BPIUM_DOMAIN);
  process.exit(1);
}

// Базовый URL для API Бипиума - ИСПРАВЛЕНО!
const BPIUM_API_BASE = `https://${BPIUM_DOMAIN}/api/v1`;
console.log('Bpium API Base URL:', BPIUM_API_BASE);

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
    console.log('API URL:', `${BPIUM_API_BASE}/auth/login`);
    
    const response = await axios.post(`${BPIUM_API_BASE}/auth/login`, {
      username: BPIUM_USERNAME,
      password: BPIUM_PASSWORD
    }, {
      timeout: 10000
    });

    authToken = response.data.token;
    // Токен обычно действителен 24 часа
    tokenExpiry = Date.now() + (23 * 60 * 60 * 1000); // Обновляем за час до истечения
    
    console.log('Bpium authentication successful');
    return authToken;
  } catch (error) {
    console.error('Bpium authentication error:', error.message);
    if (error.response) {
      console.error('Bpium response status:', error.response.status);
      console.error('Bpium response data:', error.response.data);
    } else if (error.code) {
      console.error('Error code:', error.code);
    }
    throw error;