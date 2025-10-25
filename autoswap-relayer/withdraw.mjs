import 'dotenv/config';
import { ethers } from 'ethers';

// ---- конфиг ----
const RPC = process.env.RPC_URL || process.env.BSC_RPC || 'https://bsc-dataseed.binance.org';
const PK = process.env.PRIVATE_KEY; // ВНИМАНИЕ: ключ в .env либо в командной строке
const CONTRACT = process.env.CONTRACT || '0xe67e0e2b9ec606c0f05c4bcca601de5b6d33acef';

// функции, которые попытаемся по очереди (безопасно: сначала симулируем, потом шлём)
const ABI = [
  'function balances(address) view returns (uint256)',

  // самые частые
  'function withdraw(uint256 amount)',
  'function redeem(uint256 amount)',

  // частые «без параметров»
  'function withdrawAll()',
  'function redeemAll()',
  'function claim()',
  'function claimAll()',
  'function exit()',
  'function emergencyWithdraw()',

  // с получателем
  'function withdrawTo(address to, uint256 amount)',
  'function release(address to, uint256 amount)',
];

const TRY_ORDER = [
  { name: 'withdraw', args: (me, bal) => [bal] },
  { name: 'redeem', args: (me, bal) => [bal] },
  { name: 'withdrawAll', args: () => [] },
  { name: 'redeemAll', args: () => [] },
  { name: 'claimAll', args: () => [] },
  { name: 'claim', args: () => [] },
  { name: 'exit', args: () => [] },
  { name: 'emergencyWithdraw', args: () => [] },
  { name: 'withdrawTo', args: (me, bal) => [me, bal] },
  { name: 'release', args: (me, bal) => [me, bal] },
];

function prettyErr(e) {
  return e?.shortMessage || e?.info?.error?.message || e?.reason || e?.message || String(e);
}

async function main() {
  if (!PK) {
    console.error('PRIVATE_KEY не задан. Укажи его в .env или в командной строке.');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  const me = await wallet.getAddress();
  const safe = new ethers.Contract(CONTRACT, ABI, wallet);

  const bal = await safe.balances(me);
  console.log('Your contract balance (raw):', bal.toString());
  if (bal === 0n) {
    console.log('Нечего выводить: баланс 0.');
    return;
  }

  for (const item of TRY_ORDER) {
    const fn = safe[item.name];
    if (typeof fn !== 'function') {
      // В ethers v6 вернётся прокси-функция даже если метода нет в контракте только если есть в ABI.
      // Но оставим эту проверку: если из ABI уберёшь — просто пропустим.
      continue;
    }

    const args = item.args(me, bal);
    console.log(
      `\n== Пробуем ${item.name}(${args
        .map((a) => (typeof a === 'bigint' ? a.toString() : a))
        .join(', ')})`,
    );

    // симуляция
    try {
      const txReq = await safe[item.name].populateTransaction(...args);
      await provider.call({ ...txReq, from: me });
    } catch (e) {
      console.log(`SIM revert (${item.name}):`, prettyErr(e));
      continue; // пробуем следующий метод
    }

    // отправка
    try {
      const tx = await safe[item.name](...args);
      console.log('TX sent:', tx.hash);
      const r = await tx.wait();
      console.log('OK:', { status: r.status, gasUsed: r.gasUsed?.toString?.() });
      return; // успешно вывели — выходим
    } catch (e) {
      console.log(`SEND failed (${item.name}):`, prettyErr(e));
      // попробуем следующий
    }
  }

  console.log(
    '\nПохоже, ни один из стандартных методов не подошёл. Покажи, пожалуйста, список Write-функций на BscScan → Contract → Write Contract.',
  );
}

main().catch((e) => {
  console.error('Fatal:', prettyErr(e));
  process.exit(1);
});
