'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Coins, Copy, Layers, Loader2, Pencil, Percent, Plus,
  RefreshCw, Settings2, Trash2, Users, Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommissionRule, FlatRate } from '@/types';
import { describirRegla, formaPago, zonaLabel } from '@/lib/nomina/reglas';
import ConstructorRegla from './ConstructorRegla';

interface Persona {
  id: string;
  nombre: string;
  cargo?: string | null;
  foto_url?: string | null;
  cedula?: string | null;
}

interface Props {
  sedeId: string | null;
  personas: readonly Persona[];
  canEdit: boolean;
  isAdmin: boolean;
  onAbrirPlantillas: () => void;
}

const ICONO = { porcentaje: Percent, fijo_semanal: Wallet, override_cascada: Layers, tarifa_flat: Coins } as const;

const iniciales = (n: string) =>
  n.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

const usd = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Cómo se le paga a cada quien.
 *
 * Agrupado por persona y escrito en frases, no en columnas de base de datos:
 * quien abre esta pantalla quiere leer "Freddy cobra el 50 % de cada
 * silenciador", no interpretar `porcentaje / ingreso_total / 50`.
 */
export default function PanelReglas({ sedeId, personas, canEdit, isAdmin, onAbrirPlantillas }: Props) {
  const [reglas, setReglas] = useState<CommissionRule[]>([]);
  const [tarifas, setTarifas] = useState<FlatRate[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [constructor, setConstructor] = useState<{ regla: CommissionRule | null; empleadoId: string | null } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const qs = sedeId ? `?sede=${sedeId}` : '';
      const [a, b] = await Promise.all([
        fetch(`/api/nomina/rules${qs}`), fetch(`/api/nomina/flat-rates${qs}`),
      ]);
      const [da, db] = await Promise.all([a.json(), b.json()]);
      if (!a.ok) throw new Error(da.error || 'No se pudieron cargar las reglas');
      setReglas(da.rules || []);
      setTarifas(db.flatRates || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setCargando(false);
    }
  }, [sedeId]);

  useEffect(() => { cargar(); }, [cargar]);

  const porPersona = useMemo(() => {
    const nombre = new Map(personas.map(p => [p.id, p]));
    const grupos = new Map<string, { persona: Persona | null; reglas: CommissionRule[] }>();

    for (const r of reglas) {
      const clave = r.empleado_id || '__general__';
      const g = grupos.get(clave) || { persona: r.empleado_id ? nombre.get(r.empleado_id) || null : null, reglas: [] };
      g.reglas.push(r);
      grupos.set(clave, g);
    }
    // Personas sin ninguna regla también salen: es la información más útil de
    // la pantalla —quién no tiene definido cómo cobra.
    for (const p of personas) {
      if (!grupos.has(p.id)) grupos.set(p.id, { persona: p, reglas: [] });
    }

    return [...grupos.entries()]
      .map(([clave, g]) => ({ clave, ...g }))
      .sort((a, b) => {
        if (a.clave === '__general__') return -1;
        if (b.clave === '__general__') return 1;
        // Primero quien no tiene reglas: es lo que hay que resolver.
        if (!a.reglas.length !== !b.reglas.length) return a.reglas.length ? 1 : -1;
        return (a.persona?.nombre || '').localeCompare(b.persona?.nombre || '');
      });
  }, [reglas, personas]);

  const sinReglas = porPersona.filter(g => g.clave !== '__general__' && g.reglas.length === 0).length;

  const alternar = async (r: CommissionRule) => {
    const res = await fetch(`/api/nomina/rules/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !r.activo }),
    });
    if (!res.ok) { alert((await res.json()).error || 'No se pudo cambiar'); return; }
    cargar();
  };

  const duplicar = (r: CommissionRule) => {
    // Se abre como nueva con los mismos valores: la forma más rápida de armar
    // "lo mismo pero para otra zona" sin volver a llenar todo. El id vacío es
    // lo que hace que el constructor la trate como alta y no como edición.
    setConstructor({ regla: { ...r, id: '' }, empleadoId: r.empleado_id });
  };

  const borrar = async (r: CommissionRule) => {
    if (!confirm(`¿Borrar esta regla?\n\n${describirRegla(r, nombreDe(r.empleado_id, personas))}\n\nLos trabajos ya calculados no cambian.`)) return;
    const res = await fetch(`/api/nomina/rules/${r.id}`, { method: 'DELETE' });
    if (!res.ok) { alert((await res.json()).error || 'No se pudo borrar'); return; }
    cargar();
  };

  if (cargando) {
    return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[#f97316]" aria-hidden /></div>;
  }

  return (
    <div className="space-y-3.5">
      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e8eaed] bg-white px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-extrabold tracking-tight text-[#16181d]">Cómo se le paga a cada quien</h2>
          <p className="text-[12.5px] leading-snug text-[#8a909c]">
            Cada regla dice cuánto cobra una persona por su trabajo. El sistema la aplica sola cada vez que
            se registra un trabajo suyo.
          </p>
        </div>
        <button
          onClick={cargar}
          aria-label="Actualizar"
          className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
        </button>
        {isAdmin && (
          <button
            onClick={onAbrirPlantillas}
            className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-3.5 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            <Settings2 className="h-4 w-4" aria-hidden />
            Cargar plantillas del taller
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => setConstructor({ regla: null, empleadoId: null })}
            className="flex h-[38px] items-center gap-1.5 rounded-lg bg-[#f97316] px-4 text-[12.5px] font-semibold text-white hover:bg-[#ea580c]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nueva regla
          </button>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3.5 py-2.5 text-[13px] text-[#b91c1c]">{error}</p>
      )}

      {sinReglas > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-[#ffd9bd] bg-[#fff8f3] px-3.5 py-2.5 text-[12.5px] leading-snug text-[#7c2d12]">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
          {sinReglas} persona(s) no tienen definido cómo cobran: sus trabajos saldrán en cero hasta que les crees una regla.
        </p>
      )}

      {porPersona.map(g => {
        const nombre = g.clave === '__general__' ? 'Regla general' : (g.persona?.nombre || 'Empleado sin ficha');
        const vacio = g.reglas.length === 0;
        return (
          <section key={g.clave} className={cn('overflow-hidden rounded-xl border bg-white', vacio ? 'border-[#ffd9bd]' : 'border-[#e8eaed]')}>
            <header className="flex flex-wrap items-center gap-3 px-4 py-3">
              {g.clave === '__general__' ? (
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#eef1f5] text-[#5b616e]">
                  <Users className="h-[18px] w-[18px]" aria-hidden />
                </span>
              ) : g.persona?.foto_url ? (
                <img src={g.persona.foto_url} alt="" className="h-[38px] w-[38px] shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#eef1f5] text-[12px] font-semibold text-[#9ba1ab]" aria-hidden>
                  {iniciales(nombre)}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-[#16181d]">{nombre}</p>
                <p className="num truncate text-[11.5px] text-[#8a909c]">
                  {g.clave === '__general__'
                    ? 'Se aplica a quien no tenga una regla propia'
                    : [g.persona?.cargo, g.persona?.cedula].filter(Boolean).join(' · ') || 'Sin ficha'}
                  {' · '}
                  {g.reglas.length === 0 ? 'sin reglas' : `${g.reglas.length} regla(s)`}
                </p>
              </div>

              {canEdit && g.clave !== '__general__' && (
                <button
                  onClick={() => setConstructor({ regla: null, empleadoId: g.persona?.id || null })}
                  className="flex h-[32px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-2.5 text-[11.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Regla
                </button>
              )}
            </header>

            {vacio ? (
              <p className="px-4 pb-3.5 text-[12px] leading-snug text-[#c2410c]">
                No cobra comisión todavía. Sus trabajos se registran, pero saldrán en $0,00.
              </p>
            ) : (
              <ul className="divide-y divide-[#f2f3f5] border-t border-[#eef0f3]">
                {[...g.reglas].sort((a, b) => (a.prioridad ?? 100) - (b.prioridad ?? 100)).map(r => {
                  const Icono = ICONO[r.tipo_regla as keyof typeof ICONO] || Percent;
                  const tipos = (r.condiciones as { tipos?: string[] })?.tipos || [];
                  return (
                    <li key={r.id} className={cn('flex flex-wrap items-start gap-3 px-4 py-3', !r.activo && 'opacity-55')}>
                      <span className={cn(
                        'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg',
                        r.activo ? 'bg-[#fff1e7] text-[#f97316]' : 'bg-[#f2f3f5] text-[#9ba1ab]',
                      )}>
                        <Icono className="h-[15px] w-[15px]" aria-hidden />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] leading-snug text-[#16181d]">
                          {describirRegla(r, nombre === 'Regla general' ? 'Quien haga el trabajo' : nombre.split(' ')[0])}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Chip>{formaPago(r.tipo_regla).titulo}</Chip>
                          <Chip>{zonaLabel(r.zona)}</Chip>
                          {tipos.map(t => <Chip key={t} tono="naranja">{t}</Chip>)}
                          {r.aplica_monedas?.length ? <Chip tono="azul">{r.aplica_monedas.join(' / ')}</Chip> : null}
                          {r.proveedor_pct > 0 && <Chip tono="violeta">{r.proveedor_pct} % a {r.proveedor_nombre || 'proveedor'}</Chip>}
                          {r.vigencia_hasta && <Chip tono="rojo">hasta {String(r.vigencia_hasta).slice(0, 10)}</Chip>}
                          <Chip>prioridad {r.prioridad}</Chip>
                        </div>
                      </div>

                      <span className="num shrink-0 text-[15px] font-extrabold text-[#16181d]">
                        {r.tipo_regla === 'fijo_semanal' ? usd(r.valor) : r.tipo_regla === 'tarifa_flat' ? 'tarifa' : `${r.valor} %`}
                      </span>

                      {canEdit && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            onClick={() => alternar(r)}
                            title={r.activo ? 'Desactivar' : 'Activar'}
                            className={cn(
                              'h-[26px] rounded-md border px-2 text-[10.5px] font-semibold',
                              r.activo
                                ? 'border-[#bbf7d0] bg-[#e8f7ee] text-[#15803d] hover:bg-[#d6f0e0]'
                                : 'border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]',
                            )}
                          >
                            {r.activo ? 'Activa' : 'Inactiva'}
                          </button>
                          <button onClick={() => setConstructor({ regla: r, empleadoId: r.empleado_id })} aria-label="Editar regla"
                            className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]">
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <button onClick={() => duplicar(r)} aria-label="Duplicar regla"
                            className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]">
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          {isAdmin && (
                            <button onClick={() => borrar(r)} aria-label="Borrar regla"
                              className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[#e2e5ea] text-[#dc2626] hover:bg-[#fdeaea]">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {/* Catálogo de tarifas a destajo */}
      <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
        <header className="flex items-center gap-2 px-4 py-3.5">
          <Coins className="h-4 w-4 text-[#f97316]" aria-hidden />
          <h2 className="flex-1 text-[14.5px] font-bold text-[#16181d]">Tarifas fijas por servicio</h2>
          <span className="text-[11.5px] text-[#9ba1ab]">{tarifas.length}</span>
        </header>
        {tarifas.length === 0 ? (
          <p className="px-4 pb-4 text-[12px] leading-snug text-[#8a909c]">
            Sin tarifas. Se usan cuando a alguien se le paga un monto fijo por trabajo en vez de un porcentaje.
          </p>
        ) : (
          <ul className="divide-y divide-[#f2f3f5] border-t border-[#eef0f3]">
            {tarifas.map(t => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[#16181d]">{t.label}</span>
                <span className="shrink-0 text-[11.5px] text-[#8a909c]">{zonaLabel(t.zona)}</span>
                <span className="num shrink-0 text-[13px] font-bold text-[#16181d]">{usd(t.monto)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {constructor && (
        <ConstructorRegla
          regla={constructor.regla?.id ? constructor.regla : (constructor.regla as CommissionRule | null)}
          personas={personas}
          empleadoId={constructor.empleadoId}
          otrasReglas={reglas}
          sedeId={sedeId}
          onCerrar={() => setConstructor(null)}
          onGuardado={cargar}
        />
      )}
    </div>
  );
}

function nombreDe(id: string | null, personas: readonly Persona[]) {
  return personas.find(p => p.id === id)?.nombre || 'Esta persona';
}

function Chip({ children, tono = 'gris' }: { children: React.ReactNode; tono?: 'gris' | 'naranja' | 'azul' | 'violeta' | 'rojo' }) {
  const tonos = {
    gris: 'bg-[#f2f3f5] text-[#5b616e]',
    naranja: 'bg-[#fff1e7] text-[#c2410c]',
    azul: 'bg-[#e7f0fe] text-[#1d4ed8]',
    violeta: 'bg-[#f0eafc] text-[#7c3aed]',
    rojo: 'bg-[#fdeaea] text-[#dc2626]',
  };
  return <span className={cn('rounded-md px-1.5 py-0.5 text-[10.5px] font-medium', tonos[tono])}>{children}</span>;
}
