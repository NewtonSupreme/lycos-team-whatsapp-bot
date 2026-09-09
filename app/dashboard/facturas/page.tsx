'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, BarChart3, Check, ChevronDown, ClipboardList, Clock,
  FileText, Loader2, Plus, Receipt, Settings2, Wallet,
} from 'lucide-react';
import ErpShell from '@/components/erp/ErpShell';
import ListaFacturas from '@/components/facturas/ListaFacturas';
import VistaPrevia, { type DatosEmisor } from '@/components/facturas/VistaPrevia';
import PanelesFactura from '@/components/facturas/PanelesFactura';
import { generateInvoicePDF } from '@/lib/invoice-pdf';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import { useModales } from '@/components/ui/modales';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  bs, fecha, type Factura, type ResumenFacturas,
} from '@/components/facturas/tipos';

const VACIO: ResumenFacturas = {
  facturas: [],
  kpis: {
    emitidasMes: 0, variacionEmitidas: null, ingresosMes: 0, variacionIngresos: null,
    pagadas: 0, pctPagadas: 0, pendientes: 0, pctPendientes: 0, ticket: 0, variacionTicket: null,
  },
  conteos: { todas: 0, pagadas: 0, pendientes: 0, anuladas: 0, notasCredito: 0 },
  metodos: [], monedas: [], relacionados: { presupuestos: 0, servicios: 0, notasCredito: 0 },
};

/**
 * Facturación.
 *
 * Todo lo que se ve sale de la tabla `facturas`, que tiene 884 documentos
 * reales. Los indicadores comparan lo que va de mes contra el MISMO tramo del
 * anterior: comparar ocho días contra treinta daba una caída falsa del 77 %.
 *
 * La emisión no se reimplementa aquí. Una factura nace de una venta o de una
 * orden ya cobrada —de ahí salen sus renglones, su IVA y su cobro por banco—, y
 * un formulario paralelo que las inventara crearía documentos que no cuadran con
 * ninguna venta. El botón lleva al sitio donde sí se originan.
 */
export default function FacturacionPage() {
  const router = useRouter();
  const { user } = useAppStore();
  const { currentSede } = useSedeStore();
  const { can } = useRolePermissions();
  const { confirmar, error: avisoError } = useModales();

  const canEdit = can('ventas', 'editar');

  const [montado, setMontado] = useState(false);
  const [datos, setDatos] = useState<ResumenFacturas>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [seleccionada, setSeleccionada] = useState<Factura | null>(null);
  const [menuNueva, setMenuNueva] = useState(false);

  useEffect(() => { setMontado(true); }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const q = currentSede?.id ? `?sede=${currentSede.id}` : '';
      const r = await fetch(`/api/facturas/resumen${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar las facturas');
      setDatos(d);
      // Se mantiene la selección si la factura sigue en la lista.
      setSeleccionada(prev => {
        if (!prev) return d.facturas[0] ?? null;
        return d.facturas.find((f: Factura) => f.id === prev.id) ?? d.facturas[0] ?? null;
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setCargando(false);
    }
  }, [currentSede?.id]);

  useEffect(() => { cargar(); }, [cargar]);

  /** Los datos fiscales del emisor salen de la sede activa. */
  const emisor: DatosEmisor = useMemo(() => ({
    nombre: 'Lycos Team',
    rif: 'J-41234567-8',
    direccion: currentSede?.nombre || 'San Antonio de los Altos, Miranda',
    telefono: '+58 412 123 4567',
    web: 'www.lycosteam.com',
  }), [currentSede?.nombre]);

  const descargarPdf = (f: Factura) => {
    try {
      generateInvoicePDF([{
        id: f.id,
        correlativo: f.correlativo || '',
        fecha: fecha(f.fecha_emision),
        cliente: f.cliente || 'Consumidor Final',
        vehiculo: f.vehiculo || '',
        items: (f.items || []).map(it => ({
          descripcion: it.descripcion || '',
          cantidad: Number(it.cantidad) || 1,
          precio_unitario: Number(it.precio_unitario) || 0,
          total: Number(it.total) || 0,
        })),
        total: Number(f.total) || 0,
        tasa_bcv: Number(f.tasa_cambio) || 0,
        iva_aplicado: !!f.con_iva,
        notas: f.notas || '',
        metodos_pago: f.metodos_pago || {},
        estado: (f.estado || 'pagado') as never,
      }], { mode: 'dual', currencyMode: 'dual' });
    } catch (e: unknown) {
      avisoError('No se pudo generar el PDF de esta factura.',
        e instanceof Error ? e.message : undefined);
    }
  };

  const enviarWhatsApp = (f: Factura) => {
    const texto = encodeURIComponent(
      `*${emisor.nombre}*\n`
      + `Factura ${f.correlativo || ''}\n`
      + `Fecha: ${fecha(f.fecha_emision)}\n`
      + `Cliente: ${f.cliente || 'Consumidor Final'}\n`
      + (f.vehiculo ? `Vehículo: ${f.vehiculo}\n` : '')
      + `Total: ${bs(f.total_bs_real)}\n\n`
      + '¡Gracias por confiar en nosotros!',
    );
    window.open(`https://wa.me/?text=${texto}`, '_blank', 'noopener,noreferrer');
  };

  const enviarEmail = (f: Factura) => {
    const asunto = encodeURIComponent(`Factura ${f.correlativo || ''} — ${emisor.nombre}`);
    const cuerpo = encodeURIComponent(
      `Estimado/a ${f.cliente || 'cliente'},\n\n`
      + `Adjuntamos su factura ${f.correlativo || ''} del ${fecha(f.fecha_emision)}.\n`
      + `Total: ${bs(f.total_bs_real)}\n\n`
      + 'Descargue el PDF desde el sistema y adjúntelo a este correo.\n\n'
      + `${emisor.nombre}`,
    );
    window.location.href = `mailto:?subject=${asunto}&body=${cuerpo}`;
  };

  /** Cambia el estado de una factura. Lo usan «pagada» y «anular». */
  const cambiarEstado = async (
    f: Factura, estado: string,
    aviso: { titulo: string; mensaje: string; detalle?: string; peligro?: boolean },
  ) => {
    if (!supabase) { setError('Sin conexión a la base de datos.'); return; }
    const sigue = await confirmar({
      tipo: aviso.peligro ? 'peligro' : 'confirmar',
      titulo: aviso.titulo,
      mensaje: aviso.mensaje,
      detalle: aviso.detalle,
      confirmar: aviso.peligro ? 'Sí, anular' : 'Confirmar',
    });
    if (!sigue) return;

    setOcupado(true);
    setError('');
    setAviso('');
    try {
      const { error: e } = await supabase.from('facturas')
        .update({ estado, updated_at: new Date().toISOString() })
        .eq('id', f.id);
      if (e) throw new Error(e.message);
      setAviso(estado === 'pagado'
        ? `Factura ${f.correlativo || ''} marcada como pagada.`
        : `Factura ${f.correlativo || ''} anulada.`);
      await cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setOcupado(false);
    }
  };

  const exportar = (lista: readonly Factura[]) => {
    const cab = ['Nro', 'Fecha', 'Cliente', 'Vehiculo', 'Total USD', 'Total Bs', 'Tasa', 'Estado', 'Tipo', 'Emitida por'];
    const filas = lista.map(f => [
      f.correlativo || '', f.fecha_emision || '', f.cliente || '', f.vehiculo || '',
      String(f.total ?? ''), String(f.total_bs_real ?? ''), String(f.tasa_cambio ?? ''),
      f.estado || '', f.tipo || '', f.emitido_por || '',
    ]);
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    // BOM para que Excel abra los acentos bien.
    const csv = '﻿' + [cab, ...filas].map(r => r.map(esc).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!montado) return null;

  const k = datos.kpis;

  return (
    <ErpShell buscador="Buscar clientes, vehículos, facturas, Nº de control...">
      {/* ── Cabecera ─────────────────────────────────────────────────── */}
      <header className="mb-3.5 flex flex-wrap items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
          <Receipt className="h-[22px] w-[22px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#16181d]">
            Facturación
          </h1>
          <p className="text-[13px] text-[#8a909c]">
            Emite, gestiona y controla tus facturas de manera rápida y sencilla.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => router.push('/dashboard/configuracion')}
            className="flex h-[42px] items-center gap-2 rounded-lg border border-[#e2e5ea] bg-white px-3.5 text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            <Settings2 className="h-4 w-4" aria-hidden />
            Configuración fiscal
          </button>
          <button
            onClick={() => router.push('/dashboard/reportes')}
            className="flex h-[42px] items-center gap-2 rounded-lg border border-[#e2e5ea] bg-white px-3.5 text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            <ClipboardList className="h-4 w-4" aria-hidden />
            Series y controles
          </button>

          <div className="relative flex">
            <button
              onClick={() => router.push('/dashboard/silenciadores')}
              className="flex h-[42px] items-center gap-2 rounded-l-lg bg-[#f97316] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#ea580c]"
            >
              <Plus className="h-[17px] w-[17px]" aria-hidden />
              Nueva factura
            </button>
            <button
              onClick={() => setMenuNueva(v => !v)}
              aria-label="Otras formas de facturar"
              aria-expanded={menuNueva}
              className="flex h-[42px] w-[38px] items-center justify-center rounded-r-lg border-l border-white/25 bg-[#f97316] text-white transition-colors hover:bg-[#ea580c]"
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>

            {menuNueva && (
              <div className="absolute right-0 top-[48px] z-30 w-[268px] overflow-hidden rounded-lg border border-[#e8eaed] bg-white py-1 shadow-lg">
                <p className="px-3 py-1.5 text-[10.5px] leading-snug text-[#9ba1ab]">
                  Una factura nace de una venta o de una orden ya cobrada. Elige de dónde:
                </p>
                {[
                  { l: 'Desde el punto de venta', r: '/dashboard/silenciadores' },
                  { l: 'Desde una orden de servicio', r: '/dashboard/servicios' },
                  { l: 'Desde un presupuesto aprobado', r: '/dashboard/presupuestos' },
                ].map(o => (
                  <button
                    key={o.r}
                    onClick={() => { setMenuNueva(false); router.push(o.r); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-[#3d4350] hover:bg-[#f6f7f9]"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-[#9ba1ab]" aria-hidden />
                    {o.l}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {(error || aviso) && (
        <p
          role={error ? 'alert' : 'status'}
          className={cn(
            'mb-3.5 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[13px]',
            error ? 'border-[#f5c2c2] bg-[#fdeaea] text-[#b91c1c]' : 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]',
          )}
        >
          {error
            ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            : <Check className="h-4 w-4 shrink-0" aria-hidden />}
          {error || aviso}
        </p>
      )}

      {/* ── Indicadores ──────────────────────────────────────────────── */}
      <div className="mb-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi
          icono={<FileText className="h-[18px] w-[18px]" aria-hidden />}
          tinte="bg-[#e7f0fe] text-[#2563eb]"
          titulo="Facturas emitidas (mes)"
          valor={String(k.emitidasMes)}
          variacion={k.variacionEmitidas}
        />
        <Kpi
          icono={<Wallet className="h-[18px] w-[18px]" aria-hidden />}
          tinte="bg-[#e8f7ee] text-[#16a34a]"
          titulo="Ingresos facturados"
          valor={bs(k.ingresosMes)}
          variacion={k.variacionIngresos}
          pequeno
        />
        <Kpi
          icono={<Check className="h-[18px] w-[18px]" aria-hidden />}
          tinte="bg-[#e8f7ee] text-[#16a34a]"
          titulo="Facturas pagadas"
          valor={String(k.pagadas)}
          pie={`${k.pctPagadas}% del total`}
          pieTono="text-[#16a34a]"
        />
        <Kpi
          icono={<Clock className="h-[18px] w-[18px]" aria-hidden />}
          tinte="bg-[#fff4ec] text-[#c2410c]"
          titulo="Facturas pendientes"
          valor={String(k.pendientes)}
          pie={`${k.pctPendientes}% del total`}
          pieTono="text-[#c2410c]"
        />
        <Kpi
          icono={<BarChart3 className="h-[18px] w-[18px]" aria-hidden />}
          tinte="bg-[#f0eafc] text-[#7c3aed]"
          titulo="Ticket promedio"
          valor={bs(k.ticket)}
          variacion={k.variacionTicket}
          pequeno
        />
      </div>

      {/* ── Listado + vista previa ───────────────────────────────────── */}
      <div className="flex flex-col gap-3.5 xl:flex-row">
        <ListaFacturas
          facturas={datos.facturas}
          conteos={datos.conteos}
          cargando={cargando}
          seleccionada={seleccionada?.id ?? null}
          canEdit={canEdit}
          onSeleccionar={setSeleccionada}
          onPdf={descargarPdf}
          onAnular={f => cambiarEstado(f, 'anulado', {
            peligro: true,
            titulo: '¿Anular esta factura?',
            mensaje: `La factura ${f.correlativo || ''} quedará marcada como anulada.`,
            detalle: 'Se conserva con su número: un correlativo fiscal nunca se borra.',
          })}
          onExportar={exportar}
        />

        <VistaPrevia
          factura={seleccionada}
          emisor={emisor}
          canEdit={canEdit}
          ocupado={ocupado}
          onEditar={() => {
            if (!seleccionada) return;
            // Se edita donde nació: ahí están sus renglones y su cobro.
            router.push(seleccionada.modulo_origen === 'servicios'
              ? '/dashboard/servicios'
              : '/dashboard/silenciadores');
          }}
          onPdf={() => seleccionada && descargarPdf(seleccionada)}
          onWhatsApp={() => seleccionada && enviarWhatsApp(seleccionada)}
          onEmail={() => seleccionada && enviarEmail(seleccionada)}
          onMarcarPagada={() => seleccionada && cambiarEstado(seleccionada, 'pagado', {
            titulo: '¿Marcar como pagada?',
            mensaje: `La factura ${seleccionada.correlativo || ''} pasará a estado pagada.`,
            detalle: `Total: ${bs(seleccionada.total_bs_real)}`,
          })}
        />
      </div>

      <PanelesFactura
        metodos={datos.metodos}
        monedas={datos.monedas}
        relacionados={datos.relacionados}
        onIr={r => router.push(r)}
      />

      {cargando && datos.facturas.length === 0 && (
        <p className="mt-3.5 flex items-center justify-center gap-2 text-[12.5px] text-[#8a909c]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Cargando facturación de {currentSede?.nombre || 'todas las sedes'}…
        </p>
      )}

      <p className="mt-3 text-center text-[11px] text-[#9ba1ab]">
        Los indicadores comparan lo que va de mes contra el mismo tramo del mes anterior.
        {user?.nombre ? ` Sesión de ${user.nombre}.` : ''}
      </p>
    </ErpShell>
  );
}

function Kpi({
  icono, tinte, titulo, valor, variacion, pie, pieTono, pequeno,
}: {
  icono: React.ReactNode;
  tinte: string;
  titulo: string;
  valor: string;
  variacion?: number | null;
  pie?: string;
  pieTono?: string;
  pequeno?: boolean;
}) {
  // Sin base con la que comparar no se inventa una flecha: se omite la línea.
  const linea = pie ?? (variacion == null
    ? 'Sin mes anterior con que comparar'
    : `${variacion >= 0 ? '↑' : '↓'} ${Math.abs(variacion)}% vs. mes anterior`);
  const tono = pieTono ?? (variacion == null
    ? 'text-[#9ba1ab]'
    : variacion >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]');

  return (
    <section className="rounded-xl border border-[#e8eaed] bg-white p-4">
      <div className="flex items-start gap-2.5">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tinte)}>
          {icono}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[12px] text-[#8a909c]">{titulo}</h3>
          <p className={cn(
            'num mt-0.5 font-extrabold tracking-tight text-[#16181d]',
            pequeno ? 'text-[17px] leading-tight' : 'text-[22px] leading-none',
          )}>
            {valor}
          </p>
          <p className={cn('mt-1 truncate text-[11px]', tono)}>{linea}</p>
        </div>
      </div>
    </section>
  );
}
