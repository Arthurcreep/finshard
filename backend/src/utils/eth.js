// backend/src/utils/eth.js
const { recoverAddress, hashMessage } = require('viem')
async function verifyPersonalSignature(address, message, signature) {
    const recovered = await recoverAddress({ hash: hashMessage(message), signature })
    return recovered.toLowerCase() === String(address).toLowerCase()
}
module.exports = { verifyPersonalSignature }


