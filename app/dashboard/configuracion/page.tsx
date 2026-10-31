'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, Check, Cloud, History, Loader2, Palette, Plug, Save,
  Settings, Sparkles, Wrench,
} from 'lucide-react';
import ErpShell from '@/components/erp/ErpShell';
import KpisConfig from '@/components/config/KpisConfig';
import TablaUsuarios from '@/components/config/TablaUsuarios';
import RailConfig from '@/components/config/RailConfig';
import PanelesInferiores, { type EventoActividad } from '@/components/config/PanelesInferiores';
import PanelSucursales from '@/components/config/PanelSucursales';
import PanelRoles from '@/components/config/PanelRoles';
import PanelGeneral from '@/components/config/PanelGeneral';
import GestionCuentas from '@/components/finanzas/GestionCuentas';
import PanelBot from '@/components/config/PanelBot';
import DialogoEmpleado from '@/components/rrhh/DialogoEmpleado';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { cn } from '@/lib/utils';
import { ROLE_CATALOG, resolveRol, type RoleMeta } from '@/types';
import type { EmpleadoRRHH } from '@/components/rrhh/tipos';
import {
  TABS_CONFIG, type Ajustes, type KpisConfig as Kpis,
  type RolConfig, type TabConfig, type UsuarioConfig,
} from '@/components/config/tipos';


const KPIS_VACIOS: Kpis = {
  total: 0, activos: 0, rolesCreados: 0, rolesDefinidos: 0, altasEsteMes: 0,
  variacionPct: null, ultimoAcceso: null, ultimoAccesoQuien: null,
  intentosFallidos24h: 0, hayHistorialAccesos: false,
};

const AJUSTES_VACIOS: Ajustes = {
  seguridad: {
    dosFactores: false, avisoInicioSesion: true, bloqueoPorIntentos: true,
    intentosMaximos: 5, expiraEnMinutos: 120,
  },
  contrasenas: {
    minimoCaracteres: 8, exigeMayuscula: true, exigeMinuscula: true,
    exigeNumero: true, exigeEspecial: true, caducaEnDias: 0,
  },
  general: {
    nombreTaller: 'Lycos Team', lema: 'Taller automotriz',
    moneda: 'USD', zonaHoraria: 'America/Caracas',
  },
};

/**
 * Configuración del taller.
 *
 * Todo lo que se ve sale de la base: los usuarios, sus roles, el último acceso
 * de cada uno y los intentos fallidos de las últimas 24 horas. Los ajustes de
 * seguridad y la política de contraseñas se guardan de verdad —antes vivían en
 * el estado de React y volvían a su valor por defecto al recargar—.
 *
 * Las pestañas que corresponden a pantallas que ya existen llevan a ellas en
 * lugar de reimplementarlas: un panel de configuración con su propia copia de
 * la gestión de empleados serían dos sitios donde editar lo mismo.
 */
export default function ConfiguracionPage() {
  const router = useRouter();
  const { user } = useAppStore();
  const { currentSede } = useSedeStore();

  const rol = resolveRol(user?.rol);
  const isAdmin = rol === 'admin';
  const canEdit = isAdmin || rol === 'supervisor' || rol === 'administracion';
  const canDelete = isAdmin;
  // Cualquier Usuario Maestro puede asignar el rol de Maestro.
  const esMaestro = isAdmin;

  const rolesAsignables: RoleMeta[] = useMemo(() => ROLE_CATALOG.filter(r => {
    if (r.nombre === 'admin') return esMaestro;
    if (!isAdmin) return r.asignablePorSupervisor;
    return true;
  }), [isAdmin, esMaestro]);

  const [montado, setMontado] = useState(false);
  const [tab, setTab] = useState<TabConfig>('usuarios');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const [usuarios, setUsuarios] = useState<UsuarioConfig[]>([]);
  const [roles, setRoles] = useState<RolConfig[]>([]);
  const [sedes, setSedes] = useState<{ id: string; nombre: string }[]>([]);
  const [kpis, setKpis] = useState<Kpis>(KPIS_VACIOS);
  const [actividad, setActividad] = useState<EventoActividad[]>([]);

  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_VACIOS);
  const [ajustesGuardados, setAjustesGuardados] = useState<Ajustes>(AJUSTES_VACIOS);
  const [ultimoCambio, setUltimoCambio] = useState<string | null>(null);

  const [dialogo, setDialogo] = useState<{ abierto: boolean; empleado: EmpleadoRRHH | null } | null>(null);

  useEffect(() => { setMontado(true); }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [rU, rA] = await Promise.all([
        fetch('/api/configuracion/usuarios').then(r => r.json()),
        fetch('/api/configuracion').then(r => r.json()),
      ]);
      if (rU.error) throw new Error(rU.error);
      setUsuarios(rU.usuarios || []);
      setRoles(rU.roles || []);
      setSedes(rU.sedes || []);
      setKpis(rU.kpis || KPIS_VACIOS);
      if (rA.ajustes) {
        setAjustes(rA.ajustes);
        setAjustesGuardados(rA.ajustes);
        setUltimoCambio(rA.ultimoCambio || null);
      }

      // La actividad se lee directo: es el mismo registro que alimenta los logs.
      if (supabase) {
        const { data } = await supabase.from('logs_actividad')
          .select('id, usuario, accion, modulo, created_at')
          .order('created_at', { ascending: false })
          .limit(8);
        setActividad((data || []) as EventoActividad[]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  /** Cuántos usuarios tiene cada rol. Un rol con gente no se puede borrar. */
  const usuariosPorRol = useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of usuarios) m[u.rol] = (m[u.rol] || 0) + 1;
    return m;
  }, [usuarios]);

  /** ¿Hay algo sin guardar? Se compara con lo último confirmado por el servidor. */
  const hayCambios = useMemo(
    () => JSON.stringify(ajustes) !== JSON.stringify(ajustesGuardados),
    [ajustes, ajustesGuardados],
  );

  const guardar = async () => {
    if (!hayCambios) { setAviso('No hay cambios que guardar.'); return; }
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const r = await fetch('/api/configuracion', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ajustes),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
      setAjustesGuardados(ajustes);
      setUltimoCambio(new Date().toISOString());
      setAviso('Configuración guardada.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const exportarUsuarios = () => {
    const cab = ['Usuario', 'Nombre', 'Correo', 'Rol', 'Sucursal', 'Estado', 'Ultimo acceso', 'Telefono'];
    const filas = usuarios.map(u => [
      u.username, u.nombre, u.email || '', u.rolLabel, u.sede,
      u.activo ? 'Activo' : 'Inactivo', u.ultimoAcceso || 'Nunca', u.telefono || '',
    ]);
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    // BOM para que Excel abra los acentos bien.
    const csv = '﻿' + [cab, ...filas].map(f => f.map(esc).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `usuarios_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Convierte la fila de la tabla al formato que espera el diálogo. */
  const aEmpleado = (u: UsuarioConfig): EmpleadoRRHH => ({
    id: u.id, nombre: u.nombre, username: u.username, email: u.email,
    rol: u.rol, telefono: u.telefono, activo: u.activo,
    sede_id: sedes.find(s => s.nombre === u.sede)?.id ?? null,
    foto_url: u.foto, avatar_url: u.foto,
    estado: u.activo ? 'activo' : 'inactivo',
  } as EmpleadoRRHH);

  const alternarEstado = async (u: UsuarioConfig) => {
    const accion = u.activo ? 'desactivar el acceso de' : 'reactivar el acceso de';
    if (!confirm(`¿Seguro que quieres ${accion} ${u.nombre}?`)) return;
    try {
      const r = await fetch('/api/admin/update-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, activo: !u.activo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cambiar el estado');
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cambiar el estado');
    }
  };

  const eliminar = async (u: UsuarioConfig) => {
    if (!confirm(
      `Se va a ELIMINAR a ${u.nombre} del sistema.\n\n`
      + 'Si tiene trabajos o comisiones registradas, conviene desactivarlo en vez de borrarlo: '
      + 'al eliminarlo se pierde el nombre en su historial.\n\n¿Continuar?',
    )) return;
    try {
      const r = await fetch('/api/admin/delete-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo eliminar');
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    }
  };

  if (!montado) return null;

  const subnav = TABS_CONFIG.map(t => ({ id: t.id, label: t.label }));

  return (
    <ErpShell
      buscador="Buscar clientes, vehículos, servicios, usuarios..."
      lema={['Un taller más', 'inteligente, siempre', 'en evolución.']}
      lemaPie={['Configura', 'y controla', 'todo el sistema']}
      subnav={subnav}
      subnavActivo={tab}
      onSubnav={id => setTab(id as TabConfig)}
    >
      {/* ── Cabecera ─────────────────────────────────────────────────── */}
      <header className="mb-3.5 flex flex-wrap items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
          <Settings className="h-[22px] w-[22px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#16181d]">
            Configuración
          </h1>
          <p className="text-[13px] text-[#8a909c]">
            Personaliza tu taller, gestiona usuarios, permisos e integra tus herramientas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => router.push('/dashboard/informacion')}
            className="flex h-[42px] items-center gap-2 rounded-lg border border-[#e2e5ea] bg-white px-3.5 text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            <History className="h-4 w-4" aria-hidden />
            Ver cambios
          </button>
          <button
            onClick={guardar}
            disabled={guardando || !canEdit || !hayCambios}
            title={!canEdit ? 'No tienes permiso para cambiar la configuración'
              : !hayCambios ? 'No hay cambios pendientes' : undefined}
            className="flex h-[42px] items-center gap-2 rounded-lg bg-[#f97316] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {guardando
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              : <Save className="h-4 w-4" aria-hidden />}
            {guardando ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      </header>

      {/* ── Pestañas ─────────────────────────────────────────────────── */}
      <div className="mb-3.5 overflow-x-auto" role="tablist">
        <div className="flex min-w-max items-center gap-1 border-b border-[#e8eaed]">
          {TABS_CONFIG.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'relative shrink-0 px-3.5 pb-2.5 pt-1 text-[13px] font-medium transition-colors',
                tab === t.id ? 'text-[#f97316]' : 'text-[#5b616e] hover:text-[#16181d]',
              )}
            >
              {t.label}
              {tab === t.id && (
                <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[#f97316]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {(error || aviso) && (
        <p
          role={error ? 'alert' : 'status'}
          className={cn(
            'mb-3.5 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[13px]',
            error
              ? 'border-[#f5c2c2] bg-[#fdeaea] text-[#b91c1c]'
              : 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]',
          )}
        >
          {error
            ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            : <Check className="h-4 w-4 shrink-0" aria-hidden />}
          {error || aviso}
        </p>
      )}

      {hayCambios && !guardando && (
        <p className="mb-3.5 flex items-center gap-2 rounded-lg border border-[#fed7aa] bg-[#fff7ed] px-3.5 py-2.5 text-[12.5px] text-[#9a3412]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Tienes cambios sin guardar. Pulsa «Guardar configuración» para aplicarlos.
        </p>
      )}

      {/* ── Contenido ────────────────────────────────────────────────── */}
      {tab === 'usuarios' ? (
        <>
          <KpisConfig k={kpis} />

          <div className="flex flex-col gap-3.5 lg:flex-row">
            <TablaUsuarios
              usuarios={usuarios}
              roles={roles}
              sedes={sedes}
              cargando={cargando}
              canEdit={canEdit}
              canDelete={canDelete}
              onNuevo={() => setDialogo({ abierto: true, empleado: null })}
              onEditar={u => setDialogo({ abierto: true, empleado: aEmpleado(u) })}
              onAlternarEstado={alternarEstado}
              onEliminar={eliminar}
              onPermisos={() => setTab('roles')}
              onInvitar={() => setDialogo({ abierto: true, empleado: null })}
              onExportar={exportarUsuarios}
            />

            <RailConfig
              roles={roles}
              onGestionarRoles={() => setTab('roles')}
              onNuevoUsuario={() => setDialogo({ abierto: true, empleado: null })}
              onNuevoRol={() => setTab('roles')}
              onHistorial={() => setTab('seguridad')}
              onPolitica={() => setTab('seguridad')}
            />
          </div>

          <PanelesInferiores
            actividad={actividad}
            ajustes={ajustes}
            onAjustes={setAjustes}
            canEdit={canEdit}
            onVerActividad={() => router.push('/dashboard/informacion')}
          />
        </>
      ) : tab === 'roles' ? (
        <PanelRoles canEdit={canEdit} canDelete={canDelete} usuariosPorRol={usuariosPorRol} />
      ) : tab === 'sucursales' ? (
        <PanelSucursales canEdit={canEdit} canDelete={canDelete} />
      ) : tab === 'general' ? (
        <PanelGeneral
          ajustes={ajustes}
          onAjustes={setAjustes}
          canEdit={canEdit}
          ultimoCambio={ultimoCambio}
          sedes={sedes.length}
          usuarios={usuarios.length}
        />
      ) : tab === 'cuentas' ? (
        <GestionCuentas puedeEditar={canEdit} />
      ) : tab === 'bot' ? (
        <PanelBot puedeEditar={canEdit} />
      ) : tab === 'seguridad' ? (
        <>
          <KpisConfig k={kpis} />
          <PanelesInferiores
            actividad={actividad}
            ajustes={ajustes}
            onAjustes={setAjustes}
            canEdit={canEdit}
            onVerActividad={() => router.push('/dashboard/informacion')}
          />
        </>
      ) : (
        <SeccionPendiente tab={tab} ultimoCambio={ultimoCambio} onIr={ruta => router.push(ruta)} />
      )}

      {dialogo?.abierto && (
        <DialogoEmpleado
          empleado={dialogo.empleado}
          sedes={sedes}
          sedeActual={currentSede?.id || null}
          rolesAsignables={rolesAsignables}
          onCerrar={() => setDialogo(null)}
          onGuardado={() => { setDialogo(null); cargar(); }}
        />
      )}
    </ErpShell>
  );
}

/**
 * Las pestañas cuyo contenido ya vive en otra pantalla.
 *
 * En lugar de una copia del módulo —dos sitios donde editar lo mismo— se dice
 * qué hay ahí y se lleva. Y donde todavía no hay nada, se dice que no hay,
 * en vez de fingir una sección vacía que parece rota.
 */
function SeccionPendiente({
  tab, ultimoCambio, onIr,
}: {
  tab: TabConfig; ultimoCambio: string | null; onIr: (ruta: string) => void;
}) {
  const MAPA: Partial<Record<TabConfig, {
    icono: React.ReactNode; titulo: string; texto: string; ruta?: string; cta?: string;
  }>> = {
    taller: {
      icono: <Wrench className="h-6 w-6" aria-hidden />,
      titulo: 'Operación del taller',
      texto: 'Las zonas de trabajo, los tipos de servicio y las reglas de pago del personal se configuran desde Nómina → Configuración.',
      ruta: '/dashboard/nomina',
      cta: 'Abrir Nómina',
    },
    notificaciones: {
      icono: <Cloud className="h-6 w-6" aria-hidden />,
      titulo: 'Notificaciones',
      texto: 'Los avisos del sistema y de WhatsApp llegan a la campana de la barra superior. Aún no hay ajustes por canal.',
    },
    integraciones: {
      icono: <Plug className="h-6 w-6" aria-hidden />,
      titulo: 'Integraciones',
      texto: 'WhatsApp Business y el asistente de IA están conectados y se administran desde el módulo de WhatsApp.',
      ruta: '/dashboard/whatsapp',
      cta: 'Abrir WhatsApp',
    },
    respaldos: {
      icono: <Cloud className="h-6 w-6" aria-hidden />,
      titulo: 'Respaldos',
      texto: 'La base de datos la respalda Supabase automáticamente. Todavía no hay descarga de respaldos desde aquí.',
    },
    personalizacion: {
      icono: <Palette className="h-6 w-6" aria-hidden />,
      titulo: 'Personalización',
      texto: 'El tema claro y oscuro se cambia con el icono de la luna en la barra superior. El logo y los colores de marca aún no son configurables.',
    },
    planes: {
      icono: <Sparkles className="h-6 w-6" aria-hidden />,
      titulo: 'Planes y suscripción',
      texto: 'Este sistema es propio del taller: no hay planes ni suscripción que gestionar.',
    },
  };

  const s = MAPA[tab];
  if (!s) return null;

  return (
    <section className="rounded-xl border border-[#e8eaed] bg-white px-6 py-12 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
        {s.icono}
      </span>
      <h2 className="mt-3.5 text-[17px] font-bold text-[#16181d]">{s.titulo}</h2>
      <p className="mx-auto mt-1.5 max-w-[520px] text-[13px] leading-relaxed text-[#8a909c]">{s.texto}</p>

      {s.ruta && s.cta && (
        <button
          onClick={() => onIr(s.ruta!)}
          className="mx-auto mt-4 flex h-[40px] items-center gap-2 rounded-lg bg-[#f97316] px-4 text-[13px] font-semibold text-white hover:bg-[#ea580c]"
        >
          {s.cta}
        </button>
      )}

      {ultimoCambio && (
        <p className="num mt-5 text-[11px] text-[#9ba1ab]">
          Última vez que se guardó la configuración: {new Date(ultimoCambio).toLocaleString('es-VE')}
        </p>
      )}
    </section>
  );
}
