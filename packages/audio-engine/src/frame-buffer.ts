export class FrameBuffer {
  private readonly buffer: Float32Array;
  private readonly output: Float32Array;
  private writePos: number = 0;

  constructor(private readonly frameSize: number) {
    this.buffer = new Float32Array(frameSize + 128);
    this.output = new Float32Array(frameSize);
  }

  write(chunk: Float32Array): Float32Array | null {
    this.buffer.set(chunk, this.writePos);
    this.writePos += chunk.length;
    if (this.writePos >= this.frameSize) {
      this.output.set(this.buffer.subarray(0, this.frameSize));
      const leftover = this.writePos - this.frameSize;
      if (leftover > 0) {
        this.buffer.copyWithin(0, this.frameSize, this.writePos);
      }
      this.writePos = leftover;
      return this.output;
    }
    return null;
  }
}
