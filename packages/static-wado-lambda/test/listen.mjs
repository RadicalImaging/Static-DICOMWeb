/** Starts a server on a free port, and resolves to its `http://localhost:<port>` URL. */
export const listen = server =>
  new Promise(resolve =>
    server.listen(0, () => resolve(`http://localhost:${server.address().port}`))
  );

export default listen;
