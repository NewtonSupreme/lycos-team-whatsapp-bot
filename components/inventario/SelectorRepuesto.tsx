'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Package, Search, AlertTriangle, Check, Minus, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSedeStore } from '@/lib/store/useSedeStore';
import ModalBase from '@/components/ui/modales/ModalBase';

/**
 * Elegir un repuesto del almacén para un renglón de una orden.
 *
 * Existe porque los renglones de Servicios y Taller se escribían a mano: el
 * repuesto salía del almacén y el stock se quedaba igual. Enlazar el renglón
 * con el producto es lo único que permite descontarlo.
 *
 * No obliga a que todo venga del catálogo. La mano de obra —«alineación»,
 * «soldadura»— no es un producto y no tiene existencias: esos renglones se
 * siguen escribiendo libremente. El catálogo es para lo que sí es mercancía.
 *
 * Sobre los dos precios: el almacén guarda `precio_usd` (lo que se cobra en
 * efectivo) y `precio_bs`, que a pesar del nombre está también en dólares y es
 * el precio a tasa BCV —lo que se cobra al pagar en bolívares o con Cashea—.
 * Enseñar solo uno de los dos es enseñar un precio que muchas veces no es el
 * que se va a cobrar, así que aquí se ven ambos con su equivalente en bolívares.
 */

export interface ProductoInventario {
  id: string;
  nombre: string;
  codigo: string | null;
  marca: string | null;
  categoria: string | null;
  stock: number;
  /** Precio en efectivo, en dólares. */
  precio_usd: number;
  /** Precio a tasa BCV. También en dólares, pese al nombre de la columna. */
  precio_bs?: number | null;
  precio_fabricante?: number | null;
}

const sinAcentos = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** El precio a tasa BCV, o el de efectivo si ese producto no tiene el otro. */
export const precioBcvDe = (p: ProductoInventario) =>
  Number(p.precio_bs) || Number(p.precio_usd) || 0;

export const precioEfectivoDe = (p: ProductoInventario) =>
  Number(p.precio_usd) || Number(p.precio_bs) || 0;

/**
 * Carga el catálogo una sola vez por pantalla.
 *
 * Trae el `id` a propósito: sin él el renglón no puede enlazarse con nada, y
 * ese era justamente el fallo —el presupuesto pedía `nombre, precio_usd` y
 * luego guardaba `match.id`, que siempre venía vacío—.
 */
export function useInventario(activo = true) {
  const [productos, setProductos] = useState<ProductoInventario[]>([]);
  // Arranca en «cargando» solo si de verdad se va a pedir algo.
  const [cargando, setCargando] = useState(activo && !!supabase);
  const sedeId = useSedeStore(s => s.currentSede?.id);

  useEffect(() => {
    if (!activo || !supabase) return;
    let vivo = true;
    (async () => {
      let q = supabase!
        .from('inventario')
        .select('id, nombre, codigo, marca, categoria, stock, precio_usd, precio_bs, precio_fabricante')
        .eq('activo', true)
        .order('nombre');
      if (sedeId) q = q.eq('sede_id', sedeId);
      const { data } = await q;
      if (!vivo) return;
      setProductos((data as ProductoInventario[]) || []);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [activo, sedeId]);

  return { productos, cargando };
}

/** Los productos que casan con lo escrito, los de mejor coincidencia primero. */
export function buscarProductos(
  productos: readonly ProductoInventario[],
  texto: string,
  limite = 60,
): ProductoInventario[] {
  const q = sinAcentos(texto).trim();
  if (!q) return productos.slice(0, limite);
  const palabras = q.split(/\s+/).filter(Boolean);

  const puntuados = productos
    .map(p => {
      const heno = sinAcentos(`${p.nombre} ${p.codigo || ''} ${p.marca || ''}`);
      if (!palabras.every(w => heno.includes(w))) return null;
      // Empezar por lo escrito vale más que contenerlo suelto: quien escribe
      // "sil" busca «Silenciador», no «Tornillo para silenciador».
      const puntos = sinAcentos(p.nombre).startsWith(q) ? 3
        : heno.startsWith(q) ? 2
          : sinAcentos(p.nombre).includes(q) ? 1 : 0;
      return { p, puntos };
    })
    .filter(Boolean) as { p: ProductoInventario; puntos: number }[];

  return puntuados
    .sort((a, b) =>
      b.puntos - a.puntos
      // Con lo demás igual, primero lo que hay en existencia: ofrecer algo
      // agotado obliga a repetir la búsqueda.
      || (b.p.stock > 0 ? 1 : 0) - (a.p.stock > 0 ? 1 : 0)
      || a.p.nombre.localeCompare(b.p.nombre))
    .slice(0, limite)
    .map(x => x.p);
}

/**
 * Los productos del almacén que se parecen a un texto escrito a mano.
 *
 * Se usa para avisar de que lo que alguien acaba de teclear ya existe en el
 * inventario. Es deliberadamente más estricto que el buscador: aquí una
 * coincidencia floja produce un aviso molesto y falso.
 */
export function candidatosDeTexto(
  productos: readonly ProductoInventario[],
  texto: string,
  limite = 4,
): ProductoInventario[] {
  const q = sinAcentos(texto).trim();
  // Menos de cuatro letras no distingue nada: "tub" casa con demasiadas cosas.
  if (q.length < 4) return [];

  const palabras = q.split(/\s+/).filter(w => w.length > 2);
  if (palabras.length === 0) return [];

  const puntuados = productos.map(p => {
    const nom = sinAcentos(p.nombre);
    const heno = sinAcentos(`${p.nombre} ${p.codigo || ''} ${p.marca || ''}`);
    let puntos = 0;
    if (nom === q) puntos = 100;
    else if (nom.includes(q) || q.includes(nom)) puntos = 70;
    else {
      // Cuántas de las palabras escritas aparecen en el producto.
      const casan = palabras.filter(w => heno.includes(w)).length;
      // Con una sola palabra en común no basta, salvo que sea toda la búsqueda.
      if (casan >= 2 || (casan === 1 && palabras.length === 1 && nom.startsWith(palabras[0]))) {
        puntos = 30 + casan * 10;
      }
    }
    return puntos > 0 ? { p, puntos } : null;
  }).filter(Boolean) as { p: ProductoInventario; puntos: number }[];

  return puntuados
    .sort((a, b) => b.puntos - a.puntos || b.p.stock - a.p.stock)
    .slice(0, limite)
    .map(x => x.p);
}

// ── Precio, en sus dos monedas ──────────────────────────────────────────────

function Precios({ p, tasa }: { p: ProductoInventario; tasa: number }) {
  const efectivo = precioEfectivoDe(p);
  const bcv = precioBcvDe(p);
  const distintos = Math.abs(efectivo - bcv) > 0.009;
  return (
    <span className="shrink-0 text-right leading-tight">
      <span className="block text-[12px] font-black tabular-nums text-[#16181d]">
        ${efectivo.toFixed(2)} <span className="text-[9px] font-bold text-[#9ba1ab]">efec.</span>
      </span>
      {distintos && (
        <span className="block text-[11px] font-bold tabular-nums text-[#0d9488]">
          ${bcv.toFixed(2)} <span className="text-[9px] font-bold text-[#9ba1ab]">BCV</span>
        </span>
      )}
      {tasa > 0 && (
        <span className="block text-[10px] tabular-nums text-[#8a909c]">
          Bs. {(bcv * tasa).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )}
    </span>
  );
}

function Existencias({ stock, piden }: { stock: number; piden: number }) {
  const n = Number(stock) || 0;
  const falta = piden > n;
  return (
    <span
      title={falta ? `Se piden ${piden} y solo hay ${n}` : `${n} en existencia`}
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
        n <= 0 ? 'bg-[#fdeaea] text-[#dc2626]'
          : falta ? 'bg-[#fffbeb] text-[#b45309]'
            : 'bg-[#f0f9f4] text-[#15803d]'
      }`}
    >
      {n}
    </span>
  );
}

// ── El catálogo, como ventana propia ────────────────────────────────────────

interface PropsCatalogo {
  abierto: boolean;
  onCerrar: () => void;
  productos: readonly ProductoInventario[];
  /** Tasa del día, para ver el equivalente en bolívares. */
  tasa?: number;
  /** Se llama por cada producto elegido, con la cantidad indicada. */
  onElegir: (p: ProductoInventario, cantidad: number) => void;
  /** Cierra al elegir. En el desglose se enlaza un renglón y se vuelve. */
  cerrarAlElegir?: boolean;
}

/**
 * Se monta solo cuando el catálogo está abierto.
 *
 * Así la búsqueda, la categoría y las cantidades empiezan de cero en cada
 * apertura sin necesidad de un efecto que las reinicie: montar de nuevo ES el
 * reinicio. Con el efecto había un render de más en el que aún se veía la
 * búsqueda anterior, y parecía que el almacén solo tenía cuatro cosas.
 */
export function ModalCatalogoInventario(props: PropsCatalogo) {
  if (!props.abierto) return null;
  return <CuerpoCatalogo {...props} />;
}

function CuerpoCatalogo({
  onCerrar, productos, tasa = 0, onElegir, cerrarAlElegir = false,
}: PropsCatalogo) {
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState<string>('todas');
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [agregados, setAgregados] = useState<string[]>([]);

  const categorias = useMemo(() => {
    const c = new Map<string, number>();
    productos.forEach(p => {
      const k = (p.categoria || 'general').toLowerCase();
      c.set(k, (c.get(k) || 0) + 1);
    });
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [productos]);

  const resultados = useMemo(() => {
    const base = categoria === 'todas'
      ? productos
      : productos.filter(p => (p.categoria || 'general').toLowerCase() === categoria);
    return buscarProductos(base, texto, 200);
  }, [productos, texto, categoria]);

  const cant = (id: string) => Math.max(1, cantidades[id] || 1);
  const mover = (id: string, d: number) =>
    setCantidades(c => ({ ...c, [id]: Math.max(1, (c[id] || 1) + d) }));

  const elegir = (p: ProductoInventario) => {
    onElegir(p, cant(p.id));
    setAgregados(a => (a.includes(p.id) ? a : [...a, p.id]));
    if (cerrarAlElegir) onCerrar();
  };

  return (
    <ModalBase
      abierto
      onCerrar={onCerrar}
      titulo="Inventario"
      subtitulo={`${productos.length} artículos · el precio se toma del catálogo y el stock se descuenta al guardar`}
      icono={<Package className="h-[18px] w-[18px]" aria-hidden />}
      ancho="xl"
      pie={
        <button
          type="button"
          onClick={onCerrar}
          className="h-10 rounded-xl bg-[#f97316] px-5 text-[12.5px] font-bold text-white hover:bg-[#ea6a0c]"
        >
          {agregados.length > 0 ? `Listo · ${agregados.length} agregado(s)` : 'Cerrar'}
        </button>
      }
    >
      <div className="flex flex-col gap-2.5">
        {/* Buscador */}
        <div className="flex items-center gap-2 rounded-xl border border-[#e8eaed] bg-[#fafbfc] px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-[#8a909c]" aria-hidden />
          <input
            autoFocus
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Buscar por nombre, código o marca…"
            className="w-full bg-transparent text-[13px] text-[#16181d] placeholder:text-[#9ba1ab] focus:outline-none"
          />
          {texto && (
            <button type="button" onClick={() => setTexto('')} aria-label="Limpiar búsqueda">
              <X className="h-4 w-4 text-[#9ba1ab] hover:text-[#5b616e]" />
            </button>
          )}
        </div>

        {/* Categorías */}
        {categorias.length > 1 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {[['todas', productos.length] as const, ...categorias].map(([k, n]) => (
              <button
                key={k}
                type="button"
                onClick={() => setCategoria(k)}
                className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-bold capitalize transition-colors ${
                  categoria === k
                    ? 'border-[#f97316] bg-[#fff1e7] text-[#c2410c]'
                    : 'border-[#e8eaed] bg-white text-[#5b616e] hover:border-[#cbd0d8]'
                }`}
              >
                {k} <span className="tabular-nums opacity-60">{n}</span>
              </button>
            ))}
          </div>
        )}

        {/* Encabezado de la tabla: hay dos precios y hay que decir cuál es cuál. */}
        <div className="flex items-center gap-2 border-b border-[#e8eaed] px-1 pb-1">
          <span className="flex-1 text-[10px] font-black uppercase tracking-wider text-[#9ba1ab]">Artículo</span>
          <span className="w-9 text-center text-[10px] font-black uppercase tracking-wider text-[#9ba1ab]">Stock</span>
          <span className="w-[110px] text-right text-[10px] font-black uppercase tracking-wider text-[#9ba1ab]">
            Efectivo / BCV
          </span>
          <span className="w-[132px]" />
        </div>

        {/* Resultados */}
        <ul className="max-h-[46vh] min-h-0 space-y-1 overflow-y-auto pr-0.5">
          {resultados.length === 0 && (
            <li className="px-3 py-8 text-center text-[12px] italic text-[#8a909c]">
              Nada con ese nombre en el almacén.
              <span className="mt-1 block not-italic">
                Si es mano de obra, escríbelo directamente en el renglón: no lleva existencias.
              </span>
            </li>
          )}
          {resultados.map(p => {
            const puesto = agregados.includes(p.id);
            return (
              <li
                key={p.id}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
                  puesto ? 'border-[#86efac] bg-[#f0f9f4]' : 'border-[#eef0f3] hover:border-[#cbd0d8]'
                }`}
              >
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[12.5px] font-semibold text-[#16181d]">{p.nombre}</span>
                  <span className="block truncate text-[10.5px] text-[#8a909c]">
                    {[p.marca, p.codigo, p.categoria].filter(Boolean).join(' · ') || 'Sin código'}
                  </span>
                </span>

                <span className="w-9 text-center">
                  <Existencias stock={p.stock} piden={cant(p.id)} />
                </span>

                <span className="w-[110px]">
                  <Precios p={p} tasa={tasa} />
                </span>

                {/* Cantidad + agregar */}
                <span className="flex w-[132px] shrink-0 items-center justify-end gap-1">
                  <span className="flex items-center rounded-md border border-[#e2e5ea]">
                    <button
                      type="button" onClick={() => mover(p.id, -1)} aria-label="Menos"
                      className="px-1.5 py-1 text-[#5b616e] hover:bg-[#f6f7f9]"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="min-w-[22px] text-center text-[11.5px] font-black tabular-nums">{cant(p.id)}</span>
                    <button
                      type="button" onClick={() => mover(p.id, 1)} aria-label="Más"
                      className="px-1.5 py-1 text-[#5b616e] hover:bg-[#f6f7f9]"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </span>
                  <button
                    type="button"
                    onClick={() => elegir(p)}
                    className={`flex h-[28px] items-center gap-1 rounded-md px-2 text-[11px] font-bold transition-colors ${
                      puesto
                        ? 'bg-[#15803d] text-white hover:bg-[#166534]'
                        : 'bg-[#f97316] text-white hover:bg-[#ea6a0c]'
                    }`}
                  >
                    {puesto ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {puesto ? 'Otro' : 'Poner'}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>

        <p className="px-1 text-[10.5px] leading-snug text-[#8a909c]">
          <strong className="text-[#5b616e]">Efectivo</strong> es el precio en divisas;
          <strong className="text-[#5b616e]"> BCV</strong> el que aplica al cobrar en bolívares o con Cashea.
          Lo que se pone en el renglón es el de efectivo: cámbialo ahí si el cobro va en bolívares.
        </p>
      </div>
    </ModalBase>
  );
}

// ── El botón que vive dentro del renglón ────────────────────────────────────

interface Props {
  productos: readonly ProductoInventario[];
  /** El producto ya enlazado a este renglón, si lo hay. */
  seleccionadoId?: string | null;
  onAbrirCatalogo: () => void;
  onQuitar: () => void;
  /** Cuántas unidades pide el renglón, para avisar si no alcanzan. */
  cantidad?: number;
  compacto?: boolean;
}

export default function SelectorRepuesto({
  productos, seleccionadoId, onAbrirCatalogo, onQuitar, cantidad = 1, compacto = false,
}: Props) {
  const elegido = useMemo(
    () => productos.find(p => p.id === seleccionadoId) || null,
    [productos, seleccionadoId],
  );

  if (elegido) {
    const faltan = Math.max(0, cantidad - (Number(elegido.stock) || 0));
    return (
      <button
        type="button"
        onClick={onQuitar}
        title={
          `${elegido.nombre} — quedan ${elegido.stock}.`
          + (faltan > 0 ? ` Faltan ${faltan}.` : '')
          + ' Pulsa para desligarlo del almacén (deja de descontar).'
        }
        className={`group flex shrink-0 items-center gap-1 rounded-lg border px-1.5 py-2 transition-colors ${
          faltan > 0
            ? 'border-amber-400/50 bg-amber-400/10 text-amber-600 hover:bg-amber-400/20'
            : 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
        }`}
      >
        {faltan > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
        <span className="text-[10px] font-black tabular-nums">{elegido.stock}</span>
        <X className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onAbrirCatalogo}
      title="Tomarlo del inventario (para que se descuente del stock)"
      className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background/60 px-2 py-2 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      <Package className="h-3.5 w-3.5" />
      {!compacto && <span className="text-[10px] font-bold uppercase tracking-wider">Stock</span>}
    </button>
  );
}
