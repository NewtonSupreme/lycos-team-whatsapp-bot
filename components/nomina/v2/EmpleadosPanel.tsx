'use client';

import { useId, useMemo, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download,
  FileDown, Loader2, MoreHorizontal, Plus, Search, SlidersHorizontal, Upload, Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatoMonto, iniciales, normaliza, type FilaEmpleado, type Moneda } from './tipos';

interface Props {
  filas: readonly FilaEmpleado[];
  moneda: Moneda;
  tasa: number;
  cargando: boolean;
  canLiquidar: boolean;
  onDetalle: (f: FilaEmpleado) => void;
  onLiquidar: (f: FilaEmpleado) => void;
  onRecibo: (f: FilaEmpleado) => void;
  onNuevoEmpleado: () => void;
  onExportar: () => void;
  onImportar: () => void;
}

export default function EmpleadosPanel({
  filas, moneda, tasa, cargando, canLiquidar,
  onDetalle, onLiquidar, onRecibo, onNuevoEmpleado, onExportar, onImportar,
}: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [depto, setDepto] = useState('Todos');
  const [cargo, setCargo] = useState('Todos');
  const [estado, setEstado] = useState('Todos');
  const [porPagina, setPorPagina] = useState(8);
  const [paginaPedida, setPaginaPedida] = useState(1);
  const [seleccion, setSeleccion] = useState<readonly string[]>([]);
  const [menu, setMenu] = useState<string | null>(null);

  // Las opciones salen de la plantilla real, no de una lista escrita a mano.
  const departamentos = useMemo(
    () => ['Todos', ...Array.from(new Set(filas.map(f => f.departamento).filter(d => d && d !== '—'))).sort()],
    [filas],
  );
  const cargos = useMemo(
    () => ['Todos', ...Array.from(new Set(filas.map(f => f.cargo).filter(Boolean))).sort()],
    [filas],
  );

  const filtrados = useMemo(() => {
    const q = normaliza(busqueda.trim());
    return filas.filter(f =>
      (!q || normaliza(`${f.nombre} ${f.cedula} ${f.cargo}`).includes(q)) &&
      (depto === 'Todos' || f.departamento === depto) &&
      (cargo === 'Todos' || f.cargo === cargo) &&
      (estado === 'Todos' || (estado === 'Liquidado') === f.liquidado),
    );
  }, [filas, busqueda, depto, cargo, estado]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  // La página se acota al calcular, no con un efecto: sincronizar estado desde
  // un efecto provoca un render extra en cada filtrado.
  const pagina = Math.min(paginaPedida, totalPaginas);
  const setPagina = setPaginaPedida;

  const desde = (pagina - 1) * porPagina;
  const visibles = filtrados.slice(desde, desde + porPagina);

  const todosMarcados = visibles.length > 0 && visibles.every(f => seleccion.includes(f.id));
  const algunoMarcado = visibles.some(f => seleccion.includes(f.id));

  const alternarTodos = () => {
    const ids = visibles.map(f => f.id);
    setSeleccion(prev => (todosMarcados ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
  };
  const alternarUno = (id: string) =>
    setSeleccion(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const money = (n: number) => formatoMonto(n, moneda, tasa);

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      <header className="flex flex-wrap items-center gap-3 px-5 pb-1 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-extrabold tracking-tight text-[#16181d]">Empleados</h2>
          <p className="text-[12.5px] text-[#8a909c]">Gestiona la información salarial de tu equipo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onExportar}
            className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            <Download className="h-4 w-4" aria-hidden />
            Exportar
          </button>
          <button
            onClick={onImportar}
            className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            <Upload className="h-4 w-4" aria-hidden />
            Importar
          </button>
          <button
            onClick={onNuevoEmpleado}
            className="flex h-[38px] items-center gap-1.5 rounded-lg bg-[#f97316] px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#ea580c]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nuevo empleado
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2.5 px-5 py-3.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
          <input
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
            placeholder="Buscar empleado por nombre, cédula o cargo..."
            aria-label="Buscar empleado"
            className="h-[52px] w-full rounded-lg border border-[#e2e5ea] pl-10 pr-3 text-[13px] text-[#16181d] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
          />
        </div>

        <Selector label="Departamento" valor={depto} opciones={departamentos} onChange={v => { setDepto(v); setPagina(1); }} />
        <Selector label="Cargo" valor={cargo} opciones={cargos} onChange={v => { setCargo(v); setPagina(1); }} />
        <Selector label="Estado" valor={estado} opciones={['Todos', 'Pendiente', 'Liquidado']} onChange={v => { setEstado(v); setPagina(1); }} />

        <button
          onClick={() => { setBusqueda(''); setDepto('Todos'); setCargo('Todos'); setEstado('Todos'); setPagina(1); }}
          className="flex h-[52px] shrink-0 items-center gap-2 rounded-lg border border-[#e2e5ea] px-4 text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Limpiar
        </button>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse">
          <thead>
            <tr className="border-y border-[#eef0f3] bg-[#fafbfc]">
              <th scope="col" className="w-[44px] px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  ref={el => { if (el) el.indeterminate = algunoMarcado && !todosMarcados; }}
                  onChange={alternarTodos}
                  aria-label="Seleccionar todos los empleados de esta página"
                  className="h-[15px] w-[15px] rounded border-[#cfd4dc] accent-[#f97316]"
                />
              </th>
              {['Empleado', 'Cargo', 'Departamento', 'Sueldo base', 'Comisiones', 'Total devengado', 'Deducciones', 'Neto a pagar', 'Estado', 'Acciones'].map(h => (
                <th key={h} scope="col" className="px-3 py-2.5 text-left text-[11.5px] font-semibold text-[#5b616e]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {cargando && (
              <tr>
                <td colSpan={11} className="px-5 py-12 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#f97316]" aria-hidden />
                  <span className="mt-2 block text-[12.5px] text-[#8a909c]">Calculando la nómina del período…</span>
                </td>
              </tr>
            )}

            {!cargando && visibles.map(f => (
              <tr
                key={f.id}
                onClick={() => onDetalle(f)}
                className="cursor-pointer border-b border-[#f2f3f5] last:border-0 hover:bg-[#fafbfc]"
              >
                <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={seleccion.includes(f.id)}
                    onChange={() => alternarUno(f.id)}
                    aria-label={`Seleccionar a ${f.nombre}`}
                    className="h-[15px] w-[15px] rounded border-[#cfd4dc] accent-[#f97316]"
                  />
                </td>

                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    {f.fotoUrl
                      ? <img src={f.fotoUrl} alt="" className="h-[34px] w-[34px] shrink-0 rounded-full object-cover" />
                      : (
                        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#eef1f5] text-[11px] font-semibold text-[#9ba1ab]" aria-hidden>
                          {iniciales(f.nombre)}
                        </span>
                      )}
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-[12.5px] font-semibold text-[#16181d]">{f.nombre}</span>
                      <span className="num block truncate text-[11px] text-[#f97316]">{f.cedula || `${f.trabajos} trabajo(s)`}</span>
                    </span>
                  </div>
                </td>

                <td className="px-3 py-2 text-[12px] leading-tight text-[#3d4350]">{f.cargo}</td>
                <td className="px-3 py-2 text-[12px] text-[#3d4350]">{f.departamento}</td>
                <td className="num px-3 py-2 text-[12px] text-[#16181d]">{money(f.sueldoBase)}</td>

                <td className="num px-3 py-2 text-[12px] leading-tight text-[#16181d]">
                  {money(f.comisiones)}
                  {/* El override es dinero real: se muestra, no se esconde en el bruto. */}
                  {f.overrides > 0 && (
                    <span className="block text-[10.5px] text-[#7c3aed]">+ {money(f.overrides)} override</span>
                  )}
                </td>

                <td className="num px-3 py-2 text-[12px] text-[#16181d]">{money(f.devengado)}</td>
                <td className={cn('num px-3 py-2 text-[12px]', f.deducciones > 0 ? 'text-[#dc2626]' : 'text-[#9ba1ab]')}>
                  {f.deducciones > 0 ? `- ${money(f.deducciones)}` : '—'}
                </td>
                <td className="num px-3 py-2 text-[12px] font-semibold text-[#16181d]">{money(f.neto)}</td>

                <td className="px-3 py-2">
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[11px] font-medium',
                    f.liquidado ? 'bg-[#e8f7ee] text-[#15803d]' : 'bg-[#fff4ec] text-[#c2410c]',
                  )}>
                    {f.liquidado ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <Clock3 className="h-3 w-3" aria-hidden />}
                    {f.liquidado ? 'Liquidado' : 'Pendiente'}
                  </span>
                </td>

                <td className="relative px-3 py-2" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setMenu(m => (m === f.id ? null : f.id))}
                    aria-label={`Acciones para ${f.nombre}`}
                    aria-expanded={menu === f.id}
                    className="flex h-[28px] w-[28px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </button>

                  {menu === f.id && (
                    <div className="absolute right-3 top-[42px] z-20 w-[196px] overflow-hidden rounded-lg border border-[#e8eaed] bg-white py-1 shadow-lg">
                      <button
                        onClick={() => { setMenu(null); onDetalle(f); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-[#3d4350] hover:bg-[#f6f7f9]"
                      >
                        <Wallet className="h-4 w-4" aria-hidden />
                        Ver detalle
                      </button>
                      <button
                        onClick={() => { setMenu(null); onRecibo(f); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-[#3d4350] hover:bg-[#f6f7f9]"
                      >
                        <FileDown className="h-4 w-4" aria-hidden />
                        Descargar hoja
                      </button>
                      {canLiquidar && (
                        <button
                          onClick={() => { setMenu(null); onLiquidar(f); }}
                          disabled={f.neto === 0 && f.trabajos === 0}
                          className="flex w-full items-center gap-2.5 border-t border-[#f2f3f5] px-3 py-2 text-left text-[12.5px] font-semibold text-[#15803d] hover:bg-[#e8f7ee] disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden />
                          Liquidar
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}

            {!cargando && visibles.length === 0 && (
              <tr>
                <td colSpan={11} className="px-5 py-10 text-center text-[13px] text-[#8a909c]">
                  {filas.length === 0
                    ? 'No hay nómina que calcular en este período.'
                    : 'Ningún empleado coincide con esos filtros.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <p className="num min-w-0 flex-1 text-[12.5px] text-[#8a909c]">
          {filtrados.length === 0
            ? 'Sin empleados que mostrar'
            : `Mostrando ${desde + 1} a ${desde + visibles.length} de ${filtrados.length} empleados`}
        </p>

        <nav className="flex items-center gap-1.5" aria-label="Paginación de empleados">
          <BotonPagina onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1} label="Página anterior">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </BotonPagina>

          {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(n => (
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

          <BotonPagina onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas} label="Página siguiente">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </BotonPagina>
        </nav>

        <div className="relative shrink-0">
          <select
            value={porPagina}
            onChange={e => { setPorPagina(Number(e.target.value)); setPagina(1); }}
            aria-label="Empleados por página"
            className="h-[36px] appearance-none rounded-lg border border-[#e2e5ea] pl-3 pr-8 text-[12.5px] font-medium text-[#3d4350] outline-none focus:border-[#f97316]"
          >
            {[8, 16, 24, 50].map(n => (
              <option key={n} value={n}>{n} por página</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
        </div>
      </div>
    </section>
  );
}

function BotonPagina({
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
  label, valor, opciones, onChange,
}: {
  label: string; valor: string; opciones: readonly string[]; onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="relative h-[52px] w-[152px] shrink-0 rounded-lg border border-[#e2e5ea] px-3 pt-[7px]">
      <label htmlFor={id} className="block text-[10.5px] leading-none text-[#9ba1ab]">{label}</label>
      <select
        id={id}
        value={valor}
        onChange={e => onChange(e.target.value)}
        className="mt-[3px] w-full appearance-none bg-transparent pr-5 text-[13px] font-medium text-[#16181d] outline-none"
      >
        {opciones.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
    </div>
  );
}
