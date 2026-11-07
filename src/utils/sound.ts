class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('monoua_sound');
      if (saved === 'off') this.enabled = false;
    }
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('monoua_sound', this.enabled ? 'on' : 'off');
    }
    if (this.enabled) {
      this.playClick();
    }
    return this.enabled;
  }

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    duration: number,
    delay = 0,
    type: OscillatorType = 'sine',
    volume = 0.08
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private vibrate(pattern: number | number[]): void {
    if (!this.enabled || typeof navigator === 'undefined') return;
    try {
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore on unsupported devices
    }
  }

  public playClick(): void {
    this.tone(680, 0.045, 0, 'triangle', 0.05);
  }

  public playDiceRoll(): void {
    this.vibrate([18, 45, 25]);
    const ctx = this.getContext();
    if (!ctx) return;

    // Warm tactile ivory-on-felt dice tumble + soft double-bounce landing thuds (~1.32s total arc)
    const taps = [
      { delay: 0.03, freq: 520, vol: 0.03 },
      { delay: 0.14, freq: 605, vol: 0.033 },
      { delay: 0.27, freq: 475, vol: 0.031 },
      { delay: 0.41, freq: 565, vol: 0.028 },
      { delay: 0.56, freq: 495, vol: 0.025 },
      // Primary felt tray landing impact (~740ms)
      { delay: 0.73, freq: 185, vol: 0.065 },
      { delay: 0.78, freq: 215, vol: 0.054 },
      // Secondary settle micro-bounce (~980ms)
      { delay: 0.98, freq: 165, vol: 0.036 },
    ];

    for (const tap of taps) {
      const now = ctx.currentTime + tap.delay;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = tap.freq < 250 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(tap.freq, now);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(70, tap.freq * 0.52),
        now + 0.055
      );

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1150, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(tap.vol, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  }

  public playStepHop(): void {
    this.tone(520, 0.04, 0, 'sine', 0.04);
  }

  public playCardFlip(): void {
    // Soft crisp card lift rustle + warm crystal reveal harmonic
    this.tone(340, 0.045, 0, 'triangle', 0.045);
    this.tone(540, 0.06, 0.04, 'triangle', 0.05);
    this.tone(784, 0.14, 0.11, 'sine', 0.065);
    this.tone(1174.66, 0.22, 0.17, 'sine', 0.055);
  }

  public playCardDrawFromDeck(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Realistic filtered cardstock slide ("shhhk") as hand lifts card off the 16-card stack
    const bufferSize = Math.floor(ctx.sampleRate * 0.22);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(1400, now);
    bandpass.frequency.exponentialRampToValueAtTime(2900, now + 0.19);
    bandpass.Q.setValueAtTime(1.4, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.21);

    whiteNoise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(ctx.destination);
    whiteNoise.start(now);
    whiteNoise.stop(now + 0.22);

    // Subtle tactile card-corner snap
    this.tone(420, 0.045, 0.02, 'triangle', 0.038);
    this.tone(640, 0.055, 0.12, 'sine', 0.032);
  }

  public playCardReveal(isPositive = true): void {
    if (isPositive) {
      // Radiant holographic card-flip chime
      this.tone(523.25, 0.16, 0, 'sine', 0.065);
      this.tone(659.25, 0.18, 0.055, 'sine', 0.07);
      this.tone(783.99, 0.22, 0.11, 'sine', 0.075);
      this.tone(1046.5, 0.34, 0.17, 'triangle', 0.075);
      this.tone(1318.51, 0.38, 0.23, 'sine', 0.05);
    } else {
      // Dramatic suspenseful reveal chord for fines / audit / sanctions
      this.tone(440, 0.16, 0, 'triangle', 0.065);
      this.tone(349.23, 0.22, 0.07, 'sine', 0.07);
      this.tone(293.66, 0.32, 0.14, 'triangle', 0.072);
    }
  }

  public playPurchase(): void {
    this.vibrate([15, 30, 25]);
    // Crisp Monobank-inspired cashback chime
    this.tone(523.25, 0.12, 0, 'sine', 0.08);
    this.tone(659.25, 0.12, 0.07, 'sine', 0.08);
    this.tone(783.99, 0.16, 0.14, 'sine', 0.09);
    this.tone(1046.5, 0.25, 0.21, 'triangle', 0.08);
  }

  public playIncome(): void {
    this.tone(587.33, 0.11, 0, 'sine', 0.07);
    this.tone(880, 0.2, 0.08, 'sine', 0.08);
  }

  public playExpense(): void {
    this.tone(380, 0.12, 0, 'sine', 0.07);
    this.tone(260, 0.18, 0.09, 'triangle', 0.07);
  }

  public playAuctionBid(): void {
    this.vibrate(14);
    this.tone(740, 0.07, 0, 'triangle', 0.07);
    this.tone(987, 0.09, 0.05, 'sine', 0.06);
  }

  public playYourTurn(): void {
    this.vibrate([22, 40, 28]);
    // Gentle Diia push notification double chime
    this.tone(659.25, 0.14, 0, 'sine', 0.08);
    this.tone(987.77, 0.24, 0.11, 'sine', 0.09);
  }

  public playJail(): void {
    this.tone(240, 0.18, 0, 'sawtooth', 0.045);
    this.tone(180, 0.28, 0.15, 'sawtooth', 0.045);
  }

  public playChat(): void {
    this.tone(820, 0.05, 0, 'sine', 0.035);
  }

  public playVictory(): void {
    this.vibrate([30, 50, 30, 50, 60]);
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((n, idx) => {
      this.tone(n, 0.28, idx * 0.1, 'triangle', 0.09);
    });
  }
}

export const sound = new SoundEngine();

