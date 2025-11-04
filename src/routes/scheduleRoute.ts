// src/routes/scheduleRoute.ts
import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// SET schedule
router.post('/:terminalId', async (req, res) => {
  try {
    const { terminalId } = req.params;
    const { startOn, finishOn } = req.body; // expected ISO string

    if (!startOn || !finishOn) {
      return res.status(400).json({ message: 'startOn & finishOn required' });
    }

    const updated = await prisma.terminal.update({
      where: { terminalId },
      data: { startOn: new Date(startOn), finishOn: new Date(finishOn) },
    });

    return res.json({ message: 'Schedule saved', data: updated });
  } catch (err:any) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

// DELETE schedule
router.delete('/:terminalId', async (req, res) => {
  try {
    const { terminalId } = req.params;

    const updated = await prisma.terminal.update({
      where: { terminalId },
      data: { startOn: null, finishOn: null },
    });

    return res.json({ message: 'Schedule deleted', data: updated });
  } catch (err:any) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

export default router;
