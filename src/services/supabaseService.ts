// src/services/supabaseService.ts
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_KEY in env');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Terminal DTO used internally
 */
export type TerminalRow = {
  terminalId: string;
  stm32Id?: string | null;
  terminalPriority?: number | null;
  terminalStatus?: string | null;
  startOn?: string | null;
  finishOn?: string | null;
};

/**
 * Power usage row
 */
export type PowerUsageRow = {
  powerUsageId: string;
  terminalId: string;
  power: number;
  ampere?: number | null;
  volt?: number | null;
  timestamp: string;
};

/**
 * Get all terminals (basic fields)
 */
export async function getAllTerminals(): Promise<TerminalRow[]> {
  const { data, error } = await supabase
    .from('terminals')
    .select('terminalId, stm32Id, terminalPriority, terminalStatus, startOn, finishOn');

  if (error) throw error;
  return (data ?? []) as TerminalRow[];
}

export async function updateTerminalPriority(terminalId: string, priority: number | null) {
  const { data, error } = await supabase
    .from('terminals')
    .update({ terminalPriority: priority })
    .eq('terminalId', terminalId)
    .select();

  if (error) throw error;
  return data;
}


/**
 * Get latest power usage for each terminal.
 * Implementation: query powerUsage grouped by terminalId picking latest timestamp.
 * Note: Supabase (Postgres) does not have DISTINCT ON via the client easily; use SQL RPC or simple approach:
 * - fetch latest N entries per terminal is more expensive; here we'll fetch latest per terminal via a single query with aggregation.
 */
export async function getLatestPowerForAll(): Promise<Record<string, number>> {
  // Use raw SQL to get latest per terminal using DISTINCT ON
  const sql = `
    SELECT DISTINCT ON (terminalId) terminalId, power, timestamp
    FROM "powerUsage"
    ORDER BY terminalId, timestamp DESC
  `;
    let data: any = null;
    let error: any = null;

    try {
    const res = await supabase.rpc('sql', { q: sql });
    data = res.data;
    error = res.error;
    } catch (err) {
    error = err;
    }


  // If RPC not available (depends on your Supabase setup), fallback to client method: fetch recent rows and reduce
  if ((error && (error as any).message) || !data) {
    // fallback: fetch recent 500 rows and compute latest per terminal
    const { data: rows, error: err } = await supabase
      .from('powerUsage')
      .select('terminalId, power, timestamp')
      .order('timestamp', { ascending: false })
      .limit(500);
    if (err) throw err;
    const map: Record<string, number> = {};
    (rows ?? []).forEach((r: any) => {
      if (!map[r.terminalId]) map[r.terminalId] = Number(r.power);
    });
    return map;
  }

  // If rpc returned rows:
  const map: Record<string, number> = {};
  (data as any[]).forEach((r: any) => {
    map[r.terminalid ?? r.terminalId] = Number(r.power);
  });
  return map;
}


/**
 * Update terminal status (ON/OFF/UNKNOWN)
 */
export async function updateTerminalStatus(terminalId: string, status: string) {
  const { data, error } = await supabase
    .from('terminals')
    .update({ terminalStatus: status })
    .eq('terminalId', terminalId)
    .select()
    .single();
  if (error) throw error;
  return data as TerminalRow;
}

/**
 * Insert power usage record
 */
export async function insertPowerUsage(payload: {
  powerUsageId: string;
  terminalId: string;
  power: number;
  ampere?: number | null;
  volt?: number | null;
  timestamp?: string;
}) {
  const row = {
    powerUsageId: payload.powerUsageId,
    terminalId: payload.terminalId,
    power: payload.power,
    ampere: payload.ampere ?? null,
    volt: payload.volt ?? null,
    timestamp: payload.timestamp ?? new Date().toISOString(),
  };
  const { data, error } = await supabase.from('powerUsage').insert([row]);
  if (error) throw error;
  return data;
}

/**
 * Optional: insert knapsack log (for audit)
 */
export async function insertKnapsackLog(payload: {
  maxCapacity: number;
  resultJson: any;
  totalPower: number;
  totalPriority: number;
}) {
  // Make sure you created a knapsack_logs table if you want this
  const { data, error } = await supabase.from('knapsack_logs').insert([{
    max_capacity: payload.maxCapacity,
    result_json: JSON.stringify(payload.resultJson),
    total_power: payload.totalPower,
    total_priority: payload.totalPriority,
    created_at: new Date().toISOString()
  }]);
  if (error) {
    // not critical: log but don't throw to caller necessarily
    console.warn('Failed to insert knapsack log:', error.message || error);
    return null;
  }
  return data;
}
