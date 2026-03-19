'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon-sm" disabled className="opacity-50">
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="relative hover:bg-secondary/50 transition-colors"
    >
      <div className="relative w-4 h-4 overflow-hidden">
        <Sun className={cn(
          "h-4 w-4 transition-all duration-500 absolute inset-0",
          isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
        )} />
        <Moon className={cn(
          "h-4 w-4 transition-all duration-500 absolute inset-0",
          isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
        )} />
      </div>
      <span className="sr-only">Cambiar tema</span>
    </Button>
  );
}
