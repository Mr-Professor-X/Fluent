/**
 * Plays translated speech one clip at a time so voices never overlap.
 * If people talk faster than the audio can play, the oldest waiting clips are dropped
 * so listeners always hear the most recent speech.
 */
export class AudioQueue {
  private queue: Array<() => Promise<void>> = [];
  private running = false;
  constructor(private maxPending = 3) {}
  enqueue(play: () => Promise<void>) {
    this.queue.push(play);
    while (this.queue.length > this.maxPending) this.queue.shift();
    void this.run();
  }
  clear() { this.queue = []; }
  get busy() { return this.running; }
  private async run() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      try { await this.queue.shift()!(); } catch (error) { console.error('[audio queue]', error); }
    }
    this.running = false;
  }
}
