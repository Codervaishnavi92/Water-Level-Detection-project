
require("dotenv").config();

const { Client } = require("@elastic/elasticsearch");
const fs = require("fs");

const INDEX = "iot_water_level";

const elasticUrl = process.env.ELASTICSEARCH_URL;
const username = process.env.ELASTICSEARCH_USERNAME;
const password = process.env.ELASTICSEARCH_PASSWORD;
const certificatePath = process.env.ELASTICSEARCH_CA_CERT;

if (
  !elasticUrl ||
  !username ||
  !password ||
  !certificatePath
) {
  throw new Error(
    "Elasticsearch configuration missing in .env"
  );
}

if (!fs.existsSync(certificatePath)) {
  throw new Error(
    "Elasticsearch CA certificate not found: " +
    certificatePath
  );
}

// Secure Elasticsearch connection
const esClient = new Client({
  node: elasticUrl,

  auth: {
    username: username,
    password: password
  },

  tls: {
    ca: fs.readFileSync(certificatePath),
    rejectUnauthorized: true
  }
});

// Initialize Elasticsearch index
async function initializeElasticsearch() {
  try {
    const info = await esClient.info();

    console.log(
      "Elasticsearch Connected:",
      info.cluster_name
    );

    const exists = await esClient.indices.exists({
      index: INDEX
    });

    if (!exists) {
      await esClient.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            water_level: { type: "float" },
            device_id: { type: "keyword" },
            source: { type: "keyword" },
            timestamp: { type: "date" }
          }
        }
      });

      console.log("Elasticsearch Index Created");
    } else {
      console.log("Elasticsearch Index Already Exists");
    }

    return true;

  } catch (error) {
    console.log(
      "Elasticsearch Connection Error:",
      error.message
    );

    return false;
  }
}

// Save MQTT water-level data
async function saveWaterLevel(data) {
  try {
    const level = Number(data.water_level);

    if (!Number.isFinite(level) || level < 0 || level > 100) {
      throw new Error("Invalid water level");
    }

    await esClient.index({
      index: INDEX,

      document: {
        device_id: "WATER_TANK_001",
        water_level: level,
        source: "MQTT Simulation",
        timestamp: new Date().toISOString()
      }
    });

    console.log(
      "Saved to Elasticsearch:",
      level + "%"
    );

    return true;

  } catch (error) {
    console.log(
      "Elasticsearch Save Error:",
      error.message
    );

    return false;
  }
}

// Fetch latest 50 water-level records
async function getWaterHistory() {
  try {
    const response = await esClient.search({
      index: INDEX,
      size: 50,

      sort: [
        {
          timestamp: {
            order: "desc"
          }
        }
      ],

      query: {
        match_all: {}
      }
    });

    return response.hits.hits.map(
      hit => ({
        id: hit._id,
        ...hit._source
      })
    );

  } catch (error) {
    console.log(
      "Elasticsearch History Error:",
      error.message
    );

    throw error;
  }
}

module.exports = {
  initializeElasticsearch,
  saveWaterLevel,
  getWaterHistory
};
