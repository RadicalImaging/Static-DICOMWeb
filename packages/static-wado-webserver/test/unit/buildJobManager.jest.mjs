import { createJobManager } from '@radicalimaging/static-wado-util';

/** A promise and its resolve function, to hold a job at a known point */
function gate() {
  let open;
  const promise = new Promise(resolve => {
    open = resolve;
  });
  return { promise, open };
}

describe('createJobManager', () => {
  // The API must do this (SQR-D13): a started job always completes, and a queued job blocks nothing
  it('completes a job with three levels of nested jobs while a job for a nested key waits in the queue', async () => {
    const jobs = createJobManager({ maxRunning: 1, maxQueued: 5 });
    const built = new Set();
    const builds = [];
    const needsBuild = key => () => !built.has(key);
    const build = (key, inner) => async context => {
      builds.push(key);
      await inner?.(context);
      built.add(key);
      return { committed: true };
    };
    const atLevel1 = gate();
    const queuedStarted = gate();

    const first = jobs.run(
      'l0',
      needsBuild('l0'),
      build('l0', context =>
        context.child(
          'l1',
          needsBuild('l1'),
          build('l1', async c1 => {
            atLevel1.open();
            await queuedStarted.promise;
            await c1.child(
              'l2',
              needsBuild('l2'),
              build('l2', c2 => c2.child('l3', needsBuild('l3'), build('l3')))
            );
          })
        )
      )
    );

    await atLevel1.promise;
    // The only slot is in use, so this top-level job for a nested key waits in the queue
    const queued = jobs.run('l2', needsBuild('l2'), build('l2-queued'));
    expect(jobs.stats().queued).toBe(1);
    queuedStarted.open();

    await expect(first).resolves.toEqual({ committed: true });
    await expect(queued).resolves.toBeUndefined();
    expect(builds).toEqual(['l0', 'l1', 'l2', 'l3']);
    await jobs.whenIdle();
  });

  // The API must do this (SQR-D7, SQR-D13): a failed job gives its error to its caller,
  // and releases its key, so that the next call builds again
  it('gives the error to the caller and undefined to a waiter, and releases the key, after a failed job', async () => {
    const jobs = createJobManager({ maxRunning: 1 });
    const hold = gate();
    const failing = jobs.run(
      'k',
      () => true,
      async () => {
        await hold.promise;
        throw new Error('build failed');
      }
    );
    const waiter = jobs.run(
      'k',
      () => true,
      async () => ({ committed: true })
    );
    hold.open();

    await expect(failing).rejects.toThrow('build failed');
    await expect(waiter).resolves.toBeUndefined();
    await expect(
      jobs.run(
        'k',
        () => true,
        async () => ({ committed: true })
      )
    ).resolves.toEqual({
      committed: true,
    });
    expect(jobs.stats()).toMatchObject({ active: 0, running: 0, queued: 0 });
  });
});
