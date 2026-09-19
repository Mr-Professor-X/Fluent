export class AudioQueue {
  private queue: Array<() => Promise<void>> = [];
  private running = false;
  enqueue(play: () => Promise<void>) { this.queue.push(play); void this.run(); }
  clear() { this.queue = []; }
  private async run() { if (this.running) return; this.running = true; while (this.queue.length) await this.queue.shift()!(); this.running = false; }
}
