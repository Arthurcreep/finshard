// server/routes/debug.js (добавить в конец файла)
import dotenv from 'dotenv';
dotenv.config();

const SAFE_ABI_POS = [
  'function balances(address) view returns (uint256)',
  'function bnbBalances(address) view returns (uint256)',
];

r.get('/position', async (req, res) => {
  try {
    const user = String(req.query.user || '').trim();
    const contract = String(req.query.contract || process.env.CONTRACT || '').trim();
    const rpc = String(
      process.env.RPC_URL || process.env.BSC_RPC || 'https://bsc-dataseed.binance.org',
    );

    if (!/^0x[a-fA-F0-9]{40}$/.test(user)) return res.status(400).json({ error: 'invalid user' });
    if (!/^0x[a-fA-F0-9]{40}$/.test(contract))
      return res.status(400).json({ error: 'invalid contract' });

    const provider = new (E.JsonRpcProvider || E.providers.JsonRpcProvider)(rpc);
    const safe = new E.Contract(contract, SAFE_ABI_POS, provider);

    const [usdt, bnb] = await Promise.all([
      safe.balances(user).catch(() => 0n),
      safe.bnbBalances(user).catch(() => 0n),
    ]);

    res.json({
      user,
      contract,
      balances: {
        usdtRaw: usdt.toString(),
        bnbRaw: bnb.toString(),
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
