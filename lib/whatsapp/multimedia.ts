/*
 * Lo que manda el cliente que no es texto: videos y stickers.
 *
 * Antes un video llegaba al bot como «[Video]» y un sticker como «[Sticker]»: el bot no
 * sabía qué le habían mandado y respondía a ciegas («no puedo ver videos»). Aquí se
 * descargan de WhatsApp y Gemini los mira de verdad:
 *
 *   · VIDEO: hasta ~18 MB va en la misma petición; más grande, se sube a la API de
 *     archivos de Gemini (hasta lo que permita WhatsApp, 16 MB normalmente, 100 MB como
 *     documento) y se espera a que quede listo. Se pide lo que un mecánico necesita:
 *     qué se ve, qué se oye (ruidos del motor, del escape), placa, testigos, y qué pide
 *     el cliente si habla.
 *   · STICKER: qué muestra, el texto que trae y QUÉ QUIERE DECIR (gracias, ok, risa,
 *     enojo, saludo, espera…), para contestar como contestaría una persona.
 */

const r = (ms: number) => new Promise(res => setTimeout(res, ms));
const API = 'https://generativelanguage.googleapis.com';

export interface MediaDescargada { base64: string; mime: string; bytes: number; buf: Buffer }

/** Baja un archivo de WhatsApp por su id. null si no se pudo (sin lanzar). */
export async function descargarMediaWhatsApp(mediaId: string, token: string, opciones: { timeoutMs?: number; maxBytes?: number } = {}): Promise<MediaDescargada | null> {
  const { timeoutMs = 20000, maxBytes = 60 * 1024 * 1024 } = opciones;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const meta = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, { signal: ctrl.signal, headers: { Authorization: `Bearer ${token}` } });
    if (!meta.ok) return null;
    const m = await meta.json() as { url?: string; mime_type?: string; file_size?: number };
    if (!m.url || (m.file_size && m.file_size > maxBytes)) return null;
    const resp = await fetch(m.url, { signal: ctrl.signal, headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > maxBytes) return null;
    return { base64: buf.toString('base64'), mime: (m.mime_type || 'application/octet-stream').split(';')[0], bytes: buf.length, buf };
  } catch { return null; } finally { clearTimeout(t); }
}

async function generar(key: string, modelos: readonly string[], partes: unknown[], sistema: string, timeoutMs: number, maxTokens = 900): Promise<string | null> {
  for (const model of modelos) {
    for (let intento = 0; intento < 2; intento++) {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const resp = await fetch(`${API}/v1beta/models/${model}:generateContent?key=${key}`, {
          method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: sistema }] },
            contents: [{ role: 'user', parts: partes }],
            generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
          }),
        });
        if (!resp.ok) {
          if (resp.status === 429 || resp.status === 503 || resp.status === 500) { await r(800 * (intento + 1)); continue; }
          break;
        }
        const data = await resp.json();
        const texto = (data.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('').trim();
        if (texto) return texto;
      } catch { await r(400); } finally { clearTimeout(t); }
    }
  }
  return null;
}

/** Sube un archivo grande a Gemini y espera a que esté listo. Devuelve su uri. */
async function subirArchivoGemini(key: string, buf: Buffer, mime: string): Promise<string | null> {
  try {
    const ini = await fetch(`${API}/upload/v1beta/files?key=${key}`, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(buf.length), 'X-Goog-Upload-Header-Content-Type': mime,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: `wa-${Date.now()}` } }),
    });
    const url = ini.headers.get('x-goog-upload-url');
    if (!url) return null;
    const sub = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Length': String(buf.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
      body: new Uint8Array(buf),
    });
    const f = (await sub.json())?.file as { uri?: string; name?: string; state?: string } | undefined;
    if (!f?.uri || !f.name) return null;
    // Un video se procesa unos segundos antes de poder usarse.
    for (let i = 0; i < 30 && f.state !== 'ACTIVE'; i++) {
      await r(2000);
      const est = await fetch(`${API}/v1beta/${f.name}?key=${key}`).then(x => x.json()).catch(() => null);
      f.state = est?.state;
      if (f.state === 'FAILED') return null;
    }
    return f.state === 'ACTIVE' ? f.uri : null;
  } catch { return null; }
}

const SISTEMA_VIDEO = `Eres el ojo y el oído de un taller mecánico (Lycos Team, Venezuela: silenciadores, escapes, mecánica, frenos, alineación, electrónica).
Te mandan un video por WhatsApp. Descríbelo para que el asistente pueda contestar bien. Responde en español, en este orden y solo con lo que de verdad se ve u oye:
1. QUÉ ES: tipo de video (carro andando, motor encendido, ruido, pieza, tablero, accidente, ubicación, otro).
2. VEHÍCULO: marca/modelo/año aproximados, color, PLACA si se lee (si no, «no legible»).
3. LO QUE SE OYE: ruidos (golpeteo, silbido, escape roto o ruidoso, explosiones, chirrido de frenos, cascabeleo), y en qué momento. Si alguien habla, resume LO QUE DICE.
4. LO QUE SE VE: humo y su color, fugas, piezas sueltas u oxidadas, testigos encendidos en el tablero, daños.
5. POSIBLE CAUSA: lo más probable como mecánico, con prudencia («podría ser…»), y qué servicio del taller aplica.
No inventes: si algo no se distingue, dilo.`;

/** Describe un video del cliente (o del administrador). null si no se pudo. */
export async function describirVideo(key: string, modelos: readonly string[], media: MediaDescargada, leyenda: string, esAdmin: boolean): Promise<string | null> {
  if (!key) return null;
  const pedido = `${esAdmin ? 'Lo manda un administrador del taller (puede ser el registro de un trabajo).' : 'Lo manda un cliente.'}${leyenda ? ` Escribió junto al video: «${leyenda}».` : ''} Analiza el video completo, imagen y sonido.`;
  const enLinea = media.bytes <= 18 * 1024 * 1024;
  if (enLinea) {
    const t = await generar(key, modelos, [{ inlineData: { mimeType: media.mime, data: media.base64 } }, { text: pedido }], SISTEMA_VIDEO, 60000);
    if (t) return t;
  }
  const uri = await subirArchivoGemini(key, media.buf, media.mime);
  if (!uri) return null;
  return generar(key, modelos, [{ fileData: { mimeType: media.mime, fileUri: uri } }, { text: pedido }], SISTEMA_VIDEO, 90000);
}

const SISTEMA_STICKER = `Te mandan un STICKER de WhatsApp en una conversación con un taller mecánico. Di, en una o dos líneas y en español:
- QUÉ MUESTRA (personaje, animal, persona, objeto) y el TEXTO que trae si tiene;
- QUÉ QUIERE DECIR quien lo manda, en una de estas intenciones: saludo, gracias, ok/de acuerdo, risa, cariño, despedida, espera/pensando, sorpresa, tristeza, enojo/molestia, burla, pregunta, celebración, otro.
Formato exacto: «Sticker: <qué muestra>. Texto: <texto o "ninguno">. Intención: <intención>.»`;

/** Qué es y qué quiere decir un sticker. */
export async function describirSticker(key: string, modelos: readonly string[], media: MediaDescargada): Promise<string | null> {
  if (!key) return null;
  // Los stickers animados también son webp: Gemini toma el cuadro que representa la animación.
  return generar(key, modelos, [{ inlineData: { mimeType: media.mime === 'application/octet-stream' ? 'image/webp' : media.mime, data: media.base64 } }, { text: 'Interpreta este sticker.' }], SISTEMA_STICKER, 15000, 200);
}
