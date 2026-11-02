'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import {
  MASTER_ADMIN_USERNAMES,
  MASTER_ADMIN_USERNAME,
  EVENTO_CAMBIO_SUSPENSION,
  CLAVE_CONFIGURACION_SUSPENSION,
} from '@/lib/suspension/constants';
import type { EstadoSuspension } from '@/lib/suspension/types';
import { Car } from 'lucide-react';

/**
 * PANTALLA NEGRA DE SUSPENSIÓN GENERAL
 *
 * Bloquea de inmediato toda la interfaz para todos los usuarios del sistema,
 * SIN cerrar sus sesiones, manteniéndolas vivas en espera de la señal de reanudación.
 *
 * EXCEPCIÓN ÚNICA:
 * El usuario 'leandro' (cuenta maestra principal) NUNCA es bloqueado por esta pantalla,
 * para permitirle operar el interruptor y gestionar la reactivación del sistema.
 */
export default function PantallaNegraBloqueo() {
  const { user } = useAppStore();
  const [suspendido, setSuspendido] = useState<boolean>(false);
  const [motivo, setMotivo] = useState<string>('');
  const [fechaSuspension, setFechaSuspension] = useState<string | null>(null);
  const [verificando, setVerificando] = useState<boolean>(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Determinar si el usuario actual es el Administrador Maestro (Leandro)
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
    // Verificación rápida en localStorage para evitar parpadeos en recarga
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


  // Función para consultar estado al servidor
  const consultarEstado = useCallback(async () => {
    try {
      const res = await fetch('/api/sistema/suspension', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.estado) {
          const est: EstadoSuspension = data.estado;
          setSuspendido(Boolean(est.suspendido));
          if (est.motivo) setMotivo(est.motivo);
          if (est.fecha_suspension) setFechaSuspension(est.fecha_suspension);
        }
      }
    } catch (err) {
      // Silenciar errores de red transitorios
    } finally {
      setVerificando(false);
    }
  }, []);

  // 1. Consulta inicial y suscripción a eventos locales
  useEffect(() => {
    consultarEstado();

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<EstadoSuspension>;
      if (customEvent.detail) {
        setSuspendido(Boolean(customEvent.detail.suspendido));
        if (customEvent.detail.motivo) setMotivo(customEvent.detail.motivo);
        if (customEvent.detail.fecha_suspension) setFechaSuspension(customEvent.detail.fecha_suspension);
      } else {
        consultarEstado();
      }
    };

    window.addEventListener(EVENTO_CAMBIO_SUSPENSION, handleCustomEvent);
    return () => {
      window.removeEventListener(EVENTO_CAMBIO_SUSPENSION, handleCustomEvent);
    };
  }, [consultarEstado]);

  // 2. Suscripción a Supabase Realtime para cambio instantáneo en vivo
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel('suspension-sistema-realtime')
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
            if (val.motivo) setMotivo(val.motivo);
            if (val.fecha_suspension) setFechaSuspension(val.fecha_suspension);
          } else {
            consultarEstado();
          }
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [consultarEstado]);

  // 3. Polling de respaldo cada 2.5 segundos (garantiza sincronización 100% infalible)
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      consultarEstado();
    }, 2500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [consultarEstado]);

  // 4. Control de overflow del body y bloqueo de eventos cuando está suspendido
  useEffect(() => {
    if (suspendido && !esMaster) {
      const prevBodyOverflow = document.body.style.overflow;
      const prevHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevBodyOverflow;
        document.documentElement.style.overflow = prevHtmlOverflow;
      };
    }
  }, [suspendido, esMaster]);

  // Si el usuario es el administrador maestro, NUNCA se le bloquea la pantalla
  if (esMaster) {
    return null;
  }

  // Si el sistema no está suspendido, no mostramos nada
  if (!suspendido) {
    return null;
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html, body {
              overflow: hidden !important;
              max-height: 100vh !important;
              height: 100% !important;
            }
          `,
        }}
      />
      <div
        id="lycos-blackout-screen"
        role="dialog"
        aria-modal="true"
        aria-label="Cargando Sistema"
        className="flex flex-col items-center justify-center select-none overflow-hidden"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 2147483647,
          backgroundColor: '#07090e',
          backgroundImage: 'radial-gradient(circle at center, rgba(249, 115, 22, 0.04) 0%, rgba(7, 9, 14, 0.99) 75%)',
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key !== 'F5' && !e.ctrlKey) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        <div className="relative flex flex-col items-center gap-8 z-10 animate-in fade-in duration-500">
          {/* Logo Lycos con animación idéntica a la pantalla inicial */}
          <div className="w-48 h-48 sm:w-60 sm:h-60 animate-logo-pulse relative">
            <img
              src="/Nuevo_Lycos_LOGO copy.png"
              alt="Lycos Team"
              className="w-full h-full object-contain drop-shadow-[0_10px_35px_rgba(0,0,0,0.8)]"
              style={{ filter: 'var(--logo-filter)' }}
            />
          </div>

          {/* Animación del Carro / Línea continua de progreso */}
          <div className="relative w-full max-w-[280px] h-12 flex items-center justify-center overflow-hidden">
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <div className="animate-car-drive">
              <Car className="w-8 h-8 text-primary fill-primary" />
            </div>
          </div>

          {/* Texto inocuo: exactamente igual al inicio */}
          <div className="flex flex-col items-center gap-2">
            <p
              className="text-xs sm:text-sm font-bold tracking-[0.3em] text-white/50 animate-pulse uppercase"
              style={{ fontFamily: 'Syne, sans-serif' }}
            >
              Cargando Sistema
            </p>
            <div className="w-32 h-[1px] bg-white/10" />
          </div>
        </div>

        {/* Halo de luz sutil en el fondo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      </div>
    </>
  );
}
