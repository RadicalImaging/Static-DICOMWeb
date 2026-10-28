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
  // Test 29. The API must do this (SQR-D12, SQR-D14): a request job does not wait for the
  // background jobs. It uses a request slot or starts first, a request moves a queued
  // background job of its key to the request queue, and a full request queue gives 503
  it('starts request jobs before background jobs, and rejects a request when the request queue is full', async () => {
    const jobs = createJobManager({ maxRunning: 1, maxQueued: 2, requestSlots: 1 });
    const hold = gate();
    const order = [];
    const job = name => async () => {
      order.push(name);
      await hold.promise;
      return { committed: true };
    };
    const started = () => new Promise(resolve => setImmediate(resolve));

    const background = ['b1', 'b2', 'b3'].map(key =>
      jobs.run(key, () => true, job(key), { background: true })
    );
    const first = jobs.run('r1', () => true, job('r1'));
    await started();
    expect(order).toEqual(['b1', 'r1']);

    const second = jobs.run('r2', () => true, job('r2'));
    const promoted = jobs.run('b3', () => true, job('not used'));
    await expect(jobs.run('r3', () => true, job('r3'))).rejects.toMatchObject({
      name: 'QueueFullError',
    });
    hold.open();

    await Promise.all([...background, first, second, promoted]);
    expect(order).toEqual(['b1', 'r1', 'r2', 'b3', 'b2']);
    await jobs.whenIdle();
  });

  // Test 43. The API must do this (SQR-D12): under constant request load, a queued
  // background job still starts after `backgroundEvery` request jobs
  it('starts a waiting background job after backgroundEvery request jobs', async () => {
    const jobs = createJobManager({ maxRunning: 1, requestSlots: 0, backgroundEvery: 2 });
    const hold = gate();
    const order = [];
    const job = name => async () => {
      order.push(name);
      if (name === 'r0') await hold.promise;
      return { committed: true };
    };

    const all = [
      jobs.run('r0', () => true, job('r0')),
      jobs.run('b1', () => true, job('b1'), { background: true }),
      ...['r1', 'r2', 'r3'].map(key => jobs.run(key, () => true, job(key))),
    ];
    hold.open();

    await Promise.all(all);
    expect(order).toEqual(['r0', 'r1', 'r2', 'b1', 'r3']);
    await jobs.whenIdle();
  });

  let parents = 0;
  it.each([
    ['run', (jobs, ...args) => jobs.run(...args)],
    [
      'child',
      (jobs, key, needsBuild, fn, options) =>
        jobs.run(
          `parent${++parents}`,
          () => true,
          context => context.child(key, needsBuild, fn, options)
        ),
    ],
  ])(
    '%s does not give a caller the result of a round that started before its version',
    async (_, call) => {
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
    }
  );
});
