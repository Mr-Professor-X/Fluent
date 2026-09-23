type QueueItem = { play: () => Promise<void>; drop?: () => void };

/**
 * Plays translated speech one clip at a time so voices never overlap.
 * If people talk faster than the audio can play, the oldest waiting clips are dropped
 * so listeners always hear the most recent speech. A dropped clip's `drop` callback runs
 * so it can release its audio element and stop downloading.
 */
export class AudioQueue {
  private queue: QueueItem[] = [];
  private running = false;
  constructor(private maxPending = 3) {}

  enqueue(play: () => Promise<void>, drop?: () => void) {
    this.queue.push({ play, drop });
    while (this.queue.length > this.maxPending) this.discard(this.queue.shift());
    void this.run();
  }

  clear() {
    for (const item of this.queue.splice(0)) this.discard(item);
  }

  get busy() { return this.running; }

  private discard(item?: QueueItem) {
    try { item?.drop?.(); } catch (error) { console.error('[audio queue] drop', error); }
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const item = this.queue.shift()!;
      try { await item.play(); } catch (error) { console.error('[audio queue]', error); }
    }
    this.running = false;
  }
}
