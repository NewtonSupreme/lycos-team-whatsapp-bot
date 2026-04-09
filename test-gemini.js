import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Manually load .env.local
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value.length > 0 && !line.startsWith('#')) {
      process.env[key.trim()] = value.join('=').trim();
    }
  });
}

const testGemini = async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found');
    return;
  }

  const model = 'gemini-3.1-flash-lite-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    console.log(`🤖 Testing Gemini model: ${model}...`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Hola, ¿cómo estás?' }] }]
      })
    });

    const data = await response.json();
    if (response.ok) {
      console.log('✅ Response:', data.candidates?.[0]?.content?.parts?.[0]?.text);
    } else {
      console.error('❌ Error response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Fetch error:', error.message);
  }
};

testGemini();
