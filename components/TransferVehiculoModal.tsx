'use client';
import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRightLeft, Search, Car, User, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { transferVehiculo } from '@/lib/supabase';
import { Vehiculo, Cliente } from '@/types';

interface Props {
  vehiculo: Vehiculo | null;
  clientes: Cliente[];
  open: boolean;
  onClose: () => void;
  onTransferred: () => void;
  usuario?: string;
  currentOwnerName?: string;
}

export default function TransferVehiculoModal({
  vehiculo, clientes, open, onClose, onTransferred, usuario, currentOwnerName,
}: Props) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ name: string; servicios: number; citas: number } | null>(null);

  const ownerName = currentOwnerName
    || (vehiculo?.cliente ? `${vehiculo.cliente.nombre} ${vehiculo.cliente.apellido}` : '');

  // Candidatos: todos menos el dueño actual
  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (clientes || [])
      .filter(c => c.id !== vehiculo?.cliente_id)
      .filter(c => {
        if (!term) return true;
        return `${c.nombre} ${c.apellido} ${c.telefono || ''} ${c.cedula || ''}`.toLowerCase().includes(term);
      })
      .slice(0, 50);
  }, [clientes, search, vehiculo?.cliente_id]);

  const selectedClient = clientes.find(c => c.id === selectedId) || null;

  function reset() {
    setSearch(''); setSelectedId(''); setLoading(false); setError(''); setDone(null);
  }

  function handleClose() {
    if (loading) return;
    reset();
    onClose();
  }

  async function handleTransfer() {
    if (!vehiculo || !selectedId) return;
    setLoading(true); setError('');
    try {
      const res = await transferVehiculo(vehiculo.id, selectedId, { usuario });
      setDone({
        name: `${res.newClient.nombre} ${res.newClient.apellido}`.trim(),
        servicios: res.serviciosMovidos,
        citas: res.citasMovidas,
      });
      onTransferred();
    } catch (e: any) {
      setError(e?.message || 'No se pudo transferir el vehículo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-primary" /> Transferir Vehículo
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-6 pt-2 space-y-4 custom-scrollbar">
          {/* Vehículo */}
          {vehiculo && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Car className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate text-sm">{vehiculo.marca} {vehiculo.modelo} {vehiculo.anio}</p>
                <p className="text-xs font-bold tracking-wider text-primary truncate">{vehiculo.placa}</p>
                {ownerName && <p className="text-[11px] text-muted-foreground truncate">Dueño actual: {ownerName}</p>}
              </div>
            </div>
          )}

          {done ? (
            <div className="flex flex-col items-center text-center gap-2 py-6">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
              <p className="font-semibold">Vehículo transferido</p>
              <p className="text-sm text-muted-foreground">
                Ahora pertenece a <span className="font-medium text-foreground">{done.name}</span>.
              </p>
              <p className="text-xs text-muted-foreground">
                Se reasignaron {done.servicios} servicio(s) y {done.citas} cita(s).
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
                  Nuevo cliente
                </p>
                <div className="relative">
                  <Input
                    placeholder="Buscar por nombre, cédula o teléfono…"
                    icon={<Search />}
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setSelectedId(''); }}
                  />
                </div>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
                {candidates.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    {clientes.length <= 1 ? 'No hay otros clientes disponibles.' : 'Sin resultados.'}
                  </p>
                )}
                {candidates.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                      selectedId === c.id
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border/30 bg-muted/20 hover:bg-muted/40'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.nombre} {c.apellido}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {c.telefono || 'Sin teléfono'}{c.cedula ? ` · CI ${c.cedula}` : ''}
                      </p>
                    </div>
                    {selectedId === c.id && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>

              {selectedClient && (
                <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">
                    El vehículo y su historial de servicios y citas pasarán de{' '}
                    <span className="font-medium text-foreground">{ownerName || 'sin dueño'}</span> a{' '}
                    <span className="font-medium text-foreground">{selectedClient.nombre} {selectedClient.apellido}</span>.
                    Esta acción se reflejará en toda la base de datos.
                  </p>
                </div>
              )}

              {error && (
                <div className="p-2.5 rounded-lg border border-red-500/20 bg-red-500/5 text-xs text-red-400 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 p-4 border-t border-border/20 shrink-0">
          {done ? (
            <Button onClick={handleClose} className="w-full">Listo</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={loading}>Cancelar</Button>
              <Button onClick={handleTransfer} disabled={!selectedId || loading} className="gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                {loading ? 'Transfiriendo…' : 'Transferir'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
