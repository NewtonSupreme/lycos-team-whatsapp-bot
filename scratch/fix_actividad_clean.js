const fs = require('fs');
const path = 'app/dashboard/actividad/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Ensure useSedeStore is imported
if (!content.includes('useSedeStore')) {
  content = content.replace(
    "import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';",
    "import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';\nimport { useSedeStore } from '@/lib/store/useSedeStore';"
  );
}

// Add currentSede to ActividadPage
content = content.replace(
  "export default function ActividadPage() {\n  const [logs, setLogs] = useState<LogEntry[]>([]);",
  "export default function ActividadPage() {\n  const { currentSede } = useSedeStore();\n  const [logs, setLogs] = useState<LogEntry[]>([]);"
);

// Wrap supabase.from('logs_actividad')
content = content.replace(
  "const { data } = await supabase\n        .from('logs_actividad')",
  "const { data } = await withSedeFilter(supabase.from('logs_actividad'))"
);

// Add currentSede to dependency array for loadLogs
content = content.replace(
  "setLoading(false);\n  }, []);",
  "setLoading(false);\n  }, [currentSede]);"
);

// Update realtime filter
content = content.replace(
  "const ch = supabase.channel('actividad-logs')\n      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs_actividad' }, (payload) => {",
  "const filterQuery = currentSede ? `sede_id=eq.${currentSede.id}` : undefined;\n    const ch = supabase.channel(`actividad-logs-${currentSede?.id || 'all'}`)\n      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs_actividad', filter: filterQuery }, (payload) => {"
);

// Update realtime dependency array
content = content.replace(
  "return () => { supabase?.removeChannel(ch); };\n  }, []);",
  "return () => { supabase?.removeChannel(ch); };\n  }, [currentSede]);"
);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed actividad page robustly');
