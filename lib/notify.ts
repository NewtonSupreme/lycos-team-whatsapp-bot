'use client';

import { toast } from 'sonner';

/**
 * Sistema de notificaciones unificado de Lycos CRM.
 *
 * Reemplaza los `alert()` dispersos por toasts premium y consistentes.
 * Uso:
 *   import { notify } from '@/lib/notify';
 *   notify.success('Venta registrada', 'La factura #123 fue creada.');
 *   notify.error('No se pudo registrar', err.message);
 *   const id = notify.loading('Guardando...');  notify.success('Listo', undefined, { id });
 *   await notify.promise(promesa, { loading, success, error });
 */

type NotifyOptions = {
  /** id de un toast existente (para reemplazar un loading por success/error) */
  id?: string | number;
  /** duración en ms */
  duration?: number;
  /** acción opcional con botón */
  action?: { label: string; onClick: () => void };
};

function buildOpts(description?: string, opts?: NotifyOptions) {
  return {
    description,
    id: opts?.id,
    duration: opts?.duration,
    action: opts?.action,
  };
}

export const notify = {
  /** ✅ Operación / registro exitoso */
  success(title: string, description?: string, opts?: NotifyOptions) {
    return toast.success(title, buildOpts(description, opts));
  },

  /** ❌ Error / registro fallido */
  error(title: string, description?: string, opts?: NotifyOptions) {
    return toast.error(title, buildOpts(description, { duration: 6000, ...opts }));
  },

  /** ⚠️ Advertencia */
  warning(title: string, description?: string, opts?: NotifyOptions) {
    return toast.warning(title, buildOpts(description, opts));
  },

  /** ℹ️ Información */
  info(title: string, description?: string, opts?: NotifyOptions) {
    return toast.info(title, buildOpts(description, opts));
  },

  /** ⏳ Cargando — devuelve el id para luego resolverlo con success/error */
  loading(title: string, description?: string, opts?: NotifyOptions) {
    return toast.loading(title, buildOpts(description, opts));
  },

  /** Toast neutro */
  message(title: string, description?: string, opts?: NotifyOptions) {
    return toast(title, buildOpts(description, opts));
  },

  /** Cierra un toast por id (o todos) */
  dismiss(id?: string | number) {
    return toast.dismiss(id);
  },

  /**
   * Envuelve una promesa mostrando loading → success / error automáticamente.
   * Ideal para registros: notify.promise(guardar(), { loading, success, error })
   */
  promise<T>(
    promise: Promise<T>,
    msgs: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: any) => string);
    }
  ) {
    return toast.promise(promise, msgs);
  },
};

export type Notify = typeof notify;
