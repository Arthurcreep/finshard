// scripts/read-feed.js
import 'dotenv/config';
import { ethers } from 'hardhat';

const FEED_ABI = [
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
];

async function main() {
  const CONTRACT = process.env.CONTRACT;
  if (!CONTRACT) throw new Error('Set CONTRACT in .env');

  // ABI именно под твой контракт: public immutable btcUsdFeed => автоген-геттер btcUsdFeed()
  const SAFE_ABI = ['function btcUsdFeed() view returns (address)'];

  const c = await ethers.getContractAt(SAFE_ABI, CONTRACT);
  const feedAddr = await c.btcUsdFeed();

  if (!feedAddr || feedAddr === ethers.ZeroAddress) {
    console.log('⚠️  btcUsdFeed() пуст или нулевой — проверь деплой/адрес');
    return;
  }

  const feed = new ethers.Contract(feedAddr, FEED_ABI, ethers.provider);
  const dec = await feed.decimals();
  const [, answer, , updatedAt] = await feed.latestRoundData();

  console.log({
    contract: CONTRACT,
    feed: feedAddr,
    decimals: Number(dec),
    price: Number(answer) / 10 ** Number(dec),
    updatedAt: Number(updatedAt),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
