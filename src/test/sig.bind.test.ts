import {describe, expect, it} from 'vitest';
import {createBind, removeBind, sig} from '..';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('queue coalescing', () => {
  it('runs a bind once per flush no matter how many writes precede it', async () => {
    const s = sig(0);
    let runs = 0;
    createBind(s, {}, () => {
      runs++;
    });

    for (let i = 1; i <= 5; i++) s.forceUpdate(i);
    await flush();

    expect(runs).toBe(1);
  });

  it('coalesces independently for each bind on the same signal', async () => {
    const s = sig(0);
    let runs = 0;
    for (let i = 0; i < 5; i++) {
      createBind(s, {}, () => {
        runs++;
      });
    }

    for (let i = 1; i <= 5; i++) s.forceUpdate(i);
    await flush();

    expect(runs).toBe(5);
  });

  it('delivers the final value, not an intermediate one', async () => {
    const s = sig(0);
    const seen: number[] = [];
    createBind(s, {}, (v: number) => {
      seen.push(v);
    });

    for (let i = 1; i <= 5; i++) s.forceUpdate(i);
    await flush();

    expect(seen).toEqual([5]);
  });

  it('re-arms binds so the next flush runs them again', async () => {
    const s = sig(0);
    let runs = 0;
    createBind(s, {}, () => {
      runs++;
    });

    s.forceUpdate(1);
    await flush();
    expect(runs).toBe(1);

    s.forceUpdate(2);
    await flush();
    expect(runs).toBe(2);
  });

  it('runs a bind that is added mid-flush after its own signal fires', async () => {
    const s = sig(0);
    let runs = 0;
    createBind(s, {}, () => {
      runs++;
      if (runs === 1) {
        // a bind created during the flush must still be picked up by the
        // very flush that is already draining, not dropped by de-duplication
        createBind(s, {}, () => {
          runs += 100;
        });
        s.forceUpdate(1);
      }
    });

    s.forceUpdate(1);
    await flush();

    expect(runs).toBe(101);
  });

  it('does not run binds removed before the flush', async () => {
    const s = sig<unknown>(0);
    let runs = 0;
    const bind = createBind(s, {}, () => {
      runs++;
    });

    s.forceUpdate(1);
    removeBind(bind);
    await flush();

    expect(runs).toBe(0);
  });

  it('does not run a removed bind but still re-arms the rest', async () => {
    const s = sig<unknown>(0);
    let runs = 0;
    const a = createBind(s, {}, () => {
      runs += 1;
    });
    createBind(s, {}, () => {
      runs += 10;
    });

    s.forceUpdate(1);
    removeBind(a);
    await flush();
    expect(runs).toBe(10);

    // the surviving bind subscribes to s, so writing s again must re-run it
    const b = createBind(s, {}, () => {
      runs += 100;
    });
    s.forceUpdate(2);
    await flush();
    expect(runs).toBe(120);

    removeBind(b);
    expect(s.getBinds().length).toBe(1);
  });

  it('propagates a bind added mid-flush to a derived signal', async () => {
    const s = sig(0);
    let runs = 0;
    createBind(s, {}, () => {
      runs++;
      if (runs === 1) {
        createBind(s, {}, () => {
          runs += 1000;
        });
        s.forceUpdate(2);
      }
    });

    s.forceUpdate(1);
    await flush();

    expect(runs).toBe(1001);
  });

  it('handles a signal with more binds than the argument-count limit', () => {
    const s = sig(0);
    const count = 150_000;
    let runs = 0;
    for (let i = 0; i < count; i++) {
      createBind(s, {}, () => {
        runs++;
      });
    }

    // spreading the bind list into add(...binds) overflows the stack here
    expect(() => s.forceUpdate(1)).not.toThrow();
    expect(s.getBinds().length).toBe(count);
    expect(runs).toBe(0);
  });
});
