/**
 * Constantes para el módulo de Suspensión General / Kill Switch.
 *
 * REGLA ESTRICTA DE SEGURIDAD:
 * Solamente el USUARIO 'leandro' (o la cuenta maestra de administrador)
 * tiene la facultad de apagar y prender el sistema completo.
 * Ningún otro usuario con rol de admin ni ningún otro rol puede accionar este interruptor.
 */

export const MASTER_ADMIN_USERNAMES = ['leandro', 'administrador'];
export const MASTER_ADMIN_USERNAME = 'leandro';

export const CLAVE_CONFIGURACION_SUSPENSION = 'sistema_suspension';

export const EVENTO_CAMBIO_SUSPENSION = 'lycos:sistema-suspension-cambio';

export const MOTIVO_SUSPENSION_DEFECTO = 'Suspensión general de operaciones por administración central.';
export const MOTIVO_REANUDACION_DEFECTO = 'Sistema reanudado y operativo con normalidad.';

