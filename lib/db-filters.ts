import { supabase } from "./supabase";
import { useSedeStore } from "./store/useSedeStore";

/**
 * Helper para aplicar el filtro de Sede a las consultas de Supabase.
 * Uso:
 * const query = withSedeFilter(supabase.from('inventario').select('*'));
 * const { data } = await query;
 */
export function withSedeFilter(queryBuilder: any) {
  try {
    const { currentSede } = useSedeStore.getState();
    
    if (currentSede) {
       return new Proxy(queryBuilder, {
         get(target, prop) {
           const origMethod = target[prop as keyof typeof target];
           if (typeof origMethod === 'function' && ['select', 'update', 'delete'].includes(prop as string)) {
             return function (...args: any[]) {
                // Intercept the call (e.g., .select('*'))
                const filterBuilder = (origMethod as Function).apply(target, args);
                // Append the sede_id filter automatically to the resulting FilterBuilder
                return filterBuilder.eq('sede_id', currentSede.id);
             };
           }
           if (typeof origMethod === 'function') {
             return origMethod.bind(target);
           }
           return origMethod;
         }
       });
    }
    
    return queryBuilder;
  } catch (error) {
    return queryBuilder;
  }
}

/**
 * Agrega el sede_id actual al payload de un insert
 * Uso:
 * const payload = withSedeInsert({ nombre: 'Item', precio: 10 });
 * await supabase.from('inventario').insert(payload);
 */
export function withSedeInsert(payload: any) {
  try {
    const { currentSede } = useSedeStore.getState();
    if (currentSede) {
      if (Array.isArray(payload)) {
        return payload.map(item => ({ ...item, sede_id: currentSede.id }));
      }
      return { ...payload, sede_id: currentSede.id };
    }
    return payload;
  } catch (error) {
    return payload;
  }
}
