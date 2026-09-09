/**
 * Las guías de la plataforma.
 *
 * Están escritas contra el código, no inventadas: cada paso nombra el botón que
 * de verdad existe y cada ruta lleva a una pantalla que de verdad está ahí. Una
 * guía que dice "haz clic en Nuevo presupuesto" cuando el botón se llama de otra
 * forma es peor que no tener guía: manda a buscar algo que no aparece.
 *
 * `ruta` es lo que abre el botón «Ir al módulo». Si una guía no tiene ruta, ese
 * botón no se muestra.
 */

export interface PasoGuia {
  texto: string;
  /** Aclaración opcional, para lo que no es evidente. */
  nota?: string;
}

export interface Guia {
  id: string;
  /** Módulo al que pertenece, para agrupar en «Temas sugeridos». */
  tema: TemaId;
  titulo: string;
  /** La pregunta tal como la haría alguien del taller. */
  pregunta: string;
  /** Otras formas de preguntar lo mismo; se usan para encontrar la guía. */
  alias?: string[];
  intro: string;
  pasos: PasoGuia[];
  /** Cierre: lo que conviene saber después de hacerlo. */
  cierre?: string;
  ruta?: string;
  /** Permiso que hace falta. Sin él, la guía avisa en vez de mandar a un muro. */
  permiso?: string;
}

export type TemaId =
  | 'clientes' | 'servicios' | 'ventas' | 'facturacion' | 'inventario'
  | 'agenda' | 'nomina' | 'reportes' | 'whatsapp' | 'configuracion';

export interface Tema {
  id: TemaId;
  titulo: string;
  resumen: string;
  ruta?: string;
}

export const TEMAS: readonly Tema[] = [
  { id: 'clientes', titulo: 'Gestión de clientes', resumen: 'Cómo registrar, editar y buscar clientes', ruta: '/dashboard/clientes' },
  { id: 'servicios', titulo: 'Servicios y órdenes', resumen: 'Crear órdenes de taller y asignar personal', ruta: '/dashboard/servicios' },
  { id: 'ventas', titulo: 'Punto de venta', resumen: 'Cobrar, clasificar el pago y cerrar la venta', ruta: '/dashboard/silenciadores' },
  { id: 'facturacion', titulo: 'Facturación', resumen: 'Emitir facturas y notas de entrega', ruta: '/dashboard/facturas' },
  { id: 'inventario', titulo: 'Inventario', resumen: 'Control de repuestos y stock', ruta: '/dashboard/inventario' },
  { id: 'agenda', titulo: 'Agenda', resumen: 'Programar y gestionar citas', ruta: '/dashboard/agenda' },
  { id: 'nomina', titulo: 'Nómina y comisiones', resumen: 'Reglas de pago, comisiones y liquidación', ruta: '/dashboard/nomina' },
  { id: 'reportes', titulo: 'Reportes', resumen: 'Reporte diario y análisis de ventas', ruta: '/dashboard/reportes' },
  { id: 'whatsapp', titulo: 'WhatsApp y el bot', resumen: 'Registrar por voz o mensaje desde el teléfono', ruta: '/dashboard/whatsapp' },
  { id: 'configuracion', titulo: 'Configuración', resumen: 'Usuarios, roles, sucursales y seguridad', ruta: '/dashboard/configuracion' },
];

export const GUIAS: readonly Guia[] = [
  // ── Presupuestos ─────────────────────────────────────────────────────────
  {
    id: 'crear-presupuesto',
    tema: 'facturacion',
    titulo: 'Crear un presupuesto',
    pregunta: '¿Cómo creo un presupuesto?',
    alias: ['presupuesto', 'cotizacion', 'cotizar', 'como hago un presupuesto'],
    intro: 'Te explico cómo crear un presupuesto paso a paso:',
    pasos: [
      { texto: 'Abre **Presupuestos** en el menú lateral.' },
      { texto: 'Pulsa **Nuevo presupuesto**.' },
      { texto: 'Busca el cliente por nombre o teléfono, o créalo ahí mismo si es nuevo.' },
      { texto: 'Añade el vehículo.', nota: 'Si la placa ya existe, el vehículo se enlaza solo.' },
      { texto: 'Agrega cada renglón: repuesto o mano de obra, con su cantidad y precio.' },
      { texto: 'Marca **IVA 16 %** si el presupuesto lo lleva.' },
      { texto: 'Revisa el total y pulsa **Guardar**.' },
    ],
    cierre: 'Desde el presupuesto guardado puedes descargarlo en PDF para enviárselo al cliente, y convertirlo en orden de servicio cuando lo apruebe.',
    ruta: '/dashboard/presupuestos',
    permiso: 'presupuestos',
  },

  // ── Ventas ───────────────────────────────────────────────────────────────
  {
    id: 'registrar-venta',
    tema: 'ventas',
    titulo: 'Registrar una venta',
    pregunta: '¿Cómo registro una venta?',
    alias: ['venta', 'cobrar', 'punto de venta', 'pos', 'vender'],
    intro: 'La venta se registra en el punto de venta:',
    pasos: [
      { texto: 'Abre **Ventas** en el menú lateral.' },
      { texto: 'Añade los productos al carrito desde el catálogo, o escribe el renglón a mano.' },
      { texto: 'En **Método de pago**, elige la tasa: BCV o Binance P2P.', nota: 'Importante: si el cobro fue al paralelo y se convierte al BCV, el reporte del día no cuadra.' },
      { texto: 'Toca el método y escribe el monto en **el banco exacto** por donde entró el dinero.' },
      { texto: 'Si es Cashea, el IVA del 16 % se aplica solo y el resto queda como saldo pendiente.' },
      { texto: 'En **Personal a cargo**, indica quién hizo el trabajo o marca que lo hizo el taller.', nota: 'De aquí sale la comisión. Sin esto la venta no genera nada en nómina.' },
      { texto: 'Comprueba que el cuadre diga **Cuadra** y cierra la venta.' },
    ],
    cierre: 'Cada monto cae en su columna del Reporte de Ventas, y la comisión del técnico se calcula con sus reglas reales en el momento.',
    ruta: '/dashboard/silenciadores',
    permiso: 'ventas',
  },

  // ── Servicios ────────────────────────────────────────────────────────────
  {
    id: 'crear-servicio',
    tema: 'servicios',
    titulo: 'Crear una orden de servicio',
    pregunta: '¿Cómo agendo o registro un servicio?',
    alias: ['orden de servicio', 'servicio', 'orden de taller', 'registrar trabajo'],
    intro: 'Una orden de servicio es un vehículo que ya está en el taller:',
    pasos: [
      { texto: 'Abre **Servicios** y pulsa **Nueva orden**.' },
      { texto: 'Busca o registra al cliente y su vehículo con la placa.' },
      { texto: 'Elige la **clasificación del servicio**.', nota: 'Determina en qué columna aparece en el Reporte de Ventas.' },
      { texto: 'Describe el trabajo. Si son varios, sepáralos con «+» y cada uno será un renglón.' },
      { texto: 'Registra el cobro por banco en **Métodos de pago**, si ya se cobró.' },
      { texto: 'En **Personal a cargo** elige a quien lo hizo: verás su comisión calculada en vivo.' },
      { texto: 'Guarda. La orden queda en el estado que corresponda al tipo de trabajo.' },
    ],
    cierre: 'Al completar la orden se genera la venta automáticamente y el cobro pasa al reporte del día.',
    ruta: '/dashboard/servicios',
    permiso: 'servicios',
  },
  {
    id: 'agregar-trabajo',
    tema: 'servicios',
    titulo: 'Agregar trabajo a una orden que ya existe',
    pregunta: '¿Cómo le agrego otro trabajo a un servicio en curso?',
    alias: [
      'agregar trabajo', 'agrego trabajo', 'agregar otro trabajo', 'sumar trabajo',
      'anadir servicio', 'otro trabajo', 'trabajo adicional', 'agregar a este trabajo',
    ],
    intro: 'Nunca crees una orden nueva para el mismo vehículo: se agrega a la que ya está.',
    pasos: [
      { texto: 'Abre **Servicios** y busca la orden por placa o cliente.' },
      { texto: 'Pulsa **Editar** en esa orden.' },
      { texto: 'Añade el trabajo nuevo como un renglón más, con su precio.' },
      { texto: 'Si lo hizo otra persona, agrégala en **Personal a cargo**: la orden queda a nombre de ambos.' },
      { texto: 'Guarda. El precio se suma al total y el desglose conserva los trabajos anteriores.' },
    ],
    cierre: 'Desde WhatsApp también funciona: di «agregar a este trabajo soldadura 15$» y el bot lo añade con su precio y su comisión.',
    ruta: '/dashboard/servicios',
    permiso: 'servicios',
  },

  // ── Clientes ─────────────────────────────────────────────────────────────
  {
    id: 'registrar-cliente',
    tema: 'clientes',
    titulo: 'Registrar un cliente y su vehículo',
    pregunta: '¿Cómo registro un cliente nuevo?',
    alias: ['cliente', 'nuevo cliente', 'registrar cliente', 'agregar cliente'],
    intro: 'El cliente y el vehículo se registran juntos, porque casi siempre llegan juntos:',
    pasos: [
      { texto: 'Abre **Clientes** y pulsa **Nuevo cliente**.' },
      { texto: 'Escribe nombre, apellido y teléfono.', nota: 'El teléfono del cliente, no el tuyo: si pones el tuyo, sus vehículos quedan a tu nombre.' },
      { texto: 'Añade la cédula o el RIF si va a llevar factura fiscal.' },
      { texto: 'Guarda y, desde su ficha, agrega el vehículo con su placa, marca y modelo.' },
    ],
    cierre: 'Con la placa registrada, cualquier orden futura de ese vehículo se enlaza sola con su dueño y su historial.',
    ruta: '/dashboard/clientes',
    permiso: 'clientes',
  },

  // ── Nómina ───────────────────────────────────────────────────────────────
  {
    id: 'reglas-pago',
    tema: 'nomina',
    titulo: 'Configurar cómo se le paga a alguien',
    pregunta: '¿Cómo configuro la comisión de un técnico?',
    alias: ['comision', 'reglas de pago', 'porcentaje', 'cuanto le toca', 'nomina'],
    intro: 'Sin reglas de pago, los trabajos de una persona entran a nómina en $0,00. Así se definen:',
    pasos: [
      { texto: 'Abre **Nómina** y ve a la pestaña **Configuración**.' },
      { texto: 'En **Reglas de pago**, pulsa el botón para crear una regla.' },
      { texto: 'Elige la forma de pago: porcentaje, sueldo fijo semanal, tarifa por trabajo u override en cascada.' },
      { texto: 'Indica sobre qué se calcula: todo lo que deja el trabajo, o solo la mano de obra.' },
      { texto: 'Limita la regla a una zona —escapes, alineación, cauchera— y a tipos de trabajo si hace falta.' },
      { texto: 'Mira la frase que se genera y el simulador: dice exactamente cuánto cobraría.' },
      { texto: 'Guarda.' },
    ],
    cierre: 'Cuidado con dejar una regla en 0 %: coincide igual y deja la comisión en cero, tapando cualquier otra.',
    ruta: '/dashboard/nomina',
    permiso: 'nomina',
  },
  {
    id: 'liquidar-nomina',
    tema: 'nomina',
    titulo: 'Pagar la nómina de la semana',
    pregunta: '¿Cómo liquido y pago la nómina?',
    alias: ['liquidar', 'pagar nomina', 'recibo de pago', 'hoja de pago'],
    intro: 'La liquidación cierra el período y genera el comprobante:',
    pasos: [
      { texto: 'Abre **Nómina** y elige el período arriba: esta semana, quincena o mes.' },
      { texto: 'Revisa la pestaña **Sin asignar**: ahí sale el trabajo cobrado al que nadie le puso técnico.' },
      { texto: 'Abre la ficha de cada persona para ver sus trabajos, su parte y con qué regla se calculó.' },
      { texto: 'Descarga su **hoja de pago** si quiere revisarla antes de cobrar.' },
      { texto: 'Pulsa **Liquidar**, elige el método de pago y confirma.' },
    ],
    cierre: 'Al liquidar se genera el recibo en PDF y esos trabajos quedan marcados como pagados: no vuelven a salir en el siguiente período.',
    ruta: '/dashboard/nomina',
    permiso: 'nomina',
  },

  // ── Reportes ─────────────────────────────────────────────────────────────
  {
    id: 'generar-reporte',
    tema: 'reportes',
    titulo: 'Generar el reporte del día',
    pregunta: '¿Cómo genero un reporte?',
    alias: ['reporte', 'reporte diario', 'cierre del dia', 'informe'],
    intro: 'El reporte diario recoge todo lo cobrado y por dónde entró:',
    pasos: [
      { texto: 'Abre **Reportes** en el menú lateral.' },
      { texto: 'Elige la fecha o el rango que quieras revisar.' },
      { texto: 'Comprueba el desglose por banco: cada cobro tiene que estar en su columna.' },
      { texto: 'Revisa el desglose por departamento y el total del día.' },
      { texto: 'Descarga el PDF con el botón de descarga.' },
    ],
    cierre: 'Si un monto no aparece, casi siempre es porque el método de pago con el que se cobró no está clasificado. Revisa la venta y corrige el banco.',
    ruta: '/dashboard/reportes',
    permiso: 'reportes',
  },

  // ── Inventario ───────────────────────────────────────────────────────────
  {
    id: 'inventario-stock',
    tema: 'inventario',
    titulo: 'Cargar y controlar el stock',
    pregunta: '¿Cómo agrego repuestos al inventario?',
    alias: ['inventario', 'stock', 'repuesto', 'producto', 'cargar mercancia'],
    intro: 'El inventario alimenta el catálogo del punto de venta:',
    pasos: [
      { texto: 'Abre **Inventario** y pulsa el botón de nuevo producto.' },
      { texto: 'Escribe el nombre, la categoría y el código si lo tiene.' },
      { texto: 'Pon el costo y el precio de venta.', nota: 'La diferencia es lo que se muestra como utilidad en los reportes.' },
      { texto: 'Indica la cantidad en existencia y el mínimo con el que quieres que avise.' },
      { texto: 'Guarda: el producto ya aparece en el catálogo del punto de venta.' },
    ],
    cierre: 'Cada venta descuenta el stock. Cuando baja del mínimo, el producto sale marcado para reponer.',
    ruta: '/dashboard/inventario',
    permiso: 'inventario',
  },

  // ── Agenda ───────────────────────────────────────────────────────────────
  {
    id: 'agendar-cita',
    tema: 'agenda',
    titulo: 'Programar una cita',
    pregunta: '¿Cómo agendo una cita?',
    alias: ['cita', 'agenda', 'agendar', 'programar'],
    intro: 'Una cita es para una fecha futura. Si el vehículo ya está en el taller, es una orden de servicio, no una cita.',
    pasos: [
      { texto: 'Abre **Agenda** en el menú lateral.' },
      { texto: 'Pulsa sobre el día y la hora que quieras, o usa el botón de nueva cita.' },
      { texto: 'Busca al cliente y su vehículo.' },
      { texto: 'Describe qué se le va a hacer y confirma.' },
    ],
    cierre: 'Cuando el vehículo llegue, la cita se convierte en orden de servicio sin volver a escribir los datos.',
    ruta: '/dashboard/agenda',
    permiso: 'agenda',
  },

  // ── Facturación ──────────────────────────────────────────────────────────
  {
    id: 'emitir-factura',
    tema: 'facturacion',
    titulo: 'Emitir una factura',
    pregunta: '¿Cómo emito una factura?',
    alias: ['factura', 'facturar', 'facturo', 'nota de entrega', 'facturacion', 'emitir factura'],
    intro: 'La factura sale de una venta o de una orden ya cobrada:',
    pasos: [
      { texto: 'Abre **Facturación** en el menú lateral.' },
      { texto: 'Elige la venta o la orden que vas a facturar.' },
      { texto: 'Comprueba los datos fiscales del cliente: nombre, cédula o RIF y dirección.' },
      { texto: 'Revisa que el IVA sea el correcto y que el desglose cuadre con lo cobrado.' },
      { texto: 'Emite y descarga el PDF.' },
    ],
    cierre: 'Los cobros por Banesco están marcados como fiscales; los de Banca Amiga van como nota de entrega. El sistema lo tiene en cuenta al clasificar.',
    ruta: '/dashboard/facturas',
    permiso: 'ventas',
  },

  // ── WhatsApp ─────────────────────────────────────────────────────────────
  {
    id: 'bot-whatsapp',
    tema: 'whatsapp',
    titulo: 'Registrar desde WhatsApp',
    pregunta: '¿Cómo registro un servicio desde WhatsApp?',
    alias: ['whatsapp', 'bot', 'por voz', 'nota de voz', 'chatbot'],
    intro: 'El bot registra en el sistema lo que le dictes por mensaje, nota de voz o foto:',
    pasos: [
      { texto: 'Escríbele al bot desde tu número de administrador.' },
      { texto: 'Dicta los datos de una vez: «Ingresar cliente, nombre X, vehículo Y, placa Z, teléfono, trabajo, técnico».' },
      { texto: 'Puedes mandar la foto de la placa y una nota de voz: las combina.' },
      { texto: 'Para agregar a un trabajo existente: «agregar a este trabajo soldadura 15$».' },
      { texto: 'Comprueba en el sistema que quedó como esperabas.' },
    ],
    cierre: 'Si el bot dice que registró algo pero el sistema no lo aplicó, te lo corrige él mismo con un aviso: nunca confirma un registro que no ocurrió.',
    ruta: '/dashboard/whatsapp',
    permiso: 'whatsapp',
  },

  // ── Configuración ────────────────────────────────────────────────────────
  {
    id: 'usuarios-permisos',
    tema: 'configuracion',
    titulo: 'Crear un usuario y darle permisos',
    pregunta: '¿Cómo creo un usuario y le doy permisos?',
    alias: ['usuario', 'permisos', 'rol', 'acceso', 'dar de alta'],
    intro: 'El acceso se controla por rol: se crea la persona y se le asigna uno.',
    pasos: [
      { texto: 'Abre **Configuración → Usuarios y accesos**.' },
      { texto: 'Pulsa **Nuevo usuario** y completa nombre, correo, rol y sucursal.' },
      { texto: 'Si el rol que necesita no existe, ve a la pestaña **Roles y permisos** y créalo.' },
      { texto: 'En la matriz de permisos marca qué puede hacer en cada módulo.', nota: '«Ver» manda: sin poder abrir un módulo, crear o editar en él no significa nada.' },
      { texto: 'Guarda los permisos. Se aplican la próxima vez que esa persona cargue el sistema.' },
    ],
    cierre: 'Para dar de baja a alguien, desactívalo en vez de borrarlo: así conserva su historial de trabajos y comisiones.',
    ruta: '/dashboard/configuracion',
    permiso: 'configuracion',
  },
  {
    id: 'sucursales',
    tema: 'configuracion',
    titulo: 'Gestionar sucursales',
    pregunta: '¿Cómo agrego o gestiono una sucursal?',
    alias: ['sucursal', 'sede', 'agregar sucursal'],
    intro: 'Cada sucursal tiene sus propios clientes, servicios, ventas e inventario:',
    pasos: [
      { texto: 'Abre **Configuración → Sucursales**.' },
      { texto: 'Pulsa **Nueva sucursal** y completa nombre, dirección, teléfono y RIF.' },
      { texto: 'Para cambiar la sucursal con la que trabajas, usa el selector de la barra superior.' },
      { texto: 'Si una sucursal cierra, **desactívala**: deja de aparecer pero conserva su historial.' },
    ],
    cierre: 'Una sucursal con registros no se puede eliminar, y con razón: borrarla dejaría cientos de servicios y clientes apuntando a una sede que ya no existe.',
    ruta: '/dashboard/configuracion',
    permiso: 'configuracion',
  },

  // ── Ficha del vehículo ───────────────────────────────────────────────────
  {
    id: 'ficha-vehiculo',
    tema: 'servicios',
    titulo: 'Ver lo que se gana y se gasta por vehículo',
    pregunta: '¿Cómo veo la utilidad de un vehículo?',
    alias: ['ficha', 'utilidad', 'ganancia', 'cuanto se gano', 'costo por repuesto'],
    intro: 'La ficha del vehículo compara, renglón por renglón, lo que se cobró contra lo que se gastó:',
    pasos: [
      { texto: 'Abre **Ficha** desde el menú y busca por placa.' },
      { texto: 'Cada renglón dice el precio al cliente y el costo del repuesto.' },
      { texto: 'Marca si el repuesto **lo trajo el cliente** o **lo compró el taller**.', nota: 'Lo que trae el cliente no puede llevar costo: el sistema lo impide.' },
      { texto: 'Si lo compró el taller, indica el proveedor y si está pagado o a crédito.' },
      { texto: 'Abajo verás la utilidad real de ese vehículo.' },
    ],
    cierre: 'Lo que queda a crédito aparece en Cuentas por pagar, que es donde se ve lo que el taller debe.',
    ruta: '/dashboard/ficha',
    permiso: 'servicios',
  },
];

/** Quita acentos para que «cómo» encuentre «como». */
const normaliza = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Busca la guía que responde a lo que se preguntó.
 *
 * Puntúa por palabras coincidentes en lugar de exigir la frase exacta: nadie
 * escribe la pregunta igual que está en el catálogo. Si nada llega al mínimo se
 * devuelve `null` y la pregunta va al asistente, que sí puede improvisar.
 */
export function buscarGuia(texto: string): Guia | null {
  const q = normaliza(texto);
  if (q.length < 3) return null;

  const palabras = q.split(/\s+/).filter(w => w.length > 3);
  let mejor: { g: Guia; puntos: number } | null = null;

  for (const g of GUIAS) {
    const heno = normaliza([g.pregunta, g.titulo, ...(g.alias || [])].join(' '));
    let puntos = 0;

    // Coincidencia de la frase entera: nada le gana.
    if (heno.includes(q)) puntos += 100;

    // Los alias pesan más que el resto del texto: son las formas en las que la
    // gente pregunta de verdad, y sin ese peso extra una guía de descripción
    // larga le gana a la que el alias señala exactamente. Le pasaba a «agrego
    // un trabajo», que caía en «Crear una orden» en vez de en «Agregar trabajo».
    for (const a of g.alias || []) {
      const na = normaliza(a);
      if (q.includes(na)) { puntos += 60; continue; }

      // Alias de varias palabras que no están seguidas en la pregunta. Se
      // compara por la raíz para que «agrego» reconozca «agregar».
      const suyas = na.split(/\s+/).filter(w => w.length > 3);
      if (suyas.length > 1) {
        const raiz = (w: string) => w.slice(0, Math.max(4, w.length - 2));
        if (suyas.every(w => q.includes(raiz(w)))) puntos += 45;
      }
    }

    for (const w of palabras) {
      if (heno.includes(w)) puntos += 5;
    }

    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { g, puntos };
  }

  // El umbral evita que una palabra suelta arrastre una guía que no toca.
  return mejor && mejor.puntos >= 15 ? mejor.g : null;
}

/** Las guías de un tema, para la vista de «Temas sugeridos». */
export const guiasDeTema = (tema: TemaId) => GUIAS.filter(g => g.tema === tema);

/** La guía en texto plano, para mandarla al chat o copiarla. */
export function guiaComoTexto(g: Guia): string {
  const pasos = g.pasos
    .map((p, i) => `${i + 1}. ${p.texto}${p.nota ? `\n   _${p.nota}_` : ''}`)
    .join('\n');
  return [g.intro, '', pasos, g.cierre ? `\n${g.cierre}` : ''].join('\n').trim();
}
