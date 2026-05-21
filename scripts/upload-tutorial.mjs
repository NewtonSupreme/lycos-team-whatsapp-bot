import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = Object.fromEntries(
  envContent.split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
    .filter(([k]) => k)
);

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan credenciales');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const videoPath = resolve(__dirname, '..', 'public', 'Tutorial', 'tutorial_compressed.mp4');
const bucketName = 'tutorial';
const fileName = 'tutorial_Lycos_Team.mp4';

if (!existsSync(videoPath)) {
  console.error('❌ No se encuentra:', videoPath);
  process.exit(1);
}

const buffer = readFileSync(videoPath);
const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
console.log(`📦 ${sizeMB} MB`);

console.log('⬆️ Subiendo...');
const { data, error } = await supabase.storage
  .from(bucketName)
  .upload(fileName, buffer, {
    contentType: 'video/mp4',
    upsert: true,
  });

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log('✅ Video subido!');

const { data: signed } = await supabase.storage
  .from(bucketName)
  .createSignedUrl(fileName, 86400); // 24h

if (signed?.signedUrl) {
  console.log('🔗 Signed URL (24h):', signed.signedUrl.substring(0, 100) + '...');
}
