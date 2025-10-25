// scripts/set-feed.js
import 'dotenv/config';
import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL || 'https://bsc-dataseed.binance.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT = process.env.CONTRACT;
const FEED = (process.env.FEED || '0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf').trim();
const SETTER = process.env.FEED_SETTER_NAME || ''; // опционально: точное имя

if (!PRIVATE_KEY || !CONTRACT) {
  console.error('Set PRIVATE_KEY, CONTRACT (and FEED optionally)');
  process.exit(1);
}

const p = new ethers.JsonRpcProvider(RPC_URL);
const w = new ethers.Wallet(PRIVATE_KEY, p);

// минимальный ABI с популярными именами сеттеров/геттеров
const ABI = [
  // геттеры
  'function priceFeed() view returns (address)',
  'function feed() view returns (address)',
  'function oracle() view returns (address)',
  // сеттеры (под разные контракты)
  'function setFeed(address)',
  'function setPriceFeed(address)',
  'function setOracle(address)',
  'function updateFeed(address)',
  'function setChainlinkFeed(address)',
  // владелец (если есть)
  'function owner() view returns (address)',
];

async function tryGetter(c) {
  for (const fn of ['priceFeed', 'feed', 'oracle']) {
    try {
      const a = await c[fn]();
      if (a && a !== ethers.ZeroAddress) return { getter: fn, addr: a };
    } catch {}
  }
  return { getter: null, addr: null };
}

async function main() {
  const c = new ethers.Contract(CONTRACT, ABI, w);

  // кто владелец (если метод есть)
  try {
    const owner = await c.owner();
    console.log('owner:', owner);
    if (owner.toLowerCase() !== w.address.toLowerCase()) {
      console.log('⚠️  Ваш PK не владелец — сеттер может отклониться');
    }
  } catch {}

  // текущий фид
  const before = await tryGetter(c);
  console.log('current feed:', before.addr || '(no getter)');

  // выбираем имя сеттера
  const candidates = SETTER
    ? [SETTER]
    : ['setFeed', 'setPriceFeed', 'setOracle', 'updateFeed', 'setChainlinkFeed'];

  let chosen = null;
  for (const name of candidates) {
    if (typeof c[name] !== 'function') continue;
    // пробуем статический call — если revert, переходим к следующему имени
    try {
      await c[name].staticCall(FEED);
      chosen = name;
      break;
    } catch {}
  }
  if (!chosen) {
    console.log(
      '❌ Не найден подходящий сеттер (или статический вызов ревертится). Нужен redeploy или точный ABI.',
    );
    return;
  }

  console.log(`setter chosen: ${chosen}(${FEED})`);
  const tx = await c[chosen](FEED);
  console.log('tx sent:', tx.hash);
  const r = await tx.wait();
  console.log('ok, status:', r.status);

  const after = await tryGetter(c);
  console.log('new feed:', after.addr || '(no getter)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
