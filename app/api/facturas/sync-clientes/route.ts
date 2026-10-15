import { authorize } from '@/lib/auth-server';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const auth = await authorize('ventas', 'editar');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Supabase no configurado' }, { status: 500 });
  }

  const results: { factura_id: string; correlativo: string; cliente_anterior: string; cliente_nuevo: string; }[] = [];
  const errors: { factura_id: string; error: string; }[] = [];
  let updated = 0;
  let skipped = 0;

  // ── 1. New format: referencia_tabla = 'servicios' ──
  const { data: facturasByServicio } = await supabase
    .from('facturas')
    .select('id, correlativo, cliente, referencia_id')
    .eq('modulo_origen', 'servicios')
    .eq('referencia_tabla', 'servicios');

  if (facturasByServicio) {
    for (const factura of facturasByServicio) {
      if (!factura.referencia_id) { skipped++; continue; }
      const { data: servicio } = await supabase
        .from('servicios')
        .select('nombre_cliente')
        .eq('id', factura.referencia_id)
        .maybeSingle();
      if (!servicio) { skipped++; continue; }

      const nombreActual = (servicio.nombre_cliente || '').trim();
      if (!nombreActual || nombreActual === factura.cliente) { skipped++; continue; }

      const { error } = await supabase
        .from('facturas')
        .update({ cliente: nombreActual, updated_at: new Date().toISOString() })
        .eq('id', factura.id);

      if (error) {
        errors.push({ factura_id: factura.id, error: error.message });
      } else {
        updated++;
        results.push({ factura_id: factura.id, correlativo: factura.correlativo, cliente_anterior: factura.cliente, cliente_nuevo: nombreActual });
      }
    }
  }

  // ── 2. Legacy format: referencia_tabla = 'ventas_dia' ──
  const { data: facturasByVenta } = await supabase
    .from('facturas')
    .select('id, correlativo, cliente, referencia_id')
    .eq('modulo_origen', 'servicios')
    .eq('referencia_tabla', 'ventas_dia');

  if (facturasByVenta) {
    for (const factura of facturasByVenta) {
      const ventaId = factura.referencia_id;
      if (!ventaId) { skipped++; continue; }

      const { data: ventaRec } = await supabase
        .from('ventas_dia')
        .select('cliente, notas')
        .eq('id', ventaId)
        .maybeSingle();

      if (!ventaRec) { skipped++; continue; }

      const notas = (ventaRec.notas || '').trim();
      let matchedServicio: { id: string; nombre_cliente: string } | null = null;

      // Strategy A: match by descripcion (notas could be "descripcion | tipo_personalizado" or just "descripcion")
      if (notas && notas !== 'Servicio de taller') {
        // Split by " | " to handle new format: "descripcion | tipo_personalizado"
        const parts = notas.split(' | ').map((s: string) => s.trim()).filter(Boolean);

        // Try matching by descripcion (first part)
        for (const part of parts) {
          const { data: serviciosByPart } = await supabase
            .from('servicios')
            .select('id, nombre_cliente')
            .or(`descripcion.eq.${part.replace(/'/g, "''")},tipo_personalizado.eq.${part.replace(/'/g, "''")}`)
            .limit(2);
          if (serviciosByPart && serviciosByPart.length === 1) {
            matchedServicio = serviciosByPart[0];
            break;
          }
        }
      }

      if (matchedServicio) {
        const nombreActual = (matchedServicio.nombre_cliente || '').trim();
        if (nombreActual && nombreActual !== factura.cliente) {
          const { error } = await supabase
            .from('facturas')
            .update({
              cliente: nombreActual,
              referencia_id: matchedServicio.id,
              referencia_tabla: 'servicios',
              updated_at: new Date().toISOString()
            })
            .eq('id', factura.id);
          if (error) {
            errors.push({ factura_id: factura.id, error: error.message });
          } else {
            updated++;
            results.push({ factura_id: factura.id, correlativo: factura.correlativo, cliente_anterior: factura.cliente, cliente_nuevo: nombreActual });
          }
          continue;
        }
      }

      skipped++;
    }
  }

  // ── 3. Scan completed servicios for direct reference (new format) mismatches ──
  const { data: allServicios } = await supabase
    .from('servicios')
    .select('id, nombre_cliente, descripcion, tipo_personalizado')
    .eq('estado', 'completada')
    .limit(500);

  if (allServicios) {
    for (const servicio of allServicios) {
      const nombreActual = (servicio.nombre_cliente || '').trim();
      if (!nombreActual) continue;

      const { data: existing } = await supabase
        .from('facturas')
        .select('id, cliente, correlativo')
        .eq('referencia_id', servicio.id)
        .eq('modulo_origen', 'servicios')
        .maybeSingle();

      if (existing && existing.cliente !== nombreActual) {
        const { error } = await supabase
          .from('facturas')
          .update({ cliente: nombreActual, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) {
          errors.push({ factura_id: existing.id, error: error.message });
        } else {
          updated++;
          results.push({ factura_id: existing.id, correlativo: existing.correlativo, cliente_anterior: existing.cliente, cliente_nuevo: nombreActual });
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    updated,
    skipped,
    errors: errors.length,
    details: results,
    errorDetails: errors,
  });
}
