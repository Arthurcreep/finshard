// scripts/checkFeedDirect.js
const { ethers } = require('ethers');

// адрес BTC/USD Chainlink на BSC mainnet (правильный)
const FEED = '0x5741306c21795FdCBb9b265Ea0255F499DFe515C';

const iface = new ethers.utils.Interface([
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
]);

async function main() {
  const url = process.env.RPC || process.argv[2] || 'https://bsc-dataseed.binance.org';
  console.log('RPC:', url);

  const provider = new ethers.providers.JsonRpcProvider(url);
  const net = await provider.getNetwork();
  console.log('chainId:', net.chainId.toString());

  const code = await provider.getCode(FEED);
  console.log('code.length:', code.length, code === '0x' ? '(NO CODE!)' : '(ok)');

  try {
    const rawDec = await provider.call({
      to: FEED,
      data: iface.encodeFunctionData('decimals', []),
    });
    const [dec] = iface.decodeFunctionResult('decimals', rawDec);
    console.log('decimals():', dec);
  } catch (e) {
    console.log('decimals() failed:', e.message || e);
  }

  try {
    const rawLRD = await provider.call({
      to: FEED,
      data: iface.encodeFunctionData('latestRoundData', []),
    });
    const [roundId, answer, startedAt, updatedAt, answeredInRound] = iface.decodeFunctionResult(
      'latestRoundData',
      rawLRD,
    );
    console.log('latestRoundData.answer:', answer.toString());
    console.log('latestRoundData.updatedAt:', updatedAt.toString());
  } catch (e) {
    console.log('latestRoundData() failed:', e.message || e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
