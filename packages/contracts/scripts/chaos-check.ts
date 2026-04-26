import "dotenv/config";

import { readFile } from "node:fs/promises";

type StatePayload = {
  auctions?: Array<{ auctionId: string; state: string; trackedAtMs: number }>;
  dispatchJobs?: Array<{ requestId: string; dispatchedAtMs?: number; enqueuedAtMs: number }>;
  resolutions?: Array<{ requestId: string; storedAtMs: number; submittedAtMs?: number }>;
};

async function main() {
  const stateFile = process.env.KEEPER_STATE_FILE_PATH || "../keeper/state/keeper-state.json";
  const timeoutMs = Number(process.env.CHAOS_PENDING_TIMEOUT_MS || "300000");

  let raw: string;
  try {
    raw = await readFile(stateFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Keeper state file was not found at ${stateFile}. Run the keeper once or pass KEEPER_STATE_FILE_PATH explicitly before using phase6:chaos.`
      );
    }
    throw error;
  }
  const payload = JSON.parse(raw) as StatePayload;
  const now = Date.now();

  const resolvingAuctions = (payload.auctions ?? []).filter((auction) => auction.state === "2");
  const stalledDispatchJobs = (payload.dispatchJobs ?? []).filter(
    (job) => job.dispatchedAtMs === undefined && now - job.enqueuedAtMs > timeoutMs
  );
  const stalledResolutions = (payload.resolutions ?? []).filter(
    (artifact) => artifact.submittedAtMs === undefined && now - artifact.storedAtMs > timeoutMs
  );

  const summary = {
    checkedAt: new Date().toISOString(),
    timeoutMs,
    resolvingAuctions: resolvingAuctions.length,
    stalledDispatchJobs: stalledDispatchJobs.length,
    stalledResolutions: stalledResolutions.length,
    ok: stalledDispatchJobs.length === 0 && stalledResolutions.length === 0
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
