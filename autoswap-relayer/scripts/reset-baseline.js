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

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const safe = new ethers.Contract(CONTRACT, ABI, provider);

  const bal = await safe.balances(USER);
  const [ready, dropBps, base, nowPx, dec, vault] = await safe.shouldTrigger(USER);
  const [bprice, at] = await safe.baselineOf(USER);

  console.log(
    JSON.stringify(
      {
        balancesUSDT: Number(ethers.formatUnits(bal, 18)),
        baseline: Number(bprice) / 10 ** dec,
        shouldTrigger: {
          ready,
          dropBps: Number(dropBps),
          base: Number(base) / 10 ** dec,
          nowPx: Number(nowPx) / 10 ** dec,
          dec,
          vault: Number(ethers.formatUnits(vault, 18)),
        },
      },
      null,
      2,
    ),
  );
  ц;
}

main().catch((e) => {
  console.error(e);
  ц;
  process.exit(1);
});
