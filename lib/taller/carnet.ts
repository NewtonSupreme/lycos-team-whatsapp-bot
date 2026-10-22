/*
 * El carnet de acceso del taller, dibujado en un canvas: la misma imagen se
 * ve en la página, se descarga como PNG para mandarla por WhatsApp y se
 * imprime a tamaño carnet (CR80, 54 × 85,6 mm). Identidad Lycos Team: el lobo
 * sobre blanco arriba, la franja de taller, y el negro con naranja de la
 * pantalla del taller abajo.
 */

import { RIF_TEXTO } from '@/lib/empresa';

export interface DatosCarnet {
  nombre: string;
  cargo: string | null;
  codigo: string;
  foto: string | null;
  cedula: string | null;
  emitido: string | null;
}

export interface FuentesCarnet { display: string; texto: string }

export const ANCHO = 1080;
export const ALTO = 1712;          // proporción CR80 (85,6 / 54)

const C = {
  fondo: '#0b0d10', panel: '#13171d', panel2: '#1a1f27', tinta: '#f2efe9', tenue: '#9aa3ad', apagado: '#5f6873',
  naranja: '#ff7a1a', negro: '#111111', papel: '#ffffff',
};

const imagenes = new Map<string, Promise<HTMLImageElement | null>>();
function cargar(src: string): Promise<HTMLImageElement | null> {
  if (!imagenes.has(src)) {
    imagenes.set(src, new Promise(res => {
      const i = new Image();
      i.crossOrigin = 'anonymous';           // sin esto, una foto de otro dominio no deja exportar el PNG
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = src;
    }));
  }
  return imagenes.get(src)!;
}

const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

/** Parte el nombre en hasta dos renglones y busca el tamaño más grande que quepa. */
function ajustarNombre(ctx: CanvasRenderingContext2D, nombre: string, familia: string, ancho: number): { lineas: string[]; tam: number } {
  const palabras = nombre.toUpperCase().split(/\s+/).filter(Boolean);
  for (let tam = 120; tam >= 64; tam -= 4) {
    ctx.font = `900 ${tam}px ${familia}`;
    if (ctx.measureText(palabras.join(' ')).width <= ancho) return { lineas: [palabras.join(' ')], tam };
    // El mejor corte en dos: el que deja el renglón más largo más corto.
    let mejor: string[] | null = null, peor = Infinity;
    for (let k = 1; k < palabras.length; k++) {
      const a = palabras.slice(0, k).join(' '), b = palabras.slice(k).join(' ');
      const m = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (m <= ancho && m < peor) { peor = m; mejor = [a, b]; }
    }
    if (mejor) return { lineas: mejor, tam };
  }
  return { lineas: [palabras.slice(0, 2).join(' '), palabras.slice(2, 4).join(' ')].filter(Boolean), tam: 64 };
}

export async function dibujarCarnet(d: DatosCarnet, f: FuentesCarnet, canvas?: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const cv = canvas || document.createElement('canvas');
  cv.width = ANCHO; cv.height = ALTO;
  const ctx = cv.getContext('2d')!;
  await Promise.all([
    document.fonts.load(`900 100px ${f.display}`), document.fonts.load(`800 40px ${f.display}`),
    document.fonts.load(`600 36px ${f.texto}`), document.fonts.load(`700 36px ${f.texto}`),
  ]).catch(() => null);
  const [logo, foto] = await Promise.all([cargar('/Nuevo_Lycos_LOGO.png'), d.foto ? cargar(d.foto) : Promise.resolve(null)]);

  ctx.clearRect(0, 0, ANCHO, ALTO);
  ctx.save();
  ctx.beginPath(); ctx.roundRect(0, 0, ANCHO, ALTO, 56); ctx.clip();

  // ── Arriba: el lobo sobre blanco ──
  const CORTE = 640;
  ctx.fillStyle = C.papel; ctx.fillRect(0, 0, ANCHO, CORTE);
  if (logo) {
    const w = 720, h = (logo.height / logo.width) * w;
    ctx.drawImage(logo, (ANCHO - w) / 2, 22, w, h);
  }
  ctx.fillStyle = C.negro; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `800 40px ${f.display}`; ctx.letterSpacing = '14px';
  ctx.fillText('TEAM · TALLER AUTOMOTRIZ', ANCHO / 2 + 7, 600);
  ctx.letterSpacing = '0px';

  // ── Franja de taller ──
  const FRANJA = 44;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, CORTE, ANCHO, FRANJA); ctx.clip();
  ctx.fillStyle = C.naranja; ctx.fillRect(0, CORTE, ANCHO, FRANJA);
  ctx.fillStyle = C.negro;
  for (let x = -FRANJA; x < ANCHO + FRANJA; x += 56) {
    ctx.beginPath(); ctx.moveTo(x, CORTE + FRANJA); ctx.lineTo(x + 28, CORTE + FRANJA); ctx.lineTo(x + 28 + FRANJA, CORTE); ctx.lineTo(x + FRANJA, CORTE); ctx.fill();
  }
  ctx.restore();

  // ── Abajo: el piso del taller ──
  const PISO = CORTE + FRANJA;
  ctx.fillStyle = C.fondo; ctx.fillRect(0, PISO, ANCHO, ALTO - PISO);
  const halo = ctx.createRadialGradient(ANCHO * 0.15, PISO, 0, ANCHO * 0.15, PISO, 900);
  halo.addColorStop(0, 'rgba(255,122,26,0.16)'); halo.addColorStop(1, 'rgba(255,122,26,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, PISO, ANCHO, ALTO - PISO);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 2;
  for (let x = 0; x <= ANCHO; x += 54) { ctx.beginPath(); ctx.moveTo(x, PISO); ctx.lineTo(x, ALTO); ctx.stroke(); }
  for (let y = PISO; y <= ALTO; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ANCHO, y); ctx.stroke(); }

  // Foto (o iniciales) montada sobre la franja, como un gafete.
  const R = 112, CX = ANCHO / 2, CY = PISO + 70;
  ctx.beginPath(); ctx.arc(CX, CY, R + 16, 0, Math.PI * 2); ctx.fillStyle = C.fondo; ctx.fill();
  ctx.beginPath(); ctx.arc(CX, CY, R + 8, 0, Math.PI * 2); ctx.fillStyle = C.naranja; ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.clip();
  if (foto) {
    const s = Math.max((2 * R) / foto.width, (2 * R) / foto.height);
    ctx.drawImage(foto, CX - (foto.width * s) / 2, CY - (foto.height * s) / 2, foto.width * s, foto.height * s);
  } else {
    ctx.fillStyle = C.panel2; ctx.fillRect(CX - R, CY - R, 2 * R, 2 * R);
    ctx.fillStyle = C.naranja; ctx.font = `900 ${R}px ${f.display}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(iniciales(d.nombre), CX, CY + 6);
  }
  ctx.restore();

  // Nombre y cargo
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const { lineas, tam } = ajustarNombre(ctx, d.nombre, f.display, ANCHO - 140);
  ctx.font = `900 ${tam}px ${f.display}`; ctx.fillStyle = C.tinta;
  let y = CY + R + 30 + tam * 0.86;
  lineas.forEach((l, i) => { if (i) y += tam * 0.92; ctx.fillText(l, CX, y); });
  y += 60;
  ctx.font = `600 36px ${f.texto}`; ctx.fillStyle = C.tenue; ctx.letterSpacing = '6px';
  ctx.fillText((d.cargo || 'Taller').toUpperCase(), CX + 3, y);
  ctx.letterSpacing = '0px';

  // El código, en cuatro casillas, debajo del cargo (el nombre puede ocupar uno o dos renglones).
  const CAJA_W = 172, CAJA_H = 184, GAP = 26;
  const totalW = 4 * CAJA_W + 3 * GAP, x0 = (ANCHO - totalW) / 2, yCaja = Math.max(1170, y + 110);
  ctx.font = `800 34px ${f.display}`; ctx.fillStyle = C.naranja; ctx.letterSpacing = '12px';
  ctx.fillText('CÓDIGO PERSONAL', CX + 6, yCaja - 30);
  ctx.letterSpacing = '0px';
  [...d.codigo.padEnd(4, ' ')].slice(0, 4).forEach((dig, i) => {
    const x = x0 + i * (CAJA_W + GAP);
    ctx.beginPath(); ctx.roundRect(x, yCaja, CAJA_W, CAJA_H, 30);
    ctx.fillStyle = C.panel; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = C.naranja; ctx.stroke();
    ctx.fillStyle = C.tinta; ctx.font = `900 140px ${f.display}`; ctx.textBaseline = 'middle';
    ctx.fillText(dig, x + CAJA_W / 2, yCaja + CAJA_H / 2 + 8);
  });
  ctx.textBaseline = 'alphabetic';

  ctx.font = `700 34px ${f.texto}`; ctx.fillStyle = C.tinta;
  ctx.fillText('Pantalla del taller  ›  Mi cuenta', CX, yCaja + CAJA_H + 58);
  ctx.font = `500 29px ${f.texto}`; ctx.fillStyle = C.apagado;
  ctx.fillText('Personal e intransferible. No compartas tu código.', CX, yCaja + CAJA_H + 100);

  // ── Pie naranja ──
  const PIE = ALTO - 132;
  ctx.fillStyle = C.naranja; ctx.fillRect(0, PIE, ANCHO, ALTO - PIE);
  ctx.textAlign = 'left'; ctx.fillStyle = C.negro;
  ctx.font = `900 64px ${f.display}`; ctx.fillText('LYCOS TEAM', 64, PIE + 74);
  ctx.font = `600 26px ${f.texto}`; ctx.fillText(RIF_TEXTO, 66, PIE + 110);
  ctx.textAlign = 'right';
  const emitido = d.emitido ? new Date(d.emitido).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  ctx.font = `700 28px ${f.texto}`;
  ctx.fillText('CARNET DE ACCESO', ANCHO - 64, PIE + 58);
  ctx.font = `600 26px ${f.texto}`;
  ctx.fillText([d.cedula ? `C.I. ${d.cedula}` : '', emitido ? `Emitido ${emitido}` : ''].filter(Boolean).join('  ·  '), ANCHO - 64, PIE + 98);

  ctx.restore();
  return cv;
}

/** El nombre del archivo: «carnet-freddy-rodriguez.png». */
export function archivoCarnet(nombre: string) {
  return `carnet-${nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).slice(0, 3).join('-').replace(/[^a-z0-9-]/g, '')}.png`;
}
