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
  // Test 8. The API must do this (SQR-D13): a started job always completes, and a queued job
  // blocks nothing
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

  // Test 12. The API must do this (SQR-D7, SQR-D13): a failed job gives its error to its caller and
  // to each waiter, and releases its key, so that the next call builds again
  it('gives the error to the caller and to a waiter, and releases the key, after a failed job', async () => {
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
    await expect(waiter).rejects.toThrow('build failed');
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

  // Test 25. The API must do this (SQR-D6): requests between two rounds of a key do not start
  // a second chain of next rounds
  it('keeps one waiting next round for a key', async () => {
    // The delay is much longer than the three calls, so no delayed round runs between them
    const jobs = createJobManager({ roundDelayMs: 1000 });
    let rounds = 0;
    const round = async () => {
      rounds++;
      return { committed: rounds >= 4 };
    };

    for (let i = 0; i < 3; i++) {
      await jobs.run('k', () => true, round);
    }
    expect(jobs.stats().delayedRounds).toBe(1);

    await jobs.whenIdle();
    expect(rounds).toBe(4);
  });

  // Test 28. The API must do this (SQR-U1, SQR-D7): a call joins a round that started at its
  // version or later; for an older round, it waits, and gets the result of a newer round
  let parents = 0;
  it.each([
    ['run', (jobs, ...args) => jobs.run(...args)],
    [
      'child',
      (jobs, key, needsBuild, fn, options) =>
        jobs.run(`parent${++parents}`, () => true, context =>
          context.child(key, needsBuild, fn, options)
        ),
    ],
  ])('%s does not give a caller the result of a round that started before its version', async (_, call) => {
    // Three slots, so that no parent job waits in the queue
    const jobs = createJobManager({ maxRunning: 3, roundDelayMs: 1000 });
    let generation = 1;
    const version = () => generation;
    const started = gate();
    const hold = gate();
    const round = async () => {
      const read = generation;
      if (read === 1) {
        started.open();
        await hold.promise;
      }
      return { committed: read === generation, read };
    };

    const first = jobs.run('k', () => true, round, { version });
    await started.promise;
    const joined = call(jobs, 'k', () => true, round, { version });
    // A parent job calls child in a later microtask
    await new Promise(resolve => setImmediate(resolve));
    generation = 2;
    const later = call(jobs, 'k', () => true, round, { version });
    hold.open();

    await expect(first).resolves.toMatchObject({ read: 1 });
    await expect(joined).resolves.toMatchObject({ read: 1 });
    await expect(later).resolves.toMatchObject({ committed: true, read: 2 });
    await jobs.whenIdle();
  });
});
