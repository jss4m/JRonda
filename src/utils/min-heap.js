/**
 * MinHeap Utility
 * Consolidated MinHeap implementation for use across the JRonda project
 * Eliminates duplicate implementations in routerLogic.js and ui.js
 */

/**
 * MinHeap class for priority queue operations
 * Used in routing algorithms and other priority-based operations
 */
export class MinHeap {
  constructor() {
    this.heap = [];
  }

  /**
   * Enqueue a value with priority
   * @param {any} value - The value to store
   * @param {number} priority - The priority (lower = higher priority)
   */
  enqueue(value, priority) {
    this.heap.push({ value, priority });
    this._bubbleUp();
  }

  /**
   * Dequeue the highest priority item (lowest priority number)
   * @returns {{value: any, priority: number}|null} The dequeued item or null if empty
   */
  dequeue() {
    if (this.isEmpty()) return null;
    
    const min = this.heap[0];
    const end = this.heap.pop();
    
    if (this.heap.length > 0) {
      this.heap[0] = end;
      this._sinkDown();
    }
    
    return min;
  }

  /**
   * Check if heap is empty
   * @returns {boolean} True if heap is empty
   */
  isEmpty() {
    return this.heap.length === 0;
  }

  /**
   * Get the size of the heap
   * @returns {number} Number of elements in heap
   */
  size() {
    return this.heap.length;
  }

  /**
   * Peek at the highest priority item without removing it
   * @returns {{value: any, priority: number}|null} The highest priority item or null if empty
   */
  peek() {
    return this.isEmpty() ? null : this.heap[0];
  }

  /**
   * Clear all items from the heap
   */
  clear() {
    this.heap = [];
  }

  /**
   * Find an item by value (linear search - O(n))
   * @param {any} value - The value to find
   * @returns {{value: any, priority: number}|null} The found item or null
   */
  find(value) {
    return this.heap.find(item => item.value === value) || null;
  }

  /**
   * Update priority of an item
   * @param {any} value - The value to update
   * @param {number} newPriority - New priority value
   * @returns {boolean} True if item was found and updated
   */
  updatePriority(value, newPriority) {
    const index = this.heap.findIndex(item => item.value === value);
    if (index === -1) return false;
    
    const oldPriority = this.heap[index].priority;
    this.heap[index].priority = newPriority;
    
    if (newPriority < oldPriority) {
      this._bubbleUpFromIndex(index);
    } else if (newPriority > oldPriority) {
      this._sinkDownFromIndex(index);
    }
    
    return true;
  }

  /**
   * Internal: Bubble up from the last element
   */
  _bubbleUp() {
    let idx = this.heap.length - 1;
    const element = this.heap[idx];
    
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      const parent = this.heap[parentIdx];
      
      if (element.priority >= parent.priority) break;
      
      this.heap[parentIdx] = element;
      this.heap[idx] = parent;
      idx = parentIdx;
    }
  }

  /**
   * Internal: Bubble up from a specific index
   */
  _bubbleUpFromIndex(idx) {
    const element = this.heap[idx];
    
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      const parent = this.heap[parentIdx];
      
      if (element.priority >= parent.priority) break;
      
      this.heap[parentIdx] = element;
      this.heap[idx] = parent;
      idx = parentIdx;
    }
  }

  /**
   * Internal: Sink down from the root
   */
  _sinkDown() {
    let idx = 0;
    const length = this.heap.length;
    const element = this.heap[0];
    
    while (true) {
      let leftIdx = 2 * idx + 1;
      let rightIdx = 2 * idx + 2;
      let swap = null;
      
      if (leftIdx < length) {
        if (this.heap[leftIdx].priority < element.priority) {
          swap = leftIdx;
        }
      }
      
      if (rightIdx < length) {
        const comparePriority = swap === null ? element.priority : this.heap[leftIdx].priority;
        if (this.heap[rightIdx].priority < comparePriority) {
          swap = rightIdx;
        }
      }
      
      if (swap === null) break;
      
      this.heap[idx] = this.heap[swap];
      this.heap[swap] = element;
      idx = swap;
    }
  }

  /**
   * Internal: Sink down from a specific index
   */
  _sinkDownFromIndex(idx) {
    const length = this.heap.length;
    const element = this.heap[idx];
    
    while (true) {
      let leftIdx = 2 * idx + 1;
      let rightIdx = 2 * idx + 2;
      let swap = null;
      
      if (leftIdx < length) {
        if (this.heap[leftIdx].priority < element.priority) {
          swap = leftIdx;
        }
      }
      
      if (rightIdx < length) {
        const comparePriority = swap === null ? element.priority : this.heap[leftIdx].priority;
        if (this.heap[rightIdx].priority < comparePriority) {
          swap = rightIdx;
        }
      }
      
      if (swap === null) break;
      
      this.heap[idx] = this.heap[swap];
      this.heap[swap] = element;
      idx = swap;
    }
  }

  /**
   * Convert heap to array (sorted by priority)
   * @returns {Array} Sorted array of heap items
   */
  toArray() {
    return [...this.heap].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Create a MinHeap from an array of items
   * @param {Array} items - Array of {value, priority} objects
   * @returns {MinHeap} New MinHeap instance
   */
  static fromArray(items) {
    const heap = new MinHeap();
    heap.heap = [...items];
    
    // Heapify
    for (let i = Math.floor(heap.heap.length / 2) - 1; i >= 0; i--) {
      heap._sinkDownFromIndex(i);
    }
    
    return heap;
  }
}

/**
 * Priority Queue wrapper using MinHeap
 */
export class PriorityQueue {
  constructor() {
    this.heap = new MinHeap();
  }

  enqueue(value, priority) {
    this.heap.enqueue(value, priority);
  }

  dequeue() {
    const item = this.heap.dequeue();
    return item ? item.value : null;
  }

  isEmpty() {
    return this.heap.isEmpty();
  }

  size() {
    return this.heap.size();
  }

  peek() {
    const item = this.heap.peek();
    return item ? item.value : null;
  }

  clear() {
    this.heap.clear();
  }

  updatePriority(value, newPriority) {
    return this.heap.updatePriority(value, newPriority);
  }
}

/**
 * Create a priority queue with initial items
 * @param {Array} initialItems - Array of [value, priority] pairs
 * @returns {PriorityQueue} New priority queue
 */
export function createPriorityQueue(initialItems = []) {
  const pq = new PriorityQueue();
  initialItems.forEach(([value, priority]) => {
    pq.enqueue(value, priority);
  });
  return pq;
}
