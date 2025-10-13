import { initAdminDashboard } from './dashboard.js';

function boot() {
  const mount = document.getElementById('a11ytb-admin-app');
  initAdminDashboard(mount);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
