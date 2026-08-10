import { execSync } from 'child_process';

try {
  console.log('Recreating DB...');
  execSync('node scratch/recreate_db.js', { stdio: 'inherit' });
  
  console.log('Loading Schema...');
  execSync('node scratch/load_schema.js', { stdio: 'inherit' });
  
  console.log('Setting Admin...');
  execSync('node scratch/setup_admin.js', { stdio: 'inherit' });

  // Adding the missing fix_menu_access logic since users table was recreated
  console.log('Updating Admin access...');
  execSync('node scratch/fix_menu_access.js', { stdio: 'inherit' });
  
  console.log('--- ALL INITIALIZATION COMPLETED ---');
} catch (e) {
  console.error('Failed initialization:', e);
}
