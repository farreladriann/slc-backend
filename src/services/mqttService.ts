// src/services/mqttService.ts
import mqtt, { MqttClient } from 'mqtt';
import dotenv from 'dotenv';
import { supabase, insertPowerUsage, updateTerminalStatus } from './supabaseService';
import crypto from 'crypto';

dotenv.config();

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://test.mosquitto.org:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || undefined;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || undefined;
export const MQTT_TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'slc/device';

let client: MqttClient | null = null;

export function connectMqtt() {
  client = mqtt.connect(MQTT_BROKER_URL, {
    username: MQTT_USERNAME || undefined,
    password: MQTT_PASSWORD || undefined,
    reconnectPeriod: 3000,
    clientId: `slc-backend-${Math.floor(Math.random() * 100000)}`,
  });

  client.on('connect', () => {
    console.log(`MQTT connected: ${MQTT_BROKER_URL}`);
    client!.subscribe(`${MQTT_TOPIC_PREFIX}/status/#`, { qos: 1 }, (err) => {
      if (!err) console.log(`Subscribed to: ${MQTT_TOPIC_PREFIX}/status/#`);
    });
  });

  client.on('error', (err) => console.error('MQTT Error:', err?.message ?? err));
  client.on('close', () => console.log('MQTT disconnected, reconnecting...'));

  client.on('message', async (topic, message) => {
    try {
      const payloadStr = message.toString();
      console.log(`[MQTT] ${topic} => ${payloadStr}`);

      const parts = topic.split('/');
      // expected topic: slc/device/status/<terminalId>
      const category = parts[2];
      const terminalId = parts[3];

      if (category === 'status' && terminalId) {
        // Try parse JSON telemetry; fallback to plain "on"/"off"
        let parsed: any = null;
        try {
          parsed = JSON.parse(payloadStr);
        } catch (_) {
          parsed = null;
        }

        if (parsed && typeof parsed === 'object' && (parsed.power !== undefined || parsed.status)) {
          // telemetry object expected:
          // { "status":"on", "power":125.4, "ampere":0.54, "volt":230.1, "timestamp":"..." }
          const ts = parsed.timestamp ?? new Date().toISOString();
          const power = Number(parsed.power ?? 0);
          const ampere = parsed.ampere ?? null;
          const volt = parsed.volt ?? null;
          const status = String(parsed.status ?? '').toLowerCase() === 'on' ? 'on' : 'off';

          // insert power usage
          try {
            await insertPowerUsage({
              powerUsageId: crypto.randomUUID(),
              terminalId,
              power,
              ampere,
              volt,
              timestamp: ts,
            });
          } catch (err) {
            console.warn('insertPowerUsage failed:', err);
          }

          // update terminal status
          try {
            await updateTerminalStatus(terminalId, status);
            console.log(`Terminal ${terminalId} updated to status ${status}`);
          } catch (err) {
            console.warn('updateTerminalStatus failed:', err);
          }
        } else {
          // payload is simple string like "on" or "off"
          const newStatus = payloadStr.trim().toLowerCase() === 'on' ? 'on' : 'off';
          try {
            await updateTerminalStatus(terminalId, newStatus);
            console.log(`Terminal ${terminalId} updated to status ${newStatus}`);
          } catch (err) {
            console.warn('updateTerminalStatus failed:', err);
          }
        }
      }
    } catch (err) {
      console.error('Error processing MQTT message:', err);
    }
  });
}

function publishPromise(topic: string, payload: string, opts: mqtt.IClientPublishOptions = { qos: 1, retain: false }, timeoutMs = 5000) {
  return new Promise<void>((resolve, reject) => {
    if (!client || !client.connected) {
      return reject(new Error('MQTT client not connected'));
    }
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
      return resolve();
    });
  });
}

/**
 * Publish a batch of controls. Each command targets a terminalId.
 * Topic used: `${MQTT_TOPIC_PREFIX}/control/<terminalId>`
 * Payload is plain 'on' or 'off' (ke perangkat) — STM32 firmware expected to parse that.
 */
export async function publishBatchControl(commands: { terminalId: string; status: 'on' | 'off' }[]) {
  const results: { terminalId: string; ok: boolean; error?: string }[] = [];
  for (const cmd of commands) {
    const topic = `${MQTT_TOPIC_PREFIX}/control/${cmd.terminalId}`;
    try {
      await publishPromise(topic, cmd.status, { qos: 1, retain: false }, 5000);
      console.log(`Published to ${topic}: ${cmd.status}`);
      results.push({ terminalId: cmd.terminalId, ok: true });
    } catch (err: any) {
      console.error(`Failed publish ${topic}:`, err?.message ?? err);
      results.push({ terminalId: cmd.terminalId, ok: false, error: String(err?.message ?? err) });
    }
  }
  return results;
}

export async function disconnectMqtt() {
  if (!client) return;
  return new Promise<void>((resolve) => {
    client!.end(true, {}, () => {
      console.log('MQTT client disconnected');
      resolve();
    });
  });
}
