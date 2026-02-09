import { createPromiseTracker } from '../../lib/createPromiseTracker.mjs';
import { StatusMonitor } from '../../lib/StatusMonitor.mjs';

describe('createPromiseTracker', () => {
  afterEach(() => {
    StatusMonitor.reset();
  });
  it('tracks unsettled count', async () => {
    const tracker = createPromiseTracker();
    expect(tracker.getUnsettledCount()).toBe(0);

    const p1 = new Promise((resolve) => setTimeout(() => resolve(1), 50));
    tracker.add(p1);
    expect(tracker.getUnsettledCount()).toBe(1);

    const p2 = new Promise((resolve) => setTimeout(() => resolve(2), 100));
    tracker.add(p2);
    expect(tracker.getUnsettledCount()).toBe(2);

    await p1;
    expect(tracker.getUnsettledCount()).toBe(1);

    await p2;
    expect(tracker.getUnsettledCount()).toBe(0);
  });

  it('limitUnsettled resolves when count drops below max', async () => {
    const tracker = createPromiseTracker();
    const p1 = new Promise((resolve) => setTimeout(() => resolve(1), 30));
    const p2 = new Promise((resolve) => setTimeout(() => resolve(2), 100));
    tracker.add(p1);
    tracker.add(p2);

    // Start with 2 unsettled; limitUnsettled(2) waits for count < 2
    // After ~30ms p1 settles, count becomes 1, promise resolves with 1
    const result = await tracker.limitUnsettled(2, 5000);
    expect(result).toBe(1);
    await p2;
  });

  it('limitUnsettled resolves on timeout with current count', async () => {
    const tracker = createPromiseTracker();
    const slow = new Promise((resolve) => setTimeout(() => resolve(), 200));
    tracker.add(slow);

    const result = await tracker.limitUnsettled(0, 10);
    expect(result).toBe(1);
  });

  it('limitUnsettled resolves immediately when already under limit', async () => {
    const tracker = createPromiseTracker();
    const result = await tracker.limitUnsettled(5, 10000);
    expect(result).toBe(0);
  });

  it('startStatusMonitor updates StatusMonitor and auto-stops when unsettled is 0', async () => {
    StatusMonitor.reset();
    const jobId = StatusMonitor.startJob('testType', {});
    const tracker = createPromiseTracker();
    tracker.startStatusMonitor('testType', jobId, {
      intervalMs: 20,
      buildData: (s, u) => ({ completed: s, open: u }),
    });

    let jobs = StatusMonitor.getOngoingJobs('testType');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data.completed).toBe(0);
    expect(jobs[0].data.open).toBe(0);

    // Resolve after we've had time to see open=1 (monitor ticks at 0ms and every 20ms)
    const p = new Promise((resolve) => setTimeout(() => resolve(1), 50));
    tracker.add(p);
    await new Promise((r) => setTimeout(r, 30));
    jobs = StatusMonitor.getOngoingJobs('testType');
    expect(jobs[0].data.open).toBe(1);

    await p;
    await new Promise((r) => setTimeout(r, 30));
    jobs = StatusMonitor.getOngoingJobs('testType');
    expect(jobs[0].data.completed).toBe(1);
    expect(jobs[0].data.open).toBe(0);

    tracker.stopStatusMonitor();
  });

  it('stopStatusMonitor is no-op when not started', () => {
    const tracker = createPromiseTracker();
    expect(() => tracker.stopStatusMonitor()).not.toThrow();
  });
});
