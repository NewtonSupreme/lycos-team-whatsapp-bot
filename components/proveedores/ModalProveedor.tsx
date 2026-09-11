'use client';

import { useState } from 'react';
import { Loader2, Truck } from 'lucide-react';
import ModalBase, { BotonPrincipal, BotonSecundario, Campo, CLASE_INPUT } from '@/components/ui/modales/ModalBase';
import type { ProveedorFila } from '@/lib/proveedores/tipos';

/** Lo que suele vender un proveedor de taller. Se puede escribir otra cosa. */
const CATEGORIAS = [
  'Repuestos', 'Silenciadores y escapes', 'Cauchos', 'Lubricantes',
  'Frenos', 'Eléctrico', 'Herramientas', 'Insumos y consumibles',
  'Servicios externos', 'Otros',
];

interface Props {
  abierto: boolean;
  /** El proveedor que se edita. Nulo = alta. */
  proveedor: ProveedorFila | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

/**
 * Alta y edición de un proveedor.
 *
 * Los días de crédito van aparte del texto de las condiciones a propósito: el
 * texto es para leerlo, el número es el que fecha el vencimiento de una compra
 * a crédito. Sin él la fecha había que ponerla a mano, y la mitad de las
 * compras se quedaban sin ella —y sin fecha, la alerta de pago no salta nunca—.
 */
export default function ModalProveedor({ abierto, proveedor, onCerrar, onGuardado }: Props) {
  const editando = Boolean(proveedor && !proveedor.id.startsWith('~'));

  const [nombre, setNombre] = useState(proveedor?.nombre || '');
  const [rif, setRif] = useState(proveedor?.rif || '');
  const [categoria, setCategoria] = useState(proveedor?.categoria || '');
  const [contacto, setContacto] = useState(proveedor?.contacto || '');
  const [telefono, setTelefono] = useState(proveedor?.telefono || '');
  const [email, setEmail] = useState(proveedor?.email || '');
  const [direccion, setDireccion] = useState(proveedor?.direccion || '');
  const [enlace, setEnlace] = useState(proveedor?.enlace || '');
  const [condiciones, setCondiciones] = useState(proveedor?.condiciones_pago || '');
  const [dias, setDias] = useState(String(proveedor?.dias_credito ?? 0));
  const [notas, setNotas] = useState(proveedor?.notas || '');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    const limpio = nombre.trim();
    if (!limpio) { setError('El nombre del proveedor es obligatorio.'); return; }

    setGuardando(true);
    setError('');
    try {
      const cuerpo = {
        nombre: limpio,
        rif: rif.trim() || null,
        categoria: categoria.trim() || null,
        contacto: contacto.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        direccion: direccion.trim() || null,
        enlace: enlace.trim() || null,
        condiciones_pago: condiciones.trim() || null,
        dias_credito: Math.max(0, Math.round(Number(dias) || 0)),
        notas: notas.trim() || null,
      };

      const r = await fetch(
        editando ? `/api/proveedores/${proveedor!.id}` : '/api/proveedores',
        {
          method: editando ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo),
        },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
      onGuardado();
      onCerrar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalBase
      abierto={abierto}
      onCerrar={onCerrar}
      bloqueado={guardando}
      titulo={editando ? 'Editar proveedor' : 'Nuevo proveedor'}
      subtitulo={editando
        ? 'Sus compras y deudas siguen enlazadas a él.'
        : 'Guardar su contacto y sus condiciones evita tener que preguntarlas cada vez.'}
      icono={<Truck className="h-5 w-5" aria-hidden />}
      ancho="lg"
      pie={(
        <>
          <BotonSecundario onClick={onCerrar} disabled={guardando}>Cancelar</BotonSecundario>
          <BotonPrincipal onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {guardando ? 'Guardando…' : 'Guardar proveedor'}
          </BotonPrincipal>
        </>
      )}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Nombre" obligatorio ancho>
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Repuestos El Sol, C.A."
            className={CLASE_INPUT}
          />
        </Campo>

        <Campo label="RIF">
          <input
            value={rif}
            onChange={e => setRif(e.target.value)}
            placeholder="J-12345678-9"
            className={CLASE_INPUT}
          />
        </Campo>

        <Campo label="¿Qué vende?">
          <input
            list="categorias-proveedor"
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            placeholder="Repuestos, cauchos, lubricantes…"
            className={CLASE_INPUT}
          />
          <datalist id="categorias-proveedor">
            {CATEGORIAS.map(c => <option key={c} value={c} />)}
          </datalist>
        </Campo>

        <Campo label="Persona de contacto">
          <input
            value={contacto}
            onChange={e => setContacto(e.target.value)}
            placeholder="Con quién se habla"
            className={CLASE_INPUT}
          />
        </Campo>

        <Campo label="Teléfono">
          <input
            value={telefono}
            onChange={e => setTelefono(e.target.value)}
            placeholder="0412 000 0000"
            inputMode="tel"
            className={CLASE_INPUT}
          />
        </Campo>

        <Campo label="Correo">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="ventas@proveedor.com"
            className={CLASE_INPUT}
          />
        </Campo>

        <Campo label="Enlace (catálogo, WhatsApp…)">
          <input
            value={enlace}
            onChange={e => setEnlace(e.target.value)}
            placeholder="https://…"
            className={CLASE_INPUT}
          />
        </Campo>

        <Campo label="Condiciones de pago" ancho>
          <input
            value={condiciones}
            onChange={e => setCondiciones(e.target.value)}
            placeholder="Contado · Crédito 30 días · 50% al pedir"
            className={CLASE_INPUT}
          />
        </Campo>

        <Campo label="Días de crédito">
          <input
            type="number"
            min={0}
            max={365}
            value={dias}
            onChange={e => setDias(e.target.value)}
            className={CLASE_INPUT}
          />
          <span className="mt-1 block text-[11px] leading-snug text-[#8a909c]">
            Con esto la fecha límite de cada compra a crédito se calcula sola, y la
            alerta de pago salta el día que toca.
          </span>
        </Campo>

        <Campo label="Dirección">
          <input
            value={direccion}
            onChange={e => setDireccion(e.target.value)}
            placeholder="Dónde se recoge la mercancía"
            className={CLASE_INPUT}
          />
        </Campo>

        <Campo label="Notas" ancho>
          <textarea
            rows={2}
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Lo que conviene recordar de este proveedor"
            className="w-full resize-none rounded-lg border border-[#e2e5ea] px-3 py-2 text-[13px] outline-none focus:border-[#f97316]"
          />
        </Campo>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3 py-2 text-[12.5px] text-[#b91c1c]">
          {error}
        </p>
      )}
    </ModalBase>
  );
}
