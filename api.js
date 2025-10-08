// config.js
export const Config = {
  API_BASE_URL: 'https://smolville.onrender.com',
};

// api.js
import { Config } from './config';

// Создание события с изображением
export const createEventWithImage = async (eventData, imageFile) => {
  try {
    const formData = new FormData();
    
    formData.append('eventData', JSON.stringify({
      fields: {
        Title: eventData.title,
        Description: eventData.description,
        Date: eventData.date,
        Location: eventData.location,
        Latitude: eventData.latitude,
        Longitude: eventData.longitude,
      }
    }));
    
    if (imageFile) {
      formData.append('image', {
        uri: imageFile.uri,
        type: imageFile.type || 'image/jpeg',
        name: imageFile.fileName || `event_${Date.now()}.jpg`
      });
    }

    const response = await fetch(`${Config.API_BASE_URL}/api/events-with-image`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    
    if (result.success) {
      return result.event;
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Error creating event with image:', error);
    throw error;
  }
};

// Создание рекламы с изображением
export const createAdWithImage = async (adData, imageFile) => {
  try {
    const formData = new FormData();
    
    formData.append('adData', JSON.stringify({
      fields: {
        Title: adData.title,
        Description: adData.description,
        Link: adData.link,
      }
    }));
    
    if (imageFile) {
      formData.append('image', {
        uri: imageFile.uri,
        type: imageFile.type || 'image/jpeg',
        name: imageFile.fileName || `ad_${Date.now()}.jpg`
      });
    }

    const response = await fetch(`${Config.API_BASE_URL}/api/ads-with-image`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    
    if (result.success) {
      return result.ad;
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Error creating ad with image:', error);
    throw error;
  }
};

// Загрузка изображения для опции голосования
export const uploadVotingOptionImage = async (votingId, optionIndex, imageFile) => {
  try {
    const formData = new FormData();
    
    formData.append('image', {
      uri: imageFile.uri,
      type: imageFile.type || 'image/jpeg',
      name: imageFile.fileName || `voting_${votingId}_option_${optionIndex}.jpg`
    });
    
    formData.append('optionIndex', optionIndex.toString());

    const response = await fetch(`${Config.API_BASE_URL}/api/votings/${votingId}/upload-option-image`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    
    if (result.success) {
      return result.imageUrl;
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Error uploading voting option image:', error);
    throw error;
  }
};

// Тестовый вызов
export const testBackend = async () => {
  try {
    const response = await fetch(`${Config.API_BASE_URL}/api/test-upload`);
    return await response.json();
  } catch (error) {
    console.error('Backend test failed:', error);
    throw error;
  }
};

// Существующие API функции
export const createEvent = async (eventData) => {
  const response = await fetch(`${Config.API_BASE_URL}/api/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });
  return await response.json();
};

export const createAd = async (adData) => {
  const response = await fetch(`${Config.API_BASE_URL}/api/ads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(adData),
  });
  return await response.json();
};

export const createVoting = async (votingData) => {
  const response = await fetch(`${Config.API_BASE_URL}/api/votings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(votingData),
  });
  return await response.json();
};
