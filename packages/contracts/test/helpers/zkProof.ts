import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

export function loadDemoProofBytes(): Uint8Array {
  const fixturePath = path.join(__dirname, "./zkProofFixture.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

  return ethers.getBytes(fixture.proofBytes);
}
