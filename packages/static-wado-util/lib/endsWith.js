const endsWith = (str, end) =>
  str.length >= end.length && str.substring(str.length - end.length) === end;

module.exports = endsWith;
