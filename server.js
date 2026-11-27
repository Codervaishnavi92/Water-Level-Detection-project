
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mqtt = require("mqtt");

const {
  initializeElasticsearch,
  saveWaterLevel,
  getWaterHistory
} = require("./elasticsearch");

// Task 3 - Location Tracking
const {
  registerTask3Location
} = require("./task3-location");

const app = express();
const PORT = 8001;

// Middleware
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ]
}));

app.use(express.json());

// Latest water-level data
let latestData = {
  water_level: 70,
  status: "Simulation Mode",
  source: "sample"
};

let mqttConnected = false;
let elasticsearchConnected = false;

// ========================================
// TASK 4 - ACCONEER A121 SIMULATION
// ========================================

let latestA121Data = null;

// MQTT Broker Connection
const client = mqtt.connect("mqtt://127.0.0.1:1883", {
  reconnectPeriod: 2000
});

client.on("connect", () => {
  mqttConnected = true;

  console.log("MQTT Connected Successfully!");

  // Existing water-level topic
  client.subscribe("iot/waterlevel", (error) => {
    if (error) {
      console.log("MQTT Subscribe Error:", error.message);
    } else {
      console.log("Subscribed to iot/waterlevel");
    }
  });

  // TASK 4 - Acconeer A121 topic
  client.subscribe("iot/acconeer/a121", (error) => {
    if (error) {
      console.log("A121 Subscribe Error:", error.message);
    } else {
      console.log("Subscribed to iot/acconeer/a121");
    }
  });
});

client.on("close", () => {
  mqttConnected = false;
});

client.on("error", (error) => {
  console.log("MQTT Error:", error.message);
});

// ========================================
// EXISTING MQTT WATER LEVEL DATA
// ========================================

client.on("message", async (topic, message) => {
  if (topic !== "iot/waterlevel") return;

  try {
    const data = JSON.parse(message.toString());
    const level = Number(data.water_level);

    if (
      data.water_level === undefined ||
      data.water_level === null ||
      !Number.isFinite(level) ||
      level < 0 ||
      level > 100
    ) {
      console.log("Invalid Water Level");
      return;
    }

    latestData = {
      water_level: level,
      status: "MQTT Connected",
      source: "mqtt"
    };

    console.log("Water Level Updated:", level + "%");

    // Save existing MQTT data to Elasticsearch
    if (elasticsearchConnected) {
      await saveWaterLevel(latestData);
    }

  } catch (error) {
    console.log("MQTT Data Error:", error.message);
  }
});

// ========================================
// TASK 4 - RECEIVE ACCONEER A121 DATA
// ========================================

client.on("message", (topic, message) => {
  if (topic !== "iot/acconeer/a121") return;

  try {
    const data = JSON.parse(message.toString());

    const level = Number(data.water_level);
    const distance = Number(data.distance_m);

    if (
      data.simulated !== true ||
      data.water_level === undefined ||
      data.water_level === null ||
      data.distance_m === undefined ||
      data.distance_m === null ||
      !Number.isFinite(level) ||
      !Number.isFinite(distance) ||
      level < 0 ||
      level > 100 ||
      distance < 0
    ) {
      console.log("Invalid A121 Reading");
      return;
    }

    latestA121Data = {
      ...data,
      water_level: level,
      distance_m: distance,
      hardware_connected: false,
      mode: "Simulation"
    };

    console.log(
      "A121 Updated:",
      level + "%",
      "| Distance:",
      distance + "m"
    );

  } catch (error) {
    console.log("A121 Data Error:", error.message);
  }
});

// ========================================
// HOME API
// ========================================

app.get("/", (req, res) => {
  res.json({
    message: "IoT Water Level Monitoring API Running",
    backend: "Node.js + Express",
    mqtt: mqttConnected,
    elasticsearch: elasticsearchConnected
  });
});

// Dashboard Water Level API
app.get("/api/water-level", (req, res) => {
  res.json(latestData);
});

// ========================================
// EXISTING BLE APIs
// ========================================

// BLE Device Information
app.get("/api/ble/device", (req, res) => {
  res.json({
    device_name: "Samsung Galaxy Tab A9",
    connection_type: "Bluetooth Low Energy",
    status: "Previously Tested",
    data_source: "Recorded BLE Test",
    uuid: "Not configured",
    raw_bytes: "24-00-00-00"
  });
});

// BLE Data Analysis
app.get("/api/ble/analysis", (req, res) => {
  const raw = Buffer.from("24000000", "hex");

  const hexValues = [...raw].map(byte =>
    byte.toString(16).padStart(2, "0").toUpperCase()
  );

  res.json({
    raw_hex: hexValues.join(" "),
    decimal_values: [...raw],
    first_byte_decimal: raw[0],
    total_bytes: raw.length,
    validation: "Valid byte sequence",
    note: "Recorded BLE data, not actual water-level data"
  });
});

// ========================================
// EXISTING LOCATION API
// ========================================

app.get("/api/device/location", (req, res) => {
  res.json({
    latitude: null,
    longitude: null,
    status: "Manual location input required",
    source: "Not connected to live GPS"
  });
});

// ========================================
// EXISTING ACCONEER SENSOR STATUS API
// ========================================

app.get("/api/sensor/status", (req, res) => {
  res.json({
    sensor: "Acconeer A121",
    hardware_connected: false,
    mode: "Simulation",
    water_level: latestData.water_level,
    unit: "percent",
    source: latestData.source
  });
});

// ========================================
// TASK 4 - NEW ACCONEER A121 API
// ========================================

app.get("/api/acconeer/a121", (req, res) => {
  if (!latestA121Data) {
    return res.json({
      sensor: "Acconeer A121",
      mode: "Simulation",
      hardware_connected: false,
      status: "Waiting for simulator data",
      latest_reading: null
    });
  }

  res.json({
    sensor: "Acconeer A121",
    mode: "Simulation",
    hardware_connected: false,
    status: "Simulated data received",
    latest_reading: latestA121Data
  });
});

// ========================================
// EXISTING MQTT MONITORING API
// ========================================

app.get("/api/mqtt/status", (req, res) => {
  res.json({
    broker: "localhost",
    port: 1883,
    topic: "iot/waterlevel",
    connected: mqttConnected,
    latest_water_level: latestData.water_level,
    data_source: latestData.source
  });
});

// ========================================
// EXISTING ELASTICSEARCH APIs
// ========================================

app.get("/api/elasticsearch/status", (req, res) => {
  res.json({
    connected: elasticsearchConnected,
    index: "iot_water_level",
    storage: "Elasticsearch"
  });
});

// Existing Water Level History
app.get("/api/history", async (req, res) => {
  if (!elasticsearchConnected) {
    return res.status(503).json({
      error: "Elasticsearch is not connected"
    });
  }

  try {
    const history = await getWaterHistory();

    res.json(history);

  } catch (error) {
    console.log("History Error:", error.message);

    res.status(500).json({
      error: "Unable to fetch Elasticsearch history"
    });
  }
});

// ========================================
// TASK 3 - DEVICE LOCATION TRACKING
// ========================================

// Existing APIs:
// POST /api/task3/send
// GET  /api/task3/history
//
// MQTT Topic:
// iot/waterlevel/location
//
// Elasticsearch Index:
// iot_device_locations

registerTask3Location(app, client, () => ({
  elasticsearchConnected
}));

// ========================================
// INITIALIZE ELASTICSEARCH AND SERVER
// ========================================

async function startServer() {
  try {
    elasticsearchConnected =
      await initializeElasticsearch();

    if (elasticsearchConnected) {
      console.log("Elasticsearch Ready!");
    } else {
      console.log(
        "Elasticsearch unavailable. MQTT APIs will continue working."
      );
    }

  } catch (error) {
    elasticsearchConnected = false;

    console.log(
      "Elasticsearch Startup Error:",
      error.message
    );
  }

  app.listen(PORT, () => {
    console.log("--------------------------------");
    console.log("IoT Water Level Monitoring System");
    console.log("Backend: Node.js + Express");
    console.log(`Server: http://127.0.0.1:${PORT}`);
    console.log("--------------------------------");
  });
}

startServer();
