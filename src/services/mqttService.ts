// src/services/mqttService.ts
import mqtt, { MqttClient } from 'mqtt';
import dotenv from 'dotenv';
import { insertPowerUsage, updateTerminalStatus } from './supabaseService';

dotenv.config();

// MQTT CONFIGURATION
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://i6440f9b.ala.dedicated.aws.emqxcloud.com:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || 'BagasGanteng';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || 'BagasGanteng';

// Topic mapping
const TOPIC_UPSTREAM = process.env.MQTT_TOPIC_UPSTREAM || 'stm32/data/upstream';      // from STM32 → backend
const TOPIC_DOWNSTREAM = process.env.MQTT_TOPIC_DOWNSTREAM || 'stm32/data/downstream'; // from backend → STM32
const MQTT_TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'stm32/data';


let client: MqttClient | null = null;

let mqttConnectedCallback: (() => void) | null = null;

export function onMqttConnected(cb: () => void) {
  mqttConnectedCallback = cb;
}


/**
 * Connect to MQTT broker
 */
export function connectMqtt() {
  client = mqtt.connect(MQTT_BROKER_URL, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    reconnectPeriod: 3000,
    clientId: `slc-backend-${Math.floor(Math.random() * 100000)}`,
  });

  client.on('connect', () => {
  console.log(`✅ MQTT connected: ${MQTT_BROKER_URL}`);
  client!.subscribe(TOPIC_UPSTREAM, { qos: 1 }, (err) => {
    if (!err) console.log(`Subscribed to: ${TOPIC_UPSTREAM}`);
  });

  // 🔔 Jalankan callback kalau ada
  if (mqttConnectedCallback) {
    mqttConnectedCallback();
  }
});

  client.on('error', (err) => console.error('❌ MQTT Error:', err?.message ?? err));
  client.on('close', () => console.warn('⚠️ MQTT disconnected, reconnecting...'));

  /**
   * Handle incoming message from STM32 (upstream)
   */
  client.on('message', async (topic, message) => {
  if (topic !== TOPIC_UPSTREAM) return;

  try {
    const payload = JSON.parse(message.toString());
    console.log(`[MQTT] 🔼 UPSTREAM DATA =>`, payload);

    // Bisa berupa array dari STM32
    const dataArray = Array.isArray(payload) ? payload : [payload];

    for (const d of dataArray) {
      const term = `terminal_${d.terminal_id}`;
      const status = d.relay_status === 1 ? 'on' : 'off';

      // insert ke powerUsage
      await insertPowerUsage({
        terminalId: term,
        power: Number(d.power),
        ampere: Number(d.current),
        volt: Number(d.voltage),
        timestamp: new Date().toISOString(),
      });

      // update status terminal
      await updateTerminalStatus(term, status);
      console.log(`✅ Saved powerUsage + updated status for ${term} = ${status}`);
    }
  } catch (err) {
    console.error('❌ Error processing UPSTREAM message:', err);
  }
});

}

/**
 * Publish helper with timeout
 */
function publishPromise(
  topic: string,
  payload: string,
  opts: mqtt.IClientPublishOptions = { qos: 1, retain: false },
  timeoutMs = 5000
) {
  return new Promise<void>((resolve, reject) => {
    if (!client || !client.connected) return reject(new Error('MQTT client not connected'));
    let called = false;
    const timer = setTimeout(() => {
      if (!called) {
        called = true;
        reject(new Error('publish timeout'));
      }
    }, timeoutMs);

    client!.publish(topic, payload, opts, (err) => {
      if (called) return;
      called = true;
      clearTimeout(timer);
      if (err) return reject(err);
      resolve();
    });
  });
}


function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


/**
 * Publish batch control commands to downstream topic
 * with safe delay (200ms) between each message
 */
export async function publishBatchControl(
  commands: { terminalId: string; status: 'on' | 'off' }[],
  delayMs = 7000   // you can change this to 150–300ms
) {
  const results: { terminalId: string; ok: boolean; error?: string }[] = [];

  for (const cmd of commands) {
    try {
      // convert "terminal_1" -> 1
      const idMatch = /^terminal_(\d+)$/.exec(cmd.terminalId);
      const terminalIdNum = idMatch ? Number(idMatch[1]) : 0;

      // payload sesuai permintaan STM32
      const payloadObj = {
        terminal_id: terminalIdNum,
        relay: cmd.status === 'on' ? 1 : 0,
        id: Math.floor(Math.random() * 1000),
      };

      // publish ke MQTT
      await publishPromise(
        TOPIC_DOWNSTREAM,
        JSON.stringify(payloadObj),
        { qos: 1, retain: false },
        5000
      );

      console.log(`📤 Published to ${TOPIC_DOWNSTREAM}:`, payloadObj);
      results.push({ terminalId: cmd.terminalId, ok: true });

      // 🔥 delay antar command agar STM32 tidak overload
      await delay(delayMs);

    } catch (err: any) {
      console.error(`❌ Failed publish for ${cmd.terminalId}:`, err?.message ?? err);
      results.push({
        terminalId: cmd.terminalId,
        ok: false,
        error: err?.message ?? String(err)
      });
    }
  }

  return results;
}


