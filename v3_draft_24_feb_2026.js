export function findSupportLevels(data) {
  const prices = data.map((d) => d.lp);
  const volumes = data.map((d) => d.v);
  const timestamps = data.map((d) => new Date(d.ts));

  // --- Step 1: Calculate ATR for adaptive tolerance ---
  function calculateATR(period = 14) {
    const trs = [];
    for (let i = 1; i < prices.length; i++) {
      trs.push(Math.abs(prices[i] - prices[i - 1]));
    }
    return trs.reduce((a, b) => a + b, 0) / trs.length;
  }

  const atr = calculateATR();
  const tolerance = atr * 0.8; // dynamic tolerance band

  // --- Step 2: Detect significant reversals ---
  const reactions = [];

  for (let i = 5; i < prices.length - 5; i++) {
    const before = prices[i - 3];
    const level = prices[i];
    const after = prices[i + 3];

    const movePercent = Math.abs((after - level) / level) * 100;
    const volumeSpike =
      volumes[i] > volumes.slice(i - 5, i).reduce((a, b) => a + b, 0) / 5;

    if (movePercent > 4 && volumeSpike) {
      reactions.push({
        level,
        strength: movePercent,
        volume: volumes[i],
        index: i
      });
    }
  }

  // --- Step 3: Cluster Reactions ---
  const clusters = [];

  reactions.forEach((r) => {
    let matched = false;

    for (let c of clusters) {
      if (Math.abs(r.level - c.avg) <= tolerance) {
        c.sum += r.level;
        c.count++;
        c.weight += r.strength * (r.volume / 1e7);
        c.indices.push(r.index);
        matched = true;
        break;
      }
    }

    if (!matched) {
      clusters.push({
        sum: r.level,
        avg: r.level,
        count: 1,
        weight: r.strength * (r.volume / 1e7),
        indices: [r.index]
      });
    }
  });

  // finalize averages
  clusters.forEach((c) => {
    c.avg = c.sum / c.count;
  });

  // --- Step 4: Rank By Strength ---
  clusters.sort((a, b) => b.weight - a.weight);

  // Only elite zones
  const eliteClusters = clusters.filter((c) => c.count >= 4).slice(0, 6);

  const supportZones = [];
  const resistanceZones = [];
  const highlightedZones = [];

  eliteClusters.forEach((c) => {
    const avg = parseFloat(c.avg.toFixed(2));

    // Determine if mostly support or resistance
    let supports = 0;
    let resistances = 0;

    c.indices.forEach((i) => {
      if (prices[i + 3] > prices[i]) supports++;
      else resistances++;
    });

    if (supports >= resistances) {
      supportZones.push({
        zone: avg.toFixed(2),
        bounceCount: c.count,
        confirmedResistance: resistances > 0
      });
    } else {
      resistanceZones.push({
        zone: avg.toFixed(2),
        dropCount: c.count
      });
    }

    if (supports > 1 && resistances > 1) {
      highlightedZones.push({
        zone: avg.toFixed(2),
        supportBounceCount: supports,
        resistanceDropCount: resistances,
        type: "support-resistance overlap"
      });
    }
  });

  return {
    supportZones,
    resistanceZones,
    highlightedZones
  };
}
