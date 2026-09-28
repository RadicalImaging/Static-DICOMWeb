// lib/index.mjs must load under babel-jest as well as under Bun. The two runtimes disagree
// about how this package may reach @radicalimaging/static-wado-util, so a change that satisfies
// one of the two runtimes can break the other one, and no other test loads the entry point.
describe('lib/index.mjs', () => {
  it('loads the entry point and exports uids and StaticWado', async () => {
    const entryPoint = await import('../../lib/index.mjs');

    expect(typeof entryPoint.default).toBe('function');
    expect(typeof entryPoint.StaticWado).toBe('function');
    expect(typeof entryPoint.uids).toBe('object');
    expect(Object.keys(entryPoint.uids).length).toBeGreaterThan(0);
  });
});
