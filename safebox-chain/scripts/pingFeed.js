// scripts/pingFeed.js
const { ethers } = require('hardhat');

const FEED = '0x5741306c21795FdCBb9b265Ea0255F499DFe515C';
const AGG_ABI = [
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
];

async function main() {
  const [sig] = await ethers.getSigners();
  console.log('Signer:', sig.address);

  const feed = new ethers.Contract(FEED, AGG_ABI, sig);
  const dec = await feed.decimals();
  const rd = await feed.latestRoundData();
  console.log('decimals:', dec);
  console.log('answer:', rd[1].toString());
  console.log('updatedAt:', rd[3].toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
