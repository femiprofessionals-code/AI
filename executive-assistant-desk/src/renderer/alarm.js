/*
 * Loud alarm tones generated with the Web Audio API (no sound files needed).
 * A compressor keeps the tone as loud as possible without distorting; the volume
 * setting scales it from quiet to full. The overall loudness also depends on the
 * Windows volume.
 */
(function () {
  let ctx = null;
  const log = []; // played alarms, for the automated tests
  let current = null;

  function context() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function schedule(sound, out, t0, seconds) {
    const c = out.context;
    const nodes = [];
    const osc = (type, freq, start, stop) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, start);
      o.connect(out);
      o.start(start);
      o.stop(stop);
      nodes.push(o);
      return o;
    };
    if (sound === 'beeps') {
      // Rapid, piercing beeps in groups of four (like a smoke alarm).
      for (let t = 0; t < seconds; t += 0.25) {
        if (t % 1.5 >= 1) continue; // 4 beeps, short pause, repeat
        osc('square', 3100, t0 + t, t0 + t + 0.14);
      }
    } else if (sound === 'bell') {
      // Ringing bell: struck once a second with a long decay.
      for (let t = 0; t < seconds; t += 0.6) {
        const g = c.createGain();
        g.gain.setValueAtTime(1, t0 + t);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + t + 0.58);
        g.connect(out);
        for (const [f, type] of [[1320, 'triangle'], [2640, 'sine'], [3960, 'sine']]) {
          const o = c.createOscillator();
          o.type = type;
          o.frequency.setValueAtTime(f, t0 + t);
          o.connect(g);
          o.start(t0 + t);
          o.stop(t0 + t + 0.6);
          nodes.push(o);
        }
      }
    } else {
      // Siren: sweeping up and down twice a second.
      const o = osc('sawtooth', 700, t0, t0 + seconds);
      for (let t = 0; t < seconds; t += 0.5) {
        o.frequency.setValueAtTime(700, t0 + t);
        o.frequency.linearRampToValueAtTime(1600, t0 + t + 0.25);
        o.frequency.linearRampToValueAtTime(700, t0 + t + 0.5);
      }
    }
    return nodes;
  }

  /** Play the alarm; resolves when it has finished (or was stopped). */
  function play({ sound = 'siren', volume = 1, seconds = 4 } = {}) {
    stop();
    log.push({ sound, volume, seconds, at: Date.now() });
    return new Promise((resolve) => {
      let c;
      try { c = context(); } catch (e) { resolve(); return; }
      const master = c.createGain();
      master.gain.value = Math.max(0, Math.min(1, volume));
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 12;
      master.connect(comp);
      comp.connect(c.destination);
      const pre = c.createGain();
      pre.gain.value = 0.9;
      pre.connect(master);
      const t0 = c.currentTime + 0.05;
      const nodes = schedule(sound, pre, t0, seconds);
      const timer = setTimeout(done, seconds * 1000 + 150);
      function done() {
        clearTimeout(timer);
        try { master.disconnect(); } catch (_) { /* already gone */ }
        current = null;
        resolve();
      }
      current = { nodes, done };
    });
  }

  function stop() {
    if (!current) return;
    for (const n of current.nodes) { try { n.stop(); } catch (_) { /* not started */ } }
    current.done();
  }

  window.Alarm = { play, stop, log };
})();
