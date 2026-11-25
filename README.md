# AQI Agent 🌍
> AI-Powered Air Quality Intelligence powered by **IBM Bob + IBM Cloud + IBM Granite**

## Overview

AQI Agent is a full-stack AI application that:
- 📊 **Measures AQI** at the user's city using real pollutant dataset (PM2.5, PM10, NO2, CO, NH3, SO2, Ozone)
- 🔮 **Forecasts AQI** for the next 5 days using trend simulation from dataset variance
- 🤖 **Gives personalized health suggestions** via IBM Granite LLM (with smart rule-based fallback)

---

## Tech Stack

| Component | Technology |
|---|---|
| AI Agent Platform | IBM Bob |
| Cloud Platform | IBM Cloud (Watson Machine Learning) |
| LLM | IBM Granite (`ibm/granite-13b-instruct-v2`) |
| Backend | Node.js + Express |
| AQI Engine | CPCB India standard breakpoints |
| Dataset | Real India pollutant data (CSV) |
| Frontend | Vanilla HTML/CSS/JS (dark theme) |

---

## Project Structure

```
aqi-agent/
├── server.js           # Express API server (main entry point)
├── aqi-engine.js       # AQI calculation, forecast & classification
├── granite-client.js   # IBM Granite / IBM Cloud WML integration
├── data/
│   └── aqi_data.csv    # Pollutant dataset
├── public/
│   └── index.html      # Frontend UI
├── package.json
├── .env.example        # Environment variable template
└── README.md
```

---

## Setup

### 1. Install dependencies
```bash
cd aqi-agent
npm install
```

### 2. Configure IBM Cloud credentials
```bash
cp .env.example .env
# Edit .env with your IBM Cloud API key and Project ID
```

**Required `.env` values:**
```env
IBM_CLOUD_API_KEY=your_ibm_cloud_api_key
IBM_PROJECT_ID=your_watson_studio_project_id
IBM_CLOUD_URL=https://us-south.ml.cloud.ibm.com
GRANITE_MODEL_ID=ibm/granite-13b-instruct-v2
PORT=3000
```

> **Note:** Without IBM Cloud credentials, the agent uses an intelligent rule-based fallback for suggestions — the app works fully either way.

### 3. Run the server
```bash
npm start
# Or for development with auto-reload:
npm run dev
```

### 4. Open in browser
```
http://localhost:3000
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Service health check |
| GET | `/api/cities` | List all available cities in dataset |
| GET | `/api/aqi?city=<name>` | Get AQI + forecast for a city |
| POST | `/api/suggestions` | Get IBM Granite health suggestions |
| POST | `/api/analyze` | Full pipeline (AQI + forecast + suggestions) |

---

## How AQI is Calculated

Uses **CPCB (Central Pollution Control Board) India** standard breakpoints:

| AQI Range | Category | Health Impact |
|---|---|---|
| 0–50 | Good 🟢 | Minimal impact |
| 51–100 | Satisfactory 🟡 | Minor breathing discomfort for sensitive |
| 101–200 | Moderate 🟠 | Breathing discomfort for asthma patients |
| 201–300 | Poor 🔴 | Breathing discomfort for all on long exposure |
| 301–400 | Very Poor 🔴 | Respiratory illness on prolonged exposure |
| 401–500 | Severe ⛔ | Health impact even on light activity |

Pollutants measured: **PM2.5, PM10, NO2, CO, NH3, SO2, Ozone**

---

## IBM Granite Integration

The agent calls IBM Granite via the **IBM Cloud Watson Machine Learning Text Generation API**:

```
POST /ml/v1/text/generation?version=2023-05-29
Authorization: Bearer <IAM token>
```

The prompt is structured using Granite's `<|system|>/<|user|>/<|assistant|>` chat format and returns:
- Current air quality status summary
- Health risks for sensitive groups
- Immediate protective actions
- Daily lifestyle tips
- Best/worst outdoor times

---

## Dataset

The dataset (`aqi_data.csv`) contains real-time pollutant readings from CPCB monitoring stations across Indian cities with columns:
`country, state, city, station, last_update, latitude, longitude, pollutant_id, pollutant_min, pollutant_max, pollutant_avg`
