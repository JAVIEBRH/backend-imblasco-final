/**
 * Liberar puerto automáticamente antes de iniciar el servidor
 * Uso: node src/scripts/free-port.js 3001
 */

import { execSync } from 'child_process';

const port = process.argv[2];

if (!port) {
  console.error('❌ Debes indicar un puerto. Ej: node src/scripts/free-port.js 3001');
  process.exit(1);
}

function killWindowsPort(targetPort) {
  try {
    const output = execSync(`netstat -ano | findstr :${targetPort}`, { stdio: 'pipe' }).toString();
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    const pids = new Set();

    lines.forEach(line => {
      if (line.includes('LISTENING')) {
        const parts = line.split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') pids.add(pid);
      }
    });

    if (pids.size === 0) {
      console.log(`✅ Puerto ${targetPort} libre (no hay procesos escuchando).`);
      return;
    }

    pids.forEach(pid => {
      console.log(`⚠️  Cerrando PID ${pid} en puerto ${targetPort}...`);
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    });

    console.log(`✅ Puerto ${targetPort} liberado.`);
  } catch (error) {
    console.log(`✅ Puerto ${targetPort} libre (no se detectó proceso).`);
  }
}

function killUnixPort(targetPort) {
  try {
    const output = execSync(`lsof -ti tcp:${targetPort}`, { stdio: 'pipe' }).toString().trim();
    if (!output) {
      console.log(`✅ Puerto ${targetPort} libre.`);
      return;
    }
    const pids = output.split('\n').filter(Boolean);
    pids.forEach(pid => {
      console.log(`⚠️  Cerrando PID ${pid} en puerto ${targetPort}...`);
      execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    });
    console.log(`✅ Puerto ${targetPort} liberado.`);
  } catch (_) {
    console.log(`✅ Puerto ${targetPort} libre.`);
  }
}

if (process.platform === 'win32') {
  killWindowsPort(port);
} else {
  killUnixPort(port);
}
