function readingTime(md = '') {
  const words = md
    .replace(/[#>*`_>\-\[\]()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
module.exports = { readingTime };
