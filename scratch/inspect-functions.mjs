import fs from 'node:fs';

function inspect(fnName) {
  console.log('========================================');
  console.log(' FUNCTION: ' + fnName);
  console.log('========================================');
  const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const text = fs.readFileSync('supabase/migrations/' + f, 'utf8');
    const regex = new RegExp('CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+(?:public\\.)?' + fnName + '\\b[\\s\\S]*?\\$\\$(?:\\s*LANGUAGE|;)', 'gi');
    let m;
    while ((m = regex.exec(text)) !== null) {
      console.log(`\n--- In file: ${f} ---`);
      console.log(m[0].slice(0, 400) + '...\n');
    }
  }
}

inspect('get_saved_messages');
inspect('update_group_member_role');
inspect('remove_group_member');
inspect('send_message');
