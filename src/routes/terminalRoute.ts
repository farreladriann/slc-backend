// src/routes/terminalRoute.ts
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { getLatestPowerForAll } from '../services/supabaseService';
import { publishBatchControl } from '../services/mqttService';
import { isRunning as knapIsRunning } from '../services/knapsackManager';

const router = Router();

// GET /api/terminals -> returns list with latest power
router.get('/', async (req, res) => {
  try {
    const terminals = await prisma.terminal.findMany({
      orderBy: { terminalPriority: 'asc' },
    });
    const latestMap = await getLatestPowerForAll();

    const result = terminals.map(t => ({
      terminalId: t.terminalId,
      stm32Id: t.stm32Id,
      terminalPriority: t.terminalPriority,
      terminalStatus: t.terminalStatus,
      startOn: t.startOn,
      finishOn: t.finishOn,
      latestPower: latestMap[t.terminalId] ?? null,
    }));

    res.json({ data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil terminals' });
  }
});

/**
 * POST /api/terminals/:id/set
 * body: { status: 'on'|'off' }
 *
 * Behavior:
 * - If desired == 'off': publish directly
 * - If desired == 'on': do capacity check, but if knapsack is running, reject ON (accepted:false)
 */
router.post('/:id/set', async (req, res) => {
  try {
    const terminalId = req.params.id;
    const { status } = req.body; // expected 'on'|'off'
    if (!terminalId || !status) return res.status(400).json({ message: 'terminalId & status required' });

    // normalize
    const desired = status === 'on' ? 'on' : 'off';

    // If knapsack is running, disallow manual ON (safety)
    if (desired === 'on' && knapIsRunning()) {
      return res.status(423).json({ message: 'Knapsack running - manual ON disabled', accepted: false });
    }

    // If desired == 'off' => publish directly (no threshold check)
    if (desired === 'off') {
      const publishRes = await publishBatchControl([{ terminalId, status: 'off' }]);
      return res.json({ message: 'Command published', accepted: true, publishRes });
    }

    // desired == 'on' -> perform capacity check:
    // 1. get current ON terminals and their latest power
    const latestPowerMap = await getLatestPowerForAll(); // power per terminalId
    // 2. get terminals current statuses from prisma
    const allTerminals = await prisma.terminal.findMany();
    // compute total power currently ON (exclude the requested terminal if it's already ON)
    let totalOnPower = 0;
    for (const t of allTerminals) {
      const tId = t.terminalId;
      const statusDb = t.terminalStatus?.toString().toLowerCase() ?? 'off';
      if (statusDb === 'on' && tId !== terminalId) {
        totalOnPower += Number(latestPowerMap[tId] ?? 0);
      }
    }
    // requested terminal's power
    const requestedPower = Number(latestPowerMap[terminalId] ?? 0);

    // determine capacity threshold
    const oneStm32 = await prisma.stm32.findFirst();
    const capacity = oneStm32?.stm32Threshold ?? Number(process.env.DEFAULT_MAX_CAPACITY ?? 1500);

    // check if already ON
    const targetTerm = allTerminals.find(t => t.terminalId === terminalId);
    if (targetTerm && targetTerm.terminalStatus?.toString().toLowerCase() === 'on') {
      // already on -> accept (idempotent)
      const publishRes = await publishBatchControl([{ terminalId, status: 'on' }]);
      return res.json({ message: 'Already ON', accepted: true, publishRes });
    }

    // capacity check:
    const potentialTotal = totalOnPower + requestedPower;
    if (potentialTotal <= capacity) {
      // allowed -> publish
      const publishRes = await publishBatchControl([{ terminalId, status: 'on' }]);
      console.log(`Published on request: ${terminalId} (power ${requestedPower}), total after: ${potentialTotal}/${capacity}`);
      return res.json({ message: 'Command published', accepted: true, publishRes });
    } else {
      // not allowed
      console.log(`Rejected ON for ${terminalId}: required ${requestedPower}, available ${capacity - totalOnPower}/${capacity}`);
      return res.status(200).json({ message: 'Capacity exceeded', accepted: false, reason: 'threshold_exceeded', available: capacity - totalOnPower });
    }
  } catch (err) {
    console.error('Error in set terminal handler:', err);
    return res.status(500).json({ message: 'Failed to publish command', accepted: false });
  }
});

/**
 * Save priorities (autofill missing)
 * body: { terminal_x: priority | null, ... }
 */
router.post('/savePrioritiesAutoFill', async (req, res) => {
  try {
    const body = req.body as Record<string, number | null>;
    // body example: { terminal_1:1, terminal_3:3 }

    const all = await prisma.terminal.findMany();
    const ids = all.map(t => t.terminalId);

    // list priority yg sudah dipakai
    const used = Object.values(body).filter(v => v != null) as number[];
    const allNumbers = [1,2,3,4];

    // buang yg sudah dipakai
    const remaining = allNumbers.filter(n => !used.includes(n));

    // terminal yg belum diisi
    const emptyIds = ids.filter(id => body[id] == null);

    // assign random sisa ke empty
    remaining.sort(()=> Math.random() - 0.5);
    emptyIds.forEach((id,i)=>{
      body[id] = remaining[i];
    });

    // now update DB
    for (const id of ids) {
      await prisma.terminal.update({
        where: { terminalId: id },
        data: { terminalPriority: Number(body[id]) }
      });
    }

    return res.json({message:"saved OK", body});
  } catch(e:any){
    console.log(e);
    return res.status(500).json({message:e.message});
  }
});

/**
 * Reset priorities
 */
router.post('/resetPriorities', async (req, res) => {
  try{
    await prisma.terminal.updateMany({
      data: { terminalPriority: 0 }
    });
    return res.json({message:"reset OK"});
  }catch(e:any){
    return res.status(500).json({message:e.message});
  }
});

/**
 * SET schedule for a terminal (overwrite previous)
 * body: { startOn: string (ISO), finishOn: string (ISO) }
 */
router.post('/:id/schedule', async (req, res) => {
  try {
    const terminalId = req.params.id;
    const { startOn, finishOn } = req.body ?? {};

    if (!terminalId || !startOn || !finishOn) {
      return res.status(400).json({ message: 'terminalId, startOn, finishOn required' });
    }

    const start = new Date(startOn);
    const finish = new Date(finishOn);

    if (isNaN(start.getTime()) || isNaN(finish.getTime())) {
      return res.status(400).json({ message: 'Invalid ISO date format' });
    }

    if (start >= finish) {
      return res.status(400).json({ message: 'startOn must be before finishOn' });
    }

    // update terminal schedule
    const updated = await prisma.terminal.update({
      where: { terminalId },
      data: {
        startOn: start,
        finishOn: finish,
      },
    });

    return res.status(200).json({ message: 'Schedule saved', data: updated });
  } catch (err: any) {
    console.error('Error saving schedule:', err);
    return res.status(500).json({ message: err.message ?? 'Internal error' });
  }
});

/**
 * DELETE /api/terminals/:id/schedule
 * resets startOn & finishOn to null
 */
router.delete('/:id/schedule', async (req, res) => {
  try {
    const terminalId = req.params.id;
    if (!terminalId) return res.status(400).json({ message: 'terminalId required' });

    const updated = await prisma.terminal.update({
      where: { terminalId },
      data: { startOn: null, finishOn: null },
    });

    return res.status(200).json({ message: 'Schedule removed', data: updated });
  } catch (err: any) {
    console.error('Error deleting schedule:', err);
    return res.status(500).json({ message: err.message ?? 'Internal error' });
  }
});

export default router;
