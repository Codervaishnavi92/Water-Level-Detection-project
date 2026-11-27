
const mqtt = require("mqtt");

const client = mqtt.connect("mqtt://127.0.0.1:1883", {
  reconnectPeriod: 2000
});

// Acconeer A121 Tank Level presets
const tankPresets = {
  Small: { start: 0.030, end: 0.500 },
  Medium: { start: 0.050, end: 6.000 },
  Large: { start: 0.100, end: 15.000 }
};

// Change to Small, Medium or Large
const selectedPreset = "Medium";
const tank = tankPresets[selectedPreset];

// Simulated water-level percentages
const waterLevels = [10, 25, 40, 60, 80, 95, 100, 75, 50, 20];

let index = 0;
let timer = null;

client.on("connect", () => {
  console.log("Acconeer A121 Simulator Connected!");

  if (timer) return;

  function sendReading() {
    const level = waterLevels[index % waterLevels.length];

    // Simplified simulation: tank.end is the empty reference
    const distance =
      tank.end - (level / 100) * (tank.end - tank.start);

    const data = {
      device_id: "ACCoNEER_A121_001",
      sensor: "Acconeer A121 (Simulated)",
      preset: selectedPreset,
      tank_start_m: tank.start,
      tank_end_m: tank.end,
      distance_m: Number(distance.toFixed(3)),
      water_level: level,
      unit: "percent",
      simulated: true,
      timestamp: new Date().toISOString()
    };

    client.publish(
      "iot/acconeer/a121",
      JSON.stringify(data),
      { qos: 0 },
      (error) => {
        if (error) {
          console.log("Publish Error:", error.message);
        } else {
          console.log("A121 Reading:", data);
        }
      }
    );

    index++;
  }

  sendReading();
  timer = setInterval(sendReading, 3000);
});

client.on("error", (error) => {
  console.log("MQTT Error:", error.message);
});
