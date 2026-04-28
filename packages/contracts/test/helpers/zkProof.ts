import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

export function loadDemoProofBytes(): Uint8Array {
  const buildDir = path.join(__dirname, "../../../zk/build");
  const proof = JSON.parse(fs.readFileSync(path.join(buildDir, "proof.json"), "utf-8"));
  const publicSignals = JSON.parse(fs.readFileSync(path.join(buildDir, "public.json"), "utf-8"));

  return ethers.getBytes(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256[2]", "uint256[2][2]", "uint256[2]", "uint256[1]"],
      [
        [proof.pi_a[0], proof.pi_a[1]],
        [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
        [proof.pi_c[0], proof.pi_c[1]],
        [publicSignals[0]]
      ]
    )
  );
}
