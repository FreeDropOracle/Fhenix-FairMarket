import { ethers } from "hardhat";

export async function deployPhase2Fixture() {
  const [owner, seller, bidder, bidderTwo, outsider, avsOperatorOne, avsOperatorTwo, avsOperatorThree] =
    await ethers.getSigners();

  const adapterFactory = await ethers.getContractFactory("CofheAdapter");
  const adapter = await adapterFactory.deploy();
  await adapter.waitForDeployment();

  const settlementEngineFactory = await ethers.getContractFactory("SettlementEngine");
  const settlementEngine = await settlementEngineFactory.deploy(owner.address);
  await settlementEngine.waitForDeployment();

  const slashedPotFactory = await ethers.getContractFactory("SlashedPot");
  const slashedPot = await slashedPotFactory.deploy(owner.address, await settlementEngine.getAddress());
  await slashedPot.waitForDeployment();

  const avsFactory = await ethers.getContractFactory("MockEigenLayerAVS");
  const avs = await avsFactory.deploy(
    owner.address,
    [avsOperatorOne.address, avsOperatorTwo.address, avsOperatorThree.address],
    2
  );
  await avs.waitForDeployment();

  const implementationFactory = await ethers.getContractFactory("FhenixFairMarket");
  const implementation = await implementationFactory.deploy();
  await implementation.waitForDeployment();

  const proxyFactory = await ethers.getContractFactory("FhenixFairMarketProxy");
  const initData = implementationFactory.interface.encodeFunctionData("initialize", [
    await adapter.getAddress(),
    owner.address,
    await slashedPot.getAddress()
  ]);

  const proxy = await proxyFactory.deploy(await implementation.getAddress(), initData);
  await proxy.waitForDeployment();

  const market = implementationFactory.attach(await proxy.getAddress());
  await market.connect(owner).setSettlementEngine(await settlementEngine.getAddress());
  await settlementEngine.connect(owner).setAVS(await avs.getAddress());
  await slashedPot.connect(owner).setMarket(await market.getAddress());

  const nftFactory = await ethers.getContractFactory("MockERC721");
  const nft = await nftFactory.deploy();
  await nft.waitForDeployment();

  const mockCofheFactory = await ethers.getContractFactory("MockCofhe");
  const mockCofhe = await mockCofheFactory.deploy();
  await mockCofhe.waitForDeployment();

  return {
    owner,
    seller,
    bidder,
    bidderTwo,
    outsider,
    avs,
    avsOperatorOne,
    avsOperatorTwo,
    avsOperatorThree,
    adapter,
    settlementEngine,
    slashedPot,
    implementation,
    proxy,
    market,
    nft,
    mockCofhe
  };
}

export async function createPhase2AuctionFixture() {
  const context = await deployPhase2Fixture();
  const { market, nft, seller } = context;

  await nft.connect(seller).mint(seller.address);
  await nft.connect(seller).approve(await market.getAddress(), 1n);

  await market
    .connect(seller)
    ["createAuction(address,uint256,uint256,uint256,bool)"](
      await nft.getAddress(),
      1n,
      24 * 60 * 60,
      ethers.parseEther("1"),
      true,
      {
        value: ethers.parseEther("1")
      }
    );

  return context;
}
