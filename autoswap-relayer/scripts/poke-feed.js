// scripts/poke-feed.js
import 'dotenv/config';
import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL || 'https://bsc-dataseed.binance.org';
const FEED = process.env.FEED || '0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf';

const ABI = [
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
];

async function main() {
  const p = new ethers.JsonRpcProvider(RPC_URL);
  const f = new ethers.Contract(FEED, ABI, p);
  const [dec, rd] = await Promise.all([f.decimals(), f.latestRoundData()]);
  const price = Number(rd[1]) / 10 ** Number(dec);
  console.log({ feed: FEED, decimals: Number(dec), price, updatedAt: Number(rd[3]) });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
