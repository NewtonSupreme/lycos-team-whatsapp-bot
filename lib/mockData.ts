import { Cliente, Vehiculo, Servicio, Cita, Conversacion, MensajeWhatsApp, DashboardStats, ActivityLog } from '@/types';

export const mockClientes: Cliente[] = [
  { id: '1', nombre: 'Carlos', apellido: 'Rodríguez', email: 'carlos@gmail.com', telefono: '+58412-111-2233', cedula: 'V-12345678', direccion: 'Los Teques, Miranda', notas: 'Cliente frecuente, prefiere citas en mañana', created_at: '2024-01-15T10:00:00Z', updated_at: '2024-12-01T10:00:00Z' },
  { id: '2', nombre: 'María', apellido: 'González', email: 'maria.g@hotmail.com', telefono: '+58414-222-3344', cedula: 'V-18765432', created_at: '2024-02-20T10:00:00Z', updated_at: '2024-11-15T10:00:00Z' },
  { id: '3', nombre: 'José', apellido: 'Martínez', email: 'jose.m@yahoo.com', telefono: '+58416-333-4455', cedula: 'V-20123456', direccion: 'Carrizal, Miranda', created_at: '2024-03-10T10:00:00Z', updated_at: '2024-12-05T10:00:00Z' },
  { id: '4', nombre: 'Ana', apellido: 'López', email: 'ana.lopez@gmail.com', telefono: '+58424-444-5566', created_at: '2024-04-05T10:00:00Z', updated_at: '2024-10-20T10:00:00Z' },
  { id: '5', nombre: 'Pedro', apellido: 'Herrera', email: 'pedro.h@gmail.com', telefono: '+58426-555-6677', cedula: 'V-15432109', created_at: '2024-05-12T10:00:00Z', updated_at: '2024-12-10T10:00:00Z' },
  { id: '6', nombre: 'Luisa', apellido: 'Peña', email: 'luisa.p@gmail.com', telefono: '+58412-666-7788', created_at: '2024-06-18T10:00:00Z', updated_at: '2024-11-30T10:00:00Z' },
];

export const mockVehiculos: Vehiculo[] = [
  { id: '1', cliente_id: '1', marca: 'Toyota', modelo: 'Corolla', anio: 2019, placa: 'ABC-123', color: 'Blanco', kilometraje: 85000, estado: 'en_servicio', created_at: '2024-01-16T10:00:00Z' },
  { id: '2', cliente_id: '1', marca: 'Ford', modelo: 'F-150', anio: 2021, placa: 'XYZ-789', color: 'Negro', kilometraje: 45000, estado: 'activo', created_at: '2024-02-01T10:00:00Z' },
  { id: '3', cliente_id: '2', marca: 'Chevrolet', modelo: 'Aveo', anio: 2018, placa: 'DEF-456', color: 'Rojo', kilometraje: 120000, estado: 'listo', created_at: '2024-02-21T10:00:00Z' },
  { id: '4', cliente_id: '3', marca: 'Honda', modelo: 'Civic', anio: 2020, placa: 'GHI-321', color: 'Azul', kilometraje: 67000, estado: 'en_servicio', created_at: '2024-03-11T10:00:00Z' },
  { id: '5', cliente_id: '4', marca: 'Nissan', modelo: 'Sentra', anio: 2017, placa: 'JKL-654', color: 'Gris', kilometraje: 98000, estado: 'activo', created_at: '2024-04-06T10:00:00Z' },
  { id: '6', cliente_id: '5', marca: 'Hyundai', modelo: 'Tucson', anio: 2022, placa: 'MNO-987', color: 'Plateado', kilometraje: 32000, estado: 'activo', created_at: '2024-05-13T10:00:00Z' },
  { id: '7', cliente_id: '6', marca: 'Kia', modelo: 'Sportage', anio: 2023, placa: 'PQR-147', color: 'Blanco Perla', kilometraje: 15000, estado: 'en_servicio', created_at: '2024-06-19T10:00:00Z' },
];

export const mockServicios: Servicio[] = [
  { id: '1', vehiculo_id: '1', tipo: 'mecanica', descripcion: 'Cambio de aceite y filtros, revisión general del motor', estado: 'en_proceso', costo_estimado: 120, costo_final: undefined, fecha_inicio: '2024-12-10T09:00:00Z', created_at: '2024-12-10T09:00:00Z', updated_at: '2024-12-10T09:00:00Z' },
  { id: '2', vehiculo_id: '3', tipo: 'electronica', descripcion: 'Diagnóstico computarizado - falla en sensor O2', estado: 'finalizado', costo_estimado: 80, costo_final: 95, fecha_inicio: '2024-12-08T10:00:00Z', fecha_fin: '2024-12-09T16:00:00Z', created_at: '2024-12-08T10:00:00Z', updated_at: '2024-12-09T16:00:00Z' },
  { id: '3', vehiculo_id: '4', tipo: 'motor', descripcion: 'Revisión de correa de distribución, posible cambio', estado: 'en_proceso', costo_estimado: 350, created_at: '2024-12-11T08:00:00Z', updated_at: '2024-12-11T08:00:00Z' },
  { id: '4', vehiculo_id: '7', tipo: 'cerrajeria', descripcion: 'Duplicado de llave con chip transponder', estado: 'pendiente', costo_estimado: 60, created_at: '2024-12-12T11:00:00Z', updated_at: '2024-12-12T11:00:00Z' },
  { id: '5', vehiculo_id: '2', tipo: 'diagnostico', descripcion: 'Revisión preventiva completa de 50,000 km', estado: 'finalizado', costo_estimado: 200, costo_final: 185, fecha_inicio: '2024-12-05T09:00:00Z', fecha_fin: '2024-12-06T17:00:00Z', created_at: '2024-12-05T09:00:00Z', updated_at: '2024-12-06T17:00:00Z' },
  { id: '6', vehiculo_id: '5', tipo: 'mecanica', descripcion: 'Cambio de pastillas y discos de freno delanteros', estado: 'pendiente', costo_estimado: 180, created_at: '2024-12-12T14:00:00Z', updated_at: '2024-12-12T14:00:00Z' },
];

export const mockCitas: Cita[] = [
  { id: '1', cliente_id: '1', vehiculo_id: '1', fecha: '2024-12-16', hora: '09:00', tipo_servicio: 'mecanica', descripcion: 'Cambio de frenos', estado: 'confirmada', created_at: '2024-12-10T10:00:00Z' },
  { id: '2', cliente_id: '2', vehiculo_id: '3', fecha: '2024-12-16', hora: '11:00', tipo_servicio: 'diagnostico', descripcion: 'Diagnóstico general', estado: 'pendiente', created_at: '2024-12-11T10:00:00Z' },
  { id: '3', cliente_id: '3', vehiculo_id: '4', fecha: '2024-12-17', hora: '10:00', tipo_servicio: 'electronica', descripcion: 'Falla en sistema eléctrico', estado: 'confirmada', created_at: '2024-12-11T14:00:00Z' },
  { id: '4', cliente_id: '4', vehiculo_id: '5', fecha: '2024-12-18', hora: '14:00', tipo_servicio: 'mecanica', descripcion: 'Revisión de suspensión', estado: 'pendiente', created_at: '2024-12-12T09:00:00Z' },
  { id: '5', cliente_id: '5', vehiculo_id: '6', fecha: '2024-12-19', hora: '09:30', tipo_servicio: 'motor', descripcion: 'Ruido en motor', estado: 'confirmada', created_at: '2024-12-12T15:00:00Z' },
];

export const mockMensajes: MensajeWhatsApp[] = [
  { id: '1', from: '+58412-111-2233', to: '+58412-334-3519', body: 'Hola, ¿cuánto cuesta un cambio de aceite para un Toyota Corolla 2019?', timestamp: '2024-12-12T10:15:00Z', tipo: 'entrante', estado: 'leido' },
  { id: '2', from: '+58412-334-3519', to: '+58412-111-2233', body: '¡Hola! Gracias por contactarnos. Para un Toyota Corolla 2019, el cambio de aceite sintético completo incluyendo filtro tiene un costo de $25-35 USD dependiendo del tipo de aceite. ¿Le gustaría agendar una cita? Tenemos disponibilidad esta semana. 🔧', timestamp: '2024-12-12T10:16:00Z', tipo: 'saliente', estado: 'leido', es_ia: true },
  { id: '3', from: '+58412-111-2233', to: '+58412-334-3519', body: 'Perfecto! ¿Tienen disponibilidad el viernes por la mañana?', timestamp: '2024-12-12T10:18:00Z', tipo: 'entrante', estado: 'leido' },
  { id: '4', from: '+58412-334-3519', to: '+58412-111-2233', body: 'Sí, tenemos disponibilidad el viernes 15 de diciembre a las 9:00 AM o 11:00 AM. ¿Cuál horario le viene mejor? 📅', timestamp: '2024-12-12T10:18:30Z', tipo: 'saliente', estado: 'leido', es_ia: true },
  { id: '5', from: '+58414-222-3344', to: '+58412-334-3519', body: 'Buenos días, mi carro no enciende, necesito asistencia urgente', timestamp: '2024-12-12T11:30:00Z', tipo: 'entrante', estado: 'leido' },
  { id: '6', from: '+58412-334-3519', to: '+58414-222-3344', body: 'Buenos días, lamentamos los inconvenientes. Para asistencia de emergencia nuestro técnico puede estar con usted en aproximadamente 45 minutos. ¿Podría indicarnos su ubicación exacta? 🚗⚡', timestamp: '2024-12-12T11:31:00Z', tipo: 'saliente', estado: 'leido', es_ia: true },
];

export const mockConversaciones: Conversacion[] = [
  { id: '1', telefono: '+58412-111-2233', cliente_id: '1', ultimo_mensaje: 'Perfecto! ¿Tienen disponibilidad el viernes por la mañana?', ultimo_mensaje_at: '2024-12-12T10:18:00Z', mensajes_sin_leer: 0, estado: 'bot' },
  { id: '2', telefono: '+58414-222-3344', cliente_id: '2', ultimo_mensaje: 'Buenos días, mi carro no enciende, necesito asistencia urgente', ultimo_mensaje_at: '2024-12-12T11:30:00Z', mensajes_sin_leer: 2, estado: 'humano' },
  { id: '3', telefono: '+58416-333-4455', cliente_id: '3', ultimo_mensaje: '¿Cuánto demoran en el diagnóstico?', ultimo_mensaje_at: '2024-12-12T09:45:00Z', mensajes_sin_leer: 1, estado: 'bot' },
  { id: '4', telefono: '+58424-444-5566', cliente_id: '4', ultimo_mensaje: 'Gracias por la atención', ultimo_mensaje_at: '2024-12-11T17:20:00Z', mensajes_sin_leer: 0, estado: 'cerrada' },
  { id: '5', telefono: '+58426-555-6677', cliente_id: '5', ultimo_mensaje: 'Cuándo estará listo mi carro?', ultimo_mensaje_at: '2024-12-12T08:30:00Z', mensajes_sin_leer: 3, estado: 'humano' },
];

export const mockDashboardStats: DashboardStats = {
  totalClientes: 248,
  totalVehiculos: 312,
  serviciosActivos: 18,
  conversacionesHoy: 34,
  ingresosMes: 8750,
  serviciosCompletados: 156,
  citasHoy: 7,
  mensajesIA: 892,
};

export const mockActivityLog: ActivityLog[] = [
  { id: '1', usuario: 'Admin', accion: 'Nuevo cliente registrado', modulo: 'Clientes', detalles: 'Carlos Rodríguez', created_at: '2024-12-12T10:00:00Z' },
  { id: '2', usuario: 'Bot IA', accion: 'Respuesta automática enviada', modulo: 'WhatsApp', detalles: '+58412-111-2233', created_at: '2024-12-12T10:16:00Z' },
  { id: '3', usuario: 'Admin', accion: 'Servicio actualizado', modulo: 'Servicios', detalles: 'Toyota Corolla - En proceso', created_at: '2024-12-12T09:30:00Z' },
  { id: '4', usuario: 'Admin', accion: 'Cita confirmada', modulo: 'Agenda', detalles: 'Carlos R. - Viernes 9AM', created_at: '2024-12-12T09:00:00Z' },
  { id: '5', usuario: 'Bot IA', accion: 'Emergencia detectada', modulo: 'WhatsApp', detalles: '+58414-222-3344', created_at: '2024-12-12T11:30:00Z' },
];

export const chartDataServicios = [
  { mes: 'Jul', mecanica: 24, electronica: 12, cerrajeria: 8, motor: 5 },
  { mes: 'Ago', mecanica: 28, electronica: 15, cerrajeria: 10, motor: 7 },
  { mes: 'Sep', mecanica: 22, electronica: 18, cerrajeria: 9, motor: 4 },
  { mes: 'Oct', mecanica: 31, electronica: 20, cerrajeria: 12, motor: 8 },
  { mes: 'Nov', mecanica: 35, electronica: 22, cerrajeria: 15, motor: 10 },
  { mes: 'Dic', mecanica: 18, electronica: 14, cerrajeria: 8, motor: 6 },
];

export const chartDataIngresos = [
  { mes: 'Jul', ingresos: 5200, gastos: 2100 },
  { mes: 'Ago', ingresos: 6800, gastos: 2400 },
  { mes: 'Sep', ingresos: 5900, gastos: 2200 },
  { mes: 'Oct', ingresos: 7500, gastos: 2800 },
  { mes: 'Nov', ingresos: 8200, gastos: 3100 },
  { mes: 'Dic', ingresos: 8750, gastos: 3200 },
];
