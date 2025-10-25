// server/withdrawHelper.js
import { JsonRpcProvider, Contract, Interface } from 'ethers';

export function prettyErr(e) {
  try {
    return e?.shortMessage || e?.info?.error?.message || e?.reason || e?.message || String(e);
  } catch {
    return 'Unknown error';
  }
}

/**
 * Симулирует «какой метод вывода сработает» и возвращает фронту инструкцию:
 * { ok:true, fn, args, to, amountRaw }
 */
export async function simulateWithdraw({ rpcUrl, contract, user }) {
  const provider = new JsonRpcProvider(rpcUrl);

  const iface = new Interface(ABI);
  const safe = new Contract(contract, ABI, provider);

  let balRaw = 0n;
  try {
    balRaw = await safe.balances(user); // bigint
  } catch (e) {
    console.error('[simulateWithdraw] balances() read failed:', e);
    return { ok: false, error: 'balances() read failed: ' + prettyErr(e) };
  }

  console.log('[simulateWithdraw] user balance raw:', balRaw.toString());
  if (!balRaw || balRaw === 0n) {
    return { ok: false, error: 'nothing to withdraw (balance is 0)' };
  }

  for (const item of TRY_ORDER) {
    const name = item.name;
    const args = item.args(user, balRaw);

    if (!iface.getFunction(name)) continue;

    try {
      const data = iface.encodeFunctionData(name, args);
      const txReq = { to: contract, from: user, data };
      await provider.call(txReq); // статическая проверка
      console.log('[simulateWithdraw] OK method:', name, 'args:', printableArgs(args));
      return {
        ok: true,
        to: contract,
        fn: name,
        args: args.map((a) => (typeof a === 'bigint' ? a.toString() : a)),
        amountRaw: balRaw.toString(),
      };
    } catch (e) {
      console.log('[simulateWithdraw] SIM revert for', name, ':', prettyErr(e));
      // пробуем следующий
    }
  }

  return {
    ok: false,
    error: 'no withdraw method matched; check contract Write methods and ABI mapping on the server',
  };
}

function printableArgs(args) {
  return args.map((a) => (typeof a === 'bigint' ? a.toString() : String(a)));
}

const ABI = [
  'function balances(address) view returns (uint256)',

  // частые варианты
  'function withdraw(uint256 amount)',
  'function redeem(uint256 amount)',

  // без параметров
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
  { name: 'withdraw', args: (_me, bal) => [bal] },
  { name: 'redeem', args: (_me, bal) => [bal] },
  { name: 'withdrawAll', args: () => [] },
  { name: 'redeemAll', args: () => [] },
  { name: 'claimAll', args: () => [] },
  { name: 'claim', args: () => [] },
  { name: 'exit', args: () => [] },
  { name: 'emergencyWithdraw', args: () => [] },
  { name: 'withdrawTo', args: (me, bal) => [me, bal] },
  { name: 'release', args: (me, bal) => [me, bal] },
];
