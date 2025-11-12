import { prisma } from "../lib/prisma";

type RawMsg = {
  terminal_id: number;
  voltage: number;
  current: number;
  power: number;
  relay_status: number;
};

export async function savePowerFromMqtt(msg: RawMsg) {
  // mapping terminalId
  const terminalId = `terminal_${msg.terminal_id}`;

  // relay_status → enum "on" | "off"
  const status = msg.relay_status === 1 ? "on" : "off";

  // insert ke PowerUsage
  await prisma.powerUsage.create({
    data: {
      terminalId,
      power: msg.power,
      ampere: msg.current,
      volt: msg.voltage,
    },
  });

  // update terminalStatus
  await prisma.terminal.update({
    where: { terminalId },
    data: {
      terminalStatus: status,
    },
  });
}
