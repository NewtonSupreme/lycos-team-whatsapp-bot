'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2,
  MoreHorizontal, Pencil, Plus, Search, Send, ShieldCheck, Trash2, UserX, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Avatar from '@/components/rrhh/Avatar';
import { cuando, normaliza, type RolConfig, type UsuarioConfig } from './tipos';

interface Props {
  usuarios: readonly UsuarioConfig[];
  roles: readonly RolConfig[];
  sedes: readonly { id: string; nombre: string }[];
  cargando: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onNuevo: () => void;
  onEditar: (u: UsuarioConfig) => void;
  onAlternarEstado: (u: UsuarioConfig) => void;
  onEliminar: (u: UsuarioConfig) => void;
  onPermisos: (u: UsuarioConfig) => void;
  onInvitar: () => void;
  onExportar: () => void;
}

/**
 * Los usuarios del sistema, con lo que hace falta para administrarlos.
 *
 * Filtra sobre lo que ya está en memoria en vez de volver a consultar: son unas
 * decenas de personas, y una tabla que se recarga a cada tecla se siente peor
 * de lo que rinde.
 */
export default function TablaUsuarios({
  usuarios, roles, sedes, cargando, canEdit, canDelete,
  onNuevo, onEditar, onAlternarEstado, onEliminar, onPermisos, onInvitar, onExportar,
}: Props) {
  const [busca, setBusca] = useState('');
  const [rol, setRol] = useState('todos');
  const [estado, setEstado] = useState('todos');
  const [porPagina, setPorPagina] = useState(10);
  const [paginaPedida, setPagina] = useState(1);
  const [menu, setMenu] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = normaliza(busca.trim());
    return usuarios.filter(u =>
      (!q || normaliza(`${u.nombre} ${u.username} ${u.email || ''} ${u.rolLabel}`).includes(q))
      && (rol === 'todos' || u.rol === rol)
      && (estado === 'todos' || (estado === 'activos') === u.activo),
    );
  }, [usuarios, busca, rol, estado]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  // La página se acota al calcular: sincronizarla desde un efecto provocaría un
  // render extra en cada filtrado.
  const pagina = Math.min(paginaPedida, totalPaginas);
  const desde = (pagina - 1) * porPagina;
  const visibles = filtrados.slice(desde, desde + porPagina);

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      <header className="flex flex-wrap items-start gap-3 px-5 pb-1 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-extrabold tracking-tight text-[#16181d]">Usuarios del sistema</h2>
          <p className="text-[12.5px] text-[#8a909c]">Gestiona los usuarios, roles y accesos a la plataforma.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onInvitar}
            disabled={!canEdit}
            className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9] disabled:opacity-45"
          >
            <Send className="h-4 w-4" aria-hidden />
            Invitar usuario
          </button>
          <button
            onClick={onNuevo}
            disabled={!canEdit}
            className="flex h-[38px] items-center gap-1.5 rounded-lg bg-[#f97316] px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#ea580c] disabled:opacity-45"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nuevo usuario
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2.5 px-5 py-3.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
          <input
            value={busca}
            onChange={e => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Buscar por nombre, correo o rol..."
            aria-label="Buscar usuario"
            className="h-[42px] w-full rounded-lg border border-[#e2e5ea] pl-10 pr-3 text-[13px] text-[#16181d] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316]"
          />
        </div>

        <Selector
          valor={rol}
          onChange={v => { setRol(v); setPagina(1); }}
          opciones={[{ v: 'todos', l: 'Todos los roles' }, ...roles.map(r => ({ v: r.nombre, l: r.label }))]}
          etiqueta="Filtrar por rol"
        />
        <Selector
          valor={estado}
          onChange={v => { setEstado(v); setPagina(1); }}
          opciones={[
            { v: 'todos', l: 'Todos los estados' },
            { v: 'activos', l: 'Activos' },
            { v: 'inactivos', l: 'Inactivos' },
          ]}
          etiqueta="Filtrar por estado"
        />

        <button
          onClick={onExportar}
          className="flex h-[42px] shrink-0 items-center gap-2 rounded-lg border border-[#e2e5ea] px-3.5 text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
        >
          <Download className="h-4 w-4" aria-hidden />
          Exportar
        </button>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr className="border-y border-[#eef0f3] bg-[#fafbfc]">
              {['Usuario', 'Nombre completo', 'Correo electrónico', 'Rol', 'Sucursal', 'Estado', 'Último acceso', 'Acciones'].map(h => (
                <th key={h} scope="col" className="px-3 py-2.5 text-left text-[11.5px] font-semibold text-[#5b616e] first:pl-5">
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {cargando && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#f97316]" aria-hidden />
                  <span className="mt-2 block text-[12.5px] text-[#8a909c]">Cargando usuarios…</span>
                </td>
              </tr>
            )}

            {!cargando && visibles.map(u => (
              <tr key={u.id} className="border-b border-[#f2f3f5] last:border-0 hover:bg-[#fafbfc]">
                <td className="py-2 pl-5 pr-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar nombre={u.nombre} url={u.foto} size={32} />
                    <span className="truncate text-[12.5px] font-semibold text-[#16181d]">{u.username}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-[12px] text-[#3d4350]">{u.nombre}</td>
                <td className="px-3 py-2 text-[12px] text-[#5b616e]">{u.email || '—'}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex rounded-md bg-[#fff1e7] px-2 py-[3px] text-[11px] font-medium text-[#c2410c]">
                    {u.rolLabel}
                  </span>
                </td>
                <td className="px-3 py-2 text-[12px] text-[#3d4350]">{u.sede}</td>
                <td className="px-3 py-2">
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[11px] font-medium',
                    u.activo ? 'bg-[#e8f7ee] text-[#15803d]' : 'bg-[#fdeaea] text-[#dc2626]',
                  )}>
                    {u.activo
                      ? <CheckCircle2 className="h-3 w-3" aria-hidden />
                      : <XCircle className="h-3 w-3" aria-hidden />}
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="num px-3 py-2 text-[12px] text-[#5b616e]">{cuando(u.ultimoAcceso)}</td>
                <td className="relative px-3 py-2">
                  <button
                    onClick={() => setMenu(m => (m === u.id ? null : u.id))}
                    aria-label={`Acciones para ${u.nombre}`}
                    aria-expanded={menu === u.id}
                    className="flex h-[28px] w-[28px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </button>

                  {menu === u.id && (
                    <div className="absolute right-3 top-[42px] z-20 w-[212px] overflow-hidden rounded-lg border border-[#e8eaed] bg-white py-1 shadow-lg">
                      <Accion
                        icono={<Pencil className="h-4 w-4" aria-hidden />}
                        label="Editar usuario"
                        disabled={!canEdit}
                        onClick={() => { setMenu(null); onEditar(u); }}
                      />
                      <Accion
                        icono={<ShieldCheck className="h-4 w-4" aria-hidden />}
                        label="Permisos del rol"
                        onClick={() => { setMenu(null); onPermisos(u); }}
                      />
                      <Accion
                        icono={<UserX className="h-4 w-4" aria-hidden />}
                        label={u.activo ? 'Desactivar acceso' : 'Reactivar acceso'}
                        disabled={!canEdit}
                        onClick={() => { setMenu(null); onAlternarEstado(u); }}
                      />
                      <Accion
                        icono={<Trash2 className="h-4 w-4" aria-hidden />}
                        label="Eliminar usuario"
                        peligro
                        disabled={!canDelete}
                        onClick={() => { setMenu(null); onEliminar(u); }}
                      />
                    </div>
                  )}
                </td>
              </tr>
            ))}

            {!cargando && visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-[13px] text-[#8a909c]">
                  {usuarios.length === 0
                    ? 'No hay usuarios registrados.'
                    : 'Ningún usuario coincide con esos filtros.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <p className="num min-w-0 flex-1 text-[12.5px] text-[#8a909c]">
          {filtrados.length === 0
            ? 'Sin usuarios que mostrar'
            : `Mostrando ${desde + 1} a ${desde + visibles.length} de ${filtrados.length} usuarios`}
        </p>

        <nav className="flex items-center gap-1.5" aria-label="Paginación de usuarios">
          <BotonPag onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1} label="Página anterior">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </BotonPag>
          {Array.from({ length: totalPaginas }, (_, i) => i + 1).slice(0, 8).map(n => (
            <button
              key={n}
              onClick={() => setPagina(n)}
              aria-current={n === pagina ? 'page' : undefined}
              className={cn(
                'num h-[32px] min-w-[32px] rounded-lg border px-2 text-[12.5px] font-medium transition-colors',
                n === pagina
                  ? 'border-[#f97316] bg-[#fff4ec] text-[#f97316]'
                  : 'border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]',
              )}
            >
              {n}
            </button>
          ))}
          <BotonPag onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas} label="Página siguiente">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </BotonPag>
        </nav>

        <div className="relative shrink-0">
          <select
            value={porPagina}
            onChange={e => { setPorPagina(Number(e.target.value)); setPagina(1); }}
            aria-label="Usuarios por página"
            className="h-[36px] appearance-none rounded-lg border border-[#e2e5ea] pl-3 pr-8 text-[12.5px] font-medium text-[#3d4350] outline-none focus:border-[#f97316]"
          >
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} por página</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
        </div>
      </div>

      {sedes.length > 1 && (
        <p className="px-5 pb-3.5 text-[11px] text-[#9ba1ab]">
          {sedes.length} sucursales registradas. Un usuario sin sucursal asignada trabaja en todas.
        </p>
      )}
    </section>
  );
}

function Accion({
  icono, label, onClick, disabled, peligro,
}: {
  icono: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; peligro?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] transition-colors disabled:opacity-40 disabled:hover:bg-transparent',
        peligro
          ? 'border-t border-[#f2f3f5] text-[#dc2626] hover:bg-[#fdeaea]'
          : 'text-[#3d4350] hover:bg-[#f6f7f9]',
      )}
    >
      {icono}
      {label}
    </button>
  );
}

function BotonPag({
  children, onClick, disabled, label,
}: {
  children: React.ReactNode; onClick: () => void; disabled: boolean; label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-[32px] w-[32px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] transition-colors hover:bg-[#f6f7f9] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Selector({
  valor, onChange, opciones, etiqueta,
}: {
  valor: string; onChange: (v: string) => void; opciones: { v: string; l: string }[]; etiqueta: string;
}) {
  return (
    <div className="relative h-[42px] w-[184px] shrink-0">
      <select
        value={valor}
        onChange={e => onChange(e.target.value)}
        aria-label={etiqueta}
        className="h-full w-full appearance-none rounded-lg border border-[#e2e5ea] pl-3 pr-8 text-[13px] font-medium text-[#16181d] outline-none focus:border-[#f97316]"
      >
        {opciones.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
    </div>
  );
}
