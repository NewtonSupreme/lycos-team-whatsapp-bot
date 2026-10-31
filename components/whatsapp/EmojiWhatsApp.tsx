'use client';

import React, { useState } from 'react';

/**
 * Emojis como se ven en WhatsApp.
 *
 * Cada sistema pinta los emojis a su manera (Windows los dibuja planos, Android con su set): en el
 * CRM no se parecían a lo que el cliente ve en su WhatsApp. Aquí cada emoji se reemplaza por la
 * imagen del set estilo Apple —el que usa WhatsApp— y, si alguna no existe, queda el emoji del
 * sistema: nunca se pierde un carácter. Reconoce tonos de piel, banderas, teclas (1️⃣) y
 * combinaciones (👨‍👩‍👧). Un mensaje que es solo 1–3 emojis se ve grande, como en WhatsApp.
 */

const CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/';

// Bandera · tecla · emoji (con tono de piel o variante) unido por ZWJ a otros.
const EMOJI = /(\p{Regional_Indicator}{2}|[#*0-9]️?⃣|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)(?:\p{Emoji_Modifier}|️)*(?:‍(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:\p{Emoji_Modifier}|️)*)*)/gu;

const hex = (s: string) => [...s].map(c => c.codePointAt(0)!.toString(16).padStart(4, '0'));

/** Los nombres de archivo posibles (el set a veces incluye el selector FE0F y a veces no). */
function candidatos(emoji: string): string[] {
  const todos = hex(emoji);
  const sinVs = todos.filter(h => h !== 'fe0f');
  const conVs = sinVs.length === 1 ? [...sinVs, 'fe0f'] : null;
  return [...new Set([todos.join('-'), sinVs.join('-'), conVs?.join('-')].filter(Boolean) as string[])];
}

function EmojiImg({ e, tam }: { e: string; tam: string }) {
  const [i, setI] = useState(0);
  const lista = candidatos(e);
  if (i >= lista.length) return <>{e}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagen diminuta de CDN, sin optimización
    <img src={`${CDN}${lista[i]}.png`} alt={e} draggable={false} loading="lazy" onError={() => setI(x => x + 1)}
      className="inline-block select-text align-[-0.22em]" style={{ width: tam, height: tam, margin: '0 0.05em' }} />
  );
}

/** El texto con sus emojis como en WhatsApp. */
export function conEmojis(texto: string | null | undefined, tam = '1.25em'): React.ReactNode {
  const t = String(texto ?? '');
  if (!t) return t;
  const partes = t.split(EMOJI);
  if (partes.length === 1) return t;
  return partes.map((p, k) => (k % 2 === 1 ? <EmojiImg key={k} e={p} tam={tam} /> : p ? <React.Fragment key={k}>{p}</React.Fragment> : null));
}

/** ¿El mensaje es solo 1 a 3 emojis? (WhatsApp los muestra grandes) */
export function soloEmojis(texto: string | null | undefined): boolean {
  const t = String(texto ?? '').trim();
  if (!t || t.length > 40) return false;
  const m = t.match(EMOJI);
  return !!m && m.length <= 3 && t.replace(EMOJI, '').trim() === '';
}

export default function EmojiTexto({ texto, tam }: { texto: string | null | undefined; tam?: string }) {
  return <>{conEmojis(texto, tam ?? (soloEmojis(texto) ? '2.6em' : '1.25em'))}</>;
}

const GRUPOS: Array<[string, string]> = [
  ['Frecuentes', '😊 👍 🙏 🔧 🚗 ✅ 😂 ❤️ 👋 🙌 💪 👌 🤝 😁 🔥 📍 📅 ⏰ 💰 💵'],
  ['Caras', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 🤗 🤭 🤫 🤔 😐 😑 😶 🙄 😏 😬 😌 😔 😪 😴 😷 🤒 🥵 🥶 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😢 😭 😱 😖 😣 😞 😓 😩 😫 😤 😡 😠 🤯'],
  ['Gestos', '👍 👎 👌 ✌️ 🤞 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 👋 👏 🙌 👐 🤲 🤝 🙏 💪 ✍️ 🫡 🫶'],
  ['Taller y carros', '🚗 🚙 🛻 🚕 🏎️ 🚐 🚚 🏍️ 🛵 🚨 🔧 🔩 🪛 ⚙️ 🛠️ 🧰 🔨 ⛽ 🛞 🔋 💨 🧯 🚦 🛣️ 🅿️ 🧽 🧼 💧'],
  ['Dinero y citas', '💰 💵 💲 💳 🧾 📄 📋 📅 🗓️ ⏰ ⏳ ⌛ 📍 🗺️ 📞 📲 💬 📸 🎥 🔔 📢 ⭐ 🏆 🎁 🎉 🎊'],
  ['Símbolos', '✅ ☑️ ✔️ ❌ ⚠️ ❗ ❓ ‼️ ⁉️ 💯 🔴 🟠 🟡 🟢 🔵 ⚫ ⬆️ ⬇️ ➡️ ⬅️ 🔝 🆗 🆕 🆓 ♻️ ❤️ 🧡 💛 💚 💙 💜 🖤 🤍'],
];

/** Selector de emojis con los de WhatsApp. `onElegir` recibe el emoji como texto. */
export function SelectorEmojis({ onElegir, onCerrar }: { onElegir: (e: string) => void; onCerrar?: () => void }) {
  const [g, setG] = useState(0);
  return (
    <div className="w-full rounded-xl border p-2 shadow-2xl" style={{ background: 'hsl(var(--wa-panel-alt))', borderColor: 'hsl(var(--wa-borde))' }}>
      <div className="mb-1.5 flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {GRUPOS.map(([n], i) => (
          <button key={n} type="button" onClick={() => setG(i)} className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold"
            style={{ background: i === g ? 'hsl(var(--wa-hover))' : 'transparent', color: 'hsl(var(--wa-texto))' }}>{n}</button>
        ))}
        {onCerrar && <button type="button" onClick={onCerrar} className="ml-auto shrink-0 px-2 text-[12px]" style={{ color: 'hsl(var(--wa-texto-suave))' }} aria-label="Cerrar emojis">✕</button>}
      </div>
      <div className="grid max-h-[200px] grid-cols-8 gap-0.5 overflow-y-auto sm:grid-cols-10">
        {GRUPOS[g][1].split(' ').filter(Boolean).map(e => (
          <button key={e} type="button" onClick={() => onElegir(e)} className="flex h-9 items-center justify-center rounded-lg hover:bg-[hsl(var(--wa-hover))]" aria-label={e}>
            <EmojiImg e={e} tam="1.6em" />
          </button>
        ))}
      </div>
    </div>
  );
}
