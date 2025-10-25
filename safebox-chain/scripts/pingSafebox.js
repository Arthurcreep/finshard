const { ethers } = require('hardhat');
const ABI = [
  'function usdt() view returns (address)',
  'function totalUsdt() view returns (uint256)',
];

const SAFE = process.env.SAFE || '0xAa286709903657D6F980425804430a78D2cb9710'; // твой адрес

async function main() {
  const c = new ethers.Contract(SAFE, ABI, ethers.provider);
  console.log('usdt:', await c.usdt());
  console.log('totalUsdt:', (await c.totalUsdt()).toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
