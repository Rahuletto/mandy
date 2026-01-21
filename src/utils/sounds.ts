let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function playSuccessChime() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const notes = [
    { freq: 1318.51, delay: 0, duration: 0.15 },
    { freq: 1567.98, delay: 0.08, duration: 0.2 },
  ];

  notes.forEach(({ freq, delay, duration }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + delay);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3000, now + delay);
    filter.Q.setValueAtTime(1, now + delay);

    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(0.06, now + delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);

    osc.start(now + delay);
    osc.stop(now + delay + duration + 0.05);
  });
}
