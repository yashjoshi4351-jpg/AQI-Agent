/**
 * AQI Agent — Express Server
 * IBM Cloud + IBM Granite powered Air Quality Intelligence Agent
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const csv      = require('csv-parser');

const { calculateAQI, classifyAQI, generateForecast, findCityData, getUniqueCities } = require('./aqi-engine');
const { getAQISuggestions } = require('./granite-client');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Load Dataset ──────────────────────────────────────────────────────────────
let aqiDataset = [];

function loadDataset() {
  return new Promise((resolve, reject) => {
    const rows = [];
    const csvPath = path.join(__dirname, 'data', 'aqi_data.csv');

    if (!fs.existsSync(csvPath)) {
      console.warn('[Dataset] CSV not found at', csvPath);
      resolve([]);
      return;
    }

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => {
        aqiDataset = rows;
        console.log(`[Dataset] Loaded ${rows.length} records from CSV`);
        resolve(rows);
      })
      .on('error', reject);
  });
}

// ─── API Routes ─────────────────────────────────────────────────────────────────

/**
 * GET /api/cities
 * Returns list of unique cities available in the dataset
 */
app.get('/api/cities', (req, res) => {
  const cities = getUniqueCities(aqiDataset);
  res.json({ success: true, cities });
});

/**
 * GET /api/aqi?city=<cityName>
 * Returns current AQI, classification, pollutant breakdown, and forecast
 */
app.get('/api/aqi', (req, res) => {
  const { city } = req.query;

  if (!city) {
    return res.status(400).json({ success: false, error: 'city parameter is required' });
  }

  const cityRows = findCityData(aqiDataset, city);

  if (cityRows.length === 0) {
    return res.status(404).json({
      success: false,
      error: `No data found for city: "${city}". Use /api/cities to see available cities.`,
    });
  }

  // Use first station found for the city (most recent data)
  const stationName = cityRows[0].station;
  const state       = cityRows[0].state;
  const country     = cityRows[0].country;
  const lastUpdate  = cityRows[0].last_update;
  const lat         = parseFloat(cityRows[0].latitude);
  const lon         = parseFloat(cityRows[0].longitude);

  const { aqi, dominantPollutant, subIndices } = calculateAQI(cityRows);
  const { category, color, emoji } = classifyAQI(aqi);
  const forecast = generateForecast(aqi, cityRows);

  res.json({
    success: true,
    location: { city, state, country, station: stationName, lat, lon, lastUpdate },
    aqi: { value: aqi, category, color, emoji, dominantPollutant, subIndices },
    forecast,
  });
});

/**
 * POST /api/suggestions
 * Body: { city, aqi, category, dominantPollutant, subIndices, forecast }
 * Returns AI-generated health suggestions from IBM Granite
 */
app.post('/api/suggestions', async (req, res) => {
  const { city, state, aqi, category, dominantPollutant, subIndices, forecast } = req.body;

  if (!city || !aqi) {
    return res.status(400).json({ success: false, error: 'city and aqi are required' });
  }

  try {
    const result = await getAQISuggestions(
      { city, state, aqi, category, dominantPollutant, subIndices },
      forecast
    );

    res.json({
      success: true,
      source: result.source,
      suggestions: result.suggestions,
    });
  } catch (err) {
    console.error('[Suggestions] Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate suggestions' });
  }
});

/**
 * POST /api/analyze
 * Full pipeline: city → AQI → Forecast → Granite Suggestions in one shot
 * Body: { city }
 */
app.post('/api/analyze', async (req, res) => {
  const { city } = req.body;

  if (!city) {
    return res.status(400).json({ success: false, error: 'city is required' });
  }

  const cityRows = findCityData(aqiDataset, city);

  if (cityRows.length === 0) {
    return res.status(404).json({
      success: false,
      error: `No data found for city: "${city}". Use /api/cities to explore available cities.`,
    });
  }

  const stationName = cityRows[0].station;
  const state       = cityRows[0].state;
  const country     = cityRows[0].country;
  const lastUpdate  = cityRows[0].last_update;
  const lat         = parseFloat(cityRows[0].latitude);
  const lon         = parseFloat(cityRows[0].longitude);

  const { aqi, dominantPollutant, subIndices } = calculateAQI(cityRows);
  const { category, color, emoji } = classifyAQI(aqi);
  const forecast = generateForecast(aqi, cityRows);

  // Get Granite suggestions
  const aiResult = await getAQISuggestions(
    { city, state, aqi, category, dominantPollutant, subIndices },
    forecast
  );

  res.json({
    success: true,
    location: { city, state, country, station: stationName, lat, lon, lastUpdate },
    aqi: { value: aqi, category, color, emoji, dominantPollutant, subIndices },
    forecast,
    suggestions: aiResult.suggestions,
    suggestionSource: aiResult.source,
  });
});

/**
 * GET /api/health
 * Service health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AQI Agent',
    datasetRecords: aqiDataset.length,
    granite: process.env.IBM_CLOUD_API_KEY &&
             process.env.IBM_CLOUD_API_KEY !== 'your_ibm_cloud_api_key_here'
      ? 'configured'
      : 'using-fallback',
    timestamp: new Date().toISOString(),
  });
});

// Catch-all: serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────────────────────────
loadDataset().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🌍 AQI Agent running at http://localhost:${PORT}`);
    console.log(`📊 Dataset: ${aqiDataset.length} records loaded`);
    console.log(`🤖 IBM Granite: ${process.env.IBM_CLOUD_API_KEY &&
      process.env.IBM_CLOUD_API_KEY !== 'your_ibm_cloud_api_key_here'
      ? '✅ Connected' : '⚠️  Using rule-based fallback (configure .env for Granite)'}`);
    console.log(`\n📡 API Endpoints:`);
    console.log(`   GET  /api/health`);
    console.log(`   GET  /api/cities`);
    console.log(`   GET  /api/aqi?city=<name>`);
    console.log(`   POST /api/suggestions`);
    console.log(`   POST /api/analyze\n`);
  });
});
