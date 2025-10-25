import 'dotenv/config';
import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL || 'https://bsc-dataseed.binance.org';
const CONTRACT = process.env.CONTRACT;
const USER = process.env.USER;

if (!CONTRACT || !USER) throw new Error('Set CONTRACT and USER in .env');

const ABI = [
  'function balances(address) view returns (uint256)',
  'function shouldTrigger(address) view returns (bool,uint256,int256,int256,uint8,uint256)',
  'function baselineOf(address) view returns (int256,uint64)',
];

// helper: bigint(1e8) -> number(115_000.12)
const toDec = (x, dec) => Number(x) / 10 ** Number(dec);

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const safe = new ethers.Contract(CONTRACT, ABI, provider);

  const bal = await safe.balances(USER); // bigint (USDT 18)
  const [ready, dropBps, basePx, nowPx, dec, vault] = await safe.shouldTrigger(USER);
  const [bprice, at] = await safe.baselineOf(USER);

  const decNum = Number(dec); // <- ключевая правка

  console.log(
    JSON.stringify(
      {
        balancesUSDT: Number(ethers.formatUnits(bal, 18)),
        baseline: toDec(bprice, decNum),
        shouldTrigger: {
          ready: Boolean(ready),
          dropBps: Number(dropBps),
          base: toDec(basePx, decNum),
          nowPx: toDec(nowPx, decNum),
          dec: decNum,
          vault: Number(ethers.formatUnits(vault, 18)),
          baselineSetAt: Number(at),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
