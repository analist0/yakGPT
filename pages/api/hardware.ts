// Reports this machine's hardware so the app can suggest local models that fit.
import type { NextApiRequest, NextApiResponse } from "next";
import si from "systeminformation";
import { requireLocal } from "@/lib/serverAccess";
import type { HardwareInfo } from "@/lib/localModels";

const GB = 1024 ** 3;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireLocal(req, res)) return;
  try {
    const [mem, cpu, graphics, os] = await Promise.all([
      si.mem(),
      si.cpu(),
      si.graphics(),
      si.osInfo(),
    ]);
    const gpus = graphics.controllers
      .filter((g) => g.model)
      .map((g) => ({
        model: g.model,
        vendor: g.vendor,
        // systeminformation reports VRAM in MB
        vramGB: g.vram ? Math.round((g.vram / 1024) * 10) / 10 : undefined,
        dynamic: !!g.vramDynamic,
      }));
    const info: HardwareInfo = {
      source: "server",
      os: `${os.distro} ${os.release}`.trim(),
      arch: os.arch,
      cpu: `${cpu.manufacturer} ${cpu.brand}`.trim(),
      cores: cpu.physicalCores || cpu.cores,
      threads: cpu.cores,
      ramGB: Math.round((mem.total / GB) * 10) / 10,
      freeRamGB: Math.round((mem.available / GB) * 10) / 10,
      gpus,
      appleSilicon: os.platform === "darwin" && os.arch === "arm64",
    };
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
