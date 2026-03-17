'use client';
import React, { useEffect, useState } from 'react';
import { Car } from 'lucide-react';

export default function LoadingScreen() {
  const [mounted, setMounted] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Start fading out after 2.5 seconds
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 2500);

    // Unmount after animation finishes (3.3 seconds total)
    const unmountTimer = setTimeout(() => {
      setMounted(false);
    }, 3300);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0a0a0a] ${fading ? 'animate-fade-out' : ''}`}>
      <div className="relative flex flex-col items-center gap-8">
        {/* Transparent Logo */}
        <div className="w-48 h-48 md:w-64 md:h-64 animate-logo-pulse">
          <img 
            src="/Logo lycos team trans.png" 
            alt="Lycos Team" 
            className="w-full h-full object-contain"
          />
        </div>

        {/* Car Animation Container */}
        <div className="relative w-full max-w-[300px] h-12 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <div className="animate-car-drive">
            <Car className="w-8 h-8 text-primary fill-primary" />
          </div>
        </div>

        {/* Text */}
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-bold tracking-[0.3em] text-white/50 animate-pulse uppercase" style={{ fontFamily: 'Syne, sans-serif' }}>
            Cargando Sistema
          </p>
          <div className="w-32 h-[1px] bg-white/10" />
        </div>
      </div>

      {/* Background decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
    </div>
  );
}
