import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; // requires npm install node-fetch.

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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function transcribeAudio(base64Data, mimeType) {
  if (!GEMINI_API_KEY) return null;
  const sttModel = 'gemini-3.1-flash-lite-preview';
  const systemPrompt = "Eres un sistema de reconocimiento de voz. Tu UNICA tarea es transcribir el audio a texto exacto en español. NO agregues explicaciones, respuestas, introducciones ni comentarios. Solo escribe lo que el usuario dice en español tal cual.";
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${sttModel}:generateContent?key=${GEMINI_API_KEY}`;
    console.log(`Pidiendo transcripción a Gemini usando ${sttModel}...`);
    
    // Check request body size just in case
    const body = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: mimeType.split(';')[0], data: base64Data } },
          { text: "Transcribe el audio siguiente:" }
        ]
      }],
      generationConfig: { temperature: 0.1 }
    });
    
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    
    if (!resp.ok) {
      console.error(`❌ Gemini STT error ${resp.status}:`, (await resp.text()).substring(0, 200));
      return null;
    }
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (e) {
    console.error('❌ transcribeAudio excepcion:', e);
    return null;
  }
}

async function run() {
  console.log('Downloading sample audio/ogg...');
  // A small sample audio file in OGG format from Wikimedia
  const sampleUrl = 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg';
  
  const res = await fetch(sampleUrl);
  if (!res.ok) {
    console.error('Failed to download sample file');
    return;
  }
  
  const buffer = await res.arrayBuffer();
  const base64Data = Buffer.from(buffer).toString('base64');
  console.log(`Downloaded sample. Base64 length: ${base64Data.length}`);
  
  const transcript = await transcribeAudio(base64Data, 'audio/ogg; codecs=opus');
  console.log('Transcript:', transcript);
}

run();
