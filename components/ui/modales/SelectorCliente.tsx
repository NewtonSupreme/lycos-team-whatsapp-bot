'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Car, Loader2, Plus, Search, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { cn } from '@/lib/utils';
import ModalBase, { BotonSecundario } from './ModalBase';

export interface ClienteElegible {
  id: string;
  nombre: string;
  apellido: string | null;
  cedula: string | null;
  telefono: string | null;
}

export interface VehiculoElegible {
  id: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  placa: string | null;
  cliente_id: string | null;
  clienteNombre?: string;
}

const normaliza = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Nombre completo, sin dobles espacios cuando falta el apellido. */
export const nombreCompleto = (c: { nombre: string; apellido?: string | null }) =>
  `${c.nombre} ${c.apellido || ''}`.replace(/\s+/g, ' ').trim();

/**
 * Elegir un cliente de los que ya están registrados.
 *
 * Busca por nombre, cédula y teléfono a la vez: en el mostrador unas veces se
 * sabe el nombre y otras solo el número desde el que llamó. Filtra sobre lo ya
 * cargado, así que responde a cada tecla sin ir al servidor.
 */
export function SelectorCliente({
  abierto, onCerrar, onElegir, onNuevo,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onElegir: (c: ClienteElegible) => void;
  onNuevo?: () => void;
}) {
  const { currentSede } = useSedeStore();
  const [lista, setLista] = useState<ClienteElegible[]>([]);
  const [busca, setBusca] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    setError('');
    try {
      let q = supabase.from('clientes')
        .select('id, nombre, apellido, cedula, telefono')
        .order('nombre')
        .limit(600);
      if (currentSede?.id) q = q.eq('sede_id', currentSede.id);
      const { data, error: e } = await q;
      if (e) throw new Error(e.message);
      setLista((data || []) as ClienteElegible[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los clientes');
    } finally {
      setCargando(false);
    }
  }, [currentSede?.id]);

  useEffect(() => { if (abierto) cargar(); }, [abierto, cargar]);

  const filtrados = useMemo(() => {
    const q = normaliza(busca.trim());
    if (!q) return lista.slice(0, 60);
    return lista
      .filter(c => normaliza(`${nombreCompleto(c)} ${c.cedula || ''} ${c.telefono || ''}`).includes(q))
      .slice(0, 60);
  }, [lista, busca]);

  return (
    <ModalBase
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Seleccionar cliente"
      icono={<User className="h-[18px] w-[18px]" aria-hidden />}
      ancho="md"
      pie={<BotonSecundario onClick={onCerrar}>Cerrar</BotonSecundario>}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar cliente por nombre, cédula o teléfono..."
          aria-label="Buscar cliente"
          className="h-[42px] w-full rounded-lg border border-[#e2e5ea] pl-10 pr-3 text-[13px] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316]"
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3 py-2 text-[12.5px] text-[#b91c1c]">
          {error}
        </p>
      )}

      <div className="mt-3 max-h-[340px] overflow-y-auto">
        {cargando ? (
          <p className="py-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#f97316]" aria-hidden />
            <span className="mt-2 block text-[12.5px] text-[#8a909c]">Cargando clientes…</span>
          </p>
        ) : filtrados.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-[#8a909c]">
            {lista.length === 0 ? 'No hay clientes registrados.' : 'Ningún cliente coincide.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {filtrados.map(c => (
              <li key={c.id}>
                <button
                  onClick={() => { onElegir(c); onCerrar(); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#fafbfc]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef1f5] text-[11px] font-semibold text-[#8a909c]" aria-hidden>
                    {nombreCompleto(c).split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?'}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[13px] font-semibold text-[#16181d]">{nombreCompleto(c)}</span>
                    <span className="num block truncate text-[11.5px] text-[#8a909c]">
                      {[c.cedula, c.telefono].filter(Boolean).join('  |  ') || 'Sin datos de contacto'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {onNuevo && (
        <button
          onClick={() => { onNuevo(); onCerrar(); }}
          className="mt-3 flex h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#cfd4dc] text-[13px] font-medium text-[#3d4350] transition-colors hover:border-[#f97316] hover:bg-[#fffaf6] hover:text-[#f97316]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Nuevo cliente
        </button>
      )}
    </ModalBase>
  );
}

/**
 * Elegir un vehículo. Con `clienteId` solo salen los suyos.
 *
 * Buscar por placa es lo primero que se hace en un taller: el cliente da la
 * placa mucho antes que su nombre.
 */
export function SelectorVehiculo({
  abierto, onCerrar, onElegir, onNuevo, clienteId,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onElegir: (v: VehiculoElegible) => void;
  onNuevo?: () => void;
  /** Limita la lista a los vehículos de un cliente. */
  clienteId?: string | null;
}) {
  const { currentSede } = useSedeStore();
  const [lista, setLista] = useState<VehiculoElegible[]>([]);
  const [busca, setBusca] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    setError('');
    try {
      let q = supabase.from('vehiculos')
        .select('id, marca, modelo, anio, placa, cliente_id, clientes(nombre, apellido)')
        .order('placa')
        .limit(600);
      if (clienteId) q = q.eq('cliente_id', clienteId);
      else if (currentSede?.id) q = q.eq('sede_id', currentSede.id);

      const { data, error: e } = await q;
      if (e) throw new Error(e.message);

      setLista(((data || []) as unknown as (VehiculoElegible & {
        clientes?: { nombre: string; apellido: string | null } | null;
      })[]).map(v => ({
        ...v,
        clienteNombre: v.clientes ? nombreCompleto(v.clientes) : undefined,
      })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los vehículos');
    } finally {
      setCargando(false);
    }
  }, [clienteId, currentSede?.id]);

  useEffect(() => { if (abierto) cargar(); }, [abierto, cargar]);

  const filtrados = useMemo(() => {
    const q = normaliza(busca.trim());
    if (!q) return lista.slice(0, 60);
    return lista
      .filter(v => normaliza(
        `${v.marca || ''} ${v.modelo || ''} ${v.placa || ''} ${v.clienteNombre || ''}`,
      ).includes(q))
      .slice(0, 60);
  }, [lista, busca]);

  return (
    <ModalBase
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Seleccionar vehículo"
      subtitulo={clienteId ? 'Solo los de este cliente' : undefined}
      icono={<Car className="h-[18px] w-[18px]" aria-hidden />}
      ancho="md"
      pie={<BotonSecundario onClick={onCerrar}>Cerrar</BotonSecundario>}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por marca, modelo o placa..."
          aria-label="Buscar vehículo"
          className="h-[42px] w-full rounded-lg border border-[#e2e5ea] pl-10 pr-3 text-[13px] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316]"
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3 py-2 text-[12.5px] text-[#b91c1c]">
          {error}
        </p>
      )}

      <div className="mt-3 max-h-[340px] overflow-y-auto">
        {cargando ? (
          <p className="py-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#f97316]" aria-hidden />
            <span className="mt-2 block text-[12.5px] text-[#8a909c]">Cargando vehículos…</span>
          </p>
        ) : filtrados.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-[#8a909c]">
            {lista.length === 0
              ? (clienteId ? 'Este cliente no tiene vehículos registrados.' : 'No hay vehículos registrados.')
              : 'Ningún vehículo coincide.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {filtrados.map(v => (
              <li key={v.id}>
                <button
                  onClick={() => { onElegir(v); onCerrar(); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#fafbfc]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef1f5] text-[#8a909c]">
                    <Car className="h-[17px] w-[17px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[13px] font-semibold text-[#16181d]">
                      {[v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || 'Vehículo'}
                    </span>
                    <span className="num block truncate text-[11.5px] text-[#8a909c]">
                      {[v.placa, v.clienteNombre].filter(Boolean).join('  |  ') || 'Sin placa'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {onNuevo && (
        <button
          onClick={() => { onNuevo(); onCerrar(); }}
          className={cn(
            'mt-3 flex h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-dashed',
            'border-[#cfd4dc] text-[13px] font-medium text-[#3d4350] transition-colors',
            'hover:border-[#f97316] hover:bg-[#fffaf6] hover:text-[#f97316]',
          )}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Nuevo vehículo
        </button>
      )}
    </ModalBase>
  );
}
