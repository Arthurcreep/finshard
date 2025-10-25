const { ethers } = require("hardhat");

async function main() {
    const contractAddress = "0x9DE821dCad1083Cd3B5174c8cAfE6b07Cf3F7beD";
    const abi = [
        {
            "type": "function",
            "name": "usdt",
            "stateMutability": "view",
            "inputs": [],
            "outputs": [{ "type": "address" }]
        }
    ];
    const provider = new ethers.JsonRpcProvider("https://lb.drpc.org/bsc/AoIZWfvfJUiErzVdbcQqzf8rGp3kg4IR8IV8qhnKxixj");
    const contract = new ethers.Contract(contractAddress, abi, provider);
    const usdtAddress = await contract.usdt();
    console.log("USDT Address:", usdtAddress);
}

main().catch(console.error);