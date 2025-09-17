import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Настройка multer для загрузки изображений
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Пример эндпоинта для добавления события
app.post('/events', upload.single('image'), async (req, res) => {
  try {
    const { title, type, date, location, description } = req.body;
    // Если есть файл изображения, можно загрузить в ImgBB
    let imageUrl = null;
    if (req.file) {
      const formData = new FormData();
      formData.append('image', req.file.buffer.toString('base64'));
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (data.success) imageUrl = data.data.url;
    }
    // Здесь вместо реальной базы можно вернуть объект события
    res.json({ success: true, event: { title, type, date, location, description, image: imageUrl } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
