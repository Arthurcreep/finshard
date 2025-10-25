// scripts/read-events.js
import 'dotenv/config';
import { ethers } from 'ethers';

const RPC = process.env.RPC_URL || process.env.BSC_RPC || 'https://bsc-dataseed.binance.org';
const CONTRACT = process.env.CONTRACT;
const USER = (process.env.USER || '').toLowerCase();

// Настройка диапазона:
// 1) LOOKBACK_BLOCKS — смотреть назад от head (дефолт 5000)
// 2) или задай START_BLOCK/END_BLOCK явным диапазоном
const LOOKBACK = Number(process.env.LOOKBACK_BLOCKS || '5000');
const START_BLOCK = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : null;
const END_BLOCK = process.env.END_BLOCK ? Number(process.env.END_BLOCK) : null;

// Размер чанка (чтобы не ловить "Block range limit exceeded")
const CHUNK = Number(process.env.LOG_CHUNK || '1500');

const ABI = [
  'event AutoSwapTriggered(address indexed user, address indexed tokenOut, uint256 usdtIn, uint256 outAmount, int256 base, int256 nowPx, uint64 at)',
  'event Swapped(address indexed user, address indexed tokenOut, uint256 usdtIn, uint256 amountOut)',
  'function balances(address) view returns (uint256)',
  'function baselineOf(address) view returns (int256,uint64)',
];

function asBn(x) {
  try {
    return BigInt(x);
  } catch {
    return 0n;
  }
}

async function getLogsChunked(provider, params, fromBlock, toBlock, chunkSize) {
  const out = [];
  let from = fromBlock;
  while (from <= toBlock) {
    const to = Math.min(toBlock, from + chunkSize);
    const logs = await provider.getLogs({ ...params, fromBlock: from, toBlock: to });
    out.push(...logs);
    from = to + 1;
  }
  return out;
}

async function main() {
  if (!CONTRACT) throw new Error('CONTRACT env пуст');
  if (!USER) throw new Error('USER env пуст');

  const provider = new ethers.JsonRpcProvider(RPC);
  const iface = new ethers.Interface(ABI);
  const c = new ethers.Contract(CONTRACT, ABI, provider);

  // --- Текущее состояние
  const [bal, [base, at]] = await Promise.all([c.balances(USER), c.baselineOf(USER)]);

  console.log('STATE:', {
    balancesUSDT: Number(ethers.formatUnits(bal, 18)),
    baselinePrice: Number(base) / 1e8,
    baselineAt: Number(at),
  });

  // --- Диапазон блоков
  const head = await provider.getBlockNumber();
  const fromBlock =
    START_BLOCK ?? Math.max(1, head - (Number.isFinite(LOOKBACK) ? LOOKBACK : 5000));
  const toBlock = END_BLOCK ?? head;

  // --- Темы
  const userTopic = ethers.zeroPadValue(USER, 32).toLowerCase();
  const topicAuto = iface.getEvent('AutoSwapTriggered').topicHash;
  const topicSwapped = iface.getEvent('Swapped').topicHash;

  // --- Читаем AutoSwapTriggered чанками
  const logsAuto = await getLogsChunked(
    provider,
    { address: CONTRACT, topics: [topicAuto, userTopic] },
    fromBlock,
    toBlock,
    CHUNK,
  );

  console.log(`\nAutoSwapTriggered [${fromBlock}-${toBlock}] : ${logsAuto.length}`);
  for (const l of logsAuto) {
    const ev = iface.decodeEventLog('AutoSwapTriggered', l.data, l.topics);
    const tx = l.transactionHash;
    const tokenOut = ev.tokenOut;
    const usdtIn = Number(ethers.formatUnits(ev.usdtIn, 18));
    const outAmount =
      tokenOut === ethers.ZeroAddress
        ? Number(ethers.formatEther(ev.outAmount)) // BNB native
        : Number(ethers.formatUnits(ev.outAmount, 18)); // предполагаем 18 для CAKE
    const basePx = Number(ev.base) / 1e8;
    const nowPx = Number(ev.nowPx) / 1e8;
    const atTs = Number(ev.at);
    console.log(
      `- tx=${tx}\n  tokenOut=${tokenOut}\n  usdtIn=${usdtIn}\n  out=${outAmount}\n  base=${basePx} now=${nowPx} at=${new Date(
        atTs * 1000,
      ).toLocaleString()}`,
    );
  }

  // --- Читаем ручные Swapped чанками
  const logsSwapped = await getLogsChunked(
    provider,
    { address: CONTRACT, topics: [topicSwapped, userTopic] },
    fromBlock,
    toBlock,
    CHUNK,
  );

  console.log(`\nSwapped (manual) [${fromBlock}-${toBlock}] : ${logsSwapped.length}`);
  for (const l of logsSwapped) {
    const ev = iface.decodeEventLog('Swapped', l.data, l.topics);
    const tx = l.transactionHash;
    const tokenOut = ev.tokenOut;
    const usdtIn = Number(ethers.formatUnits(ev.usdtIn, 18));
    const amountOut =
      tokenOut === ethers.ZeroAddress
        ? Number(ethers.formatEther(ev.amountOut))
        : Number(ethers.formatUnits(ev.amountOut, 18));
    console.log(`- tx=${tx}\n  tokenOut=${tokenOut}\n  usdtIn=${usdtIn}\n  out=${amountOut}`);
  }

  console.log('\nTip: можно сузить диапазон: START_BLOCK=… END_BLOCK=… или LOOKBACK_BLOCKS=…');
}

main().catch((e) => {
  // аккуратно печатаем RPC ошибки
  const msg = e?.shortMessage || e?.info?.error?.message || e?.message || String(e);
  console.error(msg);
});
