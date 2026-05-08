import { EncryptStep, Encryptable, type EncryptedItemInput } from "@cofhe/sdk";
import { Ethers6Adapter } from "@cofhe/sdk/adapters";
import { chains } from "@cofhe/sdk/chains";
import { createCofheClient, createCofheConfig } from "@cofhe/sdk/web";
import { BrowserProvider } from "ethers";

import type { Eip1193Provider } from "@/lib/eip1193";

const cofheConfig = createCofheConfig({
  supportedChains: [chains.sepolia],
  useWorkers: true
});

const cofheClient = createCofheClient(cofheConfig);

export type CofheCiphertextInput = Pick<EncryptedItemInput, "ctHash" | "securityZone" | "signature" | "utype">;

type EncryptBidAmountParams = {
  account: string;
  amountWei: bigint;
  chainId: number;
  onProgress?: (message: string) => void;
  provider: Eip1193Provider;
};

function formatEncryptStep(step: EncryptStep, isStart: boolean) {
  switch (step) {
    case EncryptStep.InitTfhe:
      return isStart ? "Initializing the CoFHE runtime..." : "CoFHE runtime ready.";
    case EncryptStep.FetchKeys:
      return isStart ? "Fetching CoFHE public keys..." : "CoFHE public keys loaded.";
    case EncryptStep.Pack:
      return isStart ? "Packing the bid value into the encrypted input..." : "Encrypted bid input packed.";
    case EncryptStep.Prove:
      return isStart ? "Generating the zero-knowledge proof for the bid input..." : "Bid proof generated.";
    case EncryptStep.Verify:
      return isStart ? "Verifying the encrypted bid package..." : "Encrypted bid package verified.";
    default:
      return isStart ? "Preparing the CoFHE bid package..." : "CoFHE bid package ready.";
  }
}

export async function encryptBidAmountWithCofhe({
  account,
  amountWei,
  chainId,
  onProgress,
  provider
}: EncryptBidAmountParams): Promise<CofheCiphertextInput> {
  const browserProvider = new BrowserProvider(provider);
  const signer = await browserProvider.getSigner(account);
  const { publicClient, walletClient } = await Ethers6Adapter(browserProvider, signer);

  await cofheClient.connect(publicClient, walletClient);

  const [encryptedBidInput] = await cofheClient
    .encryptInputs([Encryptable.uint128(amountWei)])
    .setAccount(account)
    .setChainId(chainId)
    .onStep((step, context) => {
      onProgress?.(formatEncryptStep(step, context?.isStart ?? true));
    })
    .execute();

  return encryptedBidInput;
}
