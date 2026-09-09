'use client';
import React from 'react';
import {
  User, Phone, Mail, MapPin, IdCard, Car, Wrench, Banknote, CalendarClock,
  TrendingUp, Copy, Check,
} from 'lucide-react';
import ModalBase from '@/components/ui/modales/ModalBase';
import HistorialServiciosCliente from '@/components/clientes/HistorialServiciosCliente';
import { SEGMENTOS, textoUltimaVisita, type DesempenoCliente } from '@/lib/clientes/desempeno';
import { formatearCedula } from '@/lib/clientes/identidad';
import { formatDate, getInitials } from '@/lib/utils';
import type { Cliente, Vehiculo } from '@/types';

/**
 * El perfil del cliente.
 *
 * Antes era un `Dialog` de Radix con el historial de servicios dentro. Radix,
 * en modo modal, pone `pointer-events: none` en el `body`, atrapa el foco y
 * bloquea el desplazamiento con `react-remove-scroll`. El detalle del servicio
 * se monta en un portal sobre el `body` —fuera del contenido de Radix—, así que
 * heredaba ese `pointer-events: none`: se veía encima, pero no se podía tocar
 * ni desplazar, y quedaba recortado. Un modal dentro de otro modal de Radix no
 * funciona.
 *
 * Con `ModalBase` no hay ese conflicto: es el mismo armazón que usan los demás
 * diálogos del sistema, va en su propio portal, se desplaza por dentro y deja
 * abrir otro modal encima.
 *
 * De paso, el perfil enseña lo que antes no se veía: la cédula —que se guardaba
 * pero no aparecía en ninguna parte— y el desempeño del cliente.
 */

const money = (n: number) =>
  `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  cliente: Cliente | null;
  onCerrar: () => void;
  vehiculos: Vehiculo[];
  desempeno?: DesempenoCliente | null;
}

/** Un dato del cliente, con su icono y la posibilidad de copiarlo. */
function Dato({
  icono: Icono, etiqueta, valor, copiable, destacado,
}: {
  icono: typeof Phone; etiqueta: string; valor?: string | null;
  copiable?: boolean; destacado?: boolean;
}) {
  const [copiado, setCopiado] = React.useState(false);
  const hay = !!(valor && String(valor).trim());

  const copiar = async () => {
    if (!hay) return;
    try {
      await navigator.clipboard.writeText(String(valor));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sin permiso de portapapeles no se puede hacer nada; no se avisa por
      // algo tan menor.
    }
  };

  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
        destacado && hay ? 'border-[#fed7aa] bg-[#fff8f3]' : 'border-[#e8eaed] bg-white'
      }`}
    >
      <Icono
        className={`h-4 w-4 shrink-0 ${destacado && hay ? 'text-[#f97316]' : 'text-[#8a909c]'}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[9.5px] font-black uppercase tracking-wider text-[#9ba1ab]">
          {etiqueta}
        </span>
        <span className={`block truncate text-[12.5px] ${
          hay ? 'font-semibold text-[#16181d]' : 'italic text-[#9ba1ab]'
        }`}>
          {hay ? valor : 'No registrada'}
        </span>
      </span>
      {copiable && hay && (
        <button
          type="button"
          onClick={copiar}
          title={`Copiar ${etiqueta.toLowerCase()}`}
          className="shrink-0 rounded-md p-1 text-[#9ba1ab] transition-colors hover:bg-[#f2f3f5] hover:text-[#5b616e]"
        >
          {copiado
            ? <Check className="h-3.5 w-3.5 text-[#15803d]" />
            : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

function Cifra({
  icono: Icono, etiqueta, valor, pie, color = 'text-[#16181d]',
}: {
  icono: typeof Wrench; etiqueta: string; valor: string; pie?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-[#e8eaed] bg-[#fafbfc] px-2.5 py-2">
      <span className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wider text-[#9ba1ab]">
        <Icono className="h-3 w-3" aria-hidden /> {etiqueta}
      </span>
      <span className={`mt-0.5 block text-[15px] font-black tabular-nums leading-none ${color}`}>
        {valor}
      </span>
      {pie && <span className="mt-0.5 block text-[10px] text-[#8a909c]">{pie}</span>}
    </div>
  );
}

export default function PerfilCliente({ cliente, onCerrar, vehiculos, desempeno }: Props) {
  if (!cliente) return null;

  const nombre = `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim();
  // La cédula se muestra normalizada: en la base conviven «11464383»,
  // «V-19734521» y hasta la palabra «N/A».
  const cedula = formatearCedula(cliente.cedula);
  const seg = desempeno ? SEGMENTOS[desempeno.segmento] : null;

  return (
    <ModalBase
      abierto
      onCerrar={onCerrar}
      titulo={nombre || 'Cliente'}
      subtitulo={`Cliente desde ${formatDate(cliente.created_at)}`}
      icono={<User className="h-[18px] w-[18px]" aria-hidden />}
      ancho="lg"
    >
      <div className="space-y-3">
        {/* Cabecera con la identidad y el segmento */}
        <div className="flex items-center gap-3 rounded-xl border border-[#e8eaed] bg-[#fafbfc] p-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#fff1e7] text-[15px] font-black text-[#f97316]">
            {getInitials(nombre)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-[#16181d]">{nombre}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {/* La cédula, arriba y visible: es el documento con el que se
                  factura, y hasta ahora no aparecía en ningún sitio. */}
              <span className={`rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums ${
                cedula
                  ? 'border-[#cbd5e1] bg-white text-[#334155]'
                  : 'border-dashed border-[#e2e8f0] bg-white italic text-[#9ba1ab]'
              }`}>
                {cedula || 'Sin cédula'}
              </span>
              {seg && (
                <span
                  title={seg.descripcion}
                  className={`rounded-md border px-1.5 py-0.5 text-[10.5px] font-black uppercase tracking-wide ${seg.claseChip}`}
                >
                  {seg.label}
                </span>
              )}
            </span>
          </span>
        </div>

        {/* Desempeño */}
        {desempeno && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Cifra
                icono={Wrench} etiqueta="Servicios"
                valor={String(desempeno.servicios)}
                pie={desempeno.serviciosPorAno > 0 ? `${desempeno.serviciosPorAno}/año` : undefined}
              />
              <Cifra
                icono={Banknote} etiqueta="Facturado"
                valor={money(desempeno.total)}
                pie={desempeno.ticketMedio > 0 ? `${money(desempeno.ticketMedio)} de media` : undefined}
                color="text-[#15803d]"
              />
              <Cifra
                icono={CalendarClock} etiqueta="Última visita"
                valor={textoUltimaVisita(desempeno.diasSinVenir)}
                pie={desempeno.ultimo || undefined}
              />
              <Cifra
                icono={TrendingUp} etiqueta="Puntuación"
                valor={`${desempeno.puntos}`}
                pie="sobre 100"
                color="text-[#f97316]"
              />
            </div>
            {seg?.accionable && (
              <p className={`rounded-xl border px-3 py-2 text-[11.5px] leading-snug ${seg.claseChip}`}>
                <strong className="font-bold">{seg.label}:</strong> {seg.descripcion}
              </p>
            )}
          </>
        )}

        {/* Datos de contacto */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Dato icono={IdCard} etiqueta="Cédula" valor={cedula} copiable destacado />
          <Dato icono={Phone} etiqueta="Teléfono" valor={cliente.telefono} copiable />
          <Dato icono={Mail} etiqueta="Email" valor={cliente.email} copiable />
          <Dato icono={MapPin} etiqueta="Dirección" valor={cliente.direccion} />
        </div>

        {/* Vehículos */}
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#9ba1ab]">
            <Car className="h-3.5 w-3.5" aria-hidden /> Vehículos ({vehiculos.length})
          </p>
          <div className="space-y-1.5">
            {vehiculos.map(v => (
              <div
                key={v.id}
                className="flex items-center gap-2 rounded-xl border border-[#eef0f3] bg-white px-3 py-2"
              >
                <Car className="h-3.5 w-3.5 shrink-0 text-[#f97316]" aria-hidden />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[12.5px] font-semibold text-[#16181d]">
                    {v.marca} {v.modelo} {v.anio ? `(${v.anio})` : ''}
                  </span>
                  <span className="block truncate text-[10.5px] text-[#8a909c]">
                    {[v.color, v.vin ? `VIN ${v.vin}` : null].filter(Boolean).join(' · ') || 'Sin más datos'}
                  </span>
                </span>
                <span className="shrink-0 rounded-md bg-[#fff1e7] px-1.5 py-0.5 font-mono text-[10.5px] font-bold uppercase text-[#c2410c]">
                  {v.placa}
                </span>
              </div>
            ))}
            {vehiculos.length === 0 && (
              <p className="py-2 text-center text-[11.5px] italic text-[#9ba1ab]">
                Sin vehículos registrados.
              </p>
            )}
          </div>
        </div>

        {/* Historial de servicios. Ahora sí se puede pinchar y desplazar: el
            detalle se abre sobre este modal en vez de quedar bloqueado. */}
        <div className="border-t border-[#e8eaed] pt-2.5">
          <HistorialServiciosCliente clienteId={cliente.id} />
        </div>

        {cliente.notas && (
          <div className="rounded-xl border border-[#e8eaed] bg-[#fafbfc] px-3 py-2.5">
            <p className="text-[9.5px] font-black uppercase tracking-wider text-[#9ba1ab]">Notas</p>
            <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-snug text-[#3d4350]">
              {cliente.notas}
            </p>
          </div>
        )}
      </div>
    </ModalBase>
  );
}
