import { describe, it, expect, beforeEach } from 'vitest';
import { MinHeap } from '../src/utils/min-heap.js';

describe('MinHeap', () => {
  let heap;

  beforeEach(() => {
    heap = new MinHeap();
  });

  it('enqueues and dequeues correctly', () => {
    heap.enqueue('C', 3);
    heap.enqueue('A', 1);
    heap.enqueue('B', 2);
    
    expect(heap.dequeue().value).toBe('A');
    expect(heap.dequeue().value).toBe('B');
    expect(heap.dequeue().value).toBe('C');
  });

  it('handles empty heap', () => {
    expect(heap.isEmpty()).toBe(true);
    expect(heap.dequeue()).toBe(null);
  });

  it('updatePriority works', () => {
    heap.enqueue('A', 3);
    heap.enqueue('B', 1);
    
    heap.updatePriority('A', 0);
    expect(heap.dequeue().value).toBe('A');
  });
});

