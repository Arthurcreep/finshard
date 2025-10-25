const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);

    const UsdtSafeboxV3 = await ethers.getContractFactory("UsdtSafeboxV3");
    const safebox = await UsdtSafeboxV3.deploy(
        "0x55d398326f99059fF775485246999027B3197955", // USDT
        "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeRouter
        "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
        "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", // CAKE
        "0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf"  // BTC/USD feed
    );
    await safebox.deployed();
    console.log("UsdtSafeboxV3 deployed to:", safebox.address);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});