// src/services/knapsackManager.ts
import { runKnapsack } from './knapsackService';
import { prisma } from '../lib/prisma';
import { getLatestPowerForAll, insertKnapsackLog } from './supabaseService';
import { publishBatchControl } from './mqttService';

let _interval: NodeJS.Timeout | null = null;
let _running = false;
let _runningLock = false; // prevent overlapping runs

export function isRunning() {
  return _running;
}

/**
 * startLoop: jalankan knapsack setiap `intervalMs` milidetik.
 * intervalMs default 30000.
 */
export async function startLoop(intervalMs = 30000) {
  if (_running) return { started: false, message: 'already running' };
  _running = true;

  // immediate run once
  void executeOnce().catch((e) => console.error('knapsack immediate run error', e));

  _interval = setInterval(() => {
    void executeOnce().catch((e) => console.error('knapsack periodic error', e));
  }, intervalMs);

  console.log('Knapsack loop started, intervalMs=', intervalMs);
  return { started: true };
}

export async function stopLoop() {
  if (!_running) return { stopped: false, message: 'not running' };
  _running = false;
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  console.log('Knapsack loop stopped');
  return { stopped: true };
}

async function executeOnce() {
  if (_runningLock) {
    console.log('Previous knapsack run still executing - skipping this tick');
    return;
  }
  _runningLock = true;
  try {
    // Fetch terminals
    const terminals = await prisma.terminal.findMany({
      orderBy: { terminalPriority: 'asc' },
    });
    if (!terminals || terminals.length === 0) {
      console.log('No terminals found, skipping knapsack run');
      return;
    }

    const latestPowerMap = await getLatestPowerForAll();
    const items = terminals.map((t) => ({
      terminalId: t.terminalId,
      power: Number(latestPowerMap[t.terminalId] ?? 0),
      priority: Number(t.terminalPriority ?? 0),
    }));

    // determine capacity
    const oneStm32 = await prisma.stm32.findFirst();
    const capacity = oneStm32?.stm32Threshold ?? Number(process.env.DEFAULT_MAX_CAPACITY ?? 1500);

    // run knapsack
    const knap = await runKnapsack(items, capacity, { mode: 'AUTO' });

    // build commands and publish
    const commands: { terminalId: string; status: 'on' | 'off' }[] = items.map((it) => ({
        terminalId: it.terminalId,
        status: knap.selectedIds.includes(it.terminalId) ? 'on' : 'off',
        }));

    const publishResults = await publishBatchControl(commands);

    // optional log
    try {
      await insertKnapsackLog({
        maxCapacity: capacity,
        resultJson: knap,
        totalPower: knap.totalPower,
        totalPriority: knap.totalPriority,
      });
    } catch (err) {
      console.warn('insertKnapsackLog failed', err);
    }

    console.log(`Knapsack run done: selected ${knap.selectedIds.join(',')}`);
    return { knap, publishResults };
  } finally {
    _runningLock = false;
  }
}
