import kaplay from "kaplay";

type K = ReturnType<typeof kaplay>;

const VW = 400;
const VH = 680;

// Skin tones
const SKIN: [number, number, number]      = [242, 200, 168];
const SKIN_DARK: [number, number, number] = [210, 160, 120];

// Hair palette — rich warm brunette with natural depth
const H_ROOT:  [number, number, number] = [ 45,  25,  10]; // very dark brown roots
const H_MID:   [number, number, number] = [ 80,  45,  15]; // mid brown
const H_LIGHT: [number, number, number] = [130,  75,  30]; // warm highlight
const H_SHINE: [number, number, number] = [190, 130,  60]; // shine streak

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
const BLINK_INTERVAL = 3.0;
const BLINK_DURATION = 0.15;

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

function blinkFactor(t: number): number {
  const phase = (t / BLINK_DURATION) * Math.PI;
  return Math.sin(phase);
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

      // Blink
      const cycleTime  = t0 % BLINK_INTERVAL;
      const isBlinking = cycleTime < BLINK_DURATION;
      const eyeOpen    = isBlinking ? 1 - blinkFactor(cycleTime) : 1.0;
      const curEH      = Math.max(EH * eyeOpen, 0.5);

      // Background sparkles
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

      // ── HAIR BACK LAYER (behind face) ─────────────────────────────────────
      drawHairBack(k);

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

      // Eye shadow
      if (shadowDone) {
        k.drawEllipse({ radiusX: EW + 9, radiusY: EH + 10, pos: k.vec2(ELX, ELY - 3), color: k.rgb(120, 60, 190), opacity: 0.55 });
        k.drawEllipse({ radiusX: EW + 9, radiusY: EH + 10, pos: k.vec2(ERX, ERY - 3), color: k.rgb(120, 60, 190), opacity: 0.55 });
        k.drawEllipse({ radiusX: EW + 4, radiusY: EH + 5,  pos: k.vec2(ELX, ELY - 1), color: k.rgb(200, 150, 255), opacity: 0.45 });
        k.drawEllipse({ radiusX: EW + 4, radiusY: EH + 5,  pos: k.vec2(ERX, ERY - 1), color: k.rgb(200, 150, 255), opacity: 0.45 });
      }

      // Eyes
      drawEyeballs(k, curEH);

      // Eyeliner
      if (linerDone) {
        drawEyeliner(k, ELX, ELY, EW, curEH);
        drawEyeliner(k, ERX, ERY, EW, curEH);
        if (!isBlinking) drawCatchlights(k);
      }

      // Mascara lashes
      if (mascaraDone) {
        drawLashes(k, ELX, ELY, EW, curEH);
        drawLashes(k, ERX, ERY, EW, curEH);
      }

      // Blink lid
      if (isBlinking) {
        k.drawEllipse({ radiusX: EW + 1, radiusY: curEH + 1, pos: k.vec2(ELX, ELY), color: k.rgb(...SKIN) });
        k.drawEllipse({ radiusX: EW + 1, radiusY: curEH + 1, pos: k.vec2(ERX, ERY), color: k.rgb(...SKIN) });
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

      // ── HAIR FRONT LAYER: side panels + bangs/fringe (drawn ON TOP of face) ──
      drawHairFront(k);

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
        const tt = (t0 * 4) % 1;
        k.drawRect({ pos: k.vec2(0, 72), width: VW, height: VH - 72,
          color: k.rgb(255, 210, 240), opacity: Math.sin(tt * Math.PI) * 0.13 });
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

// ─────────────────────────────────────────────────────────────────────────────
// HAIR — split into back layer (behind face) and front layer (over face edges)
// Realistic brunette with centre part, flowing side sections, bangs + fringe
// ─────────────────────────────────────────────────────────────────────────────

// Helper: draw a single hair strand as a series of line segments
// from (x0,y0) curving toward (x1,y1) with a lateral bulge of `bulge` px
function drawStrand(
  k: K,
  x0: number, y0: number,
  x1: number, y1: number,
  bulge: number,
  width: number,
  col: [number, number, number],
  opacity = 1.0,
  segs = 8,
) {
  const dx = x1 - x0, dy = y1 - y0;
  // perpendicular direction for bulge
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len, py = dx / len;

  let prevX = x0, prevY = y0;
  for (let i = 1; i <= segs; i++) {
    const tt = i / segs;
    // quadratic bezier-like: mid-point bulges outward
    const bAmt = bulge * Math.sin(tt * Math.PI);
    const cx = x0 + dx * tt + px * bAmt;
    const cy = y0 + dy * tt + py * bAmt;
    k.drawLine({
      p1: k.vec2(prevX, prevY),
      p2: k.vec2(cx, cy),
      width,
      color: k.rgb(...col),
      opacity,
    });
    prevX = cx; prevY = cy;
  }
}

// ── Back layer: the big hair mass that sits behind the face ───────────────────
function drawHairBack(k: K) {
  // 1. Main scalp mass — dark oval sitting high above and behind the face
  k.drawEllipse({ radiusX: FRX + 18, radiusY: FRY * 0.72,
    pos: k.vec2(FX, FY - FRY * 0.38), color: k.rgb(...H_ROOT) });

  // 2. Long flowing body of hair behind the face — two big side lobes
  // Left lobe
  k.drawEllipse({ radiusX: 58, radiusY: FRY * 1.55,
    pos: k.vec2(FX - FRX + 10, FY + 30), color: k.rgb(...H_ROOT) });
  k.drawEllipse({ radiusX: 42, radiusY: FRY * 1.45,
    pos: k.vec2(FX - FRX + 6,  FY + 30), color: k.rgb(...H_MID), opacity: 0.7 });
  // Right lobe
  k.drawEllipse({ radiusX: 58, radiusY: FRY * 1.55,
    pos: k.vec2(FX + FRX - 10, FY + 30), color: k.rgb(...H_ROOT) });
  k.drawEllipse({ radiusX: 42, radiusY: FRY * 1.45,
    pos: k.vec2(FX + FRX - 6,  FY + 30), color: k.rgb(...H_MID), opacity: 0.7 });

  // 3. Back centre mass — fills behind the head
  k.drawEllipse({ radiusX: FRX + 10, radiusY: FRY * 1.7,
    pos: k.vec2(FX, FY + 40), color: k.rgb(...H_ROOT) });

  // 4. Individual back strands — long, flowing downward
  // Left side back strands
  const leftBack: [number, number, number, number, number, [number,number,number], number][] = [
    [FX - FRX - 14, FY - 70,  FX - FRX - 30, FY + 180, -18, H_ROOT,  1.0],
    [FX - FRX - 4,  FY - 80,  FX - FRX - 20, FY + 200, -14, H_MID,   0.9],
    [FX - FRX + 8,  FY - 88,  FX - FRX - 10, FY + 210, -10, H_MID,   0.85],
    [FX - FRX + 20, FY - 90,  FX - FRX,      FY + 205,  -6, H_LIGHT, 0.75],
    [FX - FRX + 32, FY - 88,  FX - FRX + 12, FY + 195,  -4, H_LIGHT, 0.65],
    [FX - FRX - 18, FY - 55,  FX - FRX - 34, FY + 160, -20, H_ROOT,  0.9],
    [FX - FRX + 2,  FY - 65,  FX - FRX - 16, FY + 175, -12, H_MID,   0.8],
  ];
  for (const [x0, y0, x1, y1, bulge, col, op] of leftBack) {
    drawStrand(k, x0, y0, x1, y1, bulge, 5, col, op);
  }
  // Right side back strands (mirrored)
  const rightBack: [number, number, number, number, number, [number,number,number], number][] = [
    [FX + FRX + 14, FY - 70,  FX + FRX + 30, FY + 180,  18, H_ROOT,  1.0],
    [FX + FRX + 4,  FY - 80,  FX + FRX + 20, FY + 200,  14, H_MID,   0.9],
    [FX + FRX - 8,  FY - 88,  FX + FRX + 10, FY + 210,  10, H_MID,   0.85],
    [FX + FRX - 20, FY - 90,  FX + FRX,      FY + 205,   6, H_LIGHT, 0.75],
    [FX + FRX - 32, FY - 88,  FX + FRX - 12, FY + 195,   4, H_LIGHT, 0.65],
    [FX + FRX + 18, FY - 55,  FX + FRX + 34, FY + 160,  20, H_ROOT,  0.9],
    [FX + FRX - 2,  FY - 65,  FX + FRX + 16, FY + 175,  12, H_MID,   0.8],
  ];
  for (const [x0, y0, x1, y1, bulge, col, op] of rightBack) {
    drawStrand(k, x0, y0, x1, y1, bulge, 5, col, op);
  }

  // 5. Shine streak on back of hair
  drawStrand(k, FX - 12, FY - FRY * 0.9, FX - 18, FY + 140, -8, 3, H_SHINE, 0.55);
  drawStrand(k, FX + 10, FY - FRY * 0.9, FX + 16, FY + 140,  8, 3, H_SHINE, 0.45);
}

// ── Front layer: side panels that overlap the face edges + bangs + fringe ─────
function drawHairFront(k: K) {
  // ── 1. Side panels — thick curtains that overlap the face sides ────────────

  // LEFT side panel — several overlapping strands from parting to ear level
  // These sit on top of the face ellipse on the left edge
  const leftPanel: [number, number, number, number, number, number, [number,number,number], number][] = [
    // x0,           y0,            x1,              y1,           bulge, w,  col,     op
    [FX - 20,        FY - FRY + 2,  FX - FRX - 8,   FY + 50,      -6,   14, H_ROOT,  1.0],
    [FX - 28,        FY - FRY + 4,  FX - FRX - 12,  FY + 60,      -8,   12, H_MID,   0.9],
    [FX - 36,        FY - FRY + 6,  FX - FRX - 16,  FY + 55,      -9,   10, H_MID,   0.85],
    [FX - 44,        FY - FRY + 8,  FX - FRX - 18,  FY + 48,      -10,  9,  H_ROOT,  0.8],
    [FX - 52,        FY - FRY + 10, FX - FRX - 20,  FY + 42,      -11,  8,  H_ROOT,  0.75],
    [FX - 60,        FY - FRY + 12, FX - FRX - 22,  FY + 36,      -12,  7,  H_MID,   0.7],
    // highlight strand
    [FX - 32,        FY - FRY + 5,  FX - FRX - 10,  FY + 52,      -7,   4,  H_LIGHT, 0.5],
  ];
  for (const [x0, y0, x1, y1, bulge, w, col, op] of leftPanel) {
    drawStrand(k, x0, y0, x1, y1, bulge, w, col, op);
  }

  // RIGHT side panel (mirrored)
  const rightPanel: [number, number, number, number, number, number, [number,number,number], number][] = [
    [FX + 20,        FY - FRY + 2,  FX + FRX + 8,   FY + 50,       6,   14, H_ROOT,  1.0],
    [FX + 28,        FY - FRY + 4,  FX + FRX + 12,  FY + 60,       8,   12, H_MID,   0.9],
    [FX + 36,        FY - FRY + 6,  FX + FRX + 16,  FY + 55,       9,   10, H_MID,   0.85],
    [FX + 44,        FY - FRY + 8,  FX + FRX + 18,  FY + 48,       10,  9,  H_ROOT,  0.8],
    [FX + 52,        FY - FRY + 10, FX + FRX + 20,  FY + 42,       11,  8,  H_ROOT,  0.75],
    [FX + 60,        FY - FRY + 12, FX + FRX + 22,  FY + 36,       12,  7,  H_MID,   0.7],
    [FX + 32,        FY - FRY + 5,  FX + FRX + 10,  FY + 52,       7,   4,  H_LIGHT, 0.5],
  ];
  for (const [x0, y0, x1, y1, bulge, w, col, op] of rightPanel) {
    drawStrand(k, x0, y0, x1, y1, bulge, w, col, op);
  }

  // ── 2. Top scalp / parting line ────────────────────────────────────────────
  // A dark ellipse at the very top of the head creates the scalp/parting base
  k.drawEllipse({ radiusX: FRX + 14, radiusY: 28,
    pos: k.vec2(FX, FY - FRY + 4), color: k.rgb(...H_ROOT) });
  // Centre part — a thin lighter line down the middle of the scalp
  k.drawLine({
    p1: k.vec2(FX, FY - FRY - 2),
    p2: k.vec2(FX, FY - FRY + 32),
    width: 3,
    color: k.rgb(...SKIN_DARK),
    opacity: 0.45,
  });

  // ── 3. BANGS — side-swept strands that cross the forehead ─────────────────
  // Bangs sweep from the centre part leftward, draping across the forehead.
  // They end just above / at eyebrow level.
  // Each bang strand: starts near the centre part, sweeps left and down.

  const BANG_ROOT_Y = FY - FRY + 8; // just below the hairline at the top
  const BROW_Y      = ELY - 24;     // just above the brows

  // Main bang curtain — 9 strands sweeping left across forehead
  const bangs: [number, number, number, number, number, number, [number,number,number], number][] = [
    // root x,        root y,         tip x,           tip y,        bulge, w,  col,     op
    [FX + 10,         BANG_ROOT_Y,    FX - 20,          BROW_Y + 4,   12,   13, H_ROOT,  1.0],
    [FX + 6,          BANG_ROOT_Y,    FX - 32,          BROW_Y + 2,   14,   12, H_ROOT,  1.0],
    [FX + 2,          BANG_ROOT_Y,    FX - 44,          BROW_Y,       15,   11, H_MID,   0.95],
    [FX - 4,          BANG_ROOT_Y,    FX - 56,          BROW_Y - 1,   14,   10, H_MID,   0.9],
    [FX - 10,         BANG_ROOT_Y,    FX - 66,          BROW_Y - 2,   13,   9,  H_MID,   0.85],
    [FX - 16,         BANG_ROOT_Y,    FX - 74,          BROW_Y - 1,   11,   8,  H_ROOT,  0.8],
    [FX - 22,         BANG_ROOT_Y,    FX - 80,          BROW_Y + 2,   9,    7,  H_ROOT,  0.75],
    [FX - 28,         BANG_ROOT_Y,    FX - 84,          BROW_Y + 5,   7,    6,  H_MID,   0.65],
    [FX - 34,         BANG_ROOT_Y,    FX - 86,          BROW_Y + 9,   5,    5,  H_MID,   0.55],
    // highlight strand through the bangs
    [FX + 4,          BANG_ROOT_Y,    FX - 50,          BROW_Y + 1,   14,   3,  H_LIGHT, 0.45],
    [FX,              BANG_ROOT_Y,    FX - 38,          BROW_Y,       14,   2,  H_SHINE, 0.3],
  ];
  for (const [x0, y0, x1, y1, bulge, w, col, op] of bangs) {
    drawStrand(k, x0, y0, x1, y1, bulge, w, col, op);
  }

  // ── 4. FRINGE — the shorter front curtain that sits right at the hairline ──
  // The fringe is a denser band of shorter strands that frame the forehead
  // from temple to temple, slightly in front of the bangs.
  // These are shorter and straighter — they sit just at forehead level.

  const FRINGE_ROOT_Y = FY - FRY + 6;
  const FRINGE_TIP_Y  = FY - FRY + 42; // ends about 1/3 down the forehead

  // Left fringe strands (fan out from centre-left)
  const fringeLeft: [number, number, number, number, number, number, [number,number,number], number][] = [
    [FX - 8,   FRINGE_ROOT_Y, FX - 22,  FRINGE_TIP_Y + 4,  4,  11, H_ROOT,  1.0],
    [FX - 18,  FRINGE_ROOT_Y, FX - 34,  FRINGE_TIP_Y + 3,  5,  10, H_ROOT,  1.0],
    [FX - 28,  FRINGE_ROOT_Y, FX - 46,  FRINGE_TIP_Y + 2,  6,  9,  H_MID,   0.95],
    [FX - 38,  FRINGE_ROOT_Y, FX - 58,  FRINGE_TIP_Y,      6,  8,  H_MID,   0.9],
    [FX - 48,  FRINGE_ROOT_Y, FX - 68,  FRINGE_TIP_Y - 2,  5,  8,  H_MID,   0.85],
    [FX - 58,  FRINGE_ROOT_Y, FX - 76,  FRINGE_TIP_Y - 4,  4,  7,  H_ROOT,  0.8],
    [FX - 68,  FRINGE_ROOT_Y, FX - 82,  FRINGE_TIP_Y - 6,  3,  7,  H_ROOT,  0.75],
    [FX - 76,  FRINGE_ROOT_Y, FX - 86,  FRINGE_TIP_Y - 8,  2,  6,  H_MID,   0.65],
  ];
  for (const [x0, y0, x1, y1, bulge, w, col, op] of fringeLeft) {
    drawStrand(k, x0, y0, x1, y1, bulge, w, col, op);
  }

  // Right fringe strands
  const fringeRight: [number, number, number, number, number, number, [number,number,number], number][] = [
    [FX + 8,   FRINGE_ROOT_Y, FX + 22,  FRINGE_TIP_Y + 4,  -4,  11, H_ROOT,  1.0],
    [FX + 18,  FRINGE_ROOT_Y, FX + 34,  FRINGE_TIP_Y + 3,  -5,  10, H_ROOT,  1.0],
    [FX + 28,  FRINGE_ROOT_Y, FX + 46,  FRINGE_TIP_Y + 2,  -6,  9,  H_MID,   0.95],
    [FX + 38,  FRINGE_ROOT_Y, FX + 58,  FRINGE_TIP_Y,      -6,  8,  H_MID,   0.9],
    [FX + 48,  FRINGE_ROOT_Y, FX + 68,  FRINGE_TIP_Y - 2,  -5,  8,  H_MID,   0.85],
    [FX + 58,  FRINGE_ROOT_Y, FX + 76,  FRINGE_TIP_Y - 4,  -4,  7,  H_ROOT,  0.8],
    [FX + 68,  FRINGE_ROOT_Y, FX + 82,  FRINGE_TIP_Y - 6,  -3,  7,  H_ROOT,  0.75],
    [FX + 76,  FRINGE_ROOT_Y, FX + 86,  FRINGE_TIP_Y - 8,  -2,  6,  H_MID,   0.65],
  ];
  for (const [x0, y0, x1, y1, bulge, w, col, op] of fringeRight) {
    drawStrand(k, x0, y0, x1, y1, bulge, w, col, op);
  }

  // Fringe shine
  drawStrand(k, FX - 12, FRINGE_ROOT_Y, FX - 40, FRINGE_TIP_Y + 2, 5, 2, H_SHINE, 0.35);
  drawStrand(k, FX + 12, FRINGE_ROOT_Y, FX + 40, FRINGE_TIP_Y + 2, -5, 2, H_SHINE, 0.3);
}

// ── Eyeballs ──────────────────────────────────────────────────────────────────
function drawEyeballs(k: K, curEH: number) {
  k.drawEllipse({ radiusX: EW, radiusY: curEH, pos: k.vec2(ELX, ELY), color: k.rgb(255, 255, 255) });
  k.drawEllipse({ radiusX: EW, radiusY: curEH, pos: k.vec2(ERX, ERY), color: k.rgb(255, 255, 255) });
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

// ── Eyeliner ──────────────────────────────────────────────────────────────────
function drawEyeliner(k: K, ex: number, ey: number, ew: number, eh: number) {
  const SEGS = 12;
  for (let i = 0; i < SEGS; i++) {
    const a0 = Math.PI - (i / SEGS) * Math.PI;
    const a1 = Math.PI - ((i + 1) / SEGS) * Math.PI;
    k.drawLine({
      p1: k.vec2(ex + Math.cos(a0) * ew, ey + Math.sin(a0) * eh),
      p2: k.vec2(ex + Math.cos(a1) * ew, ey + Math.sin(a1) * eh),
      width: 2.5, color: k.rgb(10, 5, 5),
    });
  }
  for (let i = 0; i < SEGS; i++) {
    const a0 = (i / SEGS) * Math.PI;
    const a1 = ((i + 1) / SEGS) * Math.PI;
    k.drawLine({
      p1: k.vec2(ex + Math.cos(a0) * ew, ey + Math.sin(a0) * eh),
      p2: k.vec2(ex + Math.cos(a1) * ew, ey + Math.sin(a1) * eh),
      width: 1.2, color: k.rgb(10, 5, 5), opacity: 0.7,
    });
  }
  k.drawLine({
    p1: k.vec2(ex + ew, ey),
    p2: k.vec2(ex + ew + 8, ey - eh * 0.9),
    width: 2, color: k.rgb(10, 5, 5),
  });
}

// ── Lashes ────────────────────────────────────────────────────────────────────
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
    const lashAngle = normalAngle + t * LEAN_MAX;
    k.drawLine({
      p1: k.vec2(rootX, rootY),
      p2: k.vec2(rootX + Math.cos(lashAngle) * BASE_LEN, rootY + Math.sin(lashAngle) * BASE_LEN),
      width: 2.2, color: k.rgb(8, 5, 5),
    });
  }

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
    k.drawLine({
      p1: k.vec2(rootX, rootY),
      p2: k.vec2(rootX + Math.cos(normalAngle) * LOWER_LEN, rootY + Math.sin(normalAngle) * LOWER_LEN),
      width: 1.4, color: k.rgb(8, 5, 5), opacity: 0.75,
    });
  }
}

// ── Arched brow ───────────────────────────────────────────────────────────────
function drawBrow(k: K, ex: number, ey: number, flip: boolean) {
  const dir = flip ? 1 : -1;
  k.drawLine({ p1: k.vec2(ex + dir * 22, ey - 20), p2: k.vec2(ex, ey - 26),            width: 4, color: k.rgb(55, 28, 10) });
  k.drawLine({ p1: k.vec2(ex, ey - 26),             p2: k.vec2(ex - dir * 22, ey - 20), width: 3, color: k.rgb(55, 28, 10) });
}

// ── Nose ──────────────────────────────────────────────────────────────────────
function drawNose(k: K, nx: number, ny: number) {
  k.drawLine({ p1: k.vec2(nx, ny - 14), p2: k.vec2(nx - 8, ny + 10), width: 1.8, color: k.rgb(195, 145, 110) });
  k.drawLine({ p1: k.vec2(nx, ny - 14), p2: k.vec2(nx + 8, ny + 10), width: 1.8, color: k.rgb(195, 145, 110) });
  k.drawCircle({ pos: k.vec2(nx - 11, ny + 12), radius: 5, color: k.rgb(195, 145, 110), opacity: 0.65 });
  k.drawCircle({ pos: k.vec2(nx + 11, ny + 12), radius: 5, color: k.rgb(195, 145, 110), opacity: 0.65 });
  k.drawCircle({ pos: k.vec2(nx, ny + 8), radius: 4, color: k.rgb(255, 230, 210), opacity: 0.4 });
}

// ── Lips ──────────────────────────────────────────────────────────────────────
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
