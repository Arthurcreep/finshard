// scripts/listArtifacts.js
const fs = require('fs');
const path = require('path');

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) walk(p, acc);
    else if (name.endsWith('.json')) acc.push(p);
  }
  return acc;
}

function main() {
  const root = path.join(__dirname, '..', 'artifacts', 'contracts');
  if (!fs.existsSync(root)) {
    console.log('No artifacts/contracts directory yet. Compile first.');
    process.exit(0);
  }
  const files = walk(root, []);
  const names = [];
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (j && j.contractName) names.push(j.contractName);
    } catch {}
  }
  console.log('Contracts compiled:', [...new Set(names)].sort());
}
main();
