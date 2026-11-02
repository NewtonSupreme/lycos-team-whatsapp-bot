'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import {
  MASTER_ADMIN_USERNAMES,
  MASTER_ADMIN_USERNAME,
  EVENTO_CAMBIO_SUSPENSION,
  CLAVE_CONFIGURACION_SUSPENSION,
} from '@/lib/suspension/constants';
import type { EstadoSuspension } from '@/lib/suspension/types';
import { Power, PowerOff, AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

/**
 * BOTÓN DE INTERRUPTOR MAESTRO (KILL SWITCH)
 *
 * Exclusivamente visible y operativo para el usuario 'leandro' (Administrador Maestro).
 * Permite apagar todo el sistema (pantalla negra a todos los usuarios y apagado del chatbot)
 * o prenderlo de nuevo al instante.
 */
export default function BotonSuspensionMaster() {
  const { user } = useAppStore();
  const [suspendido, setSuspendido] = useState<boolean>(false);
  const [modalAbierto, setModalAbierto] = useState<boolean>(false);
  const [cargando, setCargando] = useState<boolean>(false);
  const [motivo, setMotivo] = useState<string>('');

  // Estricto: Solo para el usuario 'leandro' / 'administrador'
  const esMaster = (() => {
    const isMasterUser = (u?: string | null, email?: string | null) => {
      const cleanU = (u || '').trim().toLowerCase();
      const cleanE = (email || '').trim().toLowerCase();
      if (cleanU && MASTER_ADMIN_USERNAMES.some(m => m.toLowerCase() === cleanU)) return true;
      if (cleanE && (cleanE.includes('leandro') || cleanE === 'administrador@lycosteam.com')) return true;
      return false;
    };

    if (isMasterUser(user?.username, user?.email)) {
      return true;
    }
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('lycos_user');
        if (cached) {
          const u = JSON.parse(cached);
          if (isMasterUser(u?.username, u?.email)) {
            return true;
          }
        }
      } catch {}
    }
    return false;
  })();


  const consultarEstado = useCallback(async () => {
    try {
      const res = await fetch('/api/sistema/suspension', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.estado) {
          setSuspendido(Boolean(data.estado.suspendido));
          if (data.estado.motivo) setMotivo(data.estado.motivo);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!esMaster) return;
    consultarEstado();

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<EstadoSuspension>;
      if (customEvent.detail) {
        setSuspendido(Boolean(customEvent.detail.suspendido));
      } else {
        consultarEstado();
      }
    };

    window.addEventListener(EVENTO_CAMBIO_SUSPENSION, handleCustomEvent);
    return () => window.removeEventListener(EVENTO_CAMBIO_SUSPENSION, handleCustomEvent);
  }, [esMaster, consultarEstado]);

  // Realtime para actualizar el botón si cambia en otra pestaña
  useEffect(() => {
    if (!esMaster || !supabase) return;

    const channel = supabase
      .channel('boton-suspension-master-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'configuracion_sistema',
          filter: `clave=eq.${CLAVE_CONFIGURACION_SUSPENSION}`,
        },
        (payload: any) => {
          const nuevoValor = payload?.new?.valor;
          if (nuevoValor) {
            const val = typeof nuevoValor === 'string' ? JSON.parse(nuevoValor) : nuevoValor;
            setSuspendido(Boolean(val.suspendido));
          } else {
            consultarEstado();
          }
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [esMaster, consultarEstado]);

  // Si no es el usuario administrador maestro, no se renderiza nada
  if (!esMaster) {
    return null;
  }

  const handleToggle = async () => {
    const nuevoEstado = !suspendido;
    setCargando(true);

    try {
      const res = await fetch('/api/sistema/suspension', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suspendido: nuevoEstado,
          motivo: motivo.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'No se pudo actualizar el estado del sistema.');
      }

      setSuspendido(nuevoEstado);
      setModalAbierto(false);

      // Notificar a toda la ventana / pestañas
      window.dispatchEvent(
        new CustomEvent(EVENTO_CAMBIO_SUSPENSION, { detail: data.estado })
      );

      if (nuevoEstado) {
        toast.error('🔴 SISTEMA APAGADO', {
          description: 'Todos los accesos están suspendidos con pantalla negra y el chatbot pausado.',
          duration: 6000,
        });
      } else {
        toast.success('🟢 SISTEMA REANUDADO', {
          description: 'Se ha restaurado el acceso en tiempo real a todos los usuarios y al chatbot.',
          duration: 5000,
        });
      }
    } catch (err: any) {
      toast.error('Error al cambiar estado', {
        description: err.message || 'Ocurrió un error inesperado',
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <>
      {/* Botón en el Header */}
      {!suspendido ? (
        <button
          onClick={() => {
            setMotivo('');
            setModalAbierto(true);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all text-[11px] font-medium shadow-sm hover:shadow-[0_0_10px_rgba(239,68,68,0.2)] active:scale-95"
          title="Interruptor de Emergencia: Apagar Todo el Sistema (Solo Administrador)"
        >
          <Power className="w-3.5 h-3.5 text-red-400" />
          <span className="hidden sm:inline font-semibold">Apagar Todo</span>
        </button>
      ) : (
        <button
          onClick={() => setModalAbierto(true)}
          className="flex items-center gap-2 px-3 py-1 rounded-full border border-red-500 bg-red-600 hover:bg-red-500 text-white transition-all text-[11px] font-bold shadow-[0_0_20px_rgba(239,68,68,0.6)] animate-pulse active:scale-95"
          title="SISTEMA APAGADO: Haz clic para encender y reactivar todo el sistema"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-90"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <PowerOff className="w-3.5 h-3.5 text-white" />
          <span className="tracking-wide">SISTEMA APAGADO — Prender</span>
        </button>
      )}

      {/* Modal de Confirmación y Control */}
      <Dialog open={modalAbierto} onOpenChange={setModalAbierto}>
        <DialogContent className="sm:max-w-md bg-neutral-950 border border-neutral-800 text-white">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  !suspendido
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {!suspendido ? (
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                )}
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-white">
                  {!suspendido
                    ? '¿Suspender y Apagar Todo el Sistema?'
                    : '¿Reactivar y Prender Todo el Sistema?'}
                </DialogTitle>
                <DialogDescription className="text-xs text-neutral-400">
                  Control exclusivo de <strong className="text-white">Leandro (Usuario Maestro)</strong>.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs text-neutral-300">
            {!suspendido ? (
              <>
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-red-400 font-semibold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Consecuencias inmediatas del apagado:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-neutral-300 pl-1 text-[11.5px]">
                    <li>
                      <strong>Pantalla negra en vivo:</strong> Todos los usuarios del sistema verán la pantalla negra al instante sin cerrar sus sesiones.
                    </li>
                    <li>
                      <strong>Chatbot de WhatsApp pausado:</strong> El bot no procesará mensajes ni responderá consultas mientras esté apagado.
                    </li>
                    <li>
                      <strong>Tu acceso continúa:</strong> Solamente tú (Leandro) podrás navegar y reactivar el sistema.
                    </li>
                  </ul>
                </div>


                <div>
                  <label className="block text-[11px] font-medium text-neutral-400 mb-1.5">
                    Motivo de la suspensión (opcional):
                  </label>
                  <input
                    type="text"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ej. Mantenimiento extraordinario / Pausa administrativa"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
                  />
                </div>
              </>
            ) : (
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Restauración completa:</span>
                </div>
                <p className="text-[11.5px] leading-relaxed text-neutral-300">
                  Al reanudar, la pantalla negra desaparecerá al instante en todas las pantallas de los usuarios, sus sesiones continuarán intactas en donde estaban y el chatbot de WhatsApp volverá a operar automáticamente.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setModalAbierto(false)}
              disabled={cargando}
              className="text-neutral-400 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleToggle}
              disabled={cargando}
              className={
                !suspendido
                  ? 'bg-red-600 hover:bg-red-500 text-white font-semibold'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white font-semibold'
              }
            >
              {cargando ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Procesando...
                </>
              ) : !suspendido ? (
                <>
                  <PowerOff className="w-3.5 h-3.5 mr-1.5" />
                  Confirmar y Apagar Todo
                </>
              ) : (
                <>
                  <Power className="w-3.5 h-3.5 mr-1.5" />
                  Reactivar Sistema Ahora
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
