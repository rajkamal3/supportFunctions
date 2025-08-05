// Function to identify support and resistance zones in price data
export const findSupportLevels = (priceData) => {
  const supportZones = [];
  const resistanceZones = [];
  const highlightedZones = [];
  const checkedSupports = new Set();
  const checkedResistances = new Set();

  // Helper function to validate a trendline match for support or resistance
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
      if (Math.abs(actual - expected) / expected <= 0.03) count++;
    }
    return count >= 3;
  }

  // Check if a price acted as resistance before a given index
  function actedAsResistanceBefore(index, price) {
    for (let i = 0; i < index; i++) {
      const prevPrice = priceData[i].lp;
      if (Math.abs(prevPrice - price) / price <= 0.05) {
        for (let j = i + 1; j < index; j++) {
          const dropPrice = priceData[j].lp;
          if ((prevPrice - dropPrice) / prevPrice >= 0.1) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Filter price data range to avoid ancient irrelevant price zones
  const latestPrice = priceData[priceData.length - 1].lp;
  const minValidPrice = latestPrice * 0.5;

  for (let i = 0; i < priceData.length; i++) {
    const basePrice = priceData[i].lp;

    // Skip if price is too far from current price (ancient price zones)
    if (basePrice < minValidPrice) continue;

    // SUPPORT DETECTION
    if (
      ![...checkedSupports].some(
        (p) => Math.abs(p - basePrice) / basePrice < 0.05
      )
    ) {
      let bounceCount = 0;
      for (let j = i + 1; j < priceData.length; j++) {
        const nearSupport =
          Math.abs(priceData[j].lp - basePrice) / basePrice <= 0.05;
        if (nearSupport) {
          for (let k = j + 1; k < priceData.length; k++) {
            const bouncePrice = priceData[k].lp;
            if ((bouncePrice - priceData[j].lp) / priceData[j].lp >= 0.1) {
              if (trendLineMatch(i, 10, "support")) bounceCount++;
              break;
            }
          }
        }
      }
      const actedAsRes = actedAsResistanceBefore(i, basePrice);
      if (bounceCount >= 3) {
        supportZones.push({
          zone: basePrice.toFixed(2),
          bounceCount,
          confirmedResistance: actedAsRes
        });
        checkedSupports.add(basePrice);
      }
    }

    // RESISTANCE DETECTION
    if (
      ![...checkedResistances].some(
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

  // HIGHLIGHT ZONES where support also acted as resistance (within close range)
  for (const support of supportZones) {
    for (const resistance of resistanceZones) {
      const priceDiff = Math.abs(
        parseFloat(support.zone) - parseFloat(resistance.zone)
      );
      const avgPrice =
        (parseFloat(support.zone) + parseFloat(resistance.zone)) / 2;
      if (priceDiff / avgPrice <= 0.05) {
        highlightedZones.push({
          zone: avgPrice.toFixed(2),
          supportBounceCount: support.bounceCount,
          resistanceDropCount: resistance.dropCount || 0,
          type: "support-resistance overlap"
        });
      }
    }
  }

  return { supportZones, resistanceZones, highlightedZones };
};
