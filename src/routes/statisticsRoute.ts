import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { subDays, subMonths, subYears } from 'date-fns';

const router = Router();

/**
 * DAILY → grafik 7 hari terakhir, summary hari ini
 * MONTHLY → grafik 12 bulan terakhir, summary bulan ini
 * YEARLY → grafik 5 tahun terakhir, summary tahun ini
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const type = ((req.query.type as string) || 'daily').toLowerCase();
    const pricePerKwh = Number(process.env.PRICE_PER_KWH ?? 1500);

    const now = new Date();
    let chartStart: Date;
    let summaryStart: Date;
    let periodsCount = 0;
    let periodUnit: 'day' | 'month' | 'year' = 'day';

    // =============================
    // PERIODE CHART & SUMMARY
    // =============================
    if (type === 'monthly') {
      periodUnit = 'month';
      periodsCount = 12;

      chartStart = subMonths(now, 11);
      summaryStart = new Date(now.getFullYear(), now.getMonth(), 1);

    } else if (type === 'yearly') {
      periodUnit = 'year';
      periodsCount = 5;

      chartStart = subYears(now, 4);
      summaryStart = new Date(now.getFullYear(), 0, 1);

    } else {
      // DAILY
      periodUnit = 'day';
      periodsCount = 7;

      chartStart = subDays(now, 6);
      summaryStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const chartStartIso = chartStart.toISOString();
    const summaryStartIso = summaryStart.toISOString();
    const nowIso = now.toISOString();

    // =========================================
    // SINGLE QUERY FOR CHART & SUMMARY
    // =========================================
    // Mengambil data per terminal per periode (hari/bulan/tahun)
    // Menggunakan window function LEAD untuk menghitung durasi (integral)
    
    const dateTruncUnit =
      periodUnit === 'day' ? 'day' : periodUnit === 'month' ? 'month' : 'year';

    const rawStats = await prisma.$queryRaw<
      { terminalid: string; period: Date; kwh: number }[]
    >`
      WITH ordered_data AS (
        SELECT 
          "terminalId",
          "timestamp",
          power,
          LEAD("timestamp") OVER (PARTITION BY "terminalId" ORDER BY "timestamp") as next_ts
        FROM "powerUsage"
        WHERE "timestamp" >= ${chartStartIso}::timestamptz
          AND "timestamp" <= ${nowIso}::timestamptz
      ),
      calculated_energy AS (
        SELECT
          "terminalId",
          "timestamp",
          -- Rumus kWh: (Watt * Durasi_Detik) / 3600 / 1000
          (power * EXTRACT(EPOCH FROM (COALESCE(next_ts, "timestamp") - "timestamp")) / 3600.0 / 1000.0) as segment_kwh
        FROM ordered_data
      )
      SELECT 
        "terminalId" AS terminalid,
        date_trunc(${dateTruncUnit}, "timestamp") AS period,
        SUM(segment_kwh) AS kwh
      FROM calculated_energy
      GROUP BY "terminalId", period
      ORDER BY period
    `;

    // 1. PROSES SUMMARY (Periode saat ini saja)
    // Filter data yang period-nya >= summaryStart
    const summaryStats = rawStats.filter(
      (r) => new Date(r.period).getTime() >= summaryStart.getTime()
    );

    const terminals = summaryStats.map((r) => ({
      terminalId: r.terminalid,
      kwh: Number((r.kwh ?? 0).toFixed(4)),
    }));

    const totalKwh = terminals.reduce((s, t) => s + t.kwh, 0);

    // 2. PROSES CHART (Agregasi semua terminal per periode)
    const map = new Map<string, number>();

    rawStats.forEach((r) => {
      const d = new Date(r.period);
      let key = '';

      if (periodUnit === 'day') key = d.toISOString().slice(0, 10);
      else if (periodUnit === 'month')
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      else key = `${d.getFullYear()}`;

      const currentVal = map.get(key) ?? 0;
      map.set(key, currentVal + Number(r.kwh));
    });

    const series = [];
    for (let i = 0; i < periodsCount; i++) {
      let d: Date;
      if (periodUnit === 'day') d = subDays(now, periodsCount - 1 - i);
      else if (periodUnit === 'month')
        d = subMonths(now, periodsCount - 1 - i);
      else d = subYears(now, periodsCount - 1 - i);

      let label = '';
      if (periodUnit === 'day') label = d.toISOString().slice(0, 10);
      else if (periodUnit === 'month')
        label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      else label = `${d.getFullYear()}`;

      series.push({
        label,
        value: map.get(label) ?? 0,
      });
    }

    // =============================
    // TOTAL COST
    // =============================
    const totalCost = totalKwh * pricePerKwh;

    return res.json({
      total_kwh: totalKwh,
      total_cost: totalCost,
      terminals,
      series,
      meta: {
        type,
        period_unit: periodUnit,
      },
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

export default router;
