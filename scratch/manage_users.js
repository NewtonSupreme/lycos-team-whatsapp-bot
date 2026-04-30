
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://svazupuylnaxqmtaastz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YXp1cHV5bG5heHFtdGFhc3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MTUxMjYsImV4cCI6MjA4OTI5MTEyNn0.l_rCrXM0qmMSU6ZMkv_9aP4vQbJR3m02prauifyo09o';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUsers() {
  const { data: users, error } = await supabase
    .from('usuarios')
    .select('*');

  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  console.log('Existing users:', users);

  const targets = [
    { username: 'daniela', nombre: 'Daniela', email: 'daniela@lycosteam.com' },
    { username: 'andrea', nombre: 'Andrea', email: 'andrea@lycosteam.com' },
    { username: 'alejandra', nombre: 'Alejandra', email: 'alejandra@lycosteam.com' }
  ];

  for (const target of targets) {
    const exists = users.find(u => u.username === target.username);
    if (!exists) {
      console.log(`Adding user ${target.username}...`);
      const { data, error: insertError } = await supabase
        .from('usuarios')
        .insert({
          username: target.username,
          nombre: target.nombre,
          email: target.email,
          password_hash: 'lycos2026',
          rol: 'usuario',
          activo: true
        });
      
      if (insertError) {
        console.error(`Error adding ${target.username}:`, insertError);
      } else {
        console.log(`User ${target.username} added successfully.`);
      }
    } else {
      console.log(`User ${target.username} already exists.`);
      // Update password just in case
      if (exists.password_hash !== 'lycos2026') {
        console.log(`Updating password for ${target.username}...`);
        await supabase.from('usuarios').update({ password_hash: 'lycos2026' }).eq('username', target.username);
      }
    }
  }
}

checkUsers();
