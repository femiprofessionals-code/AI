/*
 * Optional vibration on an external game controller (Xbox / XInput-compatible, USB or
 * Bluetooth) through the Gamepad API. The computer itself is never assumed to vibrate:
 * if no compatible controller is connected, nothing happens.
 *
 * Windows only reports a controller to apps after a button on it has been pressed once
 * since it was connected.
 */
(function () {
  function controllers() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    return pads.filter(Boolean).map((gp) => ({
      gp,
      name: gp.id,
      canVibrate: !!(gp.vibrationActuator && (gp.vibrationActuator.playEffect || gp.vibrationActuator.pulse)),
    }));
  }

  async function rumbleOnce(gp, ms) {
    const act = gp.vibrationActuator;
    if (act.playEffect) {
      await act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: 1, weakMagnitude: 1 });
    } else if (act.pulse) {
      await act.pulse(1, ms);
    }
  }

  /** Pulse every vibrating controller: 3 bursts. Returns how many controllers vibrated. */
  async function pulse({ bursts = 3, ms = 900, gap = 300 } = {}) {
    const targets = controllers().filter((c) => c.canVibrate);
    for (let i = 0; i < bursts; i++) {
      await Promise.all(targets.map((c) => rumbleOnce(c.gp, ms).catch(() => {})));
      if (i < bursts - 1) await new Promise((r) => setTimeout(r, gap));
    }
    return targets.length;
  }

  window.Vibrate = { controllers, pulse };
})();
