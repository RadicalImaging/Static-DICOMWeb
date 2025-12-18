// Join on a URI path
const joinUri = (...args) =>
  args.reduce((prev, cur) => {
    if (!prev) return cur;
    if (!cur) return prev;
    const prevSlash = prev[prev.length - 1] === '/';
    const curSlash = cur[0] === '/';
    // eslint-disable-next-line prettier/prettier
    if (!prevSlash && !curSlash) return `${prev}/${cur}`;
    if (prevSlash && curSlash) return `${prev}${cur.substring(1)}`;
    return `${prev}${cur}`;
  }) || '';

export default joinUri;
