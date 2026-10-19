// Datos fiscales de la empresa: salen en el encabezado de todos los PDF.
export const EMPRESA = {
  nombre: 'Lycos Team',
  rif: 'J-50558970-9',
} as const;

export const RIF_TEXTO = `RIF: ${EMPRESA.rif}`;
