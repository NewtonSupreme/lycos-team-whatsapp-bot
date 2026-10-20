'use client';

import { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, Eraser, MoreHorizontal,
  MoreVertical, Pencil, Search, SlidersHorizontal, Trash2, UserCheck, UserX, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_CATALOG, ZONAS_TRABAJO, getRoleMeta, rolConAcceso } from '@/types';
import {
  AREAS, ESTADO_LABEL, ESTADO_TINTE, fechaCorta, normaliza,
  type EmpleadoRRHH,
} from './tipos';
import Avatar from './Avatar';

/**
 * Cargo y área tienen respaldo.
 *
 * Las columnas `cargo` y `area` son nuevas y están vacías para el personal que
 * ya existía, así que la tabla mostraría un guion en todas las filas y no se
 * vería quién es admin, mecánico o atención al cliente. Mientras no se llenen,
 * se muestra lo que el sistema sí sabe: el rol y la zona de trabajo.
 */
const cargoDe = (e: EmpleadoRRHH) =>
  (e.cargo || '').trim() || getRoleMeta(e.rol)?.label || e.rol || '—';

const areaDe = (e: EmpleadoRRHH) =>
  (e.area || '').trim() ||
  ZONAS_TRABAJO.find(z => z.key === e.especialidad)?.label ||
  '—';

interface Props {
  empleados: readonly EmpleadoRRHH[];
  seleccionado?: EmpleadoRRHH | null;
  cargando: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onSeleccionar: (e: EmpleadoRRHH) => void;
  onEditar: (e: EmpleadoRRHH) => void;
  onActivar: (e: EmpleadoRRHH, activo: boolean) => void;
  onEliminar: (e: EmpleadoRRHH) => void;
  /**
   * Cambia el estado de varios a la vez. Lo pide el menú de opciones: las
   * casillas de la tabla estaban ahí sin que nada las usara, que es peor que
   * no tenerlas —invitan a marcar y luego no hay dónde aplicar nada—.
   */
  onActivarVarios?: (ids: readonly string[], activo: boolean) => void;
}

export default function ListadoEmpleados({
  empleados, seleccionado, cargando, canEdit, canDelete,
  onSeleccionar, onEditar, onActivar, onEliminar, onActivarVarios,
}: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [area, setArea] = useState('Todas');
  const [rolFiltro, setRolFiltro] = useState('Todos');
  const [estado, setEstado] = useState('Todos');
  // Usuarios del sistema (inician sesión) y personal de nómina (no): dos cosas distintas.
  const [tipo, setTipo] = useState<'todos' | 'usuarios' | 'personal'>('todos');
  const [verFiltros, setVerFiltros] = useState(false);
  const [porPagina, setPorPagina] = useState(8);
  const [paginaPedida, setPaginaPedida] = useState(1);
  const [marcados, setMarcados] = useState<readonly string[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [menuOpciones, setMenuOpciones] = useState(false);

  /** ¿Hay algún filtro puesto? Sin esto, "Limpiar" no puede desactivarse. */
  const hayFiltros = busqueda.trim() !== '' || area !== 'Todas'
    || rolFiltro !== 'Todos' || estado !== 'Todos';

  /** CSV de las personas que se le pasen. Con BOM para que Excel abra los acentos. */
  const exportar = (lista: readonly EmpleadoRRHH[]) => {
    const cab = ['Nombre', 'Cedula', 'Cargo', 'Area', 'Rol', 'Telefono', 'Correo', 'Estado'];
    const filas = lista.map(e => [
      e.nombre, e.cedula || '', cargoDe(e), areaDe(e), e.rol,
      e.telefono || '', e.email || '', e.estado,
    ]);
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = '\ufeff' + [cab, ...filas].map(f => f.map(esc).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `personal_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const areas = useMemo(() => {
    const vistas = new Set(empleados.map(e => areaDe(e)).filter(a => a !== '—'));
    return ['Todas', ...Array.from(new Set([...AREAS, ...vistas]))];
  }, [empleados]);

  const roles = useMemo(() => {
    const usados = new Set(empleados.map(e => e.rol));
    return ['Todos', ...ROLE_CATALOG.filter(r => usados.has(r.nombre)).map(r => r.label)];
  }, [empleados]);

  const filtrados = useMemo(() => {
    const q = normaliza(busqueda.trim());
    return empleados.filter(e =>
      (!q || normaliza(`${e.nombre} ${cargoDe(e)} ${areaDe(e)} ${e.cedula || ''}`).includes(q)) &&
      (area === 'Todas' || areaDe(e) === area) &&
      (rolFiltro === 'Todos' || (getRoleMeta(e.rol)?.label || e.rol) === rolFiltro) &&
      (estado === 'Todos' || ESTADO_LABEL[e.estado] === estado) &&
      (tipo === 'todos' || (tipo === 'usuarios') === rolConAcceso(e.rol)),
    );
  }, [empleados, busqueda, area, rolFiltro, estado, tipo]);
  const nUsuarios = empleados.filter(e => rolConAcceso(e.rol)).length;

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  // La página se acota al calcular, no con un efecto: sincronizar estado desde
  // un efecto provoca un render extra en cada filtrado.
  const pagina = Math.min(paginaPedida, totalPaginas);
  const setPagina = setPaginaPedida;

  const desde = (pagina - 1) * porPagina;
  const visibles = filtrados.slice(desde, desde + porPagina);
  const todos = visibles.length > 0 && visibles.every(e => marcados.includes(e.id));
  const alguno = visibles.some(e => marcados.includes(e.id));

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      <header className="flex items-center gap-2 px-4 pt-4">
        <h2 className="flex-1 text-[15px] font-extrabold tracking-tight text-[#16181d]">
          Listado de empleados ({filtrados.length})
        </h2>
      </header>

      <div className="flex flex-wrap gap-1.5 px-4 pt-3" role="tablist" aria-label="Tipo de persona">
        {([
          ['todos', `Todos (${empleados.length})`],
          ['usuarios', `Usuarios del sistema (${nUsuarios})`],
          ['personal', `Personal de nómina (${empleados.length - nUsuarios})`],
        ] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tipo === k} onClick={() => { setTipo(k); setPaginaPedida(1); }}
            className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold ${tipo === k ? 'border-[#f97316] bg-[#fff4ec] text-[#c2410c]' : 'border-[#e8eaed] text-[#5b616e] hover:border-[#f97316]/50'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
          <input
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
            placeholder="Buscar por nombre, cargo o área..."
            aria-label="Buscar empleado"
            className="h-[40px] w-full rounded-lg border border-[#e2e5ea] pl-10 pr-3 text-[13px] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
          />
        </div>

        <button
          onClick={() => setVerFiltros(v => !v)}
          aria-expanded={verFiltros}
          className={cn(
            'flex h-[40px] shrink-0 items-center gap-2 rounded-lg border px-3.5 text-[12.5px] font-medium transition-colors',
            verFiltros ? 'border-[#f97316] bg-[#fff4ec] text-[#f97316]' : 'border-[#e2e5ea] text-[#3d4350] hover:bg-[#f6f7f9]',
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Filtros
        </button>

        {/* Menú de opciones.

            Antes este botón llevaba el icono de "más opciones" pero solo
            limpiaba los filtros: si no había ninguno puesto, no pasaba nada y
            se leía como roto. Ahora abre lo que su icono promete, y de paso
            le da uso a las casillas de la tabla. */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpciones(v => !v)}
            aria-label="Más opciones"
            aria-expanded={menuOpciones}
            className={cn(
              'flex h-[40px] w-[40px] items-center justify-center rounded-lg border transition-colors',
              menuOpciones ? 'border-[#f97316] bg-[#fff4ec] text-[#f97316]' : 'border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]',
            )}
          >
            <MoreVertical className="h-4 w-4" aria-hidden />
          </button>

          {menuOpciones && (
            <div className="absolute right-0 top-[46px] z-30 w-[248px] overflow-hidden rounded-lg border border-[#e8eaed] bg-white py-1 shadow-lg">
              {marcados.length > 0 ? (
                <>
                  <p className="px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#9ba1ab]">
                    {marcados.length} seleccionado(s)
                  </p>
                  <Opcion
                    icono={<UserCheck className="h-4 w-4" aria-hidden />}
                    label="Activar seleccionados"
                    disabled={!canEdit || !onActivarVarios}
                    onClick={() => { setMenuOpciones(false); onActivarVarios?.(marcados, true); setMarcados([]); }}
                  />
                  <Opcion
                    icono={<UserX className="h-4 w-4" aria-hidden />}
                    label="Desactivar seleccionados"
                    disabled={!canEdit || !onActivarVarios}
                    onClick={() => { setMenuOpciones(false); onActivarVarios?.(marcados, false); setMarcados([]); }}
                  />
                  <Opcion
                    icono={<Download className="h-4 w-4" aria-hidden />}
                    label="Exportar seleccionados"
                    onClick={() => { setMenuOpciones(false); exportar(empleados.filter(e => marcados.includes(e.id))); }}
                  />
                  <Opcion
                    icono={<X className="h-4 w-4" aria-hidden />}
                    label="Quitar la selección"
                    onClick={() => { setMenuOpciones(false); setMarcados([]); }}
                  />
                  <div className="my-1 border-t border-[#f2f3f5]" />
                </>
              ) : (
                <p className="px-3 py-1.5 text-[10.5px] leading-snug text-[#9ba1ab]">
                  Marca personas en la tabla para activarlas o exportarlas en lote.
                </p>
              )}

              <Opcion
                icono={<Download className="h-4 w-4" aria-hidden />}
                label={`Exportar esta vista (${filtrados.length})`}
                onClick={() => { setMenuOpciones(false); exportar(filtrados); }}
              />
              <Opcion
                icono={<Eraser className="h-4 w-4" aria-hidden />}
                label="Limpiar filtros"
                disabled={!hayFiltros}
                onClick={() => {
                  setMenuOpciones(false);
                  setBusqueda(''); setArea('Todas'); setRolFiltro('Todos'); setEstado('Todos'); setPagina(1);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {verFiltros && (
        <div className="flex flex-wrap gap-2 border-t border-[#f2f3f5] px-4 py-3">
          <Selector label="Área" valor={area} opciones={areas} onChange={v => { setArea(v); setPagina(1); }} />
          <Selector label="Rol del sistema" valor={rolFiltro} opciones={roles} onChange={v => { setRolFiltro(v); setPagina(1); }} />
          <Selector label="Estado" valor={estado} opciones={['Todos', 'Activo', 'Vacaciones', 'Permiso', 'Inactivo']} onChange={v => { setEstado(v); setPagina(1); }} />
        </div>
      )}

      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[660px] border-collapse">
          <thead>
            <tr className="border-y border-[#eef0f3] bg-[#fafbfc]">
              <th scope="col" className="w-[40px] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={todos}
                  ref={el => { if (el) el.indeterminate = alguno && !todos; }}
                  onChange={() => {
                    const ids = visibles.map(e => e.id);
                    setMarcados(prev => todos ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
                  }}
                  aria-label="Seleccionar los empleados de esta página"
                  className="h-[15px] w-[15px] rounded border-[#cfd4dc] accent-[#f97316]"
                />
              </th>
              {['Empleado', 'Cargo', 'Área', 'Estado', 'Ingreso', 'Acciones'].map(h => (
                <th key={h} scope="col" className="px-3 py-2.5 text-left text-[11.5px] font-semibold text-[#5b616e]">{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {cargando && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-[12.5px] text-[#8a909c]">Cargando plantilla…</td></tr>
            )}

            {!cargando && visibles.map(e => (
              <tr
                key={e.id}
                onClick={() => onSeleccionar(e)}
                className={cn(
                  'cursor-pointer border-b border-[#f2f3f5] last:border-0',
                  seleccionado?.id === e.id ? 'bg-[#fff8f3]' : 'hover:bg-[#fafbfc]',
                )}
              >
                <td className="px-3 py-2" onClick={ev => ev.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={marcados.includes(e.id)}
                    onChange={() => setMarcados(p => p.includes(e.id) ? p.filter(x => x !== e.id) : [...p, e.id])}
                    aria-label={`Seleccionar a ${e.nombre}`}
                    className="h-[15px] w-[15px] rounded border-[#cfd4dc] accent-[#f97316]"
                  />
                </td>

                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar nombre={e.nombre} url={(e.foto_url || e.avatar_url) as string | null} size={32} />
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-[12.5px] font-semibold text-[#16181d]">{e.nombre}</span>
                      <span className="block truncate text-[10.5px] text-[#f97316]">
                        {getRoleMeta(e.rol)?.label || e.rol}
                        {!rolConAcceso(e.rol) && <span className="ml-1 text-[#8a909c]">· sin acceso</span>}
                      </span>
                    </span>
                  </div>
                </td>

                <td className="px-3 py-2 text-[12px] text-[#3d4350]">{cargoDe(e)}</td>
                <td className="px-3 py-2 text-[12px] text-[#3d4350]">{areaDe(e)}</td>

                <td className="px-3 py-2">
                  <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[11px] font-medium', ESTADO_TINTE[e.estado])}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                    {ESTADO_LABEL[e.estado]}
                  </span>
                </td>

                <td className="num px-3 py-2 text-[12px] text-[#5b616e]">{fechaCorta(e.fecha_ingreso)}</td>

                <td className="relative px-3 py-2" onClick={ev => ev.stopPropagation()}>
                  <button
                    onClick={() => setMenu(m => (m === e.id ? null : e.id))}
                    aria-label={`Acciones para ${e.nombre}`}
                    aria-expanded={menu === e.id}
                    className="flex h-[28px] w-[28px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </button>

                  {menu === e.id && (
                    <div className="absolute right-3 top-[42px] z-20 w-[190px] overflow-hidden rounded-lg border border-[#e8eaed] bg-white py-1 shadow-lg">
                      <button
                        onClick={() => { setMenu(null); onSeleccionar(e); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-[#3d4350] hover:bg-[#f6f7f9]"
                      >
                        <UserCheck className="h-4 w-4" aria-hidden />
                        Ver ficha
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => { setMenu(null); onEditar(e); }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-[#3d4350] hover:bg-[#f6f7f9]"
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                          Editar datos
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => { setMenu(null); onActivar(e, e.activo === false); }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-[#3d4350] hover:bg-[#f6f7f9]"
                        >
                          <UserX className="h-4 w-4" aria-hidden />
                          {e.activo === false ? 'Reactivar' : 'Dar de baja'}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => { setMenu(null); onEliminar(e); }}
                          className="flex w-full items-center gap-2.5 border-t border-[#f2f3f5] px-3 py-2 text-left text-[12.5px] font-semibold text-[#dc2626] hover:bg-[#fdeaea]"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          Eliminar
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}

            {!cargando && visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[12.5px] text-[#8a909c]">
                  {empleados.length === 0 ? 'No hay personal registrado en esta sede.' : 'Nadie coincide con esos filtros.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        <p className="num min-w-0 flex-1 text-[12px] text-[#8a909c]">
          {filtrados.length === 0
            ? 'Sin empleados que mostrar'
            : `Mostrando ${desde + 1} a ${desde + visibles.length} de ${filtrados.length} empleados`}
        </p>

        <nav className="flex items-center gap-1.5" aria-label="Paginación de empleados">
          <button
            onClick={() => setPagina(p => Math.max(1, p - 1))}
            disabled={pagina === 1}
            aria-label="Página anterior"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9] disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              onClick={() => setPagina(n)}
              aria-current={n === pagina ? 'page' : undefined}
              className={cn(
                'num h-[30px] min-w-[30px] rounded-lg border px-2 text-[12.5px] font-medium transition-colors',
                n === pagina ? 'border-[#f97316] bg-[#fff4ec] text-[#f97316]' : 'border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]',
              )}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
            disabled={pagina === totalPaginas}
            aria-label="Página siguiente"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9] disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </nav>

        <div className="relative shrink-0">
          <select
            value={porPagina}
            onChange={e => { setPorPagina(Number(e.target.value)); setPagina(1); }}
            aria-label="Empleados por página"
            className="h-[34px] appearance-none rounded-lg border border-[#e2e5ea] pl-3 pr-8 text-[12.5px] font-medium text-[#3d4350] outline-none focus:border-[#f97316]"
          >
            {[8, 16, 24, 50].map(n => <option key={n} value={n}>{n} por página</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
        </div>
      </div>
    </section>
  );
}

function Selector({ label, valor, opciones, onChange }: {
  label: string; valor: string; opciones: readonly string[]; onChange: (v: string) => void;
}) {
  return (
    <label className="relative h-[48px] w-[168px] shrink-0 rounded-lg border border-[#e2e5ea] px-3 pt-[6px]">
      <span className="block text-[10.5px] leading-none text-[#9ba1ab]">{label}</span>
      <select
        value={valor}
        onChange={e => onChange(e.target.value)}
        className="mt-[3px] w-full appearance-none bg-transparent pr-5 text-[12.5px] font-medium text-[#16181d] outline-none"
      >
        {opciones.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
    </label>
  );
}

function Opcion({
  icono, label, onClick, disabled,
}: {
  icono: React.ReactNode; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-[#3d4350] transition-colors hover:bg-[#f6f7f9] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {icono}
      {label}
    </button>
  );
}
