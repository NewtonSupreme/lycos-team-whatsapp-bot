import { Metadata } from 'next';
import Link from 'next/link';
import { FileText, ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Términos y Condiciones | Lycos Team',
  description: 'Términos y condiciones del servicio de Lycos Team, taller automotriz en San Antonio de los Altos, Miranda, Venezuela.',
};

export default function TerminosPage() {
  const fecha = '30 de marzo de 2026';
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-xl border-b border-border/30">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Términos</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-4 py-10 w-full">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>
            Términos y Condiciones
          </h1>
          <p className="text-muted-foreground text-sm">Última actualización: {fecha}</p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed">
          {/* Intro */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">1. Aceptación de los términos</h2>
            <p className="text-muted-foreground">
              Al utilizar los servicios de <strong className="text-foreground">Lycos Team</strong> — ya sea de forma
              presencial en nuestro taller, a través de nuestro asistente virtual de WhatsApp, o mediante nuestra
              plataforma web — usted acepta cumplir y estar sujeto a estos Términos y Condiciones. Si no está de
              acuerdo con alguno de estos términos, le rogamos que no utilice nuestros servicios.
            </p>
          </section>

          {/* Servicios */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">2. Descripción de los servicios</h2>
            <p className="text-muted-foreground mb-3">Lycos Team ofrece los siguientes servicios automotrices:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                'Mecánica general y ligera',
                'Sistema de escape (fabricación propia)',
                'Silenciadores, resonadores, flexibles',
                'Electrónica y autotronica automotriz',
                'Alineación y balanceo',
                'Frenos y suspensión',
                'Cauchos y monturas',
                'Catalizador (limpieza/reemplazo)',
                'Aire acondicionado vehicular',
                'Autolavado y detailing',
                'Latonería y pintura',
                'Certificado médico vehicular',
                'Renovación de RCV',
                'Inventario de repuestos',
                'Grúa (previa consulta)',
                'Estética integral',
              ].map(s => (
                <div key={s} className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-primary">🔧</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground mt-4">
              Los servicios están sujetos a disponibilidad, condiciones del vehículo e inventario. Nos reservamos
              el derecho de rechazar servicios que excedan nuestra capacidad técnica o que representen riesgos.
            </p>
          </section>

          {/* Precios */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">3. Precios y pagos</h2>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-0.5">$</span>
                <span>Los precios se expresan en <strong className="text-foreground">dólares estadounidenses (USD)</strong> y se cobran en bolívares (VES) a la tasa del BCV al momento del pago, salvo que se indique expresamente lo contrario.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-0.5">$</span>
                <span>Algunos servicios tienen <strong className="text-foreground">promoción en divisas</strong>: el precio base es en dólares internacionales (Binance/P2P) convertido a tasa BCV. El precio final siempre se expresa en USD a tasa BCV.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-0.5">$</span>
                <span>Los presupuestos emitidos por el asistente virtual son orientativos. El precio final se confirma tras la revisión física del vehículo en el taller.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-0.5">$</span>
                <span>Aceptamos pago en efectivo (USD o VES), transferencia bancaria, pago móvil y Cashea (según disponibilidad). El IVA (16%) aplica según la ley venezolana.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-0.5">$</span>
                <span>Para servicios con Cashea: el IVA se suma al precio total antes de calcular la inicial. El saldo restante se cancela en 3 cuotas cada 14 días.</span>
              </li>
            </ul>
          </section>

          {/* Citas */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">4. Citas y reservaciones</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>Las citas se pueden agendar de lunes a sábado de 8:00 AM a 5:00 PM. No atendemos domingos.</span></li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>Para agendar una cita es necesario proporcionar: nombre completo, número de contacto, marca y modelo del vehículo, servicio requerido, y fecha y hora deseada.</span></li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>Las citas agendadas a través del asistente virtual de WhatsApp quedan registradas en nuestro sistema, sujetas a confirmación por parte del taller.</span></li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>Le rogamos notificar con al menos <strong className="text-foreground">2 horas de anticipación</strong> si necesita cancelar o reprogramar su cita.</span></li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>La revisión visual del vehículo al llegar al taller es <strong className="text-foreground">gratuita</strong>.</span></li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>Los tiempos de servicio son estimados. Trabajos complejos pueden requerir más tiempo del acordado inicialmente.</span></li>
            </ul>
          </section>

          {/* Garantías */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">5. Garantías de servicio</h2>
            <p className="text-muted-foreground mb-3">
              Ofrecemos garantía sobre los trabajos realizados bajo las siguientes condiciones:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span><span>La garantía aplica para defectos de mano de obra directamente relacionados con el servicio prestado.</span></li>
              <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span><span>Los silenciadores y piezas de escape de fabricación propia tienen garantía de <strong className="text-foreground">6 meses</strong> por defectos de fabricación.</span></li>
              <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span><span>Los repuestos e insumos instalados están sujetos a la garantía del fabricante.</span></li>
              <li className="flex items-start gap-2"><span className="text-yellow-400 mt-0.5">△</span><span>La garantía <strong className="text-foreground">no aplica</strong> por daños causados por mal uso, accidentes, modificaciones no autorizadas o desgaste normal.</span></li>
              <li className="flex items-start gap-2"><span className="text-yellow-400 mt-0.5">△</span><span>Para hacer válida la garantía, el cliente debe presentar el comprobante de pago del servicio original.</span></li>
            </ul>
          </section>

          {/* Responsabilidades */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">6. Responsabilidades y limitaciones</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>Lycos Team no se hace responsable por daños preexistentes al vehículo que no sean reportados antes del inicio del servicio.</span></li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>Las estimaciones de precio proporcionadas por el asistente virtual son orientativas y no constituyen una cotización formal.</span></li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>El cliente es responsable de proporcionar información veraz y completa sobre el vehículo y el problema a resolver.</span></li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>No nos responsabilizamos por objetos personales dejados dentro del vehículo durante el servicio.</span></li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>La disponibilidad del asistente virtual de WhatsApp puede verse afectada por mantenimientos de la plataforma de Meta o fallos técnicos ajenos a nuestra responsabilidad.</span></li>
            </ul>
          </section>

          {/* WhatsApp */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">7. Uso del asistente virtual WhatsApp</h2>
            <p className="text-muted-foreground mb-3">
              Al interactuar con nuestro asistente virtual de WhatsApp, usted acepta que:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">ℹ</span><span>Las respuestas del asistente son generadas por Inteligencia Artificial y pueden requerir confirmación humana para casos complejos.</span></li>
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">ℹ</span><span>No debe compartir información confidencial sensible (contraseñas, datos bancarios completos) a través del chat.</span></li>
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">ℹ</span><span>El historial de conversación puede ser revisado por el equipo de Lycos Team para mejorar la calidad del servicio.</span></li>
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">ℹ</span><span>Está prohibido usar el asistente para actividades ilícitas, spam, o envío de contenido ofensivo.</span></li>
            </ul>
          </section>

          {/* Propiedad */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">8. Propiedad intelectual</h2>
            <p className="text-muted-foreground">
              El nombre <strong className="text-foreground">Lycos Team</strong>, logotipos, sistema CRM, contenido del
              asistente virtual, conocimiento técnico plasmado en la base de datos, y cualquier material asociado son
              propiedad exclusiva de Lycos Team. Queda prohibida su reproducción, distribución o uso no autorizado sin
              consentimiento previo y por escrito.
            </p>
          </section>

          {/* Modificaciones */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">9. Modificaciones a los términos</h2>
            <p className="text-muted-foreground">
              Lycos Team se reserva el derecho de modificar estos Términos y Condiciones en cualquier momento.
              Los cambios entran en vigencia inmediatamente después de su publicación. El uso continuado de nuestros
              servicios tras la publicación de cambios implica la aceptación de los nuevos términos.
            </p>
          </section>

          {/* Ley */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">10. Ley aplicable</h2>
            <p className="text-muted-foreground">
              Estos Términos y Condiciones se rigen por las leyes de la <strong className="text-foreground">República Bolivariana de Venezuela</strong>.
              Cualquier disputa que surja en relación con estos términos se resolverá de conformidad con la legislación
              venezolana aplicable, incluyendo la Ley de Protección al Consumidor y al Usuario.
            </p>
          </section>

          {/* CTA */}
          <section className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center">
            <h2 className="text-base font-semibold mb-2">¿Tienes alguna pregunta?</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Estamos disponibles de lunes a sábado de 8:00 AM a 5:00 PM.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="https://wa.me/584265903033"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium hover:bg-green-500/20 transition-colors"
              >
                📱 WhatsApp Lycos Team
              </a>
              <a
                href="mailto:admin@lycosteam.com"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
              >
                ✉️ admin@lycosteam.com
              </a>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/20 py-4 text-center text-xs text-muted-foreground">
        © 2026 Lycos Team · San Antonio de los Altos, Miranda, Venezuela ·{' '}
        <Link href="/privacidad" className="hover:text-foreground transition-colors">Política de Privacidad</Link>
      </footer>
    </div>
  );
}
