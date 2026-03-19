'use client';
import React, { useEffect, useState } from 'react';
import { Car } from 'lucide-react';

export default function LoadingScreen() {
  const [mounted, setMounted] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Start fading out after 1 second
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 1000);

    // Unmount after animation finishes (1.8 seconds total)
    const unmountTimer = setTimeout(() => {
      setMounted(false);
    }, 1800);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm transition-all duration-700 ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      <div className="relative flex flex-col items-center gap-8">
        {/* Transparent Logo */}
        <div className="w-48 h-48 md:w-64 md:h-64 animate-logo-pulse">
          <img 
            src="/Logo lycos team trans.png" 
            alt="Lycos Team" 
            className="w-full h-full object-contain dark:invert-0 light:invert"
            style={{ filter: 'var(--logo-filter)' }}
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
          <p className="text-sm font-bold tracking-[0.3em] text-foreground/50 animate-pulse uppercase" style={{ fontFamily: 'Syne, sans-serif' }}>
            Cargando Sistema
          </p>
          <div className="w-32 h-[1px] bg-foreground/10" />
        </div>
      </div>

      {/* Background decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
    </div>
  );
}
