
const { Client } = require("@elastic/elasticsearch");
const fs = require("fs");

const LOCATION_INDEX = "iot_device_locations";
const LOCATION_TOPIC = "iot/waterlevel/location";

function registerTask3Location(app, mqttClient, getStatus) {
  const esClient = new Client({
    node: process.env.ELASTICSEARCH_URL,
    auth: {
      username: process.env.ELASTICSEARCH_USERNAME,
      password: process.env.ELASTICSEARCH_PASSWORD
    },
    tls: {
      ca: fs.readFileSync(process.env.ELASTICSEARCH_CA_CERT),
      rejectUnauthorized: true
    }
  });

  // Create a separate index for Task 3
  async function ensureIndex() {
    const exists = await esClient.indices.exists({
      index: LOCATION_INDEX
    });

    if (!exists) {
      await esClient.indices.create({
        index: LOCATION_INDEX,
        mappings: {
          properties: {
            device_id: { type: "keyword" },
            water_level: { type: "float" },
            unit: { type: "keyword" },
            sensor_data_source: { type: "keyword" },
            latitude: { type: "double" },
            longitude: { type: "double" },
            accuracy_meters: { type: "float" },
            location_source: { type: "keyword" },
            location_timestamp: { type: "date" },
            reading_timestamp: { type: "date" },
            timestamp: { type: "date" }
          }
        }
      });
    }
  }

  // Receive location + water level
  app.post("/api/task3/send", async (req, res) => {
    try {
      const data = req.body;
      const location = data.location || {};

      const level = Number(data.waterLevel);
      const latitude = Number(location.latitude);
      const longitude = Number(location.longitude);

      if (
        data.waterLevel == null ||
        location.latitude == null ||
        location.longitude == null ||
        !Number.isFinite(level) ||
        level < 0 || level > 100 ||
        !Number.isFinite(latitude) ||
        latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 || longitude > 180
      ) {
        return res.status(400).json({
          success: false,
          error: "Invalid water level or coordinates"
        });
      }

      const accuracy = location.accuracyMeters == null
        ? null
        : Number(location.accuracyMeters);

      if (
        accuracy !== null &&
        (!Number.isFinite(accuracy) || accuracy < 0)
      ) {
        return res.status(400).json({
          success: false,
          error: "Invalid location accuracy"
        });
      }

      const status = getStatus();

      if (!status.elasticsearchConnected) {
        return res.status(503).json({
          success: false,
          error: "Elasticsearch is not connected"
        });
      }

      if (!mqttClient.connected) {
        return res.status(503).json({
          success: false,
          error: "MQTT broker is not connected"
        });
      }

      const locationTime = new Date(
        location.timestamp || Date.now()
      );

      if (Number.isNaN(locationTime.getTime())) {
        return res.status(400).json({
          success: false,
          error: "Invalid location timestamp"
        });
      }

      const document = {
        device_id: String(data.deviceId || "water-level-001"),
        water_level: level,
        unit: "%",
        sensor_data_source: String(
          data.sensorDataSource || "mqtt"
        ),
        latitude,
        longitude,
        accuracy_meters: accuracy,
        location_source: String(
          location.source || "unknown"
        ),
        location_timestamp: locationTime.toISOString(),
        reading_timestamp: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      // Publish combined data to MQTT
      await new Promise((resolve, reject) => {
        mqttClient.publish(
          LOCATION_TOPIC,
          JSON.stringify(document),
          { qos: 1 },
          error => error ? reject(error) : resolve()
        );
      });

      // Save combined data in Elasticsearch
      await ensureIndex();

      const saved = await esClient.index({
        index: LOCATION_INDEX,
        document,
        refresh: "wait_for"
      });

      return res.json({
        success: true,
        mqtt: {
          published: true,
          topic: LOCATION_TOPIC
        },
        elasticsearch: {
          saved: true,
          index: LOCATION_INDEX,
          documentId: saved._id
        },
        data: document
      });

    } catch (error) {
      console.error("Task 3 Error:", error.message);

      return res.status(500).json({
        success: false,
        error: "Task 3 transmission or storage failed",
        note: "Check backend console for details"
      });
    }
  });

  // Verify saved location history
  app.get("/api/task3/history", async (req, res) => {
    try {
      const status = getStatus();

      if (!status.elasticsearchConnected) {
        return res.status(503).json({
          success: false,
          error: "Elasticsearch is not connected"
        });
      }

      await ensureIndex();

      const result = await esClient.search({
        index: LOCATION_INDEX,
        size: 20,
        sort: [{ timestamp: { order: "desc" } }],
        query: { match_all: {} }
      });

      return res.json({
        success: true,
        index: LOCATION_INDEX,
        records: result.hits.hits.map(hit => ({
          id: hit._id,
          ...hit._source
        }))
      });

    } catch (error) {
      console.error("Task 3 History Error:", error.message);

      return res.status(500).json({
        success: false,
        error: "Unable to fetch Task 3 history"
      });
    }
  });
}

module.exports = { registerTask3Location };
