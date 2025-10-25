// relayer.js
import 'dotenv/config';
import { ethers } from 'ethers';

const RPC = process.env.RPC_URL || process.env.BSC_RPC || 'https://bsc-dataseed.binance.org';
const PK = process.env.PRIVATE_KEY;
const CONTRACT = process.env.CONTRACT;
const USER = process.env.USER;

const SLIP_BPS = Number(process.env.SLIPPAGE_BPS || '50'); // 0.5%
const POLL_MS = Number(process.env.POLL_MS || '15000');
const GAS_LIMIT = Number(process.env.GAS_LIMIT || '1200000');
const DEADLINE_MIN = Number(process.env.DEADLINE_MIN || '10');

if (!PK || !CONTRACT || !USER) {
  console.error('Заполни .env: PRIVATE_KEY, CONTRACT, USER');
  process.exit(1);
}

const ABI = [
  'function shouldTrigger(address) view returns (bool ready, bool wantBuy, uint256 dropBps, uint256 upBps, int256 ref, int256 nowPx, uint8 dec)',
  'function performEnterBNBFor(address user, uint16 slipBps, uint256 deadline)',
  'function performExitBNBFor(address user, uint16 slipBps, uint256 deadline)',
  'function balances(address) view returns (uint256)', // если оставишь для справки
];

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);
const safe = new ethers.Contract(CONTRACT, ABI, wallet);

console.log(`Relayer started:
  rpc=${RPC}
  relayer=${wallet.address}
  contract=${CONTRACT}
  user=${USER}
  slip=${SLIP_BPS} bps
  poll=${POLL_MS} ms
`);

function fmt(n, d = 2) {
  return Number(n).toFixed(d);
}

async function tick() {
  try {
    const st = await safe.shouldTrigger(USER);
    const ready = Boolean(st.ready);
    const wantBuy = Boolean(st.wantBuy);
    const drop = Number(st.dropBps);
    const up = Number(st.upBps);
    const ref = Number(st.ref) / 1e8;
    const nowPx = Number(st.nowPx) / 1e8;
    const dec = Number(st.dec);

    console.log(
      `[STATE] ready=${ready} wantBuy=${wantBuy} drop=${fmt(drop, 0)} up=${fmt(up, 0)} ref=${
        ref ? fmt(ref, 2) : '—'
      } now=${nowPx ? fmt(nowPx, 2) : '—'} dec=${dec}`,
    );

    if (!ready) return;

    const deadline =
      Math.floor(Date.now() / 1000) + (Number.isFinite(DEADLINE_MIN) ? DEADLINE_MIN : 10) * 60;

    const fn = wantBuy ? 'performEnterBNBFor' : 'performExitBNBFor';
    // dry-run
    try {
      const req = await safe[fn].populateTransaction(USER, SLIP_BPS, deadline);
      await provider.call({ ...req, from: wallet.address });
    } catch (e) {
      const msg = e?.shortMessage || e?.info?.error?.message || e?.message || String(e);
      console.log(`[SIM ] ${fn} revert: ${msg}`);
      return;
    }

    const tx = await safe[fn](USER, SLIP_BPS, deadline, { gasLimit: GAS_LIMIT });
    console.log(`[SEND] ${fn} hash=${tx.hash}`);
    const r = await tx.wait();
    console.log(`[OK  ] status=${r.status} gasUsed=${r.gasUsed}`);
  } catch (e) {
    const msg = e?.shortMessage || e?.info?.error?.message || e?.message || String(e);
    console.log(`[ERR ] ${msg}`);
  }
}

(async function loop() {
  while (true) {
    await tick();
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
})();
