import { Metadata } from 'next';
import Link from 'next/link';
import { Shield, ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Política de Privacidad | Lycos Team',
  description: 'Política de privacidad y protección de datos personales de Lycos Team, taller automotriz en San Antonio de los Altos, Miranda, Venezuela.',
};

export default function PrivacidadPage() {
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
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Privacidad</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-4 py-10 w-full">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>
            Política de Privacidad
          </h1>
          <p className="text-muted-foreground text-sm">Última actualización: {fecha}</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-8 text-sm leading-relaxed">
          {/* Intro */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">1. Quiénes somos</h2>
            <p className="text-muted-foreground">
              <strong className="text-foreground">Lycos Team</strong> es un taller automotriz profesional ubicado en
              San Antonio de los Altos, Municipio Los Salias, Estado Miranda, Venezuela. Ofrecemos servicios de
              mecánica, electrónica, sistema de escape, latonería, cauchos, alineación y más. Nuestro sistema digital
              incluye una plataforma CRM web y un asistente virtual vía WhatsApp.
            </p>
            <p className="text-muted-foreground mt-3">
              En Lycos Team nos comprometemos a proteger la privacidad de nuestros clientes y usuarios. Esta política
              describe cómo recopilamos, utilizamos y protegemos su información personal.
            </p>
          </section>

          {/* Datos que recopilamos */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">2. Datos que recopilamos</h2>
            <p className="text-muted-foreground mb-3">Podemos recopilar los siguientes tipos de información:</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span><strong className="text-foreground">Datos de identificación:</strong> Nombre, apellido, número de cédula o pasaporte (cuando aplique).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span><strong className="text-foreground">Datos de contacto:</strong> Número de teléfono (WhatsApp), dirección de correo electrónico.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span><strong className="text-foreground">Información vehicular:</strong> Marca, modelo, año, placa del vehículo para prestar servicios de taller.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span><strong className="text-foreground">Historial de servicios:</strong> Trabajos realizados, diagnósticos, presupuestos y citas agendadas.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span><strong className="text-foreground">Comunicaciones:</strong> Mensajes enviados a través de WhatsApp Business con nuestro asistente virtual.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span><strong className="text-foreground">Imágenes:</strong> Fotografías de vehículos enviadas para diagnóstico remoto (con tu consentimiento implícito al enviarlas).</span>
              </li>
            </ul>
          </section>

          {/* Finalidad */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">3. Finalidad del tratamiento de datos</h2>
            <p className="text-muted-foreground mb-3">Utilizamos sus datos personales para:</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span><span>Gestionar y coordinar citas y servicios de taller.</span></li>
              <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span><span>Brindar atención al cliente a través de WhatsApp y otros canales.</span></li>
              <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span><span>Enviar recordatorios de citas y notificaciones sobre el estado de su vehículo.</span></li>
              <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span><span>Mejorar la calidad de nuestros servicios y experiencia del cliente.</span></li>
              <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span><span>Cumplir con obligaciones legales y fiscales aplicables en Venezuela.</span></li>
              <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span><span>Registrar historial de servicios para futuras visitas al taller.</span></li>
            </ul>
          </section>

          {/* WhatsApp & IA */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">4. Asistente Virtual WhatsApp e Inteligencia Artificial</h2>
            <p className="text-muted-foreground mb-3">
              Nuestro sistema utiliza un <strong className="text-foreground">asistente virtual con Inteligencia Artificial (IA)</strong> integrado
              con la API oficial de WhatsApp Business de Meta. Al comunicarte con nosotros por WhatsApp, debes saber que:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">ℹ</span><span>Los mensajes son procesados por sistemas automáticos de IA para generar respuestas.</span></li>
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">ℹ</span><span>Los mensajes de texto, imágenes y audios enviados se almacenan en nuestra base de datos para mantener el historial de conversación y prestar el servicio.</span></li>
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">ℹ</span><span>Las imágenes enviadas se analizan automáticamente para diagnóstico vehicular y se almacenan de forma segura.</span></li>
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">ℹ</span><span>Los mensajes de audio son transcritos automáticamente para facilitar la atención.</span></li>
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">ℹ</span><span>Un asesor humano puede revisar y responder conversaciones en cualquier momento.</span></li>
            </ul>
          </section>

          {/* Compartición */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">5. Compartición de datos</h2>
            <p className="text-muted-foreground mb-3">
              <strong className="text-foreground">No vendemos ni compartimos su información personal</strong> con terceros con fines
              comerciales. Sin embargo, podemos compartirla con:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2"><span className="text-yellow-400 mt-0.5">△</span><span><strong className="text-foreground">Proveedores de tecnología:</strong> Supabase (base de datos), Google (Gemini IA para el asistente), Meta (WhatsApp Business API). Todos bajo sus propias políticas de privacidad y acuerdos de procesamiento de datos.</span></li>
              <li className="flex items-start gap-2"><span className="text-yellow-400 mt-0.5">△</span><span><strong className="text-foreground">Autoridades:</strong> En caso de requerimiento legal por parte de autoridades competentes en Venezuela.</span></li>
            </ul>
          </section>

          {/* Seguridad */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">6. Seguridad de los datos</h2>
            <p className="text-muted-foreground">
              Implementamos medidas técnicas y organizativas para proteger sus datos personales contra accesos no
              autorizados, pérdida, alteración o divulgación. Esto incluye cifrado en tránsito (HTTPS/TLS),
              autenticación de acceso al panel administrativo y control de accesos basado en roles.
            </p>
          </section>

          {/* Derechos */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">7. Sus derechos</h2>
            <p className="text-muted-foreground mb-3">Usted tiene derecho a:</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">→</span><span><strong className="text-foreground">Acceso:</strong> Solicitar información sobre los datos personales que tenemos suyos.</span></li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">→</span><span><strong className="text-foreground">Rectificación:</strong> Corregir datos inexactos o incompletos.</span></li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">→</span><span><strong className="text-foreground">Eliminación:</strong> Solicitar la eliminación de sus datos cuando ya no sean necesarios.</span></li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">→</span><span><strong className="text-foreground">Oposición:</strong> Oponerse al tratamiento de sus datos para fines específicos.</span></li>
            </ul>
            <p className="text-muted-foreground mt-3">
              Para ejercer sus derechos, contáctenos a través de WhatsApp al número del taller o escribiendo a nuestro
              correo: <strong className="text-foreground">admin@lycosteam.com</strong>
            </p>
          </section>

          {/* Retención */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">8. Retención de datos</h2>
            <p className="text-muted-foreground">
              Conservamos sus datos personales mientras tenga una relación activa con Lycos Team o durante el tiempo
              necesario para cumplir con las finalidades descritas. Los historiales de conversaciones de WhatsApp se
              conservan por un período máximo de 2 años desde el último contacto. Los registros de servicios se
              conservan de forma indefinida como parte del historial vehicular.
            </p>
          </section>

          {/* Cambios */}
          <section className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-base font-semibold mb-3">9. Cambios a esta política</h2>
            <p className="text-muted-foreground">
              Nos reservamos el derecho de actualizar esta política de privacidad en cualquier momento. Cuando
              realicemos cambios significativos, lo notificaremos a través de nuestros canales de comunicación.
              Le recomendamos revisar esta página periódicamente. La fecha de última actualización siempre estará
              indicada al inicio del documento.
            </p>
          </section>

          {/* Contacto */}
          <section className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center">
            <h2 className="text-base font-semibold mb-2">¿Preguntas sobre privacidad?</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Si tienes dudas sobre cómo tratamos tus datos, puedes contactarnos directamente.
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
        <Link href="/terminos" className="hover:text-foreground transition-colors">Términos y Condiciones</Link>
      </footer>
    </div>
  );
}
