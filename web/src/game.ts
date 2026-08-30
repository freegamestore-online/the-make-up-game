import kaplay from "kaplay";

type K = ReturnType<typeof kaplay>;

const VW = 400;
const VH = 680;

// Skin tones
const SKIN: [number, number, number]      = [242, 200, 168];
const SKIN_DARK: [number, number, number] = [210, 160, 120];

// Hair palette — pink with depth
const H_ROOT:  [number, number, number] = [190,  50, 110];
const H_MID:   [number, number, number] = [240,  90, 160];
const H_LIGHT: [number, number, number] = [255, 150, 200];
const H_SHINE: [number, number, number] = [255, 210, 235];

// Face geometry
const FX  = VW / 2;
const FY  = 305;
const FRX = 92;
const FRY = 115;

// Eyes
const ELX = FX - 36, ELY = FY - 28;
const ERX = FX + 36, ERY = FY - 28;
const EW  = 30, EH = 14;

// Cheeks
const CLX = FX - 66, CLY = FY + 18;
const CRX = FX + 66, CRY = FY + 18;
const CR  = 22;

// Lips
const MX = FX, MY = FY + 52;
const MW = 38, MH = 15;

// Nose
const NX = FX, NY = FY + 10;

// Button strip
const BTN_Y = VH - 82;

// Blink timing
const BLINK_INTERVAL = 3.0;   // seconds between blinks
const BLINK_DURATION = 0.15;  // total blink duration (close + open)

const STEPS = [
  { id: "foundation", emoji: "🧴", label: "Tap the face to apply foundation!" },
  { id: "eyeshadow",  emoji: "👁️",  label: "Tap the face to apply eye shadow!" },
  { id: "eyeliner",   emoji: "🖊️",  label: "Tap the face to draw eyeliner!" },
  { id: "mascara",    emoji: "✨",  label: "Tap the face to apply mascara!" },
  { id: "blush",      emoji: "🌸",  label: "Tap the face to apply blush!" },
  { id: "lipstick",   emoji: "💄",  label: "Tap the face to apply lipstick!" },
] as const;

type StepId = typeof STEPS[number]["id"];

function inEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number, pad = 0): boolean {
  const dx = (px - cx) / (rx + pad);
  const dy = (py - cy) / (ry + pad);
  return dx * dx + dy * dy <= 1;
}

function inCircle(px: number, py: number, cx: number, cy: number, r: number): boolean {
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Returns a 0→1 blink factor (0 = fully open, 1 = fully closed)
// Uses a smooth sine curve: rises to 1 at midpoint then falls back to 0
function blinkFactor(t: number): number {
  // t in [0, BLINK_DURATION]: map to [0, π] and take sin
  const phase = (t / BLINK_DURATION) * Math.PI;
  return Math.sin(phase); // 0 → 1 → 0
}

interface Confetti {
  x: number; y: number; vx: number; vy: number;
  color: [number, number, number]; angle: number; av: number; life: number;
}

export function startGame(canvas: HTMLCanvasElement, onScore: (n: number) => void): () => void {
  const k = kaplay({
    canvas,
    width: VW,
    height: VH,
    letterbox: true,
    background: [255, 235, 250],
    global: false,
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  });

  let stepIdx     = 0;
  let stepDone    = false;
  let foundDone   = false;
  let shadowDone  = false;
  let linerDone   = false;
  let mascaraDone = false;
  let blushDone   = false;
  let lipDone     = false;
  let confetti: Confetti[] = [];

  function resetAll() {
    stepIdx = 0; stepDone = false;
    foundDone = false; shadowDone = false; linerDone = false;
    mascaraDone = false; blushDone = false; lipDone = false;
    confetti = [];
    onScore(0);
  }

  function currentStep(): StepId { return STEPS[stepIdx]?.id ?? "lipstick"; }

  function stepProgress(): number {
    const s = currentStep();
    if (s === "foundation") return foundDone   ? 1 : 0;
    if (s === "eyeshadow")  return shadowDone  ? 1 : 0;
    if (s === "eyeliner")   return linerDone   ? 1 : 0;
    if (s === "mascara")    return mascaraDone ? 1 : 0;
    if (s === "blush")      return blushDone   ? 1 : 0;
    if (s === "lipstick")   return lipDone     ? 1 : 0;
    return 0;
  }

  function spawnConfetti() {
    confetti = [];
    const cols: [number, number, number][] = [
      [255, 80, 140], [255, 200, 50], [100, 200, 255],
      [200, 100, 255], [80, 220, 120], [255, 140, 60],
    ];
    for (let i = 0; i < 60; i++) {
      confetti.push({
        x: Math.random() * VW, y: -20 - Math.random() * 60,
        vx: (Math.random() - 0.5) * 80, vy: 80 + Math.random() * 120,
        color: cols[i % cols.length]!, angle: Math.random() * 360,
        av: (Math.random() - 0.5) * 300, life: 1,
      });
    }
  }

  k.scene("main", () => {
    resetAll();

    k.add([k.rect(VW, VH), k.color(255, 235, 250), k.pos(0, 0), k.z(-10)]);

    // Instruction bar
    k.add([k.rect(VW, 72), k.color(240, 160, 200), k.pos(0, 0), k.fixed(), k.z(10)]);
    const emojiLbl = k.add([k.text("", { size: 28 }), k.anchor("center"), k.pos(30, 36), k.fixed(), k.z(11)]);
    const instrLbl = k.add([k.text("", { size: 14, width: VW - 72, align: "left" }), k.color(100, 10, 60), k.pos(60, 14), k.fixed(), k.z(11)]);

    // Progress bar
    k.add([k.rect(VW - 40, 9, { radius: 5 }), k.color(220, 175, 200), k.pos(20, VH - 18), k.fixed(), k.z(10)]);
    const progBar     = k.add([k.rect(2, 9, { radius: 5 }), k.color(220, 60, 130), k.pos(20, VH - 18), k.fixed(), k.z(11)]);
    const stepCounter = k.add([k.text("", { size: 13 }), k.color(160, 60, 110), k.anchor("right"), k.pos(VW - 22, VH - 38), k.fixed(), k.z(11)]);

    let showingNext    = false;
    let showingRestart = false;

    const BTNW = 180, BTNH = 48;
    const BTNX = VW / 2 - BTNW / 2;
    const BTNY = VH - 74;

    function inButton(x: number, y: number): boolean {
      return x >= BTNX && x <= BTNX + BTNW && y >= BTNY && y <= BTNY + BTNH;
    }

    function advanceStep() {
      if (!stepDone) return;
      stepIdx++; stepDone = false; showingNext = false;
      if (stepIdx >= STEPS.length) {
        onScore(100); spawnConfetti();
        k.wait(1.2, () => { showingRestart = true; });
      } else {
        onScore(Math.round((stepIdx / STEPS.length) * 100));
        updateUI();
      }
    }

    function updateUI() {
      const s = STEPS[stepIdx];
      if (!s) return;
      emojiLbl.text    = s.emoji;
      instrLbl.text    = s.label;
      stepCounter.text = `${stepIdx + 1} / ${STEPS.length}`;
    }
    updateUI();

    function handleTap(x: number, y: number) {
      if (y >= BTN_Y) {
        if (showingNext    && inButton(x, y)) { advanceStep(); return; }
        if (showingRestart && inButton(x, y)) { k.go("main");  return; }
        return;
      }
      if (stepDone || stepIdx >= STEPS.length) return;
      if (inEllipse(x, y, FX, FY, FRX, FRY, 24)) {
        const s = currentStep();
        if (s === "foundation") foundDone   = true;
        if (s === "eyeshadow")  shadowDone  = true;
        if (s === "eyeliner")   linerDone   = true;
        if (s === "mascara")    mascaraDone = true;
        if (s === "blush")      blushDone   = true;
        if (s === "lipstick")   lipDone     = true;
      }
      if (!stepDone) {
        const s = currentStep();
        if (s === "blush" && (inCircle(x, y, CLX, CLY, CR + 24) || inCircle(x, y, CRX, CRY, CR + 24))) blushDone = true;
        if (s === "lipstick" && inEllipse(x, y, MX, MY, MW + 14, MH + 14)) lipDone = true;
      }
    }

    k.onMousePress((_btn) => { const mp = k.mousePos(); handleTap(mp.x, mp.y); });
    k.onTouchStart((t)    => { handleTap(t.x, t.y); });

    k.onUpdate(() => {
      const dt = k.dt();
      for (const c of confetti) {
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.angle += c.av * dt; c.life -= dt * 0.3;
      }
      confetti = confetti.filter(c => c.life > 0);
      if (!stepDone && stepIdx < STEPS.length) {
        const prog = stepProgress();
        progBar.width = clamp01(prog) * (VW - 40);
        if (prog >= 1) { stepDone = true; showingNext = true; }
      }
    });

    k.onDraw(() => {
      const isDone = stepIdx >= STEPS.length;
      const s = isDone ? "done" : currentStep();
      const t0 = k.time();

      // ── Blink calculation ────────────────────────────────────────────────
      // Every BLINK_INTERVAL seconds a blink starts; it lasts BLINK_DURATION.
      // eyeOpen is 1.0 normally and squishes toward 0 at peak blink.
      const cycleTime = t0 % BLINK_INTERVAL;
      const isBlinking = cycleTime < BLINK_DURATION;
      const eyeOpen = isBlinking ? 1 - blinkFactor(cycleTime) : 1.0;
      // Actual rendered eye height (never quite reaches 0 so lid is visible)
      const curEH = Math.max(EH * eyeOpen, 0.5);

      // Decorative background sparkles
      for (let i = 0; i < 6; i++) {
        const bx = 30 + (i * 68) % VW;
        const by = 110 + Math.sin(t0 * 0.8 + i * 1.3) * 10;
        k.drawText({ text: i % 2 === 0 ? "✨" : "💕", size: 18,
          pos: k.vec2(bx, by), anchor: "center", opacity: 0.18 });
      }

      // Shoulders / dress
      k.drawEllipse({ radiusX: 110, radiusY: 55, pos: k.vec2(FX, FY + FRY + 48), color: k.rgb(230, 100, 160) });
      k.drawEllipse({ radiusX: 95,  radiusY: 42, pos: k.vec2(FX, FY + FRY + 44), color: k.rgb(245, 140, 185) });

      // Neck
      k.drawRect({ pos: k.vec2(FX - 20, FY + FRY - 16), width: 40, height: 60, color: k.rgb(...SKIN) });
      k.drawRect({ pos: k.vec2(FX - 20, FY + FRY - 16), width: 8,  height: 55, color: k.rgb(...SKIN_DARK), opacity: 0.35 });
      k.drawRect({ pos: k.vec2(FX + 12, FY + FRY - 16), width: 8,  height: 55, color: k.rgb(...SKIN_DARK), opacity: 0.35 });

      // Earrings
      k.drawCircle({ pos: k.vec2(FX - FRX - 2, FY + 10), radius: 7, color: k.rgb(255, 215, 0) });
      k.drawCircle({ pos: k.vec2(FX - FRX - 2, FY + 10), radius: 4, color: k.rgb(255, 160, 50) });
      k.drawCircle({ pos: k.vec2(FX + FRX + 2, FY + 10), radius: 7, color: k.rgb(255, 215, 0) });
      k.drawCircle({ pos: k.vec2(FX + FRX + 2, FY + 10), radius: 4, color: k.rgb(255, 160, 50) });
      k.drawLine({ p1: k.vec2(FX - FRX - 2, FY + 17), p2: k.vec2(FX - FRX - 2, FY + 28), width: 2, color: k.rgb(255, 215, 0) });
      k.drawLine({ p1: k.vec2(FX + FRX + 2, FY + 17), p2: k.vec2(FX + FRX + 2, FY + 28), width: 2, color: k.rgb(255, 215, 0) });
      k.drawCircle({ pos: k.vec2(FX - FRX - 2, FY + 31), radius: 5, color: k.rgb(255, 100, 180) });
      k.drawCircle({ pos: k.vec2(FX + FRX + 2, FY + 31), radius: 5, color: k.rgb(255, 100, 180) });

      // Hair (behind face)
      drawHair(k);

      // ── Face ──────────────────────────────────────────────────────────────
      k.drawEllipse({ radiusX: FRX + 6, radiusY: FRY + 6, pos: k.vec2(FX + 4, FY + 8), color: k.rgb(180, 130, 100), opacity: 0.18 });
      k.drawEllipse({ radiusX: FRX, radiusY: FRY, pos: k.vec2(FX, FY), color: k.rgb(...SKIN) });
      k.drawEllipse({ radiusX: FRX, radiusY: FRY, pos: k.vec2(FX - 6, FY), color: k.rgb(...SKIN_DARK), opacity: 0.12 });
      k.drawEllipse({ radiusX: FRX, radiusY: FRY, pos: k.vec2(FX + 6, FY), color: k.rgb(...SKIN_DARK), opacity: 0.12 });
      k.drawEllipse({ radiusX: 38, radiusY: 22, pos: k.vec2(FX, FY - 60), color: k.rgb(255, 240, 225), opacity: 0.45 });

      if (foundDone) {
        k.drawEllipse({ radiusX: FRX - 4, radiusY: FRY - 4, pos: k.vec2(FX, FY), color: k.rgb(255, 225, 195), opacity: 0.28 });
        k.drawEllipse({ radiusX: 18, radiusY: 10, pos: k.vec2(FX - 50, FY - 10), color: k.rgb(255, 240, 220), opacity: 0.35 });
        k.drawEllipse({ radiusX: 18, radiusY: 10, pos: k.vec2(FX + 50, FY - 10), color: k.rgb(255, 240, 220), opacity: 0.35 });
      }

      // Eyebrows
      drawBrow(k, ELX, ELY, false);
      drawBrow(k, ERX, ERY, true);

      // Eye shadow (behind eyeball)
      if (shadowDone) {
        k.drawEllipse({ radiusX: EW + 9, radiusY: EH + 10, pos: k.vec2(ELX, ELY - 3), color: k.rgb(120, 60, 190), opacity: 0.55 });
        k.drawEllipse({ radiusX: EW + 9, radiusY: EH + 10, pos: k.vec2(ERX, ERY - 3), color: k.rgb(120, 60, 190), opacity: 0.55 });
        k.drawEllipse({ radiusX: EW + 4, radiusY: EH + 5,  pos: k.vec2(ELX, ELY - 1), color: k.rgb(200, 150, 255), opacity: 0.45 });
        k.drawEllipse({ radiusX: EW + 4, radiusY: EH + 5,  pos: k.vec2(ERX, ERY - 1), color: k.rgb(200, 150, 255), opacity: 0.45 });
      }

      // Eyes — pass curEH so they squish during blink
      drawEyeballs(k, curEH);

      // Eyeliner — hugs lid edges, never crosses eyeball
      if (linerDone) {
        drawEyeliner(k, ELX, ELY, EW, curEH);
        drawEyeliner(k, ERX, ERY, EW, curEH);
        // Re-draw catchlights on top of liner (skip during blink)
        if (!isBlinking) drawCatchlights(k);
      }

      // Mascara lashes — always on top, squish with eye
      if (mascaraDone) {
        drawLashes(k, ELX, ELY, EW, curEH);
        drawLashes(k, ERX, ERY, EW, curEH);
      }

      // Draw the eyelid crease on top to seal the eye shut during blink
      if (isBlinking) {
        // Skin-coloured lid covers the eye as it closes
        k.drawEllipse({ radiusX: EW + 1, radiusY: curEH + 1, pos: k.vec2(ELX, ELY), color: k.rgb(...SKIN) });
        k.drawEllipse({ radiusX: EW + 1, radiusY: curEH + 1, pos: k.vec2(ERX, ERY), color: k.rgb(...SKIN) });
        // Lid crease line
        k.drawLine({ p1: k.vec2(ELX - EW, ELY), p2: k.vec2(ELX + EW, ELY), width: 2, color: k.rgb(...SKIN_DARK), opacity: 0.5 });
        k.drawLine({ p1: k.vec2(ERX - EW, ERY), p2: k.vec2(ERX + EW, ERY), width: 2, color: k.rgb(...SKIN_DARK), opacity: 0.5 });
      }

      // Nose
      drawNose(k, NX, NY);

      // Blush
      if (blushDone) {
        k.drawCircle({ pos: k.vec2(CLX, CLY), radius: CR + 8, color: k.rgb(255, 120, 160), opacity: 0.28 });
        k.drawCircle({ pos: k.vec2(CRX, CRY), radius: CR + 8, color: k.rgb(255, 120, 160), opacity: 0.28 });
        k.drawCircle({ pos: k.vec2(CLX, CLY), radius: CR,     color: k.rgb(255, 140, 170), opacity: 0.48 });
        k.drawCircle({ pos: k.vec2(CRX, CRY), radius: CR,     color: k.rgb(255, 140, 170), opacity: 0.48 });
      }

      // Lips
      drawLips(k, lipDone);

      // Tap hint
      if (!isDone && !stepDone) {
        const pulse = 0.4 + 0.4 * Math.sin(t0 * 5);
        drawHint(k, s, pulse);
      }

      // Progress bar
      const prog = isDone ? 1 : clamp01(stepProgress());
      progBar.width = Math.max(2, (VW - 40) * prog);

      // Step-complete shimmer
      if (stepDone && !isDone) {
        const t = (t0 * 4) % 1;
        k.drawRect({ pos: k.vec2(0, 72), width: VW, height: VH - 72,
          color: k.rgb(255, 210, 240), opacity: Math.sin(t * Math.PI) * 0.13 });
      }

      // Next / Restart button
      if (showingNext || showingRestart) {
        const btnColor = showingNext ? k.rgb(220, 60, 130) : k.rgb(100, 60, 200);
        const btnLabel = showingNext ? "Next Step  ➜" : "Play Again 🔄";
        k.drawRect({ pos: k.vec2(BTNX, BTNY), width: BTNW, height: BTNH, radius: 24, color: btnColor });
        k.drawText({ text: btnLabel, size: 16, pos: k.vec2(VW / 2, BTNY + BTNH / 2),
          anchor: "center", color: k.rgb(255, 255, 255) });
      }

      // Done screen
      if (isDone) {
        for (const c of confetti) {
          k.drawRect({ pos: k.vec2(c.x - 5, c.y - 5), width: 10, height: 10,
            color: k.rgb(...c.color), opacity: c.life, angle: c.angle });
        }
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2 + t0 * 1.2;
          const rr  = FRX + 22 + Math.sin(t0 * 3 + i) * 8;
          k.drawCircle({ pos: k.vec2(FX + Math.cos(ang) * rr, FY + Math.sin(ang) * rr * 0.6),
            radius: 4, color: k.rgb(255, 220, 60), opacity: 0.9 });
        }
        k.drawText({ text: "✨ GORGEOUS! ✨",      size: 30,
          pos: k.vec2(FX, FY + FRY + 30), anchor: "center", color: k.rgb(200, 40, 120) });
        k.drawText({ text: "You look amazing! 💖", size: 16,
          pos: k.vec2(FX, FY + FRY + 64), anchor: "center", color: k.rgb(160, 60, 120) });
        emojiLbl.text    = "🌟";
        instrLbl.text    = "All done! You're gorgeous!";
        stepCounter.text = `${STEPS.length} / ${STEPS.length}`;
      }
    });

    updateUI();
  });

  k.go("main");
  return () => k.quit();
}

// ── Eyeballs — accepts curEH so they squish during blink ─────────────────────
function drawEyeballs(k: K, curEH: number) {
  // Whites
  k.drawEllipse({ radiusX: EW, radiusY: curEH, pos: k.vec2(ELX, ELY), color: k.rgb(255, 255, 255) });
  k.drawEllipse({ radiusX: EW, radiusY: curEH, pos: k.vec2(ERX, ERY), color: k.rgb(255, 255, 255) });
  // Only draw iris/pupil when eye is meaningfully open
  if (curEH > 2) {
    k.drawCircle({ pos: k.vec2(ELX, ELY), radius: 9, color: k.rgb(80, 140, 70) });
    k.drawCircle({ pos: k.vec2(ERX, ERY), radius: 9, color: k.rgb(80, 140, 70) });
    k.drawCircle({ pos: k.vec2(ELX, ELY), radius: 9, color: k.rgb(40, 80, 30), opacity: 0.5 });
    k.drawCircle({ pos: k.vec2(ERX, ERY), radius: 9, color: k.rgb(40, 80, 30), opacity: 0.5 });
    k.drawCircle({ pos: k.vec2(ELX, ELY), radius: 5, color: k.rgb(10, 8, 8) });
    k.drawCircle({ pos: k.vec2(ERX, ERY), radius: 5, color: k.rgb(10, 8, 8) });
    drawCatchlights(k);
  }
}

// ── Catchlights ───────────────────────────────────────────────────────────────
function drawCatchlights(k: K) {
  k.drawCircle({ pos: k.vec2(ELX + 3, ELY - 3), radius: 2.5, color: k.rgb(255, 255, 255) });
  k.drawCircle({ pos: k.vec2(ERX + 3, ERY - 3), radius: 2.5, color: k.rgb(255, 255, 255) });
  k.drawCircle({ pos: k.vec2(ELX - 2, ELY + 2), radius: 1.2, color: k.rgb(255, 255, 255), opacity: 0.6 });
  k.drawCircle({ pos: k.vec2(ERX - 2, ERY + 2), radius: 1.2, color: k.rgb(255, 255, 255), opacity: 0.6 });
}

// ── Eyeliner — traces lid edges using curEH so it follows the blink ───────────
function drawEyeliner(k: K, ex: number, ey: number, ew: number, eh: number) {
  const SEGS = 12;
  // Upper lid arc (π → 0, left to right across top)
  for (let i = 0; i < SEGS; i++) {
    const a0 = Math.PI - (i / SEGS) * Math.PI;
    const a1 = Math.PI - ((i + 1) / SEGS) * Math.PI;
    k.drawLine({
      p1: k.vec2(ex + Math.cos(a0) * ew, ey + Math.sin(a0) * eh),
      p2: k.vec2(ex + Math.cos(a1) * ew, ey + Math.sin(a1) * eh),
      width: 2.5, color: k.rgb(10, 5, 5),
    });
  }
  // Lower waterline arc (0 → π, bottom)
  for (let i = 0; i < SEGS; i++) {
    const a0 = (i / SEGS) * Math.PI;
    const a1 = ((i + 1) / SEGS) * Math.PI;
    k.drawLine({
      p1: k.vec2(ex + Math.cos(a0) * ew, ey + Math.sin(a0) * eh),
      p2: k.vec2(ex + Math.cos(a1) * ew, ey + Math.sin(a1) * eh),
      width: 1.2, color: k.rgb(10, 5, 5), opacity: 0.7,
    });
  }
  // Wing flick from outer corner
  k.drawLine({
    p1: k.vec2(ex + ew, ey),
    p2: k.vec2(ex + ew + 8, ey - eh * 0.9),
    width: 2, color: k.rgb(10, 5, 5),
  });
}

// ── Lashes — long, even, symmetrically fanned, follow blink ──────────────────
function drawLashes(k: K, ex: number, ey: number, ew: number, eh: number) {
  const COUNT    = 11;
  const BASE_LEN = 20;
  const LEAN_MAX = 0.38;

  for (let i = 0; i < COUNT; i++) {
    const t = i / (COUNT - 1) - 0.5;
    const arcAngle = Math.PI * (1 - (t + 0.5));
    const rootX = ex + Math.cos(arcAngle) * ew;
    const rootY = ey + Math.sin(arcAngle) * eh;

    const nx = Math.cos(arcAngle) / ew;
    const ny = Math.sin(arcAngle) / eh;
    const nLen = Math.sqrt(nx * nx + ny * ny);
    const normalAngle = Math.atan2(ny / nLen, nx / nLen);
    const lean = t * LEAN_MAX;
    const lashAngle = normalAngle + lean;

    const tipX = rootX + Math.cos(lashAngle) * BASE_LEN;
    const tipY = rootY + Math.sin(lashAngle) * BASE_LEN;

    k.drawLine({ p1: k.vec2(rootX, rootY), p2: k.vec2(tipX, tipY), width: 2.2, color: k.rgb(8, 5, 5) });
  }

  // Lower lashes
  const LOWER_COUNT = 7;
  const LOWER_LEN   = 7;
  for (let i = 0; i < LOWER_COUNT; i++) {
    const t = i / (LOWER_COUNT - 1) - 0.5;
    const arcAngle = t * Math.PI;
    const rootX = ex + Math.cos(arcAngle) * ew;
    const rootY = ey + Math.sin(arcAngle) * eh;

    const nx = Math.cos(arcAngle) / ew;
    const ny = Math.sin(arcAngle) / eh;
    const nLen = Math.sqrt(nx * nx + ny * ny);
    const normalAngle = Math.atan2(ny / nLen, nx / nLen);

    const tipX = rootX + Math.cos(normalAngle) * LOWER_LEN;
    const tipY = rootY + Math.sin(normalAngle) * LOWER_LEN;

    k.drawLine({ p1: k.vec2(rootX, rootY), p2: k.vec2(tipX, tipY), width: 1.4, color: k.rgb(8, 5, 5), opacity: 0.75 });
  }
}

// ── Arched brow ───────────────────────────────────────────────────────────────
function drawBrow(k: K, ex: number, ey: number, flip: boolean) {
  const dir = flip ? 1 : -1;
  const x0 = ex + dir * 22, y0 = ey - 20;
  const x1 = ex,             y1 = ey - 26;
  const x2 = ex - dir * 22,  y2 = ey - 20;
  k.drawLine({ p1: k.vec2(x0, y0), p2: k.vec2(x1, y1), width: 4, color: k.rgb(55, 28, 10) });
  k.drawLine({ p1: k.vec2(x1, y1), p2: k.vec2(x2, y2), width: 3, color: k.rgb(55, 28, 10) });
}

// ── Cute button nose ──────────────────────────────────────────────────────────
function drawNose(k: K, nx: number, ny: number) {
  k.drawLine({ p1: k.vec2(nx, ny - 14), p2: k.vec2(nx - 8, ny + 10), width: 1.8, color: k.rgb(195, 145, 110) });
  k.drawLine({ p1: k.vec2(nx, ny - 14), p2: k.vec2(nx + 8, ny + 10), width: 1.8, color: k.rgb(195, 145, 110) });
  k.drawCircle({ pos: k.vec2(nx - 11, ny + 12), radius: 5, color: k.rgb(195, 145, 110), opacity: 0.65 });
  k.drawCircle({ pos: k.vec2(nx + 11, ny + 12), radius: 5, color: k.rgb(195, 145, 110), opacity: 0.65 });
  k.drawCircle({ pos: k.vec2(nx, ny + 8), radius: 4, color: k.rgb(255, 230, 210), opacity: 0.4 });
}

// ── Fuller lips with cupid's bow ──────────────────────────────────────────────
function drawLips(k: K, lipDone: boolean) {
  const lipBase = lipDone ? k.rgb(215, 35, 80)   : k.rgb(200, 130, 110);
  const lipDark = lipDone ? k.rgb(160, 20, 55)   : k.rgb(170, 100, 85);
  const lipHi   = lipDone ? k.rgb(255, 120, 150) : k.rgb(230, 170, 150);

  k.drawEllipse({ radiusX: MW,        radiusY: MH,       pos: k.vec2(MX, MY + 6),      color: lipBase });
  k.drawEllipse({ radiusX: MW * 0.55, radiusY: MH * 0.8, pos: k.vec2(MX - 14, MY - 5), color: lipBase });
  k.drawEllipse({ radiusX: MW * 0.55, radiusY: MH * 0.8, pos: k.vec2(MX + 14, MY - 5), color: lipBase });
  k.drawLine({ p1: k.vec2(MX - 5, MY - 4), p2: k.vec2(MX + 5, MY - 4), width: 2, color: lipDark, opacity: 0.5 });
  k.drawLine({ p1: k.vec2(MX - MW + 3, MY + 2), p2: k.vec2(MX + MW - 3, MY + 2), width: 1.5, color: lipDark, opacity: 0.6 });
  k.drawEllipse({ radiusX: 12, radiusY: 5, pos: k.vec2(MX, MY + 5), color: lipHi, opacity: 0.45 });
}

// ── Hint overlays ─────────────────────────────────────────────────────────────
function drawHint(k: K, s: string, pulse: number) {
  const hELX = FX - 36, hELY = FY - 28, hERX = FX + 36, hERY = FY - 28;
  const hEW = 30, hEH = 14;
  const hCLX = FX - 66, hCLY = FY + 18, hCRX = FX + 66, hCRY = FY + 18;
  const hCR = 22;
  const hMX = FX, hMY = FY + 52, hMW = 38, hMH = 15;

  k.drawEllipse({ radiusX: FRX + 12, radiusY: FRY + 12, pos: k.vec2(FX, FY),
    color: k.rgb(220, 60, 130), opacity: pulse * 0.2 });

  if (s === "eyeshadow") {
    k.drawEllipse({ radiusX: hEW + 14, radiusY: hEH + 14, pos: k.vec2(hELX, hELY), color: k.rgb(155, 95, 210), opacity: pulse * 0.5 });
    k.drawEllipse({ radiusX: hEW + 14, radiusY: hEH + 14, pos: k.vec2(hERX, hERY), color: k.rgb(155, 95, 210), opacity: pulse * 0.5 });
  }
  if (s === "eyeliner" || s === "mascara") {
    k.drawEllipse({ radiusX: hEW + 14, radiusY: hEH + 14, pos: k.vec2(hELX, hELY), color: k.rgb(30, 20, 20), opacity: pulse * 0.4 });
    k.drawEllipse({ radiusX: hEW + 14, radiusY: hEH + 14, pos: k.vec2(hERX, hERY), color: k.rgb(30, 20, 20), opacity: pulse * 0.4 });
  }
  if (s === "blush") {
    k.drawCircle({ pos: k.vec2(hCLX, hCLY), radius: hCR + 20, color: k.rgb(255, 140, 170), opacity: pulse * 0.5 });
    k.drawCircle({ pos: k.vec2(hCRX, hCRY), radius: hCR + 20, color: k.rgb(255, 140, 170), opacity: pulse * 0.5 });
  }
  if (s === "lipstick") {
    k.drawEllipse({ radiusX: hMW + 14, radiusY: hMH + 14, pos: k.vec2(hMX, hMY), color: k.rgb(210, 38, 85), opacity: pulse * 0.5 });
  }

  k.drawText({ text: "👆 TAP THE FACE", size: 18, pos: k.vec2(FX, FY + FRY + 24),
    anchor: "center", color: k.rgb(180, 40, 100) });
}

// ── Hair — multi-layer strand system ─────────────────────────────────────────
function drawHair(k: K) {
  // 1. Back volume mass
  k.drawEllipse({ radiusX: FRX + 22, radiusY: FRY * 1.65,
    pos: k.vec2(FX, FY + 38), color: k.rgb(...H_ROOT) });

  // 2. Side curtains — left
  k.drawEllipse({ radiusX: 46, radiusY: FRY * 1.3,
    pos: k.vec2(FX - FRX + 4, FY + 28), color: k.rgb(...H_MID) });
  k.drawEllipse({ radiusX: 20, radiusY: FRY * 1.2,
    pos: k.vec2(FX - FRX + 28, FY + 28), color: k.rgb(...H_ROOT), opacity: 0.55 });
  const leftStrands: [number, number, number, number, number, [number,number,number], number][] = [
    [FX - FRX - 10, FY - 80,  FX - FRX - 18, FY + 120, 6, H_ROOT,  1.0],
    [FX - FRX - 2,  FY - 90,  FX - FRX - 8,  FY + 140, 5, H_MID,   1.0],
    [FX - FRX + 8,  FY - 95,  FX - FRX + 2,  FY + 150, 5, H_MID,   0.9],
    [FX - FRX + 18, FY - 90,  FX - FRX + 14, FY + 145, 4, H_LIGHT, 0.8],
    [FX - FRX + 28, FY - 85,  FX - FRX + 22, FY + 135, 4, H_LIGHT, 0.7],
    [FX - FRX - 14, FY - 60,  FX - FRX - 22, FY + 100, 3, H_ROOT,  0.85],
    [FX - FRX + 4,  FY - 70,  FX - FRX - 4,  FY + 110, 3, H_MID,   0.75],
  ];
  for (const [x1, y1, x2, y2, w, col, op] of leftStrands) {
    const mx = (x1 + x2) / 2 - 6, my = (y1 + y2) / 2;
    k.drawLine({ p1: k.vec2(x1, y1), p2: k.vec2(mx, my), width: w, color: k.rgb(...col), opacity: op });
    k.drawLine({ p1: k.vec2(mx, my), p2: k.vec2(x2, y2), width: w * 0.85, color: k.rgb(...col), opacity: op * 0.9 });
  }

  // 3. Side curtains — right
  k.drawEllipse({ radiusX: 46, radiusY: FRY * 1.3,
    pos: k.vec2(FX + FRX - 4, FY + 28), color: k.rgb(...H_MID) });
  k.drawEllipse({ radiusX: 20, radiusY: FRY * 1.2,
    pos: k.vec2(FX + FRX - 28, FY + 28), color: k.rgb(...H_ROOT), opacity: 0.55 });
  const rightStrands: [number, number, number, number, number, [number,number,number], number][] = [
    [FX + FRX + 10, FY - 80,  FX + FRX + 18, FY + 120, 6, H_ROOT,  1.0],
    [FX + FRX + 2,  FY - 90,  FX + FRX + 8,  FY + 140, 5, H_MID,   1.0],
    [FX + FRX - 8,  FY - 95,  FX + FRX - 2,  FY + 150, 5, H_MID,   0.9],
    [FX + FRX - 18, FY - 90,  FX + FRX - 14, FY + 145, 4, H_LIGHT, 0.8],
    [FX + FRX - 28, FY - 85,  FX + FRX - 22, FY + 135, 4, H_LIGHT, 0.7],
    [FX + FRX + 14, FY - 60,  FX + FRX + 22, FY + 100, 3, H_ROOT,  0.85],
    [FX + FRX - 4,  FY - 70,  FX + FRX + 4,  FY + 110, 3, H_MID,   0.75],
  ];
  for (const [x1, y1, x2, y2, w, col, op] of rightStrands) {
    const mx = (x1 + x2) / 2 + 6, my = (y1 + y2) / 2;
    k.drawLine({ p1: k.vec2(x1, y1), p2: k.vec2(mx, my), width: w, color: k.rgb(...col), opacity: op });
    k.drawLine({ p1: k.vec2(mx, my), p2: k.vec2(x2, y2), width: w * 0.85, color: k.rgb(...col), opacity: op * 0.9 });
  }

  // 4. Crown / top
  k.drawEllipse({ radiusX: FRX + 14, radiusY: FRY * 0.52,
    pos: k.vec2(FX, FY - FRY * 0.54), color: k.rgb(...H_MID) });
  k.drawEllipse({ radiusX: 6, radiusY: FRY * 0.38,
    pos: k.vec2(FX, FY - FRY * 0.56), color: k.rgb(...H_ROOT), opacity: 0.7 });
  const crownStrands: [number, number, number, number, number, [number,number,number]][] = [
    [FX - 4,  FY - FRY * 0.95, FX - 60,  FY - FRY * 0.55, 5, H_MID],
    [FX + 4,  FY - FRY * 0.95, FX + 60,  FY - FRY * 0.55, 5, H_MID],
    [FX - 16, FY - FRY * 0.92, FX - 80,  FY - FRY * 0.48, 4, H_LIGHT],
    [FX + 16, FY - FRY * 0.92, FX + 80,  FY - FRY * 0.48, 4, H_LIGHT],
    [FX - 30, FY - FRY * 0.85, FX - 96,  FY - FRY * 0.38, 4, H_MID],
    [FX + 30, FY - FRY * 0.85, FX + 96,  FY - FRY * 0.38, 4, H_MID],
    [FX - 44, FY - FRY * 0.75, FX - 100, FY - FRY * 0.22, 3, H_ROOT],
    [FX + 44, FY - FRY * 0.75, FX + 100, FY - FRY * 0.22, 3, H_ROOT],
    [FX,      FY - FRY * 0.96, FX,       FY - FRY * 0.55, 4, H_ROOT],
  ];
  for (const [x1, y1, x2, y2, w, col] of crownStrands) {
    k.drawLine({ p1: k.vec2(x1, y1), p2: k.vec2(x2, y2), width: w, color: k.rgb(...col) });
  }

  // 5. Face-framing wisps — left
  const wispL: [number, number, number, number, number][] = [
    [FX - FRX + 6,  FY - 60, FX - FRX - 2,  FY + 20, 2],
    [FX - FRX + 12, FY - 50, FX - FRX + 4,  FY + 30, 2],
    [FX - FRX + 18, FY - 40, FX - FRX + 12, FY + 15, 1],
  ];
  for (const [x1, y1, x2, y2, w] of wispL)
    k.drawLine({ p1: k.vec2(x1, y1), p2: k.vec2(x2, y2), width: w, color: k.rgb(...H_LIGHT), opacity: 0.7 });

  // 5b. Face-framing wisps — right
  const wispR: [number, number, number, number, number][] = [
    [FX + FRX - 6,  FY - 60, FX + FRX + 2,  FY + 20, 2],
    [FX + FRX - 12, FY - 50, FX + FRX - 4,  FY + 30, 2],
    [FX + FRX - 18, FY - 40, FX + FRX - 12, FY + 15, 1],
  ];
  for (const [x1, y1, x2, y2, w] of wispR)
    k.drawLine({ p1: k.vec2(x1, y1), p2: k.vec2(x2, y2), width: w, color: k.rgb(...H_LIGHT), opacity: 0.7 });

  // 6. Specular shine
  k.drawEllipse({ radiusX: 28, radiusY: 9,
    pos: k.vec2(FX - 14, FY - FRY * 0.72), color: k.rgb(...H_SHINE), opacity: 0.55 });
  k.drawEllipse({ radiusX: 12, radiusY: 5,
    pos: k.vec2(FX + 20, FY - FRY * 0.62), color: k.rgb(...H_SHINE), opacity: 0.32 });
  k.drawCircle({ pos: k.vec2(FX - 10, FY - FRY * 0.74), radius: 4,
    color: k.rgb(255, 240, 250), opacity: 0.6 });
}
