// scripts/checkBalances.js
require('dotenv').config();
const { ethers } = require('hardhat');

const USDT = '0x55d398326f99059fF775485246999027B3197955'; // BSC-Peg USDT (18d)
const SAFE = process.env.CONTRACT || '0x805b43EA0B7f3F19Ec462A5b2F99c81c80d3aceD';
const USER = process.env.USER || '0x9A36464b79301D45c622B553EeDf62479253C2ea';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function main() {
  const [signer] = await ethers.getSigners();
  const provider = signer.provider;
  const net = await provider.getNetwork();
  console.log('Network:', net.chainId);

  const usdt = new ethers.Contract(USDT, ERC20_ABI, provider);
  const [dec, sym] = await Promise.all([usdt.decimals(), usdt.symbol()]);

  const [userBalRaw, safeBalRaw] = await Promise.all([usdt.balanceOf(USER), usdt.balanceOf(SAFE)]);

  const fmt = (v) => ethers.utils.formatUnits(v, dec);

  console.log(`${sym} decimals:`, dec);
  console.log(`User  ${USER} ${sym} =`, fmt(userBalRaw));
  console.log(`SAFE  ${SAFE} ${sym} =`, fmt(safeBalRaw));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
