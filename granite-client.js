/**
 * IBM Granite AI Client
 * Calls IBM Cloud Watson Machine Learning API to invoke IBM Granite LLM
 * for AQI-based health suggestions and intelligent insights.
 */

require('dotenv').config();
const axios = require('axios');

const IBM_CLOUD_API_KEY = process.env.IBM_CLOUD_API_KEY;
const IBM_CLOUD_URL     = process.env.IBM_CLOUD_URL || 'https://us-south.ml.cloud.ibm.com';
const IBM_PROJECT_ID    = process.env.IBM_PROJECT_ID;
const GRANITE_MODEL_ID  = process.env.GRANITE_MODEL_ID || 'ibm/granite-13b-instruct-v2';

let cachedToken = null;
let tokenExpiry  = 0;

/**
 * Get IBM Cloud IAM access token (cached, auto-refreshed)
 */
async function getIBMToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;

  const resp = await axios.post(
    'https://iam.cloud.ibm.com/identity/token',
    new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: IBM_CLOUD_API_KEY,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  cachedToken = resp.data.access_token;
  // IBM tokens expire in 3600s — refresh 60s early
  tokenExpiry = now + (resp.data.expires_in - 60) * 1000;
  return cachedToken;
}

/**
 * Call IBM Granite model via WML Text Generation API
 */
async function callGranite(prompt) {
  const token = await getIBMToken();

  const payload = {
    model_id: GRANITE_MODEL_ID,
    input: prompt,
    parameters: {
      decoding_method: 'greedy',
      max_new_tokens: 600,
      min_new_tokens: 50,
      stop_sequences: ['<|endoftext|>'],
      temperature: 0.7,
      top_p: 0.9,
    },
    project_id: IBM_PROJECT_ID,
  };

  const response = await axios.post(
    `${IBM_CLOUD_URL}/ml/v1/text/generation?version=2023-05-29`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30000,
    }
  );

  return response.data.results[0].generated_text.trim();
}

/**
 * Build a structured prompt for AQI health suggestions
 */
function buildSuggestionPrompt(aqiData, forecastData) {
  const { city, state, aqi, category, dominantPollutant, subIndices } = aqiData;
  const forecastSummary = forecastData
    .map(f => `${f.date}: AQI ${f.aqi} (${f.category})`)
    .join(', ');

  const pollutantList = subIndices
    .map(s => `${s.pollutant}=${s.subIndex}`)
    .join(', ');

  return `<|system|>
You are AQI-Agent, an expert AI assistant for air quality health advisory. You provide clear, concise, and actionable health recommendations based on real-time and forecast AQI data. Always structure your response with sections: Current Status, Health Risks, Immediate Actions, and Daily Lifestyle Tips. Be empathetic, practical, and use simple language.
<|user|>
City: ${city}, ${state}
Current AQI: ${aqi} — Category: ${category}
Dominant Pollutant: ${dominantPollutant}
Sub-index breakdown: ${pollutantList}
5-Day Forecast: ${forecastSummary}

Please provide:
1. A brief summary of current air quality status
2. Health risks for sensitive groups (children, elderly, pregnant, respiratory patients)
3. 3–4 immediate protective actions people should take today
4. 3–4 practical daily lifestyle adjustments for the forecast period
5. Best and worst times to go outdoors based on this data
<|assistant|>`;
}

/**
 * Fallback suggestions when IBM Cloud is not configured or fails
 * Uses rule-based logic from AQI category — ensures the agent always works
 */
function getFallbackSuggestions(aqiData, forecastData) {
  const { aqi, category, dominantPollutant, city } = aqiData;

  const riskMap = {
    'Good': {
      risk: 'Air quality is satisfactory. Minimal health risk for the general public.',
      actions: [
        '✅ Enjoy outdoor activities freely',
        '✅ Open windows for natural ventilation',
        '✅ No special precautions needed',
        '✅ Great day for exercise outdoors',
      ],
      tips: [
        '🌿 Plant indoor air-purifying plants',
        '🚶 Encourage walking/cycling over driving',
        '📊 Monitor AQI daily to stay informed',
        '💧 Stay hydrated throughout the day',
      ],
    },
    'Satisfactory': {
      risk: 'Air quality is acceptable. Minor discomfort possible for very sensitive individuals.',
      actions: [
        '⚠️ Sensitive groups should limit prolonged outdoor exposure',
        '😷 Carry a mask if you have asthma or allergies',
        '🏠 Keep windows partially open',
        '🏃 Moderate outdoor exercise is generally fine',
      ],
      tips: [
        '🕐 Prefer morning hours (6-9 AM) for outdoor activities',
        '🌱 Use air purifiers indoors if available',
        '💊 Asthma patients keep inhalers accessible',
        '🧴 Wash hands and face after outdoor exposure',
      ],
    },
    'Moderate': {
      risk: 'Air quality may cause breathing discomfort for sensitive people including children, elderly, and those with respiratory conditions.',
      actions: [
        '😷 Wear N95/KN95 mask outdoors',
        '🚫 Avoid strenuous outdoor exercise',
        '🏠 Keep windows and doors closed',
        '🌬️ Run air purifiers on medium setting',
      ],
      tips: [
        '⏰ Limit outdoor time to under 1 hour',
        '🧒 Keep children indoors as much as possible',
        '👴 Elderly should strictly avoid outdoor exposure',
        '🏥 Consult a doctor if experiencing cough or breathlessness',
      ],
    },
    'Poor': {
      risk: 'Everyone may experience health effects. Serious risk for sensitive groups. Breathing discomfort for all on prolonged exposure.',
      actions: [
        '🚨 Wear N95 mask whenever stepping outside',
        '🚫 Avoid all outdoor exercise',
        '🪟 Seal windows; use air purifiers on high',
        '🏠 Stay indoors as much as possible',
      ],
      tips: [
        '❌ No outdoor activities for children, elderly, or sick',
        '🏥 Seek medical help immediately if chest pain or breathing difficulty',
        '🚗 Use car AC with recirculation mode',
        '💧 Drink plenty of water and herbal teas',
      ],
    },
    'Very Poor': {
      risk: 'Health alert: everyone may experience serious health effects. Respiratory illness very likely with prolonged exposure.',
      actions: [
        '🚨 STAY INDOORS — Essential trips only',
        '😷 Double-mask (N95 + surgical) if going out',
        '🏠 Seal all gaps with wet cloth to block pollutants',
        '🌬️ Run HEPA air purifiers continuously',
      ],
      tips: [
        '❌ No children, elderly, or sensitive groups outdoors',
        '🏥 Emergency contacts ready for respiratory distress',
        '🚫 Cancel all outdoor events and gatherings',
        '🍵 Consume antioxidant-rich foods (turmeric, ginger, honey)',
      ],
    },
    'Severe': {
      risk: '🚨 HEALTH EMERGENCY: Severe air pollution. Life-threatening for sensitive groups. Serious health impacts for everyone.',
      actions: [
        '🆘 DO NOT go outdoors under any circumstances',
        '🏠 Seal home completely — windows, doors, ventilation gaps',
        '😷 Use respirator-grade masks if emergency exit required',
        '📞 Call helpline if experiencing breathing difficulty',
      ],
      tips: [
        '🏥 Hospital-level precautions required for sensitive groups',
        '🚑 Keep emergency medication (bronchodilators, oxygen) ready',
        '📺 Follow government advisories and air quality alerts',
        '🛌 Bed rest recommended for vulnerable populations',
      ],
    },
  };

  const data = riskMap[category] || riskMap['Moderate'];
  const forecastWarning = forecastData.some(f => f.aqi > aqi + 50)
    ? `⚠️ **Forecast Alert**: AQI expected to worsen over next 2–3 days. Plan activities accordingly.`
    : forecastData.some(f => f.aqi < aqi - 50)
    ? `✨ **Good News**: AQI expected to improve in coming days. Outdoor activities can be planned accordingly.`
    : `📊 AQI expected to remain relatively stable over the next 5 days.`;

  return `## 🌍 Current Air Quality: ${city}

**AQI: ${aqi} — ${category}** | Dominant Pollutant: **${dominantPollutant}**

---

### 🩺 Health Risk Assessment
${data.risk}

---

### ⚡ Immediate Actions (Today)
${data.actions.join('\n')}

---

### 📅 Daily Lifestyle Tips (For Forecast Period)
${data.tips.join('\n')}

---

### 🔮 Forecast Outlook
${forecastWarning}

---

### ⏰ Best Time to Go Outdoors
${aqi <= 100 ? '**Anytime is relatively safe** — mornings (6–9 AM) are ideal.' : aqi <= 200 ? '**Early morning (5–7 AM)** when pollution is lower. Avoid 10 AM–6 PM peak hours.' : '**Strongly discouraged** — if unavoidable, choose 4–6 AM with full mask protection.'}`;
}

/**
 * Main function: get AI-powered AQI suggestions
 * Tries IBM Granite first; falls back to rule-based if unavailable
 */
async function getAQISuggestions(aqiData, forecastData) {
  // If IBM Cloud is not configured, use smart fallback
  if (!IBM_CLOUD_API_KEY || IBM_CLOUD_API_KEY === 'your_ibm_cloud_api_key_here') {
    console.log('[Granite] IBM Cloud API key not configured — using rule-based fallback');
    return {
      source: 'rule-based',
      suggestions: getFallbackSuggestions(aqiData, forecastData),
    };
  }

  try {
    const prompt = buildSuggestionPrompt(aqiData, forecastData);
    const text = await callGranite(prompt);
    return { source: 'ibm-granite', suggestions: text };
  } catch (err) {
    console.error('[Granite] API error:', err.message);
    return {
      source: 'rule-based-fallback',
      suggestions: getFallbackSuggestions(aqiData, forecastData),
    };
  }
}

module.exports = { getAQISuggestions };
