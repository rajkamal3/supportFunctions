// Function to identify support and resistance zones in price data
export const findSupportLevels = (priceData) => {
  // Arrays to collect discovered zones
  const supportZones = [];
  const resistanceZones = [];
  let highlightedZones = [];
  // Sets used to avoid re-checking very close price levels repeatedly
  const checkedSupports = new Set();
  const checkedResistances = new Set();

  // -------------------------
  // Helper: trendLineMatch
  // -------------------------
  // Validates whether a small sequence of subsequent points roughly follow
  // a linear trend (used to prefer trend-based supports/resistances).
  // - baseIndex: index in priceData used as the starting point for the trend
  // - range: how many following points to check (default 10)
  // - type: "support" or "resistance" determines expected direction
  function trendLineMatch(baseIndex, range = 10, type = "support") {
    const base = priceData[baseIndex];
    let count = 0;
    for (
      let i = baseIndex + 1;
      i < baseIndex + range && i < priceData.length;
      i++
    ) {
      const expected =
        type === "support"
          ? base.lp - base.lp * 0.01 * (i - baseIndex)
          : base.lp + base.lp * 0.01 * (i - baseIndex);
      const actual = priceData[i].lp;
      // allow ~3% deviation from the expected trend value
      if (Math.abs(actual - expected) / expected <= 0.03) count++;
    }
    // require at least 3 points to consider it a valid trendline match
    return count >= 3;
  }

  // -------------------------
  // Helper: actedAsResistanceBefore
  // -------------------------
  // Checks whether a given price level acted as a resistance before the
  // provided index (i.e., price hit that level and then dropped by >=10%).
  // This strengthens a support if it previously stopped prices on the way up.
  function actedAsResistanceBefore(index, price) {
    for (let i = 0; i < index; i++) {
      const prevPrice = priceData[i].lp;
      // consider "about the same" if within 5%
      if (Math.abs(prevPrice - price) / price <= 0.05) {
        for (let j = i + 1; j < index; j++) {
          const dropPrice = priceData[j].lp;
          // if it subsequently dropped by >= 10% after touching this level
          if ((prevPrice - dropPrice) / prevPrice >= 0.1) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // -------------------------
  // Filter ancient price zones
  // -------------------------
  // Avoid considering very old/low prices that are unrealistic relative
  // to the latest price. We treat anything below 50% of latest price
  // as irrelevant for current support detection.
  const latestPrice = priceData[priceData.length - 1].lp;
  const minValidPrice = latestPrice * 0.5;

  // -------------------------
  // Main loop: detect supports & resistances
  // -------------------------
  // We iterate through each price point treating it as a potential base
  // support/resistance and look forward for bounces (>=10%) or drops (>=10%).
  for (let i = 0; i < priceData.length; i++) {
    const basePrice = priceData[i].lp;

    // Skip if price is too far below current price (ancient zones)
    if (basePrice < minValidPrice) continue;

    // -------------------------
    // SUPPORT DETECTION
    // -------------------------
    // Only check if we haven't already recorded a very-close support
    if (
      !Array.from(checkedSupports).some(
        (p) => Math.abs(p - basePrice) / basePrice < 0.05
      )
    ) {
      let bounceCount = 0;
      // look ahead for touches near the basePrice and then a bounce >= 10%
      for (let j = i + 1; j < priceData.length; j++) {
        const nearSupport =
          Math.abs(priceData[j].lp - basePrice) / basePrice <= 0.05;
        if (nearSupport) {
          for (let k = j + 1; k < priceData.length; k++) {
            const bouncePrice = priceData[k].lp;
            // only count bounce if it rises by at least 10% from the touch
            const bouncePct = (bouncePrice - priceData[j].lp) / priceData[j].lp;
            if (bouncePct >= 0.1) {
              // prefer supports that also match a partial trendline
              if (trendLineMatch(i, 10, "support")) bounceCount++;
              break;
            }
          }
        }
      }
      const actedAsRes = actedAsResistanceBefore(i, basePrice);
      // require at least 3 confirmed bounces to call it a support
      if (bounceCount >= 3) {
        supportZones.push({
          zone: basePrice.toFixed(2),
          bounceCount,
          confirmedResistance: actedAsRes
        });
        checkedSupports.add(basePrice);
      }
    }

    // -------------------------
    // RESISTANCE DETECTION
    // -------------------------
    // Similar logic for resistance: look for touches and subsequent drops >=10%
    if (
      !Array.from(checkedResistances).some(
        (p) => Math.abs(p - basePrice) / basePrice < 0.05
      )
    ) {
      let dropCount = 0;
      for (let j = i + 1; j < priceData.length; j++) {
        const nearResistance =
          Math.abs(priceData[j].lp - basePrice) / basePrice <= 0.05;
        if (nearResistance) {
          for (let k = j + 1; k < priceData.length; k++) {
            const dropPrice = priceData[k].lp;
            if ((priceData[j].lp - dropPrice) / priceData[j].lp >= 0.1) {
              // prefer resistances that also match a partial trendline
              if (trendLineMatch(i, 10, "resistance")) dropCount++;
              break;
            }
          }
        }
      }
      if (dropCount >= 3) {
        resistanceZones.push({ zone: basePrice.toFixed(2), dropCount });
        checkedResistances.add(basePrice);
      }
    }
  }

  // -------------------------
  // Aggregate zones with identical exact price strings
  // -------------------------
  // If multiple discovered zones round to the exact same string (e.g. "2413.90")
  // we club their counts together so the final results do not show duplicates.
  const aggregatedSupportMap = {};
  for (const s of supportZones) {
    const z = s.zone;
    if (!aggregatedSupportMap[z]) {
      // clone object to avoid mutating original
      aggregatedSupportMap[z] = { ...s };
    } else {
      // add counts and keep 'confirmedResistance' truthy if any was true
      aggregatedSupportMap[z].bounceCount += s.bounceCount;
      aggregatedSupportMap[z].confirmedResistance =
        aggregatedSupportMap[z].confirmedResistance || s.confirmedResistance;
    }
  }
  const aggregatedSupportZones = Object.values(aggregatedSupportMap).sort(
    (a, b) => parseFloat(a.zone) - parseFloat(b.zone)
  );

  const aggregatedResistanceMap = {};
  for (const r of resistanceZones) {
    const z = r.zone;
    if (!aggregatedResistanceMap[z]) {
      aggregatedResistanceMap[z] = { ...r };
    } else {
      aggregatedResistanceMap[z].dropCount += r.dropCount;
    }
  }
  const aggregatedResistanceZones = Object.values(aggregatedResistanceMap).sort(
    (a, b) => parseFloat(a.zone) - parseFloat(b.zone)
  );

  // -------------------------
  // Highlighted zones: where support overlaps with resistance
  // -------------------------
  // Use the support price as the highlighted zone (NOT an average).
  // Club counts when multiple resistances match the same support (done below).
  const tempHighlights = {};
  for (const support of aggregatedSupportZones) {
    for (const resistance of aggregatedResistanceZones) {
      const priceDiff = Math.abs(
        parseFloat(support.zone) - parseFloat(resistance.zone)
      );
      // consider them overlapping if within 5% of the support price
      if (priceDiff / parseFloat(support.zone) <= 0.05) {
        if (!tempHighlights[support.zone]) {
          tempHighlights[support.zone] = {
            zone: support.zone,
            supportBounceCount: 0,
            resistanceDropCount: 0,
            type: "support-resistance overlap"
          };
        }
        // add the aggregated counts so that duplicates are clubbed
        tempHighlights[support.zone].supportBounceCount += support.bounceCount;
        tempHighlights[support.zone].resistanceDropCount +=
          resistance.dropCount || 0;
      }
    }
  }

  highlightedZones = Object.values(tempHighlights).sort(
    (a, b) => parseFloat(a.zone) - parseFloat(b.zone)
  );

  // Return aggregated and sorted results (ascending by price)
  return {
    supportZones: aggregatedSupportZones,
    resistanceZones: aggregatedResistanceZones,
    highlightedZones
  };
};
