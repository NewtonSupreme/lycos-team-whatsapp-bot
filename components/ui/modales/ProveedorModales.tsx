'use client';

import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import DialogoAviso, { type AvisoConfig } from './DialogoAviso';

/**
 * Los avisos del sistema, disponibles desde cualquier pantalla.
 *
 * `confirmar()` devuelve una promesa igual que el `confirm()` nativo, así que
 * sustituirlo es cambiar la llamada y añadir un `await`:
 *
 *     if (!confirm('¿Borrar?')) return;          // antes
 *     if (!await confirmar({ ... })) return;     // ahora
 *
 * La promesa es lo que hace que la sustitución sea mecánica en las 163
 * llamadas nativas que hay repartidas. Sin ella habría que darle la vuelta a
 * cada función para partirla en dos.
 */

interface Api {
  /** Pregunta y espera. `true` si el usuario confirma. */
  confirmar: (c: Omit<AvisoConfig, 'tipo'> & { tipo?: 'confirmar' | 'peligro' }) => Promise<boolean>;
  exito: (mensaje: string, titulo?: string) => Promise<boolean>;
  error: (mensaje: string, detalle?: string) => Promise<boolean>;
  info: (mensaje: string, titulo?: string) => Promise<boolean>;
}

const Contexto = createContext<Api | null>(null);

/**
 * Fuera de un `ProveedorModales` se cae a los diálogos nativos.
 *
 * Es a propósito: un componente que se renderice sin el proveedor —una prueba,
 * una pantalla suelta— tiene que seguir preguntando antes de borrar algo. Es
 * mejor un diálogo feo que ninguno.
 */
const RESPALDO: Api = {
  confirmar: async c => (typeof window !== 'undefined' ? window.confirm(`${c.titulo}\n\n${c.mensaje}`) : false),
  exito: async m => { if (typeof window !== 'undefined') window.alert(m); return true; },
  error: async m => { if (typeof window !== 'undefined') window.alert(m); return true; },
  info: async m => { if (typeof window !== 'undefined') window.alert(m); return true; },
};

export function useModales(): Api {
  return useContext(Contexto) ?? RESPALDO;
}

export default function ProveedorModales({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<(AvisoConfig & { abierto: boolean }) | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const abrir = useCallback((c: AvisoConfig) => new Promise<boolean>(resolve => {
    // Si ya había un aviso esperando, se resuelve en falso antes de sustituirlo:
    // dejar una promesa colgada congela la función que la esperaba.
    resolver.current?.(false);
    resolver.current = resolve;
    setConfig({ ...c, abierto: true });
  }), []);

  const cerrar = useCallback((valor: boolean) => {
    resolver.current?.(valor);
    resolver.current = null;
    setConfig(c => (c ? { ...c, abierto: false } : null));
  }, []);

  const api = useMemo<Api>(() => ({
    confirmar: c => abrir({
      tipo: c.tipo ?? 'confirmar',
      titulo: c.titulo,
      mensaje: c.mensaje,
      detalle: c.detalle,
      confirmar: c.confirmar ?? 'Confirmar',
      cancelar: c.cancelar ?? 'Cancelar',
    }),
    exito: (mensaje, titulo) => abrir({
      tipo: 'exito', titulo: titulo ?? '¡Operación exitosa!', mensaje, confirmar: 'Aceptar',
    }),
    error: (mensaje, detalle) => abrir({
      tipo: 'error', titulo: 'Ha ocurrido un error', mensaje, detalle, confirmar: 'Entendido',
    }),
    info: (mensaje, titulo) => abrir({
      tipo: 'info', titulo: titulo ?? 'Información', mensaje, confirmar: 'Aceptar',
    }),
  }), [abrir]);

  return (
    <Contexto.Provider value={api}>
      {children}
      {config && (
        <DialogoAviso
          {...config}
          onConfirmar={() => cerrar(true)}
          onCancelar={() => cerrar(false)}
        />
      )}
    </Contexto.Provider>
  );
}
