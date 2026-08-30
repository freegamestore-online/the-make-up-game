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

// ── Anime face geometry ───────────────────────────────────────────────────────
// Wide flat top, high cheekbones that taper to a sharp pointed chin.
// We build the face as a filled polygon using overlapping rects + ellipses
// rather than a single oval.
const FX  = VW / 2;
const FY  = 310;          // face centre Y (slightly lower to give chin room)

// Forehead: wide flat ellipse for the top of the head
const FHW = 88;           // forehead half-width
const FHH = 78;           // forehead half-height (top dome)

// Cheekbone width (widest point of face, below eye level)
const CBW = 84;           // cheekbone half-width
const CBY = FY + 10;      // Y of widest cheekbone point

// Chin: very narrow, pointed
const CHIN_X = FX;
const CHIN_Y = FY + 118;  // tip of chin

// Jaw corners (where cheeks taper to chin)
const JAW_LX = FX - 62, JAW_LY = FY + 62;
const JAW_RX = FX + 62, JAW_RY = FY + 62;

// Top of head
const HEAD_TOP_Y = FY - FHH;

// Eyes — large, wide-set, anime-style (bigger than before)
const ELX = FX - 34, ELY = FY - 30;
const ERX = FX + 34, ERY = FY - 30;
const EW  = 22, EH = 16;   // wider, taller anime eyes

// Cheek blush
const CLX = FX - 60, CLY = FY + 22;
const CRX = FX + 60, CRY = FY + 22;
const CR  = 20;

// Lips — smaller, centred higher on the short lower face
const MX = FX, MY = FY + 78;
const MW = 28, MH = 11;

// Nose — tiny, just a hint
const NX = FX, NY = FY + 30;

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
  // Top dome (ellipse)
  if (py < CBY) {
    const dx = (px - FX) / FHW;
    const dy = (py - FY) / FHH;
    return dx * dx + dy * dy <= 1.05;
  }
  // Lower jaw: linearly interpolate width from CBW at CBY to 0 at CHIN_Y
  const t  = (py - CBY) / (CHIN_Y - CBY);
  const hw = CBW * (1 - t);
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
      k.drawEllipse({ radiusX: 110, radiusY: 55, pos: k.vec2(FX, CHIN_Y + 52), color: k.rgb(230, 100, 160) });
      k.drawEllipse({ radiusX: 95,  radiusY: 42, pos: k.vec2(FX, CHIN_Y + 48), color: k.rgb(245, 140, 185) });

      // Neck — narrower for anime look
      k.drawRect({ pos: k.vec2(FX - 16, CHIN_Y - 12), width: 32, height: 65, color: k.rgb(...SKIN) });
      k.drawRect({ pos: k.vec2(FX - 16, CHIN_Y - 12), width: 6,  height: 60, color: k.rgb(...SKIN_DARK), opacity: 0.3 });
      k.drawRect({ pos: k.vec2(FX + 10, CHIN_Y - 12), width: 6,  height: 60, color: k.rgb(...SKIN_DARK), opacity: 0.3 });

      // Earrings
      k.drawCircle({ pos: k.vec2(FX - CBW - 4, FY + 8), radius: 6, color: k.rgb(255, 215, 0) });
      k.drawCircle({ pos: k.vec2(FX - CBW - 4, FY + 8), radius: 3, color: k.rgb(255, 160, 50) });
      k.drawCircle({ pos: k.vec2(FX + CBW + 4, FY + 8), radius: 6, color: k.rgb(255, 215, 0) });
      k.drawCircle({ pos: k.vec2(FX + CBW + 4, FY + 8), radius: 3, color: k.rgb(255, 160, 50) });
      k.drawLine({ p1: k.vec2(FX - CBW - 4, FY + 14), p2: k.vec2(FX - CBW - 4, FY + 26), width: 2, color: k.rgb(255, 215, 0) });
      k.drawLine({ p1: k.vec2(FX + CBW + 4, FY + 14), p2: k.vec2(FX + CBW + 4, FY + 26), width: 2, color: k.rgb(255, 215, 0) });
      k.drawCircle({ pos: k.vec2(FX - CBW - 4, FY + 30), radius: 5, color: k.rgb(255, 100, 180) });
      k.drawCircle({ pos: k.vec2(FX + CBW + 4, FY + 30), radius: 5, color: k.rgb(255, 100, 180) });

      // Hair back layer (behind face)
      drawHairBack(k);

      // ── Anime face shape ──────────────────────────────────────────────────
      drawAnimeFace(k, foundDone);

      // Eyebrows — thinner, more arched for anime
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

      // Nose — tiny anime dot/hint
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

      // Hair front layer (bangs + fringe on top of face)
      drawHairFront(k);

      // Tap hint
      if (!isDone && !stepDone) {
        const pulse = 0.4 + 0.4 * Math.sin(t0 * 5);
        drawHint(k, s, pulse);
      }

      // Progress bar width
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
          pos: k.vec2(FX, CHIN_Y + 28), anchor: "center", color: k.rgb(200, 40, 120) });
        k.drawText({ text: "You look amazing! 💖", size: 16,
          pos: k.vec2(FX, CHIN_Y + 62), anchor: "center", color: k.rgb(160, 60, 120) });
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
// ANIME FACE — wide top, sharp pointed chin, flat cheeks
// Built from layered filled shapes + outline strokes
// ─────────────────────────────────────────────────────────────────────────────
function drawAnimeFace(k: K, foundDone: boolean) {
  const skinCol  = k.rgb(...SKIN);
  const skinDark = k.rgb(...SKIN_DARK);

  // Drop shadow
  k.drawEllipse({ radiusX: FHW + 6, radiusY: FHH + 4,
    pos: k.vec2(FX + 5, FY + 10), color: k.rgb(180, 130, 100), opacity: 0.15 });

  // ── Upper face: wide rounded forehead dome ────────────────────────────────
  k.drawEllipse({ radiusX: FHW, radiusY: FHH, pos: k.vec2(FX, FY), color: skinCol });

  // ── Lower face: jaw tapers from cheekbones to pointed chin ────────────────
  // We fill horizontal scanlines from CBY down to CHIN_Y
  // KAPLAY has no polygon fill, so we use many thin rects (scanline fill).
  const SCAN_STEPS = 40;
  for (let i = 0; i <= SCAN_STEPS; i++) {
    const t   = i / SCAN_STEPS;
    const y   = CBY + (CHIN_Y - CBY) * t;
    // Width tapers with a slight ease-out curve for natural jaw shape
    const ease = 1 - t * t;
    const hw  = CBW * ease;
    k.drawRect({
      pos:    k.vec2(FX - hw, y),
      width:  hw * 2,
      height: (CHIN_Y - CBY) / SCAN_STEPS + 1,
      color:  skinCol,
    });
  }

  // ── Subtle shading ────────────────────────────────────────────────────────
  // Left cheek shadow
  k.drawEllipse({ radiusX: 22, radiusY: 30, pos: k.vec2(FX - FHW + 14, FY + 5),
    color: skinDark, opacity: 0.1 });
  // Right cheek shadow
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

  // ── Outline — the characteristic anime face silhouette ───────────────────
  // Top dome arc (left half: 180° → 90°, right half: 90° → 0°)
  const ARC_SEGS = 20;
  for (let i = 0; i < ARC_SEGS; i++) {
    const a0 = Math.PI - (i / ARC_SEGS) * Math.PI;
    const a1 = Math.PI - ((i + 1) / ARC_SEGS) * Math.PI;
    k.drawLine({
      p1: k.vec2(FX + Math.cos(a0) * FHW, FY + Math.sin(a0) * FHH),
      p2: k.vec2(FX + Math.cos(a1) * FHW, FY + Math.sin(a1) * FHH),
      width: 2.5,
      color: k.rgb(200, 155, 125),
      opacity: 0.5,
    });
  }

  // Left jaw line: from top-left cheek (FX - FHW, FY) → jaw corner → chin tip
  k.drawLine({
    p1: k.vec2(FX - CBW, CBY),
    p2: k.vec2(JAW_LX,   JAW_LY),
    width: 2.2,
    color: k.rgb(200, 155, 125),
    opacity: 0.55,
  });
  k.drawLine({
    p1: k.vec2(JAW_LX,  JAW_LY),
    p2: k.vec2(CHIN_X,  CHIN_Y),
    width: 2.0,
    color: k.rgb(200, 155, 125),
    opacity: 0.5,
  });

  // Right jaw line
  k.drawLine({
    p1: k.vec2(FX + CBW, CBY),
    p2: k.vec2(JAW_RX,   JAW_RY),
    width: 2.2,
    color: k.rgb(200, 155, 125),
    opacity: 0.55,
  });
  k.drawLine({
    p1: k.vec2(JAW_RX,  JAW_RY),
    p2: k.vec2(CHIN_X,  CHIN_Y),
    width: 2.0,
    color: k.rgb(200, 155, 125),
    opacity: 0.5,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EYES — large anime-style with big iris
// ─────────────────────────────────────────────────────────────────────────────
function drawEyeballs(k: K, curEH: number) {
  // Whites
  k.drawEllipse({ radiusX: EW, radiusY: curEH, pos: k.vec2(ELX, ELY), color: k.rgb(255, 255, 255) });
  k.drawEllipse({ radiusX: EW, radiusY: curEH, pos: k.vec2(ERX, ERY), color: k.rgb(255, 255, 255) });

  if (curEH > 2) {
    // Large iris — anime eyes have huge irises relative to the white
    const irisR = Math.min(curEH - 1, 13);
    k.drawCircle({ pos: k.vec2(ELX, ELY), radius: irisR, color: k.rgb(60, 110, 200) });
    k.drawCircle({ pos: k.vec2(ERX, ERY), radius: irisR, color: k.rgb(60, 110, 200) });
    // Iris depth ring
    k.drawCircle({ pos: k.vec2(ELX, ELY), radius: irisR, color: k.rgb(20, 50, 140), opacity: 0.45 });
    k.drawCircle({ pos: k.vec2(ERX, ERY), radius: irisR, color: k.rgb(20, 50, 140), opacity: 0.45 });
    // Pupil
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
    k.drawLine({
      p1: k.vec2(ex + Math.cos(a0) * ew, ey + Math.sin(a0) * eh),
      p2: k.vec2(ex + Math.cos(a1) * ew, ey + Math.sin(a1) * eh),
      width: 2.8, color: k.rgb(10, 5, 5),
    });
  }
  for (let i = 0; i < SEGS; i++) {
    const a0 = (i / SEGS) * Math.PI;
    const a1 = ((i + 1) / SEGS) * Math.PI;
    k.drawLine({
      p1: k.vec2(ex + Math.cos(a0) * ew, ey + Math.sin(a0) * eh),
      p2: k.vec2(ex + Math.cos(a1) * ew, ey + Math.sin(a1) * eh),
      width: 1.2, color: k.rgb(10, 5, 5), opacity: 0.65,
    });
  }
  // Wing flick
  k.drawLine({
    p1: k.vec2(ex + ew, ey),
    p2: k.vec2(ex + ew + 9, ey - eh),
    width: 2.2, color: k.rgb(10, 5, 5),
  });
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
    k.drawLine({
      p1: k.vec2(rootX, rootY),
      p2: k.vec2(rootX + Math.cos(lashAngle) * BASE_LEN, rootY + Math.sin(lashAngle) * BASE_LEN),
      width: 2.2, color: k.rgb(8, 5, 5),
    });
  }
  // Lower lashes
  for (let i = 0; i < 7; i++) {
    const t = i / 6 - 0.5;
    const arcAngle = t * Math.PI;
    const rootX = ex + Math.cos(arcAngle) * ew;
    const rootY = ey + Math.sin(arcAngle) * eh;
    const nx = Math.cos(arcAngle) / ew;
    const ny = Math.sin(arcAngle) / eh;
    const nLen = Math.sqrt(nx * nx + ny * ny);
    const normalAngle = Math.atan2(ny / nLen, nx / nLen);
    k.drawLine({
      p1: k.vec2(rootX, rootY),
      p2: k.vec2(rootX + Math.cos(normalAngle) * 7, rootY + Math.sin(normalAngle) * 7),
      width: 1.4, color: k.rgb(8, 5, 5), opacity: 0.7,
    });
  }
}

// ── Thin arched anime brow ───────────────────────────────────────────────────
function drawBrow(k: K, ex: number, ey: number, flip: boolean) {
  const dir = flip ? 1 : -1;
  // Anime brows: thin, high-arched, slightly tapered
  const x0 = ex + dir * 24, y0 = ey - 22;
  const x1 = ex + dir * 4,  y1 = ey - 30;
  const x2 = ex - dir * 20, y2 = ey - 24;
  k.drawLine({ p1: k.vec2(x0, y0), p2: k.vec2(x1, y1), width: 3.5, color: k.rgb(50, 25, 8) });
  k.drawLine({ p1: k.vec2(x1, y1), p2: k.vec2(x2, y2), width: 2.5, color: k.rgb(50, 25, 8) });
}

// ── Tiny anime nose ──────────────────────────────────────────────────────────
function drawNose(k: K, nx: number, ny: number) {
  // Anime noses are minimal — just two tiny nostril dots and a faint bridge line
  k.drawLine({ p1: k.vec2(nx - 6, ny + 8), p2: k.vec2(nx + 6, ny + 8),
    width: 1.5, color: k.rgb(195, 145, 110), opacity: 0.4 });
  k.drawCircle({ pos: k.vec2(nx - 7, ny + 10), radius: 2.5, color: k.rgb(195, 145, 110), opacity: 0.5 });
  k.drawCircle({ pos: k.vec2(nx + 7, ny + 10), radius: 2.5, color: k.rgb(195, 145, 110), opacity: 0.5 });
}

// ── Lips ─────────────────────────────────────────────────────────────────────
function drawLips(k: K, lipDone: boolean) {
  const lipBase = lipDone ? k.rgb(215, 35, 80)   : k.rgb(200, 130, 110);
  const lipDark = lipDone ? k.rgb(160, 20, 55)   : k.rgb(170, 100, 85);
  const lipHi   = lipDone ? k.rgb(255, 120, 150) : k.rgb(230, 170, 150);

  k.drawEllipse({ radiusX: MW,        radiusY: MH,       pos: k.vec2(MX, MY + 5),      color: lipBase });
  k.drawEllipse({ radiusX: MW * 0.5,  radiusY: MH * 0.8, pos: k.vec2(MX - 12, MY - 4), color: lipBase });
  k.drawEllipse({ radiusX: MW * 0.5,  radiusY: MH * 0.8, pos: k.vec2(MX + 12, MY - 4), color: lipBase });
  k.drawLine({ p1: k.vec2(MX - 4, MY - 3), p2: k.vec2(MX + 4, MY - 3), width: 1.8, color: lipDark, opacity: 0.5 });
  k.drawLine({ p1: k.vec2(MX - MW + 2, MY + 2), p2: k.vec2(MX + MW - 2, MY + 2), width: 1.4, color: lipDark, opacity: 0.55 });
  k.drawEllipse({ radiusX: 9, radiusY: 4, pos: k.vec2(MX, MY + 4), color: lipHi, opacity: 0.45 });
}

// ── Tap hint overlays ────────────────────────────────────────────────────────
function drawHint(k: K, s: string, pulse: number) {
  // Pulse the whole face outline
  k.drawEllipse({ radiusX: FHW + 14, radiusY: FHH + 14, pos: k.vec2(FX, FY),
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
    pos: k.vec2(FX, CHIN_Y + 22), anchor: "center", color: k.rgb(180, 40, 100) });
}

// ─────────────────────────────────────────────────────────────────────────────
// HAIR — strand helper + back / front layers
// ─────────────────────────────────────────────────────────────────────────────
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
  k.drawEllipse({ radiusX: FHW + 18, radiusY: FHH * 0.75,
    pos: k.vec2(FX, FY - FHH * 0.38), color: k.rgb(...H_ROOT) });

  // Long flowing body behind face
  k.drawEllipse({ radiusX: 56, radiusY: FHH * 1.6, pos: k.vec2(FX - FHW + 8,  FY + 28), color: k.rgb(...H_ROOT) });
  k.drawEllipse({ radiusX: 40, radiusY: FHH * 1.5, pos: k.vec2(FX - FHW + 4,  FY + 28), color: k.rgb(...H_MID), opacity: 0.7 });
  k.drawEllipse({ radiusX: 56, radiusY: FHH * 1.6, pos: k.vec2(FX + FHW - 8,  FY + 28), color: k.rgb(...H_ROOT) });
  k.drawEllipse({ radiusX: 40, radiusY: FHH * 1.5, pos: k.vec2(FX + FHW - 4,  FY + 28), color: k.rgb(...H_MID), opacity: 0.7 });
  k.drawEllipse({ radiusX: FHW + 10, radiusY: FHH * 1.75, pos: k.vec2(FX, FY + 38), color: k.rgb(...H_ROOT) });

  // Back strands — left
  const leftBack: [number, number, number, number, number, [number,number,number], number][] = [
    [FX - FHW - 12, FY - 65,  FX - FHW - 28, FY + 175, -16, H_ROOT,  1.0],
    [FX - FHW - 2,  FY - 75,  FX - FHW - 18, FY + 195, -12, H_MID,   0.9],
    [FX - FHW + 10, FY - 82,  FX - FHW - 8,  FY + 205,  -8, H_MID,   0.85],
    [FX - FHW + 22, FY - 84,  FX - FHW + 2,  FY + 198,  -4, H_LIGHT, 0.7],
    [FX - FHW - 16, FY - 50,  FX - FHW - 32, FY + 155, -18, H_ROOT,  0.9],
  ];
  for (const [x0, y0, x1, y1, bulge, col, op] of leftBack)
    drawStrand(k, x0, y0, x1, y1, bulge, 5, col, op);

  // Back strands — right
  const rightBack: [number, number, number, number, number, [number,number,number], number][] = [
    [FX + FHW + 12, FY - 65,  FX + FHW + 28, FY + 175,  16, H_ROOT,  1.0],
    [FX + FHW + 2,  FY - 75,  FX + FHW + 18, FY + 195,  12, H_MID,   0.9],
    [FX + FHW - 10, FY - 82,  FX + FHW + 8,  FY + 205,   8, H_MID,   0.85],
    [FX + FHW - 22, FY - 84,  FX + FHW - 2,  FY + 198,   4, H_LIGHT, 0.7],
    [FX + FHW + 16, FY - 50,  FX + FHW + 32, FY + 155,  18, H_ROOT,  0.9],
  ];
  for (const [x0, y0, x1, y1, bulge, col, op] of rightBack)
    drawStrand(k, x0, y0, x1, y1, bulge, 5, col, op);

  // Shine
  drawStrand(k, FX - 10, FY - FHH * 0.88, FX - 16, FY + 135, -8, 3, H_SHINE, 0.5);
  drawStrand(k, FX + 10, FY - FHH * 0.88, FX + 16, FY + 135,  8, 3, H_SHINE, 0.4);
}

function drawHairFront(k: K) {
  // Side panels overlapping face edges
  const leftPanel: [number, number, number, number, number, number, [number,number,number], number][] = [
    [FX - 18, FY - FHH + 2,  FX - FHW - 6,  FY + 48,  -6,  14, H_ROOT,  1.0],
    [FX - 26, FY - FHH + 4,  FX - FHW - 10, FY + 58,  -8,  12, H_MID,   0.9],
    [FX - 34, FY - FHH + 6,  FX - FHW - 14, FY + 52,  -9,  10, H_MID,   0.85],
    [FX - 42, FY - FHH + 8,  FX - FHW - 16, FY + 46, -10,   9, H_ROOT,  0.8],
    [FX - 50, FY - FHH + 10, FX - FHW - 18, FY + 40, -11,   8, H_ROOT,  0.75],
    [FX - 30, FY - FHH + 5,  FX - FHW - 8,  FY + 50,  -7,   4, H_LIGHT, 0.45],
  ];
  for (const [x0, y0, x1, y1, bulge, w, col, op] of leftPanel)
    drawStrand(k, x0, y0, x1, y1, bulge, w, col, op);

  const rightPanel: [number, number, number, number, number, number, [number,number,number], number][] = [
    [FX + 18, FY - FHH + 2,  FX + FHW + 6,  FY + 48,   6,  14, H_ROOT,  1.0],
    [FX + 26, FY - FHH + 4,  FX + FHW + 10, FY + 58,   8,  12, H_MID,   0.9],
    [FX + 34, FY - FHH + 6,  FX + FHW + 14, FY + 52,   9,  10, H_MID,   0.85],
    [FX + 42, FY - FHH + 8,  FX + FHW + 16, FY + 46,  10,   9, H_ROOT,  0.8],
    [FX + 50, FY - FHH + 10, FX + FHW + 18, FY + 40,  11,   8, H_ROOT,  0.75],
    [FX + 30, FY - FHH + 5,  FX + FHW + 8,  FY + 50,   7,   4, H_LIGHT, 0.45],
  ];
  for (const [x0, y0, x1, y1, bulge, w, col, op] of rightPanel)
    drawStrand(k, x0, y0, x1, y1, bulge, w, col, op);

  // Scalp top + centre part
  k.drawEllipse({ radiusX: FHW + 12, radiusY: 26,
    pos: k.vec2(FX, FY - FHH + 4), color: k.rgb(...H_ROOT) });
  k.drawLine({
    p1: k.vec2(FX, FY - FHH - 2),
    p2: k.vec2(FX, FY - FHH + 30),
    width: 3, color: k.rgb(...SKIN_DARK), opacity: 0.4,
  });

  // ── BANGS — sweep left across forehead ────────────────────────────────────
  const BANG_ROOT_Y = FY - FHH + 10;
  const BROW_Y      = ELY - 22;

  const bangs: [number, number, number, number, number, number, [number,number,number], number][] = [
    [FX + 12, BANG_ROOT_Y, FX - 18,  BROW_Y + 4,  13, 13, H_ROOT,  1.0],
    [FX + 7,  BANG_ROOT_Y, FX - 30,  BROW_Y + 2,  15, 12, H_ROOT,  1.0],
    [FX + 2,  BANG_ROOT_Y, FX - 42,  BROW_Y,      16, 11, H_MID,   0.95],
    [FX - 4,  BANG_ROOT_Y, FX - 54,  BROW_Y - 1,  15, 10, H_MID,   0.9],
    [FX - 10, BANG_ROOT_Y, FX - 64,  BROW_Y - 2,  13,  9, H_MID,   0.85],
    [FX - 16, BANG_ROOT_Y, FX - 72,  BROW_Y,      11,  8, H_ROOT,  0.8],
    [FX - 22, BANG_ROOT_Y, FX - 78,  BROW_Y + 3,   9,  7, H_ROOT,  0.75],
    [FX - 28, BANG_ROOT_Y, FX - 82,  BROW_Y + 6,   7,  6, H_MID,   0.65],
    [FX - 34, BANG_ROOT_Y, FX - 84,  BROW_Y + 10,  5,  5, H_MID,   0.55],
    // highlight through bangs
    [FX + 4,  BANG_ROOT_Y, FX - 48,  BROW_Y + 1,  15,  3, H_LIGHT, 0.4],
    [FX,      BANG_ROOT_Y, FX - 36,  BROW_Y,      14,  2, H_SHINE, 0.28],
  ];
  for (const [x0, y0, x1, y1, bulge, w, col, op] of bangs)
    drawStrand(k, x0, y0, x1, y1, bulge, w, col, op);

  // ── FRINGE — shorter, fuller curtain just at the hairline ─────────────────
  // Sits just above the bangs, denser, covering the very top of the forehead
  const FRINGE_Y = FY - FHH + 6;
  const FRINGE_END_Y = FY - FHH + 38; // ends partway down forehead

  const fringe: [number, number, number, number, number, number, [number,number,number], number][] = [
    // centre fringe strands
    [FX - 6,  FRINGE_Y, FX - 8,   FRINGE_END_Y,  2, 10, H_ROOT,  1.0],
    [FX + 6,  FRINGE_Y, FX + 4,   FRINGE_END_Y,  -2, 10, H_ROOT, 1.0],
    [FX - 18, FRINGE_Y, FX - 22,  FRINGE_END_Y,   4,  9, H_MID,  0.95],
    [FX + 18, FRINGE_Y, FX + 22,  FRINGE_END_Y,  -4,  9, H_MID,  0.95],
    [FX - 30, FRINGE_Y, FX - 36,  FRINGE_END_Y,   6,  8, H_MID,  0.9],
    [FX + 30, FRINGE_Y, FX + 36,  FRINGE_END_Y,  -6,  8, H_MID,  0.9],
    [FX - 42, FRINGE_Y, FX - 50,  FRINGE_END_Y,   8,  7, H_ROOT, 0.85],
    [FX + 42, FRINGE_Y, FX + 50,  FRINGE_END_Y,  -8,  7, H_ROOT, 0.85],
    [FX - 54, FRINGE_Y, FX - 62,  FRINGE_END_Y,  10,  6, H_ROOT, 0.75],
    [FX + 54, FRINGE_Y, FX + 62,  FRINGE_END_Y, -10,  6, H_ROOT, 0.75],
    // fringe highlight
    [FX - 2,  FRINGE_Y, FX - 4,   FRINGE_END_Y,   1,  3, H_SHINE, 0.35],
    [FX + 2,  FRINGE_Y, FX + 4,   FRINGE_END_Y,  -1,  3, H_SHINE, 0.35],
  ];
  for (const [x0, y0, x1, y1, bulge, w, col, op] of fringe)
    drawStrand(k, x0, y0, x1, y1, bulge, w, col, op);
}
