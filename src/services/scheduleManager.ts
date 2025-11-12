// src/services/scheduleManager.ts
import { prisma } from '../lib/prisma';
import { publishBatchControl } from './mqttService';

let _interval: NodeJS.Timeout | null = null;

export function startScheduleWatcher(intervalMs = 30_000) { // cek tiap 30 detik
  if (_interval) return console.log('⏱️ Schedule watcher already running');
  
  _interval = setInterval(async () => {
    const now = new Date();

    // ambil semua terminal yg punya jadwal
    const terminals = await prisma.terminal.findMany({
      where: { startOn: { not: null }, finishOn: { not: null } },
    });

    const toTurnOn: string[] = [];
    const toTurnOff: string[] = [];

    for (const t of terminals) {
      const start = t.startOn ? new Date(t.startOn) : null;
      const finish = t.finishOn ? new Date(t.finishOn) : null;

      if (!start || !finish) continue;

      // jika sekarang antara startOn dan finishOn
      if (now >= start && now < finish && t.terminalStatus === 'off') {
        toTurnOn.push(t.terminalId);
      }
      // jika sudah lewat finishOn
      else if (now >= finish && t.terminalStatus === 'on') {
        toTurnOff.push(t.terminalId);
      }
    }

    // kirim perintah MQTT
    if (toTurnOn.length > 0) {
      await publishBatchControl(toTurnOn.map(id => ({ terminalId: id, status: 'on' })));
      console.log(`🟢 Scheduled ON: ${toTurnOn.join(', ')}`);
    }
    if (toTurnOff.length > 0) {
      await publishBatchControl(toTurnOff.map(id => ({ terminalId: id, status: 'off' })));
      console.log(`🔴 Scheduled OFF: ${toTurnOff.join(', ')}`);
    }
  }, intervalMs);

  console.log(`✅ Schedule watcher started, checking every ${intervalMs / 1000}s`);
}

export function stopScheduleWatcher() {
  if (_interval) clearInterval(_interval);
  _interval = null;
  console.log('⏹️ Schedule watcher stopped');
}
