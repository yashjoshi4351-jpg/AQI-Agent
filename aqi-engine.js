/**
 * AQI Engine
 * Calculates AQI from raw pollutant readings using CPCB (India) breakpoints
 * and provides forecast simulation from historical dataset trends.
 */

// CPCB India AQI Breakpoints (Standard)
const BREAKPOINTS = {
  PM25: [
    { cLow: 0,    cHigh: 30,   iLow: 0,   iHigh: 50  },
    { cLow: 31,   cHigh: 60,   iLow: 51,  iHigh: 100 },
    { cLow: 61,   cHigh: 90,   iLow: 101, iHigh: 200 },
    { cLow: 91,   cHigh: 120,  iLow: 201, iHigh: 300 },
    { cLow: 121,  cHigh: 250,  iLow: 301, iHigh: 400 },
    { cLow: 251,  cHigh: 500,  iLow: 401, iHigh: 500 },
  ],
  PM10: [
    { cLow: 0,    cHigh: 50,   iLow: 0,   iHigh: 50  },
    { cLow: 51,   cHigh: 100,  iLow: 51,  iHigh: 100 },
    { cLow: 101,  cHigh: 250,  iLow: 101, iHigh: 200 },
    { cLow: 251,  cHigh: 350,  iLow: 201, iHigh: 300 },
    { cLow: 351,  cHigh: 430,  iLow: 301, iHigh: 400 },
    { cLow: 431,  cHigh: 600,  iLow: 401, iHigh: 500 },
  ],
  NO2: [
    { cLow: 0,    cHigh: 40,   iLow: 0,   iHigh: 50  },
    { cLow: 41,   cHigh: 80,   iLow: 51,  iHigh: 100 },
    { cLow: 81,   cHigh: 180,  iLow: 101, iHigh: 200 },
    { cLow: 181,  cHigh: 280,  iLow: 201, iHigh: 300 },
    { cLow: 281,  cHigh: 400,  iLow: 301, iHigh: 400 },
    { cLow: 401,  cHigh: 800,  iLow: 401, iHigh: 500 },
  ],
  CO: [
    { cLow: 0,    cHigh: 1,    iLow: 0,   iHigh: 50  },
    { cLow: 1.1,  cHigh: 2,    iLow: 51,  iHigh: 100 },
    { cLow: 2.1,  cHigh: 10,   iLow: 101, iHigh: 200 },
    { cLow: 10.1, cHigh: 17,   iLow: 201, iHigh: 300 },
    { cLow: 17.1, cHigh: 34,   iLow: 301, iHigh: 400 },
    { cLow: 34.1, cHigh: 50,   iLow: 401, iHigh: 500 },
  ],
  NH3: [
    { cLow: 0,    cHigh: 200,  iLow: 0,   iHigh: 50  },
    { cLow: 201,  cHigh: 400,  iLow: 51,  iHigh: 100 },
    { cLow: 401,  cHigh: 800,  iLow: 101, iHigh: 200 },
    { cLow: 801,  cHigh: 1200, iLow: 201, iHigh: 300 },
    { cLow: 1201, cHigh: 1800, iLow: 301, iHigh: 400 },
    { cLow: 1801, cHigh: 2400, iLow: 401, iHigh: 500 },
  ],
  SO2: [
    { cLow: 0,    cHigh: 40,   iLow: 0,   iHigh: 50  },
    { cLow: 41,   cHigh: 80,   iLow: 51,  iHigh: 100 },
    { cLow: 81,   cHigh: 380,  iLow: 101, iHigh: 200 },
    { cLow: 381,  cHigh: 800,  iLow: 201, iHigh: 300 },
    { cLow: 801,  cHigh: 1600, iLow: 301, iHigh: 400 },
    { cLow: 1601, cHigh: 2100, iLow: 401, iHigh: 500 },
  ],
  OZONE: [
    { cLow: 0,    cHigh: 50,   iLow: 0,   iHigh: 50  },
    { cLow: 51,   cHigh: 100,  iLow: 51,  iHigh: 100 },
    { cLow: 101,  cHigh: 168,  iLow: 101, iHigh: 200 },
    { cLow: 169,  cHigh: 208,  iLow: 201, iHigh: 300 },
    { cLow: 209,  cHigh: 748,  iLow: 301, iHigh: 400 },
    { cLow: 749,  cHigh: 1000, iLow: 401, iHigh: 500 },
  ],
};

// Map dataset pollutant_id to breakpoint keys
const POLLUTANT_MAP = {
  'PM2.5': 'PM25',
  'PM10':  'PM10',
  'NO2':   'NO2',
  'CO':    'CO',
  'NH3':   'NH3',
  'SO2':   'SO2',
  'OZONE': 'OZONE',
  'Ozone': 'OZONE',
};

/**
 * Calculate sub-index AQI for a single pollutant concentration
 */
function calcSubIndex(concentration, pollutantKey) {
  const bps = BREAKPOINTS[pollutantKey];
  if (!bps) return null;

  for (const bp of bps) {
    if (concentration >= bp.cLow && concentration <= bp.cHigh) {
      return Math.round(
        ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) *
        (concentration - bp.cLow) + bp.iLow
      );
    }
  }
  // Above highest breakpoint
  return 500;
}

/**
 * Calculate overall AQI from an array of { pollutant_id, pollutant_avg } rows.
 * Groups rows by pollutant type and averages concentrations across stations
 * before computing one sub-index per pollutant (CPCB standard approach).
 * Returns { aqi, dominantPollutant, subIndices }
 */
function calculateAQI(rows) {
  // Step 1: aggregate concentrations per pollutant type (average across stations)
  const pollutantSums = new Map(); // pollutant_id -> { sum, count }

  for (const row of rows) {
    const key = POLLUTANT_MAP[row.pollutant_id];
    if (!key) continue;

    const avg = parseFloat(row.pollutant_avg);
    if (isNaN(avg) || avg <= 0) continue;

    const pid = row.pollutant_id;
    if (!pollutantSums.has(pid)) pollutantSums.set(pid, { sum: 0, count: 0, key });
    const entry = pollutantSums.get(pid);
    entry.sum += avg;
    entry.count++;
  }

  if (pollutantSums.size === 0) return { aqi: 0, dominantPollutant: 'Unknown', subIndices: [] };

  // Step 2: compute one sub-index per pollutant
  const subIndices = [];

  for (const [pid, { sum, count, key }] of pollutantSums) {
    let concentration = sum / count;
    // CO in dataset is in µg/m³ — CPCB CO breakpoints are in mg/m³, so divide by 1000
    if (key === 'CO') concentration = concentration / 1000;

    const si = calcSubIndex(concentration, key);
    if (si !== null) {
      subIndices.push({
        pollutant: pid,
        subIndex: si,
        concentration: parseFloat(concentration.toFixed(2)),
      });
    }
  }

  subIndices.sort((a, b) => b.subIndex - a.subIndex);
  const aqi = subIndices[0].subIndex;
  const dominantPollutant = subIndices[0].pollutant;

  return { aqi, dominantPollutant, subIndices };
}

/**
 * Classify AQI into category
 */
function classifyAQI(aqi) {
  if (aqi <= 50)  return { category: 'Good',          color: '#00b050', emoji: '🟢' };
  if (aqi <= 100) return { category: 'Satisfactory',  color: '#92d050', emoji: '🟡' };
  if (aqi <= 200) return { category: 'Moderate',      color: '#ffff00', emoji: '🟠' };
  if (aqi <= 300) return { category: 'Poor',          color: '#ff9900', emoji: '🔴' };
  if (aqi <= 400) return { category: 'Very Poor',     color: '#ff0000', emoji: '🔴' };
  return                 { category: 'Severe',        color: '#c00000', emoji: '⛔' };
}

/**
 * Generate a 5-day AQI forecast using simple trend simulation
 * Uses dataset variance to simulate realistic day-to-day fluctuation
 */
function generateForecast(currentAQI, pollutantRows) {
  const forecast = [];
  const today = new Date();

  // Calculate a volatility score from min/max spread in dataset
  let totalSpread = 0;
  let spreadCount = 0;
  for (const row of pollutantRows) {
    const min = parseFloat(row.pollutant_min);
    const max = parseFloat(row.pollutant_max);
    if (!isNaN(min) && !isNaN(max) && max > 0) {
      totalSpread += (max - min) / max;
      spreadCount++;
    }
  }
  const volatility = spreadCount > 0 ? (totalSpread / spreadCount) * 50 : 15;

  // Simulate trend — slight seasonal drift + noise
  const trendFactors = [1.0, 0.95, 1.05, 1.1, 0.98]; // 5-day pattern
  let baseAQI = currentAQI;

  for (let i = 0; i < 5; i++) {
    const dayOffset = i + 1;
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);

    // Trend-based prediction with bounded noise
    const noise = (Math.random() - 0.5) * volatility;
    const predictedAQI = Math.min(500, Math.max(0, Math.round(baseAQI * trendFactors[i] + noise)));
    baseAQI = predictedAQI * 0.7 + currentAQI * 0.3; // mean reversion

    forecast.push({
      date: date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
      aqi: predictedAQI,
      ...classifyAQI(predictedAQI),
    });
  }

  return forecast;
}

/**
 * Find best matching station from dataset for a given city name (case-insensitive)
 */
function findCityData(allRows, cityName) {
  const name = cityName.toLowerCase().trim();
  return allRows.filter(r => r.city && r.city.toLowerCase().includes(name));
}

/**
 * Get unique cities from dataset
 */
function getUniqueCities(allRows) {
  const cities = new Map();
  for (const row of allRows) {
    if (row.city && row.state) {
      const key = `${row.city}, ${row.state}`;
      if (!cities.has(key)) {
        cities.set(key, { city: row.city, state: row.state, country: row.country });
      }
    }
  }
  return Array.from(cities.values());
}

module.exports = {
  calculateAQI,
  classifyAQI,
  generateForecast,
  findCityData,
  getUniqueCities,
};
