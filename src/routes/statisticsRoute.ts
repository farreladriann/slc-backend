// src/routes/statisticsRoute.ts
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { subDays, subMonths, subYears } from 'date-fns';

const router = Router();

/**
 * GET /api/statistics?type=daily|monthly|yearly
 *
 * Response format:
 * {
 *   total_kwh: number,
 *   total_cost: number,
 *   terminals: [{ terminalId: string, kwh: number }],
 *   series: [{ label: string, value: number }]
 * }
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const type = ((req.query.type as string) || 'daily').toLowerCase();
    const sampleSec = Number(process.env.SAMPLE_INTERVAL_SECONDS ?? 10);
    const pricePerKwh = Number(process.env.PRICE_PER_KWH ?? 1500);

    // Tentukan periode waktu
    const now = new Date();
    let startDate: Date;
    let periodsCount = 0;
    let periodUnit: 'day' | 'month' | 'year' = 'day';

    if (type === 'monthly') {
      periodUnit = 'month';
      periodsCount = 12;
      startDate = subMonths(now, periodsCount - 1);
    } else if (type === 'yearly') {
      periodUnit = 'year';
      periodsCount = 5;
      startDate = subYears(now, periodsCount - 1);
    } else {
      // daily
      periodUnit = 'day';
      periodsCount = 7;
      startDate = subDays(now, periodsCount - 1);
    }

    const startIso = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate()
    ).toISOString();
    const endIso = now.toISOString();

    // ===============================
    // Query 1: agregasi per terminal
    // ===============================
    const terminalAgg = await prisma.$queryRaw<
    { terminalid: string; sum_power: number }[]
    >`
    SELECT "terminalId" as terminalid, SUM(power) as sum_power
    FROM "powerUsage"
    WHERE "timestamp" >= ${startIso}::timestamptz AND "timestamp" <= ${endIso}::timestamptz
    GROUP BY "terminalId"
    `;

    // ===============================
    // Query 2: agregasi per periode (untuk grafik)
    // ===============================
    const dateTruncUnit =
    periodUnit === 'day' ? 'day' : periodUnit === 'month' ? 'month' : 'year';

    const seriesAgg = await prisma.$queryRaw<
    { period: Date; sum_power: number }[]
    >`
    SELECT date_trunc(${dateTruncUnit}, "timestamp") as period, SUM(power) as sum_power
    FROM "powerUsage"
    WHERE "timestamp" >= ${startIso}::timestamptz AND "timestamp" <= ${endIso}::timestamptz
    GROUP BY period
    ORDER BY period
    `;


    // ===============================
    // Konversi hasil ke kWh
    // ===============================
    const factor = sampleSec / 3_600_000.0; // W * s / 3.6e6 = kWh
    const terminals = (terminalAgg ?? []).map((r) => {
      const sumPower = Number(r.sum_power ?? 0);
      const kwh = sumPower * factor;
      return { terminalId: r.terminalid, kwh: Number(kwh.toFixed(4)) };
    });

    const totalKwh = terminals.reduce((s, t) => s + (t.kwh ?? 0), 0);

    // ===============================
    // Series (chart) data
    // ===============================
    const seriesMap = new Map<string, number>();
    (seriesAgg ?? []).forEach((r) => {
      const d = new Date(r.period);
      let label = '';
      if (periodUnit === 'day') {
        label = d.toISOString().slice(0, 10);
      } else if (periodUnit === 'month') {
        label = `${d.getFullYear()}-${(d.getMonth() + 1)
          .toString()
          .padStart(2, '0')}`;
      } else {
        label = `${d.getFullYear()}`;
      }
      seriesMap.set(label, Number((r.sum_power ?? 0) * factor));
    });

    const series: { label: string; value: number }[] = [];
    for (let i = 0; i < periodsCount; i++) {
      let label = '';
      if (periodUnit === 'day') {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        label = d.toISOString().slice(0, 10);
      } else if (periodUnit === 'month') {
        const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
        label = `${d.getFullYear()}-${(d.getMonth() + 1)
          .toString()
          .padStart(2, '0')}`;
      } else {
        const d = new Date(startDate.getFullYear() + i, 0, 1);
        label = `${d.getFullYear()}`;
      }
      const val = seriesMap.get(label) ?? 0;
      series.push({ label, value: Number(val.toFixed(4)) });
    }

    // ===============================
    // Total biaya
    // ===============================
    const totalCost = totalKwh * pricePerKwh;

    return res.json({
      total_kwh: Number(totalKwh.toFixed(4)),
      total_cost: Number(totalCost.toFixed(2)),
      terminals,
      series,
      meta: {
        type,
        sample_seconds: sampleSec,
        price_per_kwh: pricePerKwh,
        period_unit: periodUnit,
      },
    });
  } catch (err: any) {
    console.error('statisticsRoute error', err);
    return res.status(500).json({ message: err.message ?? 'Internal error' });
  }
});

export default router;
