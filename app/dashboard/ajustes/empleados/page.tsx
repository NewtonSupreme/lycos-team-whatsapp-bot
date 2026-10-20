'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Download, FileBarChart, Loader2, Plus, RefreshCw, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { ROLE_CATALOG, resolveRol, type RoleMeta } from '@/types';
import ErpShell from '@/components/erp/ErpShell';
import RrhhKpis from '@/components/rrhh/RrhhKpis';
import ListadoEmpleados from '@/components/rrhh/ListadoEmpleados';
import ColumnaDia from '@/components/rrhh/ColumnaDia';
import PerfilEmpleado, { type AccionRRHH } from '@/components/rrhh/PerfilEmpleado';
import TablaRecurso from '@/components/rrhh/TablaRecurso';
import DialogoEmpleado from '@/components/rrhh/DialogoEmpleado';
import DialogoRecurso from '@/components/rrhh/DialogoRecurso';
import { Anillo, Barras, porcionesDeAreas } from '@/components/rrhh/graficos';
import { hoyISO, mensajeError, type EmpleadoRRHH, type ResumenRRHH } from '@/components/rrhh/tipos';
import type { RecursoKey } from '@/lib/rrhh/recursos';
import { generarReporteRRHH } from '@/lib/rrhh/reportes-pdf';

type Tab =
  | 'personal' | 'asistencia' | 'nomina' | 'vacaciones' | 'permisos'
  | 'evaluaciones' | 'capacitaciones' | 'reclutamiento' | 'documentos';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'personal', label: 'Personal' },
  { id: 'asistencia', label: 'Asistencia' },
  { id: 'nomina', label: 'Nómina' },
  { id: 'vacaciones', label: 'Vacaciones' },
  { id: 'permisos', label: 'Permisos' },
  { id: 'evaluaciones', label: 'Evaluaciones' },
  { id: 'capacitaciones', label: 'Capacitación' },
  { id: 'reclutamiento', label: 'Reclutamiento' },
  { id: 'documentos', label: 'Documentos' },
];

/** La acción rápida de la ficha abre el alta del recurso que corresponde. */
const ACCION_A_RECURSO: Record<AccionRRHH, RecursoKey> = {
  asistencia: 'asistencia',
  vacaciones: 'vacaciones',
  contrato: 'documentos',
  evaluacion: 'evaluaciones',
};

const RESUMEN_VACIO: ResumenRRHH = {
  fecha: hoyISO(), empleados: [],
  kpis: { total: 0, presentes: 0, tardanzas: 0, ausentes: 0, pctPresentes: 0, enVacaciones: 0, permisos: 0, cumpleanosMes: 0, rotacion: 0, bajas: 0 },
  asistenciaHoy: { presentes: 0, tardanzas: 0, ausentes: 0 },
  cumpleanos: [], vacacionesProximas: [], evaluaciones: [], capacitaciones: [],
  distribucion: [], antiguedad: [], sinFechaIngreso: 0,
};

/**
 * Recursos Humanos.
 *
 * Es la antigua Gestión de Empleados, ampliada: la plantilla sigue siendo la
 * misma tabla `usuarios` con su alta, edición y baja, y encima se le suman
 * asistencia, vacaciones, permisos, evaluaciones, capacitación, documentos y
 * reclutamiento. Todos los indicadores se calculan de esos datos —no hay
 * ningún número escrito a mano en la pantalla.
 */
export default function RecursosHumanosPage() {
  const router = useRouter();
  const { user } = useAppStore();
  const { currentSede } = useSedeStore();
  const sedeId = currentSede?.id || null;

  const rol = resolveRol(user?.rol);
  const isAdmin = rol === 'admin';
  const canEdit = isAdmin || rol === 'supervisor' || rol === 'administracion';
  const canDelete = isAdmin;
  // Cualquier Usuario Maestro puede asignar el rol de Maestro.
  const esMaestro = isAdmin;

  // Quién puede asignar qué rol: la regla existente se mantiene intacta.
  const rolesAsignables: RoleMeta[] = useMemo(() => ROLE_CATALOG.filter(r => {
    if (r.nombre === 'admin') return esMaestro;
    if (!isAdmin) return r.asignablePorSupervisor;
    return true;
  }), [isAdmin, esMaestro]);

  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>('personal');
  const [resumen, setResumen] = useState<ResumenRRHH>(RESUMEN_VACIO);
  const [sedes, setSedes] = useState<{ id: string; nombre: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccionado, setSeleccionado] = useState<EmpleadoRRHH | null>(null);

  const [dialogoEmpleado, setDialogoEmpleado] = useState<{ abierto: boolean; empleado: EmpleadoRRHH | null } | null>(null);
  const [dialogoRecurso, setDialogoRecurso] = useState<RecursoKey | null>(null);
  const [menuReportes, setMenuReportes] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const qs = sedeId ? `?sede=${sedeId}` : '';
      const r = await fetch(`/api/rrhh/resumen${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar');
      setResumen(d);
      // Se mantiene la selección si la persona sigue en la lista.
      setSeleccionado(prev => {
        const vigente = prev && d.empleados.find((e: EmpleadoRRHH) => e.id === prev.id);
        return vigente || d.empleados[0] || null;
      });
    } catch (e: unknown) {
      setError(mensajeError(e, 'Error al cargar'));
      setResumen(RESUMEN_VACIO);
    } finally {
      setCargando(false);
    }
  }, [sedeId]);

  useEffect(() => { if (mounted) cargar(); }, [mounted, cargar]);

  useEffect(() => {
    if (!supabase || !mounted) return;
    supabase.from('sedes').select('id, nombre').order('nombre')
      .then(({ data }) => setSedes(data || []));
  }, [mounted]);

  const empleados = resumen.empleados;

  /** Altas del mes en curso, para la variación del primer indicador. */
  const altasMes = useMemo(() => {
    const mes = resumen.fecha.slice(0, 7);
    return empleados.filter(e => String(e.fecha_ingreso || '').slice(0, 7) === mes).length;
  }, [empleados, resumen.fecha]);

  const irA = (destino: string) => {
    if (destino === 'nomina') { router.push('/dashboard/nomina'); return; }
    setTab(destino as Tab);
  };

  const cambiarActivo = async (e: EmpleadoRRHH, activo: boolean) => {
    if (!confirm(`¿${activo ? 'Reactivar' : 'Dar de baja'} a ${e.nombre}?`)) return;
    const r = await fetch('/api/admin/update-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: e.id, activo }),
    });
    if (!r.ok) { alert((await r.json()).error || 'No se pudo actualizar'); return; }
    cargar();
  };

  /**
   * Activa o desactiva a varios de golpe.
   *
   * Se va uno por uno a propósito: si falla el tercero, los dos primeros ya
   * quedaron aplicados y se dice cuántos fueron, en vez de dejar el lote a
   * medias sin que nadie sepa por dónde se cortó.
   */
  const cambiarActivoVarios = async (ids: readonly string[], activo: boolean) => {
    const nombres = empleados.filter(e => ids.includes(e.id)).map(e => e.nombre);
    if (nombres.length === 0) return;
    if (!confirm(
      `¿${activo ? 'Reactivar' : 'Dar de baja'} a ${nombres.length} persona(s)?\n\n`
      + nombres.slice(0, 8).join(', ') + (nombres.length > 8 ? ` y ${nombres.length - 8} más` : ''),
    )) return;

    let ok = 0;
    const fallos: string[] = [];
    for (const id of ids) {
      // Nadie se da de baja a sí mismo por descuido en un lote.
      if (!activo && id === user?.id) { fallos.push('tu propia cuenta'); continue; }
      try {
        const r = await fetch('/api/admin/update-user', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, activo }),
        });
        if (r.ok) ok += 1;
        else fallos.push(empleados.find(e => e.id === id)?.nombre || id);
      } catch {
        fallos.push(empleados.find(e => e.id === id)?.nombre || id);
      }
    }

    setError(fallos.length > 0
      ? `${ok} aplicado(s). No se pudo con: ${fallos.join(', ')}.`
      : '');
    cargar();
  };

  const eliminar = async (e: EmpleadoRRHH) => {
    if (e.id === user?.id) { alert('No puedes eliminar tu propia cuenta.'); return; }
    if (!confirm(`¿Eliminar permanentemente a ${e.nombre}? Se borrará también su asistencia, vacaciones y demás registros. Esta acción es irreversible.`)) return;
    const r = await fetch('/api/admin/delete-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: e.id }),
    });
    if (!r.ok) { alert((await r.json()).error || 'No se pudo eliminar'); return; }
    cargar();
  };

  const exportarCSV = () => {
    const cab = ['Nombre', 'Cedula', 'Cargo', 'Area', 'Rol', 'Contrato', 'Ingreso', 'Nacimiento', 'Telefono', 'Correo', 'Estado'];
    const filas = empleados.map(e => [
      e.nombre, e.cedula || '', e.cargo || '', e.area || '', e.rol, e.tipo_contrato || '',
      e.fecha_ingreso || '', e.fecha_nacimiento || '', e.telefono || '', e.email || '', e.estado,
    ]);
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    // BOM para que Excel abra los acentos bien.
    const csv = '﻿' + [cab, ...filas].map(r => r.map(esc).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `rrhh_personal_${resumen.fecha}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Los reportes en PDF.
   *
   * Antes el menú solo cambiaba de pestaña: enseñaba la tabla y ahí se
   * acababa. Un reporte de RRHH existe para imprimirse o firmarse.
   *
   * Los datos se piden al generar y no se guardan en la página: la tabla de
   * cada recurso ya trae los suyos, y duplicarlos aquí sería tener dos
   * versiones de lo mismo que se pueden desincronizar.
   */
  const [generando, setGenerando] = useState<string | null>(null);

  const descargarReporte = async (id: string) => {
    setMenuReportes(false);
    setGenerando(id);
    setError('');
    try {
      const nombreDe = (empId: unknown) =>
        empleados.find(e => e.id === empId)?.nombre || '—';
      const txt = (v: unknown) => (v == null || v === '' ? '—' : String(v));

      if (id === 'personal') {
        generarReporteRRHH({
          titulo: 'Directorio de personal',
          subtitulo: `${empleados.length} persona(s)`,
          sede: currentSede?.nombre,
          columnas: ['Nombre', 'C.I.', 'Cargo', 'Área', 'Rol', 'Contrato', 'Ingreso', 'Teléfono', 'Estado'],
          filas: empleados.map(e => [
            e.nombre, txt(e.cedula), txt(e.cargo), txt(e.area), e.rol,
            txt(e.tipo_contrato), txt(e.fecha_ingreso), txt(e.telefono), e.estado,
          ]),
          resumen: [
            { etiqueta: 'Total', valor: String(empleados.length) },
            { etiqueta: 'Activos', valor: String(empleados.filter(e => e.estado === 'activo').length) },
            { etiqueta: 'Altas del mes', valor: String(altasMes) },
          ],
          apaisado: true,
        });
        return;
      }

      const q = new URLSearchParams();
      if (sedeId) q.set('sede', sedeId);
      const r = await fetch(`/api/rrhh/${id}?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo obtener el reporte');
      const filas = (d[id] || []) as Record<string, unknown>[];

      if (id === 'asistencia') {
        generarReporteRRHH({
          titulo: 'Reporte de asistencia',
          sede: currentSede?.nombre,
          columnas: ['Empleado', 'Fecha', 'Entrada', 'Salida', 'Estado', 'Nota'],
          filas: filas.map(a => [
            nombreDe(a.empleado_id), txt(a.fecha), txt(a.hora_entrada),
            txt(a.hora_salida), txt(a.estado), txt(a.nota),
          ]),
          resumen: [
            { etiqueta: 'Presentes hoy', valor: String(resumen.asistenciaHoy.presentes) },
            { etiqueta: 'Tardanzas hoy', valor: String(resumen.asistenciaHoy.tardanzas) },
            { etiqueta: 'Ausentes hoy', valor: String(resumen.asistenciaHoy.ausentes) },
          ],
          nota: 'La asistencia se registra por persona y día. Un día sin registro no cuenta como ausencia.',
        });
        return;
      }

      if (id === 'vacaciones') {
        generarReporteRRHH({
          titulo: 'Reporte de vacaciones',
          sede: currentSede?.nombre,
          columnas: ['Empleado', 'Desde', 'Hasta', 'Días', 'Estado', 'Motivo'],
          filas: filas.map(v => [
            nombreDe(v.empleado_id), txt(v.fecha_inicio), txt(v.fecha_fin),
            txt(v.dias), txt(v.estado), txt(v.motivo),
          ]),
          resumen: [
            { etiqueta: 'Solicitudes', valor: String(filas.length) },
            { etiqueta: 'Aprobadas', valor: String(filas.filter(v => v.estado === 'aprobada').length) },
            { etiqueta: 'Pendientes', valor: String(filas.filter(v => v.estado === 'pendiente').length) },
          ],
        });
        return;
      }

      if (id === 'evaluaciones') {
        const puntajes = filas.map(e => Number(e.puntaje) || 0).filter(n => n > 0);
        const media = puntajes.length
          ? (puntajes.reduce((a, b) => a + b, 0) / puntajes.length).toFixed(1)
          : '—';
        generarReporteRRHH({
          titulo: 'Reporte de desempeño',
          sede: currentSede?.nombre,
          columnas: ['Empleado', 'Período', 'Puntaje', 'Evalúa', 'Observaciones'],
          filas: filas.map(e => [
            nombreDe(e.empleado_id), txt(e.periodo), txt(e.puntaje),
            txt(e.evaluador), txt(e.observaciones),
          ]),
          resumen: [
            { etiqueta: 'Evaluaciones', valor: String(filas.length) },
            { etiqueta: 'Puntaje medio', valor: String(media) },
          ],
        });
      }
    } catch (e: unknown) {
      setError(mensajeError(e));
    } finally {
      setGenerando(null);
    }
  };

  if (!mounted) return null;

  const subnav = TABS.filter(t => t.id !== 'nomina').map(t => ({ id: t.id, label: t.label }));

  return (
    <ErpShell
      buscador="Buscar empleados, cargos, documentos..."
      lema={['Nuestro equipo', 'también mueve', 'grandes historias']}
      lemaPie={['Personas', 'que hacen', 'la diferencia']}
      subnav={subnav}
      subnavActivo={tab}
      onSubnav={id => setTab(id as Tab)}
    >
      {/* ── Encabezado ─────────────────────────────────────────────────── */}
      <header className="mb-3.5 flex flex-wrap items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
          <UsersRound className="h-[24px] w-[24px]" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-[#16181d]">
            Recursos Humanos
          </h1>
          <p className="text-[13px] text-[#8a909c]">
            Gestiona tu equipo de trabajo, asistencia, nómina, desempeño y todo el talento de tu taller.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={cargar}
            disabled={cargando}
            aria-label="Actualizar"
            className="flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-[#e2e5ea] bg-white text-[#5b616e] hover:bg-[#f6f7f9] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', cargando && 'animate-spin')} aria-hidden />
          </button>

          <button
            onClick={exportarCSV}
            className="flex h-[42px] items-center gap-2 rounded-lg border border-[#e2e5ea] bg-white px-3.5 text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            <Download className="h-4 w-4" aria-hidden />
            Exportar
          </button>

          <div className="relative">
            <button
              onClick={() => setMenuReportes(v => !v)}
              aria-expanded={menuReportes}
              className="flex h-[42px] items-center gap-2 rounded-lg border border-[#e2e5ea] bg-white px-3.5 text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
            >
              <FileBarChart className="h-4 w-4" aria-hidden />
              {generando ? 'Generando…' : 'Reportes'}
              <ChevronDown className="h-3.5 w-3.5 text-[#9ba1ab]" aria-hidden />
            </button>

            {menuReportes && (
              <div className="absolute right-0 top-[48px] z-30 w-[220px] overflow-hidden rounded-lg border border-[#e8eaed] bg-white py-1 shadow-lg">
                {([
                  ['personal', 'Directorio de personal'],
                  ['asistencia', 'Reporte de asistencia'],
                  ['vacaciones', 'Reporte de vacaciones'],
                  ['evaluaciones', 'Reporte de desempeño'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => descargarReporte(id)}
                    disabled={generando !== null}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-[#3d4350] hover:bg-[#f6f7f9]"
                  >
                    <FileBarChart className="h-3.5 w-3.5 shrink-0 text-[#9ba1ab]" aria-hidden />
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => { setMenuReportes(false); router.push('/dashboard/nomina'); }}
                  className="block w-full border-t border-[#f2f3f5] px-3 py-2 text-left text-[12.5px] text-[#3d4350] hover:bg-[#f6f7f9]"
                >
                  Ir a Nómina
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setDialogoEmpleado({ abierto: true, empleado: null })}
            disabled={!canEdit}
            title={!canEdit ? 'No tienes permiso para registrar personal' : undefined}
            className="flex h-[42px] items-center gap-2 rounded-lg bg-[#f97316] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus className="h-[17px] w-[17px]" aria-hidden />
            Nuevo empleado
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="mb-3.5 rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3.5 py-2.5 text-[13px] text-[#b91c1c]">
          {error}
        </p>
      )}

      <RrhhKpis resumen={resumen} altasMes={altasMes} onIrA={irA} />

      {/* ── Pestañas ───────────────────────────────────────────────────── */}
      <div className="mb-3.5 overflow-x-auto" role="tablist">
        <div className="flex min-w-max items-center gap-1.5 border-b border-[#e8eaed] pb-2">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => irA(t.id)}
              className={cn(
                'h-[36px] rounded-lg px-3.5 text-[13px] font-medium transition-colors',
                tab === t.id ? 'bg-[#f97316] font-semibold text-white' : 'text-[#5b616e] hover:bg-[#f4f5f7]',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'personal' ? (
        <div className="flex flex-col gap-3.5 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <div className="flex flex-col gap-3.5 xl:flex-row">
              <ListadoEmpleados
                empleados={empleados}
                seleccionado={seleccionado}
                cargando={cargando}
                canEdit={canEdit}
                canDelete={canDelete}
                onSeleccionar={setSeleccionado}
                onEditar={e => setDialogoEmpleado({ abierto: true, empleado: e })}
                onActivar={cambiarActivo}
                onActivarVarios={cambiarActivoVarios}
                onEliminar={eliminar}
              />
              <ColumnaDia resumen={resumen} onIrA={irA} />
            </div>

            {/* Gráficos de la plantilla */}
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
              <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
                <h2 className="text-[14.5px] font-bold text-[#16181d]">Distribución por áreas</h2>
                {resumen.distribucion.length === 0 ? (
                  <p className="py-8 text-center text-[12.5px] text-[#8a909c]">Sin personal para distribuir.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-5">
                    <Anillo
                      porciones={porcionesDeAreas(resumen.distribucion)}
                      total={resumen.kpis.total}
                      titulo={String(resumen.kpis.total)}
                      subtitulo="Empleados"
                      size={148}
                      grosor={22}
                    />
                    <ul className="min-w-[160px] flex-1 space-y-2">
                      {porcionesDeAreas(resumen.distribucion).map(p => (
                        <li key={p.label} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-[12px] text-[#3d4350]">{p.label}</span>
                          <span className="num text-[12px] text-[#8a909c]">
                            {p.valor} ({Math.round((p.valor / Math.max(1, resumen.kpis.total)) * 100)}%)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
                <h2 className="text-[14.5px] font-bold text-[#16181d]">Antigüedad del personal</h2>
                <div className="mt-3">
                  <Barras datos={resumen.antiguedad} />
                </div>
                {resumen.sinFechaIngreso > 0 && (
                  <p className="mt-2 text-[11px] leading-snug text-[#9ba1ab]">
                    {resumen.sinFechaIngreso} empleado{resumen.sinFechaIngreso === 1 ? '' : 's'} sin fecha de ingreso
                    {resumen.sinFechaIngreso === 1 ? ' no aparece' : ' no aparecen'} en el gráfico. Se completa en su ficha.
                  </p>
                )}
              </section>
            </div>
          </div>

          <PerfilEmpleado
            empleado={seleccionado}
            resumen={resumen}
            sedeNombre={currentSede?.nombre}
            canEdit={canEdit}
            onIrA={irA}
            onFicha={() => seleccionado && setDialogoEmpleado({ abierto: true, empleado: seleccionado })}
            onAccion={a => setDialogoRecurso(ACCION_A_RECURSO[a])}
          />
        </div>
      ) : tab === 'nomina' ? (
        <section className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-[#e8eaed] bg-white px-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#f97316]" aria-hidden />
          <p className="mt-2 text-[13px] text-[#8a909c]">Abriendo Nómina…</p>
        </section>
      ) : (
        <TablaRecurso
          recurso={tab as RecursoKey}
          empleados={empleados}
          sedeId={sedeId}
          canEdit={canEdit}
          canDelete={canDelete}
          empleadoFoco={seleccionado?.id || null}
          onCambio={cargar}
        />
      )}

      {dialogoEmpleado?.abierto && (
        <DialogoEmpleado
          empleado={dialogoEmpleado.empleado}
          sedes={sedes}
          sedeActual={sedeId}
          rolesAsignables={rolesAsignables}
          onCerrar={() => setDialogoEmpleado(null)}
          onGuardado={cargar}
        />
      )}

      {dialogoRecurso && (
        <DialogoRecurso
          recurso={dialogoRecurso}
          empleados={empleados}
          empleadoId={seleccionado?.id || null}
          onCerrar={() => setDialogoRecurso(null)}
          onGuardado={cargar}
        />
      )}
    </ErpShell>
  );
}
