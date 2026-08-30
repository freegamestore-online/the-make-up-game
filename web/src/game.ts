import kaplay from "kaplay";

type K = ReturnType<typeof kaplay>;

const VW = 400;
const VH = 680;

// Skin tones
const SKIN: [number, number, number]      = [242, 200, 168];
const SKIN_DARK: [number, number, number] = [210, 160, 120];

// Hair palette — rich warm brunette
const H_ROOT:  [number, number, number] = [ 45,  25,  10];
const H_MID:   [number, number, number] = [ 80,  45,  15];
const H_LIGHT: [number, number, number] = [130,  75,  30];
const H_SHINE: [number, number, number] = [190, 130,  60];

// ── Face geometry ─────────────────────────────────────────────────────────────
const FX  = VW / 2;
const FY  = 300;

// Forehead dome
const FHW = 88;
const FHH = 78;

// Cheekbone (widest point)
const CBW = 84;
const CBY = FY + 10;

// Chin — softer, less pointy: raised up and wider at tip
const CHIN_X = FX;
const CHIN_Y = FY + 100;   // was 118 — shorter lower face
const CHIN_W = 18;          // chin tip half-width (not a knife point)

// Jaw corners — wider so the taper is gentler
const JAW_LX = FX - 68, JAW_LY = FY + 58;
const JAW_RX = FX + 68, JAW_RY = FY + 58;

// Eyes — moved DOWN: closer to the nose, lower in the face
// Previously ELY = FY - 30; now FY - 10 (20 px lower)
const ELX = FX - 34, ELY = FY - 10;
const ERX = FX + 34, ERY = FY - 10;
const EW  = 22, EH = 16;

// Cheek blush — follow eye position down
const CLX = FX - 60, CLY = FY + 30;
const CRX = FX + 60, CRY = FY + 30;
const CR  = 20;

// Lips
const MX = FX, MY = FY + 74;
const MW = 28, MH = 11;

// Nose — sits between eyes and lips
const NX = FX, NY = FY + 36;

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

function inFace(px: number, py: number): boolean {
  if (py < CBY) {
    const dx = (px - FX) / FHW;
    const dy = (py - FY) / FHH;
    return dx * dx + dy * dy <= 1.05;
  }
  const t  = (py - CBY) / (CHIN_Y - CBY);
  // Taper from CBW down to CHIN_W (not 0) — softer chin
  const hw = CBW + (CHIN_W - CBW) * (t * t);
  return Math.abs(px - FX) <= hw;
}

function inCircle(px: number, py: number, cx: number, cy: number, r: number): boolean {
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function inEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number, pad = 0): boolean {
  const dx = (px - cx) / (rx + pad);
  const dy = (py - cy) / (ry + pad);
  return dx * dx + dy * dy <= 1;
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

function blinkFactor(t: number): number {
  return Math.sin((t / BLINK_DURATION) * Math.PI);
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
      if (inFace(x, y)) {
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
      k.drawEllipse({ radiusX: 110, radiusY: 55, pos: k.vec2(FX, CHIN_Y + 55), color: k.rgb(230, 100, 160) });
      k.drawEllipse({ radiusX: 95,  radiusY: 42, pos: k.vec2(FX, CHIN_Y + 51), color: k.rgb(245, 140, 185) });

      // Neck
      k.drawRect({ pos: k.vec2(FX - 16, CHIN_Y - 8), width: 32, height: 65, color: k.rgb(...SKIN) });
      k.drawRect({ pos: k.vec2(FX - 16, CHIN_Y - 8), width: 6,  height: 60, color: k.rgb(...SKIN_DARK), opacity: 0.3 });
      k.drawRect({ pos: k.vec2(FX + 10, CHIN_Y - 8), width: 6,  height: 60, color: k.rgb(...SKIN_DARK), opacity: 0.3 });

      // Earrings
      k.drawCircle({ pos: k.vec2(FX - CBW - 4, FY + 8), radius: 6, color: k.rgb(255, 215, 0) });
      k.drawCircle({ pos: k.vec2(FX - CBW - 4, FY + 8), radius: 3, color: k.rgb(255, 160, 50) });
      k.drawCircle({ pos: k.vec2(FX + CBW + 4, FY + 8), radius: 6, color: k.rgb(255, 215, 0) });
      k.drawCircle({ pos: k.vec2(FX + CBW + 4, FY + 8), radius: 3, color: k.rgb(255, 160, 50) });
      k.drawLine({ p1: k.vec2(FX - CBW - 4, FY + 14), p2: k.vec2(FX - CBW - 4, FY + 26), width: 2, color: k.rgb(255, 215, 0) });
      k.drawLine({ p1: k.vec2(FX + CBW + 4, FY + 14), p2: k.vec2(FX + CBW + 4, FY + 26), width: 2, color: k.rgb(255, 215, 0) });
      k.drawCircle({ pos: k.vec2(FX - CBW - 4, FY + 30), radius: 5, color: k.rgb(255, 100, 180) });
      k.drawCircle({ pos: k.vec2(FX + CBW + 4, FY + 30), radius: 5, color: k.rgb(255, 100, 180) });

      // Hair back layer
      drawHairBack(k);

      // Face
      drawAnimeFace(k, foundDone);

      // Eyebrows (follow eye position)
      drawBrow(k, ELX, ELY, false);
      drawBrow(k, ERX, ERY, true);

      // Eye shadow
      if (shadowDone) {
        k.drawEllipse({ radiusX: EW + 8, radiusY: EH + 9,  pos: k.vec2(ELX, ELY - 2), color: k.rgb(120, 60, 190), opacity: 0.55 });
        k.drawEllipse({ radiusX: EW + 8, radiusY: EH + 9,  pos: k.vec2(ERX, ERY - 2), color: k.rgb(120, 60, 190), opacity: 0.55 });
        k.drawEllipse({ radiusX: EW + 3, radiusY: EH + 4,  pos: k.vec2(ELX, ELY),     color: k.rgb(200, 150, 255), opacity: 0.4 });
        k.drawEllipse({ radiusX: EW + 3, radiusY: EH + 4,  pos: k.vec2(ERX, ERY),     color: k.rgb(200, 150, 255), opacity: 0.4 });
      }

      // Eyes
      drawEyeballs(k, curEH);

      // Eyeliner
      if (linerDone) {
        drawEyeliner(k, ELX, ELY, EW, curEH);
        drawEyeliner(k, ERX, ERY, EW, curEH);
        if (!isBlinking) drawCatchlights(k);
      }

      // Mascara
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
        k.drawCircle({ pos: k.vec2(CLX, CLY), radius: CR + 8, color: k.rgb(255, 120, 160), opacity: 0.25 });
        k.drawCircle({ pos: k.vec2(CRX, CRY), radius: CR + 8, color: k.rgb(255, 120, 160), opacity: 0.25 });
        k.drawCircle({ pos: k.vec2(CLX, CLY), radius: CR,     color: k.rgb(255, 140, 170), opacity: 0.45 });
        k.drawCircle({ pos: k.vec2(CRX, CRY), radius: CR,     color: k.rgb(255, 140, 170), opacity: 0.45 });
      }

      // Lips
      drawLips(k, lipDone);

      // Hair front layer
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
          const rr  = CBW + 22 + Math.sin(t0 * 3 + i) * 8;
          k.drawCircle({ pos: k.vec2(FX + Math.cos(ang) * rr, FY + Math.sin(ang) * rr * 0.6),
            radius: 4, color: k.rgb(255, 220, 60), opacity: 0.9 });
        }
        k.drawText({ text: "✨ GORGEOUS! ✨",      size: 30,
          pos: k.vec2(FX, CHIN_Y + 30), anchor: "center", color: k.rgb(200, 40, 120) });
        k.drawText({ text: "You look amazing! 💖", size: 16,
          pos: k.vec2(FX, CHIN_Y + 64), anchor: "center", color: k.rgb(160, 60, 120) });
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
// ANIME FACE — wide forehead dome, soft rounded jaw, gentle chin
// ─────────────────────────────────────────────────────────────────────────────
function drawAnimeFace(k: K, foundDone: boolean) {
  const skinCol  = k.rgb(...SKIN);
  const skinDark = k.rgb(...SKIN_DARK);

  // Drop shadow
  k.drawEllipse({ radiusX: FHW + 6, radiusY: FHH + 4,
    pos: k.vec2(FX + 5, FY + 10), color: k.rgb(180, 130, 100), opacity: 0.15 });

  // Upper face dome
  k.drawEllipse({ radiusX: FHW, radiusY: FHH, pos: k.vec2(FX, FY), color: skinCol });

  // Lower jaw: scanline fill from CBY to CHIN_Y
  // Taper from CBW → CHIN_W with a smooth quadratic ease (not linear to a point)
  const SCAN_STEPS = 44;
  for (let i = 0; i <= SCAN_STEPS; i++) {
    const t   = i / SCAN_STEPS;
    const y   = CBY + (CHIN_Y - CBY) * t;
    // ease: start wide, narrow gently, stay rounded at the bottom
    const ease = 1 - t * t * (2 - t); // smooth-step keeps chin rounder
    const hw  = CHIN_W + (CBW - CHIN_W) * ease;
    k.drawRect({
      pos:    k.vec2(FX - hw, y),
      width:  hw * 2,
      height: (CHIN_Y - CBY) / SCAN_STEPS + 1.5,
      color:  skinCol,
    });
  }

  // Round off the very bottom of the chin with a small ellipse cap
  k.drawEllipse({ radiusX: CHIN_W + 4, radiusY: 10,
    pos: k.vec2(CHIN_X, CHIN_Y), color: skinCol });

  // Subtle shading
  k.drawEllipse({ radiusX: 22, radiusY: 30, pos: k.vec2(FX - FHW + 14, FY + 5),
    color: skinDark, opacity: 0.1 });
  k.drawEllipse({ radiusX: 22, radiusY: 30, pos: k.vec2(FX + FHW - 14, FY + 5),
    color: skinDark, opacity: 0.1 });
  // Forehead highlight
  k.drawEllipse({ radiusX: 34, radiusY: 18, pos: k.vec2(FX, FY - 52),
    color: k.rgb(255, 245, 235), opacity: 0.4 });

  // Foundation shimmer
  if (foundDone) {
    k.drawEllipse({ radiusX: FHW - 4, radiusY: FHH - 4, pos: k.vec2(FX, FY),
      color: k.rgb(255, 225, 195), opacity: 0.22 });
    k.drawEllipse({ radiusX: 16, radiusY: 8, pos: k.vec2(FX - 44, FY - 8),
      color: k.rgb(255, 240, 220), opacity: 0.3 });
    k.drawEllipse({ radiusX: 16, radiusY: 8, pos: k.vec2(FX + 44, FY - 8),
      color: k.rgb(255, 240, 220), opacity: 0.3 });
  }

  // Outline — top dome arc
  const ARC_SEGS = 20;
  for (let i = 0; i < ARC_SEGS; i++) {
    const a0 = Math.PI - (i / ARC_SEGS) * Math.PI;
    const a1 = Math.PI - ((i + 1) / ARC_SEGS) * Math.PI;
    k.drawLine({
      p1: k.vec2(FX + Math.cos(a0) * FHW, FY + Math.sin(a0) * FHH),
      p2: k.vec2(FX + Math.cos(a1) * FHW, FY + Math.sin(a1) * FHH),
      width: 2.5, color: k.rgb(200, 155, 125), opacity: 0.5,
    });
  }

  // Left jaw outline: cheek → jaw corner → chin (two segments, gentle curve)
  k.drawLine({ p1: k.vec2(FX - CBW, CBY), p2: k.vec2(JAW_LX, JAW_LY),
    width: 2.2, color: k.rgb(200, 155, 125), opacity: 0.55 });
  k.drawLine({ p1: k.vec2(JAW_LX, JAW_LY), p2: k.vec2(CHIN_X - CHIN_W, CHIN_Y),
    width: 2.0, color: k.rgb(200, 155, 125), opacity: 0.5 });

  // Right jaw outline
  k.drawLine({ p1: k.vec2(FX + CBW, CBY), p2: k.vec2(JAW_RX, JAW_RY),
    width: 2.2, color: k.rgb(200, 155, 125), opacity: 0.55 });
  k.drawLine({ p1: k.vec2(JAW_RX, JAW_RY), p2: k.vec2(CHIN_X + CHIN_W, CHIN_Y),
    width: 2.0, color: k.rgb(200, 155, 125), opacity: 0.5 });

  // Chin bottom arc outline
  const CHIN_SEGS = 8;
  for (let i = 0; i < CHIN_SEGS; i++) {
    const a0 = Math.PI + (i / CHIN_SEGS) * Math.PI;
    const a1 = Math.PI + ((i + 1) / CHIN_SEGS) * Math.PI;
    k.drawLine({
      p1: k.vec2(CHIN_X + Math.cos(a0) * (CHIN_W + 4), CHIN_Y + Math.sin(a0) * 10),
      p2: k.vec2(CHIN_X + Math.cos(a1) * (CHIN_W + 4), CHIN_Y + Math.sin(a1) * 10),
      width: 2.0, color: k.rgb(200, 155, 125), opacity: 0.45,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EYES
// ─────────────────────────────────────────────────────────────────────────────
function drawEyeballs(k: K, curEH: number) {
  k.drawEllipse({ radiusX: EW, radiusY: curEH, pos: k.vec2(ELX, ELY), color: k.rgb(255, 255, 255) });
  k.drawEllipse({ radiusX: EW, radiusY: curEH, pos: k.vec2(ERX, ERY), color: k.rgb(255, 255, 255) });

  if (curEH > 2) {
    const irisR = Math.min(curEH - 1, 13);
    k.drawCircle({ pos: k.vec2(ELX, ELY), radius: irisR, color: k.rgb(60, 110, 200) });
    k.drawCircle({ pos: k.vec2(ERX, ERY), radius: irisR, color: k.rgb(60, 110, 200) });
    k.drawCircle({ pos: k.vec2(ELX, ELY), radius: irisR, color: k.rgb(20, 50, 140), opacity: 0.45 });
    k.drawCircle({ pos: k.vec2(ERX, ERY), radius: irisR, color: k.rgb(20, 50, 140), opacity: 0.45 });
    const pupilR = Math.min(irisR * 0.5, 7);
    k.drawCircle({ pos: k.vec2(ELX, ELY), radius: pupilR, color: k.rgb(8, 6, 6) });
    k.drawCircle({ pos: k.vec2(ERX, ERY), radius: pupilR, color: k.rgb(8, 6, 6) });
    drawCatchlights(k);
  }
}

function drawCatchlights(k: K) {
  k.drawCircle({ pos: k.vec2(ELX + 4, ELY - 4), radius: 3.5, color: k.rgb(255, 255, 255) });
  k.drawCircle({ pos: k.vec2(ERX + 4, ERY - 4), radius: 3.5, color: k.rgb(255, 255, 255) });
  k.drawCircle({ pos: k.vec2(ELX - 3, ELY + 3), radius: 1.5, color: k.rgb(255, 255, 255), opacity: 0.6 });
  k.drawCircle({ pos: k.vec2(ERX - 3, ERY + 3), radius: 1.5, color: k.rgb(255, 255, 255), opacity: 0.6 });
}

// ── Eyeliner ─────────────────────────────────────────────────────────────────
function drawEyeliner(k: K, ex: number, ey: number, ew: number, eh: number) {
  const SEGS = 14;
  for (let i = 0; i < SEGS; i++) {
    const a0 = Math.PI - (i / SEGS) * Math.PI;
    const a1 = Math.PI - ((i + 1) / SEGS) * Math.PI;
    k.drawLine({ p1: k.vec2(ex + Math.cos(a0) * ew, ey + Math.sin(a0) * eh),
      p2: k.vec2(ex + Math.cos(a1) * ew, ey + Math.sin(a1) * eh),
      width: 2.8, color: k.rgb(10, 5, 5) });
  }
  for (let i = 0; i < SEGS; i++) {
    const a0 = (i / SEGS) * Math.PI;
    const a1 = ((i + 1) / SEGS) * Math.PI;
    k.drawLine({ p1: k.vec2(ex + Math.cos(a0) * ew, ey + Math.sin(a0) * eh),
      p2: k.vec2(ex + Math.cos(a1) * ew, ey + Math.sin(a1) * eh),
      width: 1.2, color: k.rgb(10, 5, 5), opacity: 0.65 });
  }
  k.drawLine({ p1: k.vec2(ex + ew, ey), p2: k.vec2(ex + ew + 9, ey - eh),
    width: 2.2, color: k.rgb(10, 5, 5) });
}

// ── Lashes ───────────────────────────────────────────────────────────────────
function drawLashes(k: K, ex: number, ey: number, ew: number, eh: number) {
  const COUNT = 12, BASE_LEN = 18, LEAN_MAX = 0.36;
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
    k.drawLine({ p1: k.vec2(rootX, rootY),
      p2: k.vec2(rootX + Math.cos(lashAngle) * BASE_LEN, rootY + Math.sin(lashAngle) * BASE_LEN),
      width: 2.2, color: k.rgb(8, 5, 5) });
  }
  for (let i = 0; i < 7; i++) {
    const t = i / 6 - 0.5;
    const arcAngle = t * Math.PI;
    const rootX = ex + Math.cos(arcAngle) * ew;
    const rootY = ey + Math.sin(arcAngle) * eh;
    const nx = Math.cos(arcAngle) / ew;
    const ny = Math.sin(arcAngle) / eh;
    const nLen = Math.sqrt(nx * nx + ny * ny);
    const normalAngle = Math.atan2(ny / nLen, nx / nLen);
    k.drawLine({ p1: k.vec2(rootX, rootY),
      p2: k.vec2(rootX + Math.cos(normalAngle) * 7, rootY + Math.sin(normalAngle) * 7),
      width: 1.4, color: k.rgb(8, 5, 5), opacity: 0.7 });
  }
}

// ── Thin arched anime brow ───────────────────────────────────────────────────
function drawBrow(k: K, ex: number, ey: number, flip: boolean) {
  const dir = flip ? 1 : -1;
  const x0 = ex + dir * 24, y0 = ey - 22;
  const x1 = ex + dir * 4,  y1 = ey - 30;
  const x2 = ex - dir * 20, y2 = ey - 24;
  k.drawLine({ p1: k.vec2(x0, y0), p2: k.vec2(x1, y1), width: 3.5, color: k.rgb(50, 25, 8) });
  k.drawLine({ p1: k.vec2(x1, y1), p2: k.vec2(x2, y2), width: 2.5, color: k.rgb(50, 25, 8) });
}

// ── Tiny anime nose ──────────────────────────────────────────────────────────
function drawNose(k: K, nx: number, ny: number) {
  k.drawLine({ p1: k.vec2(nx - 6, ny + 8), p2: k.vec2(nx, ny + 12), width: 1.6, color: k.rgb(195, 145, 110) });
  k.drawLine({ p1: k.vec2(nx + 6, ny + 8), p2: k.vec2(nx, ny + 12), width: 1.6, color: k.rgb(195, 145, 110) });
  k.drawCircle({ pos: k.vec2(nx, ny + 12), radius: 2.5, color: k.rgb(195, 145, 110), opacity: 0.5 });
}

// ── Fuller lips ───────────────────────────────────────────────────────────────
function drawLips(k: K, lipDone: boolean) {
  const lipBase = lipDone ? k.rgb(215, 35, 80)   : k.rgb(200, 130, 110);
  const lipDark = lipDone ? k.rgb(160, 20, 55)   : k.rgb(170, 100, 85);
  const lipHi   = lipDone ? k.rgb(255, 120, 150) : k.rgb(230, 170, 150);

  k.drawEllipse({ radiusX: MW,        radiusY: MH,       pos: k.vec2(MX, MY + 5),      color: lipBase });
  k.drawEllipse({ radiusX: MW * 0.55, radiusY: MH * 0.8, pos: k.vec2(MX - 12, MY - 4), color: lipBase });
  k.drawEllipse({ radiusX: MW * 0.55, radiusY: MH * 0.8, pos: k.vec2(MX + 12, MY - 4), color: lipBase });
  k.drawLine({ p1: k.vec2(MX - 4, MY - 3), p2: k.vec2(MX + 4, MY - 3), width: 2, color: lipDark, opacity: 0.5 });
  k.drawLine({ p1: k.vec2(MX - MW + 3, MY + 2), p2: k.vec2(MX + MW - 3, MY + 2), width: 1.5, color: lipDark, opacity: 0.6 });
  k.drawEllipse({ radiusX: 10, radiusY: 4, pos: k.vec2(MX, MY + 4), color: lipHi, opacity: 0.45 });
}

// ── Hint overlays ─────────────────────────────────────────────────────────────
function drawHint(k: K, s: string, pulse: number) {
  k.drawEllipse({ radiusX: FHW + 12, radiusY: FHH + 12, pos: k.vec2(FX, FY),
    color: k.rgb(220, 60, 130), opacity: pulse * 0.18 });

  if (s === "eyeshadow") {
    k.drawEllipse({ radiusX: EW + 14, radiusY: EH + 14, pos: k.vec2(ELX, ELY), color: k.rgb(155, 95, 210), opacity: pulse * 0.5 });
    k.drawEllipse({ radiusX: EW + 14, radiusY: EH + 14, pos: k.vec2(ERX, ERY), color: k.rgb(155, 95, 210), opacity: pulse * 0.5 });
  }
  if (s === "eyeliner" || s === "mascara") {
    k.drawEllipse({ radiusX: EW + 14, radiusY: EH + 14, pos: k.vec2(ELX, ELY), color: k.rgb(30, 20, 20), opacity: pulse * 0.4 });
    k.drawEllipse({ radiusX: EW + 14, radiusY: EH + 14, pos: k.vec2(ERX, ERY), color: k.rgb(30, 20, 20), opacity: pulse * 0.4 });
  }
  if (s === "blush") {
    k.drawCircle({ pos: k.vec2(CLX, CLY), radius: CR + 20, color: k.rgb(255, 140, 170), opacity: pulse * 0.5 });
    k.drawCircle({ pos: k.vec2(CRX, CRY), radius: CR + 20, color: k.rgb(255, 140, 170), opacity: pulse * 0.5 });
  }
  if (s === "lipstick") {
    k.drawEllipse({ radiusX: MW + 14, radiusY: MH + 14, pos: k.vec2(MX, MY), color: k.rgb(210, 38, 85), opacity: pulse * 0.5 });
  }
  k.drawText({ text: "👆 TAP THE FACE", size: 18,
    pos: k.vec2(FX, CHIN_Y + 16), anchor: "center", color: k.rgb(220, 60, 130), opacity: pulse });
}

// ─────────────────────────────────────────────────────────────────────────────
// HAIR — back layer (behind face) + front layer (bangs/fringe over face)
// ─────────────────────────────────────────────────────────────────────────────
function drawStrand(
  k: K,
  x0: number, y0: number, x1: number, y1: number,
  bulge: number, width: number,
  col: [number, number, number], opacity = 1.0, segs = 8,
) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len, py = dx / len;
  let prevX = x0, prevY = y0;
  for (let i = 1; i <= segs; i++) {
    const tt = i / segs;
    const bAmt = bulge * Math.sin(tt * Math.PI);
    const cx = x0 + dx * tt + px * bAmt;
    const cy = y0 + dy * tt + py * bAmt;
    k.drawLine({ p1: k.vec2(prevX, prevY), p2: k.vec2(cx, cy), width, color: k.rgb(...col), opacity });
    prevX = cx; prevY = cy;
  }
}

function drawHairBack(k: K) {
  // Main scalp mass
  k.drawEllipse({ radiusX: FHW + 18, radiusY: FHH * 0.72,
    pos: k.vec2(FX, FY - FHH * 0.38), color: k.rgb(...H_ROOT) });

  // Side lobes
  k.drawEllipse({ radiusX: 58, radiusY: FHH * 1.55, pos: k.vec2(FX - FHW + 10, FY + 30), color: k.rgb(...H_ROOT) });
  k.drawEllipse({ radiusX: 42, radiusY: FHH * 1.45, pos: k.vec2(FX - FHW + 6,  FY + 30), color: k.rgb(...H_MID), opacity: 0.7 });
  k.drawEllipse({ radiusX: 58, radiusY: FHH * 1.55, pos: k.vec2(FX + FHW - 10, FY + 30), color: k.rgb(...H_ROOT) });
  k.drawEllipse({ radiusX: 42, radiusY: FHH * 1.45, pos: k.vec2(FX + FHW - 6,  FY + 30), color: k.rgb(...H_MID), opacity: 0.7 });

  // Back centre mass
  k.drawEllipse({ radiusX: FHW + 10, radiusY: FHH * 1.7, pos: k.vec2(FX, FY + 40), color: k.rgb(...H_ROOT) });

  // Back strands left
  const leftBack: [number,number,number,number,number,[number,number,number],number][] = [
    [FX-FHW-14, FY-70, FX-FHW-30, FY+180, -18, H_ROOT, 1.0],
    [FX-FHW-4,  FY-80, FX-FHW-20, FY+200, -14, H_MID,  0.9],
    [FX-FHW+8,  FY-88, FX-FHW-10, FY+210, -10, H_MID,  0.85],
    [FX-FHW+20, FY-90, FX-FHW,    FY+205,  -6, H_LIGHT,0.75],
    [FX-FHW-18, FY-55, FX-FHW-34, FY+160, -20, H_ROOT, 0.9],
  ];
  for (const [x0,y0,x1,y1,bulge,col,op] of leftBack) drawStrand(k,x0,y0,x1,y1,bulge,5,col,op);

  // Back strands right
  const rightBack: [number,number,number,number,number,[number,number,number],number][] = [
    [FX+FHW+14, FY-70, FX+FHW+30, FY+180,  18, H_ROOT, 1.0],
    [FX+FHW+4,  FY-80, FX+FHW+20, FY+200,  14, H_MID,  0.9],
    [FX+FHW-8,  FY-88, FX+FHW+10, FY+210,  10, H_MID,  0.85],
    [FX+FHW-20, FY-90, FX+FHW,    FY+205,   6, H_LIGHT,0.75],
    [FX+FHW+18, FY-55, FX+FHW+34, FY+160,  20, H_ROOT, 0.9],
  ];
  for (const [x0,y0,x1,y1,bulge,col,op] of rightBack) drawStrand(k,x0,y0,x1,y1,bulge,5,col,op);

  // Shine
  drawStrand(k, FX-12, FY-FHH*0.9, FX-18, FY+140, -8, 3, H_SHINE, 0.55);
  drawStrand(k, FX+10, FY-FHH*0.9, FX+16, FY+140,  8, 3, H_SHINE, 0.45);
}

function drawHairFront(k: K) {
  const BANG_ROOT_Y = FY - FHH + 8;
  const BROW_Y      = ELY - 24;   // just above brows (which are now lower too)

  // Side panels
  const leftPanel: [number,number,number,number,number,number,[number,number,number],number][] = [
    [FX-20, FY-FHH+2, FX-FHW-8,  FY+50, -6,  14, H_ROOT, 1.0],
    [FX-28, FY-FHH+4, FX-FHW-12, FY+60, -8,  12, H_MID,  0.9],
    [FX-36, FY-FHH+6, FX-FHW-16, FY+55, -9,  10, H_MID,  0.85],
    [FX-44, FY-FHH+8, FX-FHW-18, FY+48, -10,  9, H_ROOT, 0.8],
    [FX-52, FY-FHH+10,FX-FHW-20, FY+42, -11,  8, H_ROOT, 0.75],
    [FX-32, FY-FHH+5, FX-FHW-10, FY+52, -7,   4, H_LIGHT,0.5],
  ];
  for (const [x0,y0,x1,y1,bulge,w,col,op] of leftPanel) drawStrand(k,x0,y0,x1,y1,bulge,w,col,op);

  const rightPanel: [number,number,number,number,number,number,[number,number,number],number][] = [
    [FX+20, FY-FHH+2, FX+FHW+8,  FY+50,  6,  14, H_ROOT, 1.0],
    [FX+28, FY-FHH+4, FX+FHW+12, FY+60,  8,  12, H_MID,  0.9],
    [FX+36, FY-FHH+6, FX+FHW+16, FY+55,  9,  10, H_MID,  0.85],
    [FX+44, FY-FHH+8, FX+FHW+18, FY+48,  10,  9, H_ROOT, 0.8],
    [FX+52, FY-FHH+10,FX+FHW+20, FY+42,  11,  8, H_ROOT, 0.75],
    [FX+32, FY-FHH+5, FX+FHW+10, FY+52,  7,   4, H_LIGHT,0.5],
  ];
  for (const [x0,y0,x1,y1,bulge,w,col,op] of rightPanel) drawStrand(k,x0,y0,x1,y1,bulge,w,col,op);

  // Scalp / parting base
  k.drawEllipse({ radiusX: FHW + 14, radiusY: 28,
    pos: k.vec2(FX, FY - FHH + 4), color: k.rgb(...H_ROOT) });
  k.drawLine({ p1: k.vec2(FX, FY - FHH - 2), p2: k.vec2(FX, FY - FHH + 32),
    width: 3, color: k.rgb(...SKIN_DARK), opacity: 0.45 });

  // Bangs — sweep left across forehead, tips reach just above brows
  const bangs: [number,number,number,number,number,number,[number,number,number],number][] = [
    [FX+10, BANG_ROOT_Y, FX-20, BROW_Y+4,  12, 13, H_ROOT,  1.0],
    [FX+6,  BANG_ROOT_Y, FX-32, BROW_Y+2,  14, 12, H_ROOT,  1.0],
    [FX+2,  BANG_ROOT_Y, FX-44, BROW_Y,    15, 11, H_MID,   0.95],
    [FX-4,  BANG_ROOT_Y, FX-56, BROW_Y-1,  14, 10, H_MID,   0.9],
    [FX-10, BANG_ROOT_Y, FX-66, BROW_Y-2,  13,  9, H_MID,   0.85],
    [FX-16, BANG_ROOT_Y, FX-74, BROW_Y-1,  11,  8, H_ROOT,  0.8],
    [FX-22, BANG_ROOT_Y, FX-80, BROW_Y+2,   9,  7, H_ROOT,  0.75],
    [FX-28, BANG_ROOT_Y, FX-84, BROW_Y+5,   7,  6, H_MID,   0.65],
    [FX-34, BANG_ROOT_Y, FX-86, BROW_Y+9,   5,  5, H_MID,   0.55],
    [FX+4,  BANG_ROOT_Y, FX-50, BROW_Y+1,  14,  3, H_LIGHT, 0.45],
    [FX,    BANG_ROOT_Y, FX-38, BROW_Y,    14,  2, H_SHINE, 0.3],
  ];
  for (const [x0,y0,x1,y1,bulge,w,col,op] of bangs) drawStrand(k,x0,y0,x1,y1,bulge,w,col,op);

  // Fringe — shorter curtain strands that hang straight down across the forehead
  const fringe: [number,number,number,number,number,number,[number,number,number],number][] = [
    [FX-6,  BANG_ROOT_Y+4, FX-8,  BROW_Y+8,  2, 11, H_ROOT,  0.9],
    [FX-14, BANG_ROOT_Y+4, FX-18, BROW_Y+6,  3, 10, H_MID,   0.85],
    [FX-22, BANG_ROOT_Y+4, FX-28, BROW_Y+4,  3,  9, H_MID,   0.8],
    [FX-30, BANG_ROOT_Y+4, FX-38, BROW_Y+3,  2,  8, H_ROOT,  0.75],
    [FX-38, BANG_ROOT_Y+4, FX-48, BROW_Y+2,  2,  7, H_ROOT,  0.7],
    [FX-46, BANG_ROOT_Y+4, FX-56, BROW_Y+4,  1,  6, H_MID,   0.6],
    [FX-2,  BANG_ROOT_Y+4, FX-4,  BROW_Y+10, 1,  5, H_LIGHT, 0.4],
  ];
  for (const [x0,y0,x1,y1,bulge,w,col,op] of fringe) drawStrand(k,x0,y0,x1,y1,bulge,w,col,op);
}
