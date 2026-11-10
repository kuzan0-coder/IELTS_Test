/* =========================================================================
   mic-worklet.js — AudioWorklet untuk Ngobrol AI (percakapan suara).
   Mengubah suara mikrofon (sample rate perangkat, mis. 48 kHz) menjadi
   PCM 16-bit mono 16 kHz — format yang diminta Gemini Live — lalu
   mengirimnya ke halaman per potongan 100 ms beserta level suaranya.
   ========================================================================= */
const TARGET_RATE = 16000;
const CHUNK = 1600; // 100 ms pada 16 kHz

class MicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.t = 0;      // posisi pecahan menuju sampel keluaran berikutnya
    this.acc = 0;    // jumlah sampel masukan dalam jendela saat ini
    this.cnt = 0;
    this.out = new Int16Array(CHUNK);
    this.n = 0;
    this.sumSq = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      // Downsample dengan merata-ratakan tiap jendela: cukup halus untuk suara.
      this.acc += ch[i];
      this.cnt++;
      this.t += 1;
      if (this.t < this.ratio) continue;
      this.t -= this.ratio;
      const v = Math.max(-1, Math.min(1, this.acc / this.cnt));
      this.acc = 0;
      this.cnt = 0;
      this.sumSq += v * v;
      this.out[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.n === CHUNK) {
        const level = Math.sqrt(this.sumSq / CHUNK);
        this.port.postMessage({ pcm: this.out.buffer, level }, [this.out.buffer]);
        this.out = new Int16Array(CHUNK);
        this.n = 0;
        this.sumSq = 0;
      }
    }
    return true;
  }
}

registerProcessor('mic-capture', MicCapture);
