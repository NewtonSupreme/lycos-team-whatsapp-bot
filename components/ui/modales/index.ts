/**
 * Los modales del sistema, en un solo sitio.
 *
 * Antes cada pantalla montaba el suyo: unos con portal y otros sin él —y por eso
 * se recortaban dentro de otro modal—, unos cerrables con Escape y otros no,
 * cada uno con sus propias medidas. Aquí todos salen del mismo armazón.
 */

export { default as ModalBase, BotonPrincipal, BotonSecundario, Campo, CLASE_INPUT } from './ModalBase';
export type { AnchoModal } from './ModalBase';

export { default as DialogoAviso } from './DialogoAviso';
export type { AvisoConfig, TipoAviso } from './DialogoAviso';

export { default as ProveedorModales, useModales } from './ProveedorModales';

export { SelectorCliente, SelectorVehiculo, nombreCompleto } from './SelectorCliente';
export type { ClienteElegible, VehiculoElegible } from './SelectorCliente';

export {
  VisorImagenes, VisorDocumento, ModalCerrarSesion, ModalSesionExpirada,
  ModalMantenimiento, ModalCambiarEstado,
} from './ModalesSistema';
export type { OpcionEstado } from './ModalesSistema';
