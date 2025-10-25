// scripts/checkFeed.js
const { ethers } = require('hardhat');

const AGG_ABI = [
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
];

async function main() {
  // тот же адрес, что в deploy.js
  const FEED = '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE';

  const [signer] = await ethers.getSigners();
  const provider = signer.provider;
  const { chainId } = await provider.getNetwork();
  console.log('Network chainId:', chainId);

  const code = await provider.getCode(FEED);
  console.log('code.length:', code.length, code.length > 2 ? '(HAS CODE)' : '(NO CODE!)');

  const feed = new ethers.Contract(FEED, AGG_ABI, provider);

  try {
    const dec = await feed.decimals();
    console.log('decimals():', dec);
  } catch (e) {
    console.log('decimals() call failed:', e.message);
  }

  try {
    const [roundId, answer, startedAt, updatedAt] = await feed.latestRoundData();
    console.log('latestRoundData():', {
      roundId: roundId.toString(),
      answer: answer.toString(),
      startedAt: Number(startedAt),
      updatedAt: Number(updatedAt),
    });
  } catch (e) {
    console.log('latestRoundData() call failed:', e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
