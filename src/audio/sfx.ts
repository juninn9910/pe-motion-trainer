// Web Audio API로 합성하는 효과음 (외부 오디오 파일 없음).
// 브라우저 정책상 첫 소리는 사용자 클릭 이후에만 나므로 '시작' 버튼에서 unlock()을 부른다.

class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastTick = 0;

  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private out(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.enabled || !this.ctx || !this.master) return null;
    return { ctx: this.ctx, out: this.master };
  }

  private tone(at: number, freq: number, dur: number, type: OscillatorType, gain: number, freqEnd?: number) {
    const r = this.out();
    if (!r) return;
    const t = r.ctx.currentTime + at;
    const osc = r.ctx.createOscillator();
    const g = r.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(r.out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(at: number, dur: number, gain: number, type: BiquadFilterType, freq: number) {
    const r = this.out();
    if (!r || !this.noiseBuf) return;
    const t = r.ctx.currentTime + at;
    const src = r.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = r.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = r.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(r.out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** 성공: 도-미-솔-도 아르페지오 + 반짝임 */
  success() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(i * 0.09, f, 0.35, 'triangle', 0.35));
    this.tone(0.36, 1046.5, 0.6, 'sine', 0.25);
    this.tone(0.36, 1568, 0.6, 'sine', 0.15);
    [2093, 2637, 3136].forEach((f, i) => this.tone(0.42 + i * 0.05, f, 0.15, 'sine', 0.06));
  }

  /** 콤보 1단계 준비 완료: 딩-딩 */
  ready() {
    this.tone(0, 880, 0.18, 'sine', 0.3);
    this.tone(0.12, 1320, 0.25, 'sine', 0.3);
  }

  /** 타격: 낮은 쿵 + 짧은 딱 */
  hit() {
    this.tone(0, 170, 0.28, 'sine', 0.9, 45);
    this.noise(0, 0.09, 0.6, 'highpass', 1800);
    this.noise(0, 0.18, 0.35, 'bandpass', 600);
    this.tone(0.0, 330, 0.08, 'square', 0.12, 160);
  }

  /** 부위 일치 순간의 작은 톡 (너무 잦지 않게 0.35초 간격 제한) */
  tick() {
    const now = performance.now();
    if (now - this.lastTick < 350) return;
    this.lastTick = now;
    this.tone(0, 740, 0.07, 'sine', 0.12);
  }

  /** 캘리브레이션 완료 */
  calibrated() {
    this.tone(0, 660, 0.12, 'sine', 0.25);
    this.tone(0.1, 990, 0.2, 'sine', 0.25);
  }
}

export const sfx = new Sfx();
