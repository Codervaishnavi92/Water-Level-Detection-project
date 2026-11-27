

const mqtt = require("mqtt");

// Connect to local Mosquitto MQTT Broker
const client = mqtt.connect("mqtt://127.0.0.1:1883", {
  reconnectPeriod: 2000
});

// Simulated water levels in percentage
const waterLevels = [10, 25, 40, 60, 80, 95, 100, 75, 50, 20];

let index = 0;
let timer = null;

client.on("connect", () => {
  console.log("MQTT Simulator Connected Successfully!");

  if (timer) return;

  function sendWaterLevel() {
    const level = waterLevels[index % waterLevels.length];

    const data = {
      device_id: "WATER_TANK_001",
      sensor: "Acconeer A121 (Simulated)",
      water_level: level,
      unit: "percent",
      timestamp: new Date().toISOString()
    };

    client.publish(
      "iot/waterlevel",
      JSON.stringify(data),
      { qos: 0 },
      (error) => {
        if (error) {
          console.log("Publish Error:", error.message);
        } else {
          console.log("Water Level Sent:", level + "%");
        }
      }
    );

    index++;
  }

  sendWaterLevel();
  timer = setInterval(sendWaterLevel, 3000);
});

client.on("error", (error) => {
  console.log("MQTT Connection Error:", error.message);
});

client.on("close", () => {
  console.log("MQTT Connection Closed. Reconnecting...");
});
