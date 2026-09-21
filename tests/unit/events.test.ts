import { describe, expect, it, vi } from 'vitest';
import { Emitter } from '../../src/core/events.js';

describe('Emitter', () => {
  it('invokes listeners with the emitted payload', () => {
    const emitter = new Emitter();
    const listener = vi.fn();
    emitter.on('change', listener);
    emitter.emit('change', { index: 1, previousIndex: 0, source: 'api' });
    expect(listener).toHaveBeenCalledWith({ index: 1, previousIndex: 0, source: 'api' });
  });

  it('on() returns an unsubscribe function', () => {
    const emitter = new Emitter();
    const listener = vi.fn();
    const unsubscribe = emitter.on('change', listener);
    unsubscribe();
    emitter.emit('change', { index: 1, previousIndex: 0, source: 'api' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('off() removes a specific listener without affecting others', () => {
    const emitter = new Emitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on('change', a);
    emitter.on('change', b);
    emitter.off('change', a);
    emitter.emit('change', { index: 1, previousIndex: 0, source: 'api' });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('a listener unsubscribing itself mid-emit does not skip other listeners', () => {
    const emitter = new Emitter();
    const b = vi.fn();
    const a = vi.fn(() => unsubscribeA());
    const unsubscribeA = emitter.on('change', a);
    emitter.on('change', b);
    emitter.emit('change', { index: 1, previousIndex: 0, source: 'api' });
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('clear() removes all listeners for all events', () => {
    const emitter = new Emitter();
    const listener = vi.fn();
    emitter.on('destroy', listener);
    emitter.clear();
    emitter.emit('destroy', undefined);
    expect(listener).not.toHaveBeenCalled();
  });
});
