// src/routes/terminalRoute.ts
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { getLatestPowerForAll } from '../services/supabaseService';
import { publishBatchControl } from '../services/mqttService';



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

// inside src/routes/terminalRoute.ts (replace existing router.post('/:id/set',...))
router.post('/:id/set', async (req, res) => {
        try {
            const terminalId = req.params.id;
            const { status } = req.body; // expected 'on'|'off'
            if (!terminalId || !status) return res.status(400).json({ message: 'terminalId & status required' });

            // normalize
            const desired = status === 'on' ? 'on' : 'off';

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
            // already on -> accept
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


router.post('/:id/set', async (req, res) => {
    try {
        const terminalId = req.params.id;
        const { status } = req.body; // expected 'on'|'off'
        if (!terminalId || !status) return res.status(400).json({ message: 'terminalId & status required' });

        // publish single command
        const publishRes = await publishBatchControl([{ terminalId, status: status === 'on' ? 'on' : 'off' }]);

        // Optionally: optimistic update to DB? prefer wait for device ack via mqtt status
        res.json({ message: 'Command published', publishRes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to publish command' });
    }
    });

export default router;
