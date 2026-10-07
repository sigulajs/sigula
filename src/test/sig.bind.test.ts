import {describe, expect, it, vi} from 'vitest';
import {
  compute,
  createBind,
  html,
  removeBind,
  render,
  sig,
  text,
  view,
} from '..';

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

  it('keeps running the rest of the queue when a bind throws', async () => {
    const s = sig(0);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let ran = 0;
    createBind(s, {}, () => {
      throw new Error('boom');
    });
    createBind(s, {}, () => {
      ran++;
    });

    s.forceUpdate(1);
    await flush();

    expect(ran).toBe(1);
    expect(spy).toHaveBeenCalledWith(
      '[Queue] task failed:',
      expect.any(Error),
      expect.anything(),
    );
    spy.mockRestore();
  });
});

describe('DerivedSig re-arm', () => {
  it('stays live with no observer', async () => {
    const source = sig(1);
    const doubled = compute(source, (v) => v * 2);

    expect(doubled.get()).toBe(2);
    source.update(5);
    await Promise.resolve();
    expect(doubled.get()).toBe(10);
  });

  it('re-arms, then propagates through a chain', async () => {
    const source = sig(1);
    const doubled = compute(source, (v) => v * 2);

    const observer = createBind(doubled, {} as never, (() => {}) as never);
    doubled.removeBind(observer as never);
    expect(source.getBinds().length).toBe(0);

    source.update(3);
    await Promise.resolve();
    expect(doubled.get()).toBe(2);

    createBind(doubled, {} as never, (() => {}) as never);
    expect(doubled.get()).toBe(6);

    const quadrupled = compute(doubled, (v) => v * 2);
    expect(quadrupled.get()).toBe(12);

    source.update(4);
    await Promise.resolve();
    expect(doubled.get()).toBe(8);
    expect(quadrupled.get()).toBe(16);
  });

  it('does not duplicate source binds when cleanup runs twice', () => {
    const source = sig(1);
    const doubled = compute(source, (v) => v * 2);

    const bind = createBind(doubled, {} as never, (() => {}) as never);
    doubled.removeBind(bind as never);
    expect(source.getBinds().length).toBe(0);

    doubled.cleanup();
    expect(source.getBinds().length).toBe(0);
  });

  it('recomputes once when a multi-source derived signal is re-observed', async () => {
    const sources = {a: sig(1), b: sig(2), c: sig(3)};

    let calls = 0;
    const sum = compute(sources, (v) => {
      calls++;
      return v.a + v.b + v.c;
    });

    const show = sig(true);
    const mount = () =>
      render(
        html`<p>${view(show, (v) => (v ? text(sum) : text('off')))}</p>`,
        document.body,
      );

    const dispose = mount();
    const callsAfterMount = calls;

    // hiding the subtree removes the last observer, which unlinks the
    // derived signal from its sources
    show.update(false);
    await flush();
    expect(document.body.innerHTML).toBe('<p>off</p>');

    // re-showing it re-arms the links
    calls = 0;
    show.update(true);
    await flush();

    expect(document.body.innerHTML).toBe('<p>6</p>');
    expect(calls).toBe(1);
    expect(callsAfterMount).toBeGreaterThan(0);

    dispose();
  });
});

describe('Sig.notify', () => {
  it('runs dependents without changing the value', async () => {
    const s = sig(1);
    const seen: number[] = [];
    createBind(s, {}, (v: number) => {
      seen.push(v);
    });

    s.notify();
    await flush();

    expect(seen).toEqual([1]);
    expect(s.get()).toBe(1);
  });

  it('coalesces multiple notifies into one run per bind', async () => {
    const s = sig('x');
    let runs = 0;
    createBind(s, {}, () => {
      runs++;
    });

    s.notify();
    s.notify();
    s.notify();
    await flush();

    expect(runs).toBe(1);
  });

  it('recomputes a derived signal', async () => {
    const items = sig<number[]>([]);
    const count = compute(items, (v) => v.length);
    expect(count.get()).toBe(0);

    items.get().push(1);
    items.notify();
    await flush();

    expect(count.get()).toBe(1);
  });

  it('schedules a derived signal consumer', async () => {
    const source = sig(1);
    const doubled = compute(source, (v) => v * 2);

    const seen: number[] = [];
    createBind(doubled, {}, (v: number) => {
      seen.push(v);
    });

    doubled.notify();
    await flush();

    expect(seen).toEqual([2]);
    expect(doubled.get()).toBe(2);
  });

  it('is a no-op with no bindings', () => {
    const s = sig(0);
    expect(() => s.notify()).not.toThrow();
    expect(s.getBinds().length).toBe(0);
  });

  it('forceUpdate still sets the value and notifies', async () => {
    const s = sig(1);
    const seen: number[] = [];
    createBind(s, {}, (v: number) => {
      seen.push(v);
    });

    s.forceUpdate(2);
    await flush();

    expect(s.get()).toBe(2);
    expect(seen).toEqual([2]);
  });

  it('re-runs a direct bind after in-place mutation', async () => {
    const items = sig<number[]>([]);
    const lens: number[] = [];
    createBind(items, {}, (v: number[]) => {
      lens.push(v.length);
    });

    items.notify();
    await flush();
    expect(lens).toEqual([0]);

    items.get().push(1);
    items.notify();
    await flush();
    expect(lens).toEqual([0, 1]);
  });
});

describe('Sig custom comparator', () => {
  it('uses the opts.eq comparator for update', async () => {
    const caseInsensitive = (a: string, b: string) =>
      a.toLowerCase() === b.toLowerCase();
    const s = sig<string>('A', {eq: caseInsensitive});
    let runs = 0;
    createBind(s, {}, () => {
      runs++;
    });

    s.update('a');
    await flush();
    expect(runs).toBe(0);
    expect(s.get()).toBe('A');

    s.update('b');
    await flush();
    expect(runs).toBe(1);
    expect(s.get()).toBe('b');
  });

  it('applies the comparator through trans', () => {
    const abs = (a: number, b: number) => Math.abs(a) === Math.abs(b);
    const s = sig<number>(1, {eq: abs});

    s.trans(() => -1);
    expect(s.get()).toBe(1);

    s.trans(() => 2);
    expect(s.get()).toBe(2);
  });

  it('defaults to deep equality when opts is omitted', async () => {
    const s = sig({a: 1});
    let runs = 0;
    createBind(s, {}, () => {
      runs++;
    });

    s.update({a: 1});
    await flush();
    expect(runs).toBe(0);
    expect(s.get()).toEqual({a: 1});
  });
});

describe('compute record coalescing', () => {
  it('runs the record fn once per flush when several sources change', async () => {
    const a = sig(1);
    const b = sig(2);
    let calls = 0;
    const sum = compute({a, b}, (v) => {
      calls++;
      return v.a + v.b;
    });
    expect(calls).toBe(1);

    a.update(10);
    b.update(20);
    await flush();

    expect(calls).toBe(2);
    expect(sum.get()).toBe(30);
  });

  it('keeps coalescing after a hide and re-show', async () => {
    const a = sig(1);
    const b = sig(2);
    let calls = 0;
    const sum = compute({a, b}, (v) => {
      calls++;
      return v.a + v.b;
    });

    const show = sig(true);
    const dispose = render(
      html`<p>${view(show, (v) => (v ? text(sum) : text('off')))}</p>`,
      document.body,
    );

    show.update(false);
    await flush();
    show.update(true);
    await flush();

    calls = 0;
    a.update(10);
    b.update(20);
    await flush();

    expect(calls).toBe(1);
    expect(sum.get()).toBe(30);
    dispose();
  });

  it('recomputes after a detach and re-arm with a pending write', async () => {
    const a = sig(1);
    const b = sig(2);
    const sum = compute({a, b}, (v) => v.a + v.b);
    const consumer = createBind(sum, {}, () => {});
    a.update(10);
    removeBind(consumer);
    createBind(sum, {}, () => {});
    b.update(20);
    await flush();
    expect(sum.get()).toBe(30);
  });

  it('coalesces when a non-first source is the queued representative', async () => {
    const a = sig(1);
    const b = sig(2);
    let calls = 0;
    const sum = compute({a, b}, (v) => {
      calls++;
      return v.a + v.b;
    });
    const consumer = createBind(sum, {}, () => {});

    calls = 0;
    b.update(20); // queues the second from-bind, not the first
    removeBind(consumer);
    createBind(sum, {}, () => {});
    await flush();

    expect(calls).toBe(1);
    expect(sum.get()).toBe(21);
  });
});

describe('queue self-write termination', () => {
  it('does not re-run a bind that writes its own signal from its command', async () => {
    const s = sig(0);
    let runs = 0;
    createBind(s, {}, () => {
      runs++;
      s.trans((v) => v + 1);
    });

    s.update(10);
    await flush();

    // the running bind stays `queued` until its command returns, so its own
    // synchronous write cannot re-queue it
    expect(runs).toBe(1);
    expect(s.get()).toBe(11);
  });

  it('does not infinitely re-render a view whose callback writes its signal', async () => {
    const s = sig(0);
    let runs = 0;
    render(
      view(s, () => {
        runs++;
        s.trans((v) => v + 1);
        return text(s);
      }),
      document.body,
    );
    expect(runs).toBe(1);

    s.update(10);
    await flush();

    expect(runs).toBe(2);
    expect(s.get()).toBe(11);
  });
});

describe('queue flush cap', () => {
  it('stops a divergent flush at the task cap', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = sig(0);
    let runs = 0;
    const bump = () => {
      runs++;
      s.forceUpdate(runs);
    };
    // Two binds on one signal, each writing that signal: every task re-queues
    // the other, so the queue grows without bound.
    createBind(s, {}, bump);
    createBind(s, {}, bump);

    s.forceUpdate(1);
    await flush();

    expect(runs).toBe(1_000_000);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('flush exceeded'));
    spy.mockRestore();
  });
});
