// src/routes/knapsackRoute.ts
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getLatestPowerForAll, insertKnapsackLog } from '../services/supabaseService';
import { runKnapsack } from '../services/knapsackService';
import { publishBatchControl } from '../services/mqttService';
import { startLoop, stopLoop, isRunning as knapIsRunning } from '../services/knapsackManager';

const router = Router();

// Update terminal priority
router.post('/terminals/updatePriority', async (req: Request, res: Response) => {
  try {
    const { terminalId, priority } = req.body;

    if (!terminalId || priority === undefined) {
      return res.status(400).json({ message: 'terminalId dan priority wajib diisi' });
    }

    const updated = await prisma.terminal.update({
      where: { terminalId },
      data: { terminalPriority: Number(priority) },
    });

    console.log(`✅ Updated terminal ${terminalId} ke priority ${priority}`);
    res.status(200).json({ message: 'Priority updated successfully', data: updated });
  } catch (err: any) {
    console.error('❌ Error update priority:', err);
    res.status(500).json({ message: err.message });
  }
});

// Run knapsack algorithm once (on-demand)
router.post('/run', async (req: Request, res: Response) => {
  try {
    const { maxCapacity, mode } = req.body;
    const capacityInput = Number(maxCapacity) || undefined;

    // Fetch terminals
    const terminals = await prisma.terminal.findMany({
      orderBy: { terminalPriority: 'asc' },
    });

    if (!terminals || terminals.length === 0) {
      return res.status(404).json({ message: 'No terminals found' });
    }

    // Latest power readings from Supabase
    const latestPowerMap = await getLatestPowerForAll();

    // Build items for knapsack
    const items = terminals.map(t => ({
      terminalId: t.terminalId,
      power: Number(latestPowerMap[t.terminalId] ?? 0),
      priority: Number(t.terminalPriority ?? 0),
    }));

    // Determine capacity
    let capacity = capacityInput;
    if (!capacity) {
      const oneStm32 = await prisma.stm32.findFirst();
      capacity = oneStm32?.stm32Threshold ?? Number(process.env.DEFAULT_MAX_CAPACITY ?? 1500);
    }

    // Run knapsack
    const knapResult = await runKnapsack(items, capacity, { mode: mode ?? 'AUTO' });

    // Build publish commands (TS type-safe)
    const commands: { terminalId: string; status: 'on' | 'off' }[] = items.map(it => ({
      terminalId: it.terminalId,
      status: knapResult.selectedIds.includes(it.terminalId) ? 'on' : 'off',
    }));

    // Publish to MQTT
    const publishResults = await publishBatchControl(commands);

    // Optional: insert knapsack log to Supabase (non-blocking)
    try {
      await insertKnapsackLog({
        maxCapacity: capacity,
        resultJson: knapResult,
        totalPower: knapResult.totalPower,
        totalPriority: knapResult.totalPriority,
      });
    } catch (err) {
      console.warn('insertKnapsackLog warning:', (err as any).message ?? err);
    }

    return res.status(200).json({
      message: 'Knapsack executed',
      data: {
        selected: knapResult.selectedIds,
        totalPower: knapResult.totalPower,
        totalPriority: knapResult.totalPriority,
        publishResults,
        runtimeMs: knapResult.runtimeMs,
      },
    });
  } catch (err: any) {
    console.error('❌ Error running knapsack:', err);
    return res.status(500).json({ message: err.message ?? 'Internal error' });
  }
});

/**
 * Start continuous knapsack loop
 * body: { intervalMs?: number }
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const intervalMs = Number(req.body?.intervalMs) || 60000;
    const out = await startLoop(intervalMs);
    return res.status(200).json({ running: true, info: out });
  } catch (err: any) {
    console.error('start knapsack err', err);
    return res.status(500).json({ message: 'Failed to start', error: err.message });
  }
});

/**
 * Stop continuous knapsack loop
 */
router.post('/stop', async (_req: Request, res: Response) => {
  try {
    const out = await stopLoop();
    return res.status(200).json({ running: false, info: out });
  } catch (err: any) {
    console.error('stop knapsack err', err);
    return res.status(500).json({ message: 'Failed to stop', error: err.message });
  }
});

/**
 * Status endpoint
 */
router.get('/status', (_req: Request, res: Response) => {
  return res.status(200).json({ running: knapIsRunning() });
});

export default router;
