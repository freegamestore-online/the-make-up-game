import kaplay from "kaplay";

type K = ReturnType<typeof kaplay>;

const VW = 400;
const VH = 680;

// ── Culture definitions ───────────────────────────────────────────────────────
interface Culture {
  id: string;
  label: string;
  flag: string;
  skin:      [number, number, number];
  skinDark:  [number, number, number];
  hairRoot:  [number, number, number];
  hairMid:   [number, number, number];
  hairLight: [number, number, number];
  hairShine: [number, number, number];
  irisColor: [number, number, number];
  bgColor:   [number, number, number];
  cardColor: [number, number, number];
}

const CULTURES: Culture[] = [
  {
    id: "chinese", label: "Chinese", flag: "🇨🇳",
    skin:      [255, 235, 200],
    skinDark:  [220, 190, 155],
    hairRoot:  [ 10,   8,   8],
    hairMid:   [ 25,  20,  18],
    hairLight: [ 55,  45,  38],
    hairShine: [100,  85,  70],
    irisColor: [ 20,  15,  10],
    bgColor:   [255, 235, 235],
    cardColor: [255, 200, 200],
  },
  {
    id: "indian", label: "Indian", flag: "🇮🇳",
    skin:      [180, 110,  70],
    skinDark:  [140,  80,  45],
    hairRoot:  [  8,   5,   3],
    hairMid:   [ 20,  12,   6],
    hairLight: [ 45,  28,  12],
    hairShine: [ 80,  55,  25],
    irisColor: [ 15,  10,   5],
    bgColor:   [255, 240, 220],
    cardColor: [255, 210, 170],
  },
  {
    id: "russian", label: "Russian", flag: "🇷🇺",
    skin:      [245, 220, 200],
    skinDark:  [215, 185, 165],
    hairRoot:  [100,  70,  40],
    hairMid:   [145, 105,  60],
    hairLight: [185, 145,  90],
    hairShine: [220, 190, 140],
    irisColor: [110,  80,  50],
    bgColor:   [235, 240, 255],
    cardColor: [200, 215, 255],
  },
];

// ── Face geometry (fixed) ─────────────────────────────────────────────────────
const FX  = VW / 2;
const FY  = 300;
const FHW = 88;
const FHH = 78;
const CBW = 84;
const CBY = FY + 10;
const CHIN_X = FX;
const CHIN_Y = FY + 100;
const CHIN_W = 18;
const JAW_LX = FX - 68, JAW_LY = FY + 58;
const JAW_RX = FX + 68, JAW_RY = FY + 58;
const ELX = FX - 34, ELY = FY - 10;
const ERX = FX + 34, ERY = FY - 10;
const EW  = 22, EH = 16;
const CLX = FX - 60, CLY = FY + 30;
const CRX = FX + 60, CRY = FY + 30;
const CR  = 20;
const MX = FX, MY = FY + 74;
const MW = 28, MH = 11;
const NX = FX, NY = FY + 36;
const BTN_Y = VH - 82;
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
function blinkFactor(t: number): number { return Math.sin((t / BLINK_DURATION) * Math.PI); }

interface Confetti {
  x: number; y: number; vx: number; vy: number;
  color: [number, number, number]; angle: number; av: number; life: number;
}

// ─────────────────────────────────────────────────────────────────────────────
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

  // Currently selected culture (set on picker screen)
  let culture: Culture = CULTURES[0]!;

  // ── PICKER SCENE ────────────────────────────────────────────────────────────
  k.scene("picker", () => {
    onScore(0);

    k.onDraw(() => {
      const t0 = k.time();
      const bg = culture.bgColor;

      // Gradient-ish background
      k.drawRect({ pos: k.vec2(0, 0), width: VW, height: VH, color: k.rgb(...bg) });

      // Floating sparkles
      for (let i = 0; i < 8; i++) {
        const bx = 20 + (i * 55) % (VW - 20);
        const by = 40 + Math.sin(t0 * 0.7 + i * 0.9) * 14;
        k.drawText({ text: i % 3 === 0 ? "✨" : i % 3 === 1 ? "💄" : "💕",
          size: 20, pos: k.vec2(bx, by), anchor: "center", opacity: 0.22 });
      }

      // Title
      k.drawText({
        text: "💄 Make-up Studio",
        size: 26,
        pos: k.vec2(VW / 2, 60),
        anchor: "center",
        color: k.rgb(200, 40, 110),
      });
      k.drawText({
        text: "Choose your model",
        size: 16,
        pos: k.vec2(VW / 2, 100),
        anchor: "center",
        color: k.rgb(150, 60, 110),
      });

      // Culture cards
      const CARD_W = 100, CARD_H = 180;
      const GAP    = 16;
      const TOTAL  = CULTURES.length * CARD_W + (CULTURES.length - 1) * GAP;
      const STARTX = (VW - TOTAL) / 2;
      const CARDY  = 145;

      for (let ci = 0; ci < CULTURES.length; ci++) {
        const c   = CULTURES[ci]!;
        const cx  = STARTX + ci * (CARD_W + GAP);
        const sel = culture.id === c.id;

        // Card shadow
        k.drawRect({ pos: k.vec2(cx + 3, CARDY + 4), width: CARD_W, height: CARD_H,
          radius: 18, color: k.rgb(180, 120, 160), opacity: 0.18 });

        // Card bg
        const pulse = sel ? 0.08 * Math.sin(t0 * 4) : 0;
        k.drawRect({ pos: k.vec2(cx, CARDY), width: CARD_W, height: CARD_H,
          radius: 18,
          color: sel ? k.rgb(...c.cardColor) : k.rgb(255, 248, 252),
          opacity: 1 - pulse });

        // Selected border glow
        if (sel) {
          for (let b = 3; b >= 1; b--) {
            k.drawRect({ pos: k.vec2(cx - b, CARDY - b), width: CARD_W + b * 2, height: CARD_H + b * 2,
              radius: 20, color: k.rgb(220, 60, 130), opacity: 0.12 * b });
          }
          k.drawRect({ pos: k.vec2(cx - 2, CARDY - 2), width: CARD_W + 4, height: CARD_H + 4,
            radius: 20, color: k.rgb(220, 60, 130), opacity: 0.7 });
          k.drawRect({ pos: k.vec2(cx, CARDY), width: CARD_W, height: CARD_H,
            radius: 18, color: sel ? k.rgb(...c.cardColor) : k.rgb(255, 248, 252) });
        }

        // Mini face preview
        const faceCX = cx + CARD_W / 2;
        const faceCY = CARDY + 68;
        drawMiniface(k, c, faceCX, faceCY);

        // Flag
        k.drawText({ text: c.flag, size: 22,
          pos: k.vec2(faceCX, CARDY + CARD_H - 46), anchor: "center" });

        // Label
        k.drawText({ text: c.label, size: 13,
          pos: k.vec2(faceCX, CARDY + CARD_H - 20), anchor: "center",
          color: sel ? k.rgb(200, 40, 110) : k.rgb(130, 70, 100) });
      }

      // Start button
      const BTNW = 200, BTNH = 52;
      const BTNX = VW / 2 - BTNW / 2;
      const BTNY = CARDY + CARD_H + 32;
      const bpulse = 0.06 * Math.sin(t0 * 3);
      k.drawRect({ pos: k.vec2(BTNX - 3, BTNY + 3), width: BTNW + 6, height: BTNH + 6,
        radius: 28, color: k.rgb(180, 30, 90), opacity: 0.25 });
      k.drawRect({ pos: k.vec2(BTNX, BTNY), width: BTNW, height: BTNH,
        radius: 26, color: k.rgb(220, 60, 130), opacity: 1 - bpulse });
      k.drawText({ text: "Start ✨", size: 20,
        pos: k.vec2(VW / 2, BTNY + BTNH / 2), anchor: "center",
        color: k.rgb(255, 255, 255) });

      // Tagline
      k.drawText({ text: "Tap a card to choose, then Start!",
        size: 12, pos: k.vec2(VW / 2, BTNY + BTNH + 20),
        anchor: "center", color: k.rgb(180, 100, 140) });
    });

    function handlePickerTap(x: number, y: number) {
      const CARD_W = 100, CARD_H = 180, GAP = 16;
      const TOTAL  = CULTURES.length * CARD_W + (CULTURES.length - 1) * GAP;
      const STARTX = (VW - TOTAL) / 2;
      const CARDY  = 145;

      // Check culture cards
      for (let ci = 0; ci < CULTURES.length; ci++) {
        const cx = STARTX + ci * (CARD_W + GAP);
        if (x >= cx && x <= cx + CARD_W && y >= CARDY && y <= CARDY + CARD_H) {
          culture = CULTURES[ci]!;
          return;
        }
      }

      // Check start button
      const BTNW = 200, BTNH = 52;
      const BTNX = VW / 2 - BTNW / 2;
      const BTNY = CARDY + CARD_H + 32;
      if (x >= BTNX && x <= BTNX + BTNW && y >= BTNY && y <= BTNY + BTNH) {
        k.go("main");
      }
    }

    k.onMousePress((_btn) => { const mp = k.mousePos(); handlePickerTap(mp.x, mp.y); });
    k.onTouchStart((t)    => { handlePickerTap(t.x, t.y); });
  });

  // ── MAIN GAME SCENE ─────────────────────────────────────────────────────────
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

    const bg = culture.bgColor;
    k.add([k.rect(VW, VH), k.color(...bg), k.pos(0, 0), k.z(-10)]);

    // Instruction bar
    k.add([k.rect(VW, 72), k.color(240, 160, 200), k.pos(0, 0), k.fixed(), k.z(10)]);
    const emojiLbl = k.add([k.text("", { size: 28 }), k.anchor("center"), k.pos(30, 36), k.fixed(), k.z(11)]);
    const instrLbl = k.add([k.text("", { size: 14, width: VW - 72, align: "left" }), k.color(100, 10, 60), k.pos(60, 14), k.fixed(), k.z(11)]);

    // Progress bar track
    k.add([k.rect(VW - 40, 9, { radius: 5 }), k.color(220, 175, 200), k.pos(20, VH - 18), k.fixed(), k.z(10)]);
    const progBar     = k.add([k.rect(2, 9, { radius: 5 }), k.color(220, 60, 130), k.pos(20, VH - 18), k.fixed(), k.z(11)]);
    const stepCounter = k.add([k.text("", { size: 13 }), k.color(160, 60, 110), k.anchor("right"), k.pos(VW - 22, VH - 38), k.fixed(), k.z(11)]);

    let showingNext    = false;
    let showingRestart = false;

    const BTNW = 180, BTNH = 48;
    const BTNX = VW / 2 - BTNW / 2;
    const BTNY = VH - 74;

    // Back button (top-left of instruction bar)
    const BACKW = 52, BACKH = 36, BACKX = 4, BACKY = 18;

    function inButton(x: number, y: number): boolean {
      return x >= BTNX && x <= BTNX + BTNW && y >= BTNY && y <= BTNY + BTNH;
    }
    function inBack(x: number, y: number): boolean {
      return x >= BACKX && x <= BACKX + BACKW && y >= BACKY && y <= BACKY + BACKH;
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
      // Back button always available
      if (inBack(x, y)) { k.go("picker"); return; }

      if (y >= BTN_Y) {
        if (showingNext    && inButton(x, y)) { advanceStep(); return; }
        if (showingRestart && inButton(x, y)) { k.go("picker"); return; }
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

      // Dress / shoulders
      k.drawEllipse({ radiusX: 110, radiusY: 55, pos: k.vec2(FX, CHIN_Y + 55), color: k.rgb(230, 100, 160) });
      k.drawEllipse({ radiusX: 95,  radiusY: 42, pos: k.vec2(FX, CHIN_Y + 51), color: k.rgb(245, 140, 185) });

      // Neck
      k.drawRect({ pos: k.vec2(FX - 16, CHIN_Y - 8), width: 32, height: 65, color: k.rgb(...culture.skin) });
      k.drawRect({ pos: k.vec2(FX - 16, CHIN_Y - 8), width: 6,  height: 60, color: k.rgb(...culture.skinDark), opacity: 0.3 });
      k.drawRect({ pos: k.vec2(FX + 10, CHIN_Y - 8), width: 6,  height: 60, color: k.rgb(...culture.skinDark), opacity: 0.3 });

      // Earrings
      k.drawCircle({ pos: k.vec2(FX - CBW - 4, FY + 8), radius: 6, color: k.rgb(255, 215, 0) });
      k.drawCircle({ pos: k.vec2(FX - CBW - 4, FY + 8), radius: 3, color: k.rgb(255, 160, 50) });
      k.drawCircle({ pos: k.vec2(FX + CBW + 4, FY + 8), radius: 6, color: k.rgb(255, 215, 0) });
      k.drawCircle({ pos: k.vec2(FX + CBW + 4, FY + 8), radius: 3, color: k.rgb(255, 160, 50) });
      k.drawLine({ p1: k.vec2(FX - CBW - 4, FY + 14), p2: k.vec2(FX - CBW - 4, FY + 26), width: 2, color: k.rgb(255, 215, 0) });
      k.drawLine({ p1: k.vec2(FX + CBW + 4, FY + 14), p2: k.vec2(FX + CBW + 4, FY + 26), width: 2, color: k.rgb(255, 215, 0) });
      k.drawCircle({ pos: k.vec2(FX - CBW - 4, FY + 30), radius: 5, color: k.rgb(255, 100, 180) });
      k.drawCircle({ pos: k.vec2(FX + CBW + 4, FY + 30), radius: 5, color: k.rgb(255, 100, 180) });

      // Hair back
      drawHairBack(k, culture);

      // Face
      drawAnimeFace(k, foundDone, culture);

      // Eyebrows
      drawBrow(k, ELX, ELY, false, culture);
      drawBrow(k, ERX, ERY, true,  culture);

      // Eye shadow
      if (shadowDone) {
        k.drawEllipse({ radiusX: EW + 8, radiusY: EH + 9, pos: k.vec2(ELX, ELY - 2), color: k.rgb(120, 60, 190), opacity: 0.55 });
        k.drawEllipse({ radiusX: EW + 8, radiusY: EH + 9, pos: k.vec2(ERX, ERY - 2), color: k.rgb(120, 60, 190), opacity: 0.55 });
        k.drawEllipse({ radiusX: EW + 3, radiusY: EH + 4, pos: k.vec2(ELX, ELY),     color: k.rgb(200, 150, 255), opacity: 0.4 });
        k.drawEllipse({ radiusX: EW + 3, radiusY: EH + 4, pos: k.vec2(ERX, ERY),     color: k.rgb(200, 150, 255), opacity: 0.4 });
      }

      // Eyes
      drawEyeballs(k, curEH, culture);

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
        k.drawEllipse({ radiusX: EW + 1, radiusY: curEH + 1, pos: k.vec2(ELX, ELY), color: k.rgb(...culture.skin) });
        k.drawEllipse({ radiusX: EW + 1, radiusY: curEH + 1, pos: k.vec2(ERX, ERY), color: k.rgb(...culture.skin) });
        k.drawLine({ p1: k.vec2(ELX - EW, ELY), p2: k.vec2(ELX + EW, ELY), width: 2, color: k.rgb(...culture.skinDark), opacity: 0.5 });
        k.drawLine({ p1: k.vec2(ERX - EW, ERY), p2: k.vec2(ERX + EW, ERY), width: 2, color: k.rgb(...culture.skinDark), opacity: 0.5 });
      }

      // Nose
      drawNose(k, NX, NY, culture);

      // Blush
      if (blushDone) {
        k.drawCircle({ pos: k.vec2(CLX, CLY), radius: CR + 8, color: k.rgb(255, 120, 160), opacity: 0.25 });
        k.drawCircle({ pos: k.vec2(CRX, CRY), radius: CR + 8, color: k.rgb(255, 120, 160), opacity: 0.25 });
        k.drawCircle({ pos: k.vec2(CLX, CLY), radius: CR,     color: k.rgb(255, 140, 170), opacity: 0.45 });
        k.drawCircle({ pos: k.vec2(CRX, CRY), radius: CR,     color: k.rgb(255, 140, 170), opacity: 0.45 });
      }

      // Lips
      drawLips(k, lipDone);

      // Hair front
      drawHairFront(k, culture);

      // Back button overlay (drawn on top of instruction bar)
      k.drawRect({ pos: k.vec2(BACKX, BACKY), width: BACKW, height: BACKH,
        radius: 10, color: k.rgb(255, 255, 255), opacity: 0.35 });
      k.drawText({ text: "← Back", size: 11,
        pos: k.vec2(BACKX + BACKW / 2, BACKY + BACKH / 2),
        anchor: "center", color: k.rgb(120, 20, 70) });

      // Culture flag badge
      k.drawText({ text: culture.flag, size: 18,
        pos: k.vec2(VW - 24, 20), anchor: "center" });

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
        const btnLabel = showingNext ? "Next Step  ➜" : "Back to Menu 🏠";
        k.drawRect({ pos: k.vec2(BTNX, BTNY), width: BTNW, height: BTNH, radius: 24, color: btnColor });
        k.drawText({ text: btnLabel, size: 15,
          pos: k.vec2(VW / 2, BTNY + BTNH / 2), anchor: "center", color: k.rgb(255, 255, 255) });
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
        k.drawText({ text: "✨ GORGEOUS! ✨", size: 30,
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

  k.go("picker");
  return () => k.quit();
}

// ─────────────────────────────────────────────────────────────────────────────
// MINI FACE — drawn on the picker cards
// ─────────────────────────────────────────────────────────────────────────────
function drawMiniface(k: K, c: Culture, cx: number, cy: number) {
  const S = 0.38; // scale factor
  const fw = FHW * S, fh = FHH * S;
  const cbw = CBW * S, cby = cy + 10 * S;
  const chinY = cy + 100 * S, chinW = CHIN_W * S;

  // Hair back
  k.drawEllipse({ radiusX: fw + 5, radiusY: fh + 20,
    pos: k.vec2(cx, cy - 4), color: k.rgb(...c.hairMid) });

  // Face dome
  k.drawEllipse({ radiusX: fw, radiusY: fh, pos: k.vec2(cx, cy), color: k.rgb(...c.skin) });

  // Jaw scanlines (mini)
  const SCAN = 16;
  for (let i = 0; i <= SCAN; i++) {
    const t  = i / SCAN;
    const y  = cby + (chinY - cby) * t;
    const ease = 1 - t * t * (2 - t);
    const hw = chinW + (cbw - chinW) * ease;
    k.drawRect({ pos: k.vec2(cx - hw, y), width: hw * 2,
      height: (chinY - cby) / SCAN + 1.5, color: k.rgb(...c.skin) });
  }
  k.drawEllipse({ radiusX: chinW + 2, radiusY: 4,
    pos: k.vec2(cx, chinY), color: k.rgb(...c.skin) });

  // Hair bangs (front)
  k.drawEllipse({ radiusX: fw + 2, radiusY: 14,
    pos: k.vec2(cx, cy - fh + 6), color: k.rgb(...c.hairMid) });

  // Eyes (tiny)
  const elx = cx - 13, ery_y = cy - 4, erx = cx + 13;
  k.drawEllipse({ radiusX: 8, radiusY: 5, pos: k.vec2(elx, ery_y), color: k.rgb(255, 255, 255) });
  k.drawEllipse({ radiusX: 8, radiusY: 5, pos: k.vec2(erx, ery_y), color: k.rgb(255, 255, 255) });
  k.drawCircle({ pos: k.vec2(elx, ery_y), radius: 4, color: k.rgb(...c.irisColor) });
  k.drawCircle({ pos: k.vec2(erx, ery_y), radius: 4, color: k.rgb(...c.irisColor) });
  k.drawCircle({ pos: k.vec2(elx + 1, ery_y - 1), radius: 1.5, color: k.rgb(255, 255, 255) });
  k.drawCircle({ pos: k.vec2(erx + 1, ery_y - 1), radius: 1.5, color: k.rgb(255, 255, 255) });

  // Tiny lips
  k.drawEllipse({ radiusX: 9, radiusY: 4, pos: k.vec2(cx, cy + 28), color: k.rgb(210, 110, 100) });
}

// ─────────────────────────────────────────────────────────────────────────────
// FULL FACE
// ─────────────────────────────────────────────────────────────────────────────
function drawAnimeFace(k: K, foundDone: boolean, c: Culture) {
  const skinCol  = k.rgb(...c.skin);
  const skinDark = k.rgb(...c.skinDark);

  // Drop shadow
  k.drawEllipse({ radiusX: FHW + 6, radiusY: FHH + 4,
    pos: k.vec2(FX + 5, FY + 10), color: k.rgb(180, 130, 100), opacity: 0.15 });

  // Upper face dome
  k.drawEllipse({ radiusX: FHW, radiusY: FHH, pos: k.vec2(FX, FY), color: skinCol });

  // Lower jaw scanlines
  const SCAN_STEPS = 44;
  for (let i = 0; i <= SCAN_STEPS; i++) {
    const t    = i / SCAN_STEPS;
    const y    = CBY + (CHIN_Y - CBY) * t;
    const ease = 1 - t * t * (2 - t);
    const hw   = CHIN_W + (CBW - CHIN_W) * ease;
    k.drawRect({ pos: k.vec2(FX - hw, y), width: hw * 2,
      height: (CHIN_Y - CBY) / SCAN_STEPS + 1.5, color: skinCol });
  }
  k.drawEllipse({ radiusX: CHIN_W + 4, radiusY: 10,
    pos: k.vec2(CHIN_X, CHIN_Y), color: skinCol });

  // Shading
  k.drawEllipse({ radiusX: 22, radiusY: 30, pos: k.vec2(FX - FHW + 14, FY + 5),
    color: skinDark, opacity: 0.1 });
  k.drawEllipse({ radiusX: 22, radiusY: 30, pos: k.vec2(FX + FHW - 14, FY + 5),
    color: skinDark, opacity: 0.1 });
  k.drawEllipse({ radiusX: 34, radiusY: 18, pos: k.vec2(FX, FY - 52),
    color: k.rgb(255, 245, 235), opacity: 0.4 });

  if (foundDone) {
    k.drawEllipse({ radiusX: FHW - 4, radiusY: FHH - 4, pos: k.vec2(FX, FY),
      color: k.rgb(255, 225, 195), opacity: 0.22 });
    k.drawEllipse({ radiusX: 16, radiusY: 8, pos: k.vec2(FX - 44, FY - 8),
      color: k.rgb(255, 240, 220), opacity: 0.3 });
    k.drawEllipse({ radiusX: 16, radiusY: 8, pos: k.vec2(FX + 44, FY - 8),
      color: k.rgb(255, 240, 220), opacity: 0.3 });
  }

  // Outline
  const ARC_SEGS = 20;
  for (let i = 0; i < ARC_SEGS; i++) {
    const a0 = Math.PI - (i / ARC_SEGS) * Math.PI;
    const a1 = Math.PI - ((i + 1) / ARC_SEGS) * Math.PI;
    k.drawLine({ p1: k.vec2(FX + Math.cos(a0) * FHW, FY + Math.sin(a0) * FHH),
      p2: k.vec2(FX + Math.cos(a1) * FHW, FY + Math.sin(a1) * FHH),
      width: 2.5, color: k.rgb(180, 130, 100), opacity: 0.5 });
  }
  k.drawLine({ p1: k.vec2(FX - CBW, CBY), p2: k.vec2(JAW_LX, JAW_LY),
    width: 2.2, color: k.rgb(180, 130, 100), opacity: 0.55 });
  k.drawLine({ p1: k.vec2(JAW_LX, JAW_LY), p2: k.vec2(CHIN_X - CHIN_W, CHIN_Y),
    width: 2.0, color: k.rgb(180, 130, 100), opacity: 0.5 });
  k.drawLine({ p1: k.vec2(FX + CBW, CBY), p2: k.vec2(JAW_RX, JAW_RY),
    width: 2.2, color: k.rgb(180, 130, 100), opacity: 0.55 });
  k.drawLine({ p1: k.vec2(JAW_RX, JAW_RY), p2: k.vec2(CHIN_X + CHIN_W, CHIN_Y),
    width: 2.0, color: k.rgb(180, 130, 100), opacity: 0.5 });
  const CHIN_SEGS = 8;
  for (let i = 0; i < CHIN_SEGS; i++) {
    const a0 = Math.PI + (i / CHIN_SEGS) * Math.PI;
    const a1 = Math.PI + ((i + 1) / CHIN_SEGS) * Math.PI;
    k.drawLine({ p1: k.vec2(CHIN_X + Math.cos(a0) * (CHIN_W + 4), CHIN_Y + Math.sin(a0) * 10),
      p2: k.vec2(CHIN_X + Math.cos(a1) * (CHIN_W + 4), CHIN_Y + Math.sin(a1) * 10),
      width: 2.0, color: k.rgb(180, 130, 100), opacity: 0.45 });
  }
}

function drawEyeballs(k: K, curEH: number, c: Culture) {
  k.drawEllipse({ radiusX: EW, radiusY: curEH, pos: k.vec2(ELX, ELY), color: k.rgb(255, 255, 255) });
  k.drawEllipse({ radiusX: EW, radiusY: curEH, pos: k.vec2(ERX, ERY), color: k.rgb(255, 255, 255) });
  if (curEH > 2) {
    const irisR  = Math.min(curEH - 1, 13);
    const pupilR = Math.min(irisR * 0.5, 7);
    k.drawCircle({ pos: k.vec2(ELX, ELY), radius: irisR, color: k.rgb(...c.irisColor) });
    k.drawCircle({ pos: k.vec2(ERX, ERY), radius: irisR, color: k.rgb(...c.irisColor) });
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

function drawBrow(k: K, ex: number, ey: number, flip: boolean, c: Culture) {
  const dir = flip ? 1 : -1;
  const x0 = ex + dir * 24, y0 = ey - 22;
  const x1 = ex + dir * 4,  y1 = ey - 30;
  const x2 = ex - dir * 20, y2 = ey - 24;
  k.drawLine({ p1: k.vec2(x0, y0), p2: k.vec2(x1, y1), width: 3.5, color: k.rgb(...c.hairRoot) });
  k.drawLine({ p1: k.vec2(x1, y1), p2: k.vec2(x2, y2), width: 2.5, color: k.rgb(...c.hairRoot) });
}

function drawNose(k: K, nx: number, ny: number, c: Culture) {
  const sd = c.skinDark;
  k.drawLine({ p1: k.vec2(nx - 6, ny + 8), p2: k.vec2(nx, ny + 12), width: 1.6, color: k.rgb(...sd) });
  k.drawLine({ p1: k.vec2(nx + 6, ny + 8), p2: k.vec2(nx, ny + 12), width: 1.6, color: k.rgb(...sd) });
  k.drawCircle({ pos: k.vec2(nx, ny + 12), radius: 2.5, color: k.rgb(...sd), opacity: 0.5 });
}

function drawLips(k: K, lipDone: boolean) {
  const lipBase = lipDone ? k.rgb(215, 35, 80)   : k.rgb(200, 130, 110);
  const lipDark = lipDone ? k.rgb(160, 20, 55)   : k.rgb(170, 100, 85);
  const lipHi   = lipDone ? k.rgb(255, 120, 150) : k.rgb(230, 170, 155);
  // Lower lip
  k.drawEllipse({ radiusX: MW,     radiusY: MH,     pos: k.vec2(MX, MY + 3), color: lipBase });
  k.drawEllipse({ radiusX: MW - 4, radiusY: MH - 2, pos: k.vec2(MX, MY + 4), color: lipDark, opacity: 0.4 });
  // Upper lip
  k.drawEllipse({ radiusX: MW - 2, radiusY: MH - 3, pos: k.vec2(MX, MY - 2), color: lipBase });
  // Cupid's bow
  k.drawLine({ p1: k.vec2(MX - MW + 2, MY - 2), p2: k.vec2(MX, MY - MH + 2), width: 2, color: lipDark, opacity: 0.6 });
  k.drawLine({ p1: k.vec2(MX + MW - 2, MY - 2), p2: k.vec2(MX, MY - MH + 2), width: 2, color: lipDark, opacity: 0.6 });
  // Highlight
  k.drawEllipse({ radiusX: 10, radiusY: 3, pos: k.vec2(MX - 4, MY - 2), color: lipHi, opacity: 0.55 });
  // Centre line
  k.drawLine({ p1: k.vec2(MX - MW + 2, MY), p2: k.vec2(MX + MW - 2, MY), width: 1.2, color: lipDark, opacity: 0.5 });
}

function drawHairBack(k: K, c: Culture) {
  // Long flowing hair behind the face
  k.drawEllipse({ radiusX: FHW + 18, radiusY: FHH + 60,
    pos: k.vec2(FX, FY + 20), color: k.rgb(...c.hairRoot) });
  k.drawEllipse({ radiusX: FHW + 12, radiusY: FHH + 50,
    pos: k.vec2(FX, FY + 18), color: k.rgb(...c.hairMid) });
  // Side hair panels
  k.drawEllipse({ radiusX: 28, radiusY: 90,
    pos: k.vec2(FX - FHW - 8, FY + 30), color: k.rgb(...c.hairMid) });
  k.drawEllipse({ radiusX: 28, radiusY: 90,
    pos: k.vec2(FX + FHW + 8, FY + 30), color: k.rgb(...c.hairMid) });
  // Hair shine
  k.drawEllipse({ radiusX: 18, radiusY: 30,
    pos: k.vec2(FX - 20, FY - FHH + 20), color: k.rgb(...c.hairShine), opacity: 0.45 });
  k.drawEllipse({ radiusX: 10, radiusY: 16,
    pos: k.vec2(FX + 14, FY - FHH + 24), color: k.rgb(...c.hairShine), opacity: 0.3 });
}

function drawHairFront(k: K, c: Culture) {
  // Bangs / fringe over forehead
  const HEAD_TOP_Y = FY - FHH;
  k.drawEllipse({ radiusX: FHW + 4, radiusY: 22,
    pos: k.vec2(FX, HEAD_TOP_Y + 16), color: k.rgb(...c.hairRoot) });
  k.drawEllipse({ radiusX: FHW,     radiusY: 18,
    pos: k.vec2(FX, HEAD_TOP_Y + 14), color: k.rgb(...c.hairMid) });
  // Side sweep left
  k.drawEllipse({ radiusX: 30, radiusY: 14,
    pos: k.vec2(FX - FHW + 14, HEAD_TOP_Y + 22), color: k.rgb(...c.hairMid) });
  // Side sweep right
  k.drawEllipse({ radiusX: 30, radiusY: 14,
    pos: k.vec2(FX + FHW - 14, HEAD_TOP_Y + 22), color: k.rgb(...c.hairMid) });
  // Wispy bang strands
  for (let i = 0; i < 5; i++) {
    const bx  = FX - 30 + i * 16;
    const by0 = HEAD_TOP_Y + 18;
    const by1 = HEAD_TOP_Y + 34 + (i % 2) * 8;
    k.drawLine({ p1: k.vec2(bx, by0), p2: k.vec2(bx + 4, by1),
      width: 3.5, color: k.rgb(...c.hairLight) });
  }
}

function drawHint(k: K, s: string, pulse: number) {
  if (s === "blush") {
    k.drawCircle({ pos: k.vec2(CLX, CLY), radius: CR + 14, color: k.rgb(255, 150, 180), opacity: pulse * 0.4 });
    k.drawCircle({ pos: k.vec2(CRX, CRY), radius: CR + 14, color: k.rgb(255, 150, 180), opacity: pulse * 0.4 });
  } else if (s === "lipstick") {
    k.drawEllipse({ radiusX: MW + 16, radiusY: MH + 12, pos: k.vec2(MX, MY),
      color: k.rgb(220, 60, 100), opacity: pulse * 0.35 });
  } else {
    k.drawEllipse({ radiusX: FHW - 6, radiusY: FHH - 6, pos: k.vec2(FX, FY),
      color: k.rgb(255, 200, 220), opacity: pulse * 0.18 });
  }
}
