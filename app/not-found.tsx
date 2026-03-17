import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background dot-pattern flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-8xl font-black text-gradient mb-4" style={{ fontFamily: 'Syne, sans-serif' }}>404</div>
        <h1 className="text-2xl font-bold mb-2">Página no encontrada</h1>
        <p className="text-muted-foreground mb-6 text-sm">La página que buscas no existe o fue movida.</p>
        <Link href="/dashboard" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          Ir al Dashboard
        </Link>
      </div>
    </div>
  );
}
