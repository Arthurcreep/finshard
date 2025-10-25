// scripts/deploy.js
const { ethers } = require('hardhat');

function normalizeAddress(addr) {
  const s = String(addr).trim();
  try {
    // Пробуем чек-сумму (если валидна — вернётся нормализованный EIP-55)
    return ethers.utils.getAddress(s);
  } catch {
    // Если ethers ругается на checksum — берём нижний регистр (EVM ок)
    return s.toLowerCase();
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);

  // Имя должно совпадать с именем контракта в .sol
  const Factory = await ethers.getContractFactory('UsdtSafeboxV4_BNBOnly_Updated');

  // --- BSC mainnet addresses (в “каноническом” виде) ---
  const USDT_RAW = '0x55d398326f99059fF775485246999027B3197955';
  const ROUTER_RAW = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
  const WBNB_RAW = '0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'; // иногда триггерит checksum в ethers v5
  const FEED_RAW = '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE'; // BNB/USD Chainlink feed (живой на BSC)

  // Нормализуем адреса (если checksum не пройдёт — подадим lowercase)
  const USDT = normalizeAddress(USDT_RAW);
  const ROUTER = normalizeAddress(ROUTER_RAW);
  const WBNB = normalizeAddress(WBNB_RAW);
  const FEED = normalizeAddress(FEED_RAW);

  console.log('Deploy args (normalized):', { USDT, ROUTER, WBNB, FEED });

  // Доп. диагностика перед деплоем — проверим, что провайдер отвечает и сеть та
  const net = await ethers.provider.getNetwork();
  console.log('Network:', { name: net.name, chainId: Number(net.chainId) });

  // Опционально: быстрый “пинг” код-контракта у известных адресов (для самопроверки RPC)
  for (const [label, addr] of Object.entries({ USDT, ROUTER, WBNB })) {
    try {
      const code = await ethers.provider.getCode(addr);
      console.log(`[preflight] ${label} code length:`, (code || '0x').length);
    } catch (e) {
      console.log(`[preflight] ${label} getCode failed:`, e?.message || e);
    }
  }

  // Сам деплой
  const c = await Factory.deploy(USDT, ROUTER, WBNB, FEED);
  console.log('Tx sent:', c.deployTransaction?.hash || '(no hash from ethers v5)');
  await c.deployed();

  console.log('✅ Deployed at:', c.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
