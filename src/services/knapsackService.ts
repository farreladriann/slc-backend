// src/services/knapsackService.ts
export type KnapsackItem = {
  terminalId: string;
  power: number; // in watts (float)
  priority: number; // integer (lower number = higher priority in your design) or 0 = none
};

export type KnapsackResult = {
  selectedIds: string[];
  totalPower: number;
  totalPriority: number;
  modeUsed: 'DP' | 'GREEDY';
  runtimeMs: number;
};

function mapPriorityToValue(priority: number, maxPriority: number) {
  if (priority === null || priority === undefined) return 0;
  // smaller priority number => higher value
  // value = (maxPriority - priority + 1)
  return Math.max(0, maxPriority - priority + 1);
}

export async function runKnapsack(items: KnapsackItem[], capacity: number, options?: { quantizeFactor?: number; mode?: 'AUTO' | 'DP' | 'GREEDY' }): Promise<KnapsackResult> {
  const start = Date.now();
  const quantizeFactor = options?.quantizeFactor ?? 1; // 1 watt unit
  const modeOption = options?.mode ?? 'AUTO';

  const n = items.length;
  const maxPriority = items.reduce((m, it) => Math.max(m, it.priority ?? 0), 0);

  // Prepare value & weights
  const prepared = items.map(it => {
    const value = mapPriorityToValue(it.priority ?? 0, maxPriority);
    const weight = Math.max(1, Math.round(it.power / quantizeFactor)); // at least 1
    return { ...it, value, weight };
  });

  // Heuristic thresholds for DP vs Greedy
  const capUnits = Math.floor(capacity / quantizeFactor);
  const dpCells = capUnits * n;
  const useGreedy = modeOption === 'GREEDY' || modeOption === 'AUTO' && (n > 200 || dpCells > 2_000_000);

  if (useGreedy) {
    // GREEDY by density (value / weight), ties to smaller weight
    prepared.sort((a, b) => {
      const da = (a.value / a.weight) || 0;
      const db = (b.value / b.weight) || 0;
      if (db === da) return a.weight - b.weight;
      return db - da;
    });
    const selected: string[] = [];
    let used = 0;
    let totalPriority = 0;
    for (const p of prepared) {
      if (used + p.weight <= capUnits) {
        selected.push(p.terminalId);
        used += p.weight;
        totalPriority += p.value;
      }
    }
    // compute real watt used
    const totalPower = items.filter(i => selected.includes(i.terminalId)).reduce((s, it) => s + it.power, 0);
    return { selectedIds: selected, totalPower, totalPriority, modeUsed: 'GREEDY', runtimeMs: Date.now() - start };
  }

  // DP 0/1 knapsack
  const W = capUnits;
  // dp array optimized to 1D but we need to recover selected items -> keep 2D boolean choose table or keep parent pointer
  // We'll use 2D boolean keep for clarity (n+1) x (W+1) - be cautious about memory
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(W + 1).fill(0));
  const keep: boolean[][] = Array.from({ length: n + 1 }, () => new Array(W + 1).fill(false));

  for (let i = 1; i <= n; i++) {
    const wt = prepared[i - 1].weight;
    const val = prepared[i - 1].value;
    for (let w = 0; w <= W; w++) {
      if (wt <= w) {
        const take = dp[i - 1][w - wt] + val;
        const notake = dp[i - 1][w];
        if (take > notake) {
          dp[i][w] = take;
          keep[i][w] = true;
        } else {
          dp[i][w] = notake;
          keep[i][w] = false;
        }
      } else {
        dp[i][w] = dp[i - 1][w];
      }
    }
  }

  // backtrack
  let w = W;
  const selected: string[] = [];
  let totalPriority = 0;
  for (let i = n; i >= 1; i--) {
    if (keep[i][w]) {
      selected.push(prepared[i - 1].terminalId);
      totalPriority += prepared[i - 1].value;
      w -= prepared[i - 1].weight;
    }
  }

  const totalPower = items.filter(i => selected.includes(i.terminalId)).reduce((s, it) => s + it.power, 0);
  return { selectedIds: selected, totalPower, totalPriority, modeUsed: 'DP', runtimeMs: Date.now() - start };
}
