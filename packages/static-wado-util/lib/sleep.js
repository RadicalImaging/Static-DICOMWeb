function sleep(ms) {
  return new Promise(resolveFunc => {
    setTimeout(resolveFunc, ms);
  });
}

module.exports = sleep;
