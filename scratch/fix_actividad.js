const fs = require('fs');

const path = 'app/dashboard/actividad/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add useSedeStore
if (!content.includes('useSedeStore')) {
  content = content.replace(/import \{ withSedeFilter, withSedeInsert \} from '@\/lib\/db-filters';/, 
    "import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';\nimport { useSedeStore } from '@/lib/store/useSedeStore';");
}

// 2. Add currentSede to ActividadPage component
content = content.replace(/export default function ActividadPage\(\) \{\s+const \[logs, setLogs\] = useState/, 
  "export default function ActividadPage() {\n  const { currentSede } = useSedeStore();\n  const [logs, setLogs] = useState");

// 3. Wrap supabase.from('logs_actividad')
content = content.replace(/const \{ data \} = await supabase\s*\n\s*\.from\('logs_actividad'\)/, 
  "const { data } = await withSedeFilter(supabase.from('logs_actividad'))");

// 4. Update loadLogs dependencies
content = content.replace(/setLoading\(false\);\n\s*\}, \[\]\);/, "setLoading(false);\n  }, [currentSede]);");

// 5. Update Realtime channel filter and dependencies
const realtimeOriginal = `const ch = supabase.channel('actividad-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs_actividad' }, (payload) => {`;
      
const realtimeNew = `const filterQuery = currentSede ? \`sede_id=eq.\${currentSede.id}\` : undefined;
    const ch = supabase.channel(\`actividad-logs-\${currentSede?.id || 'all'}\`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs_actividad', filter: filterQuery }, (payload) => {`;

content = content.replace(realtimeOriginal, realtimeNew);
content = content.replace(/return \(\) => \{ supabase\?\.removeChannel\(ch\); \};\n\s*\}, \[\]\);/, "return () => { supabase?.removeChannel(ch); };\n  }, [currentSede]);");

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed actividad page');
