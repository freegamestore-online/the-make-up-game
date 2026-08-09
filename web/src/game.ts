import kaplay from "kaplay";

type K = ReturnType<typeof kaplay>;

const VW = 400;
const VH = 680;

const SKIN_FOUND: [number, number, number] = [228, 182, 148];

const STEPS = [
  { id: "foundation", emoji: "🧴", label: "Tap the face to apply foundation!" },
  { id: "eyeshadow",  emoji: "👁️",  label: "Tap an eye to apply eye shadow!" },
  { id: "eyeliner",   emoji: "🖊️",  label: "Tap an eye to draw eyeliner!" },
  { id: "mascara",    emoji: "✨",  label: "Tap an eye to apply mascara!" },
  { id: "blush",      emoji: "🌸",  label: "Tap a cheek to apply blush!" },
  { id: "lipstick",   emoji: "💄",  label: "Tap the lips to apply lipstick!" },
] as const;

type StepId = typeof STEPS[number]["id"];

const FX = VW / 2;
const FY = 310;
const FRX = 88;
const FRY = 108;

const ELX = FX - 33, ELY = FY - 22;
const ERX = FX + 33, ERY = FY - 22;
const EW = 26, EH = 12;

const CLX = FX - 62, CLY = FY + 14;
const CRX = FX + 62, CRY = FY + 14;
const CR = 20;

const MX = FX, MY = FY + 44;
const MW = 36, MH = 13;

const NX = FX, NY = FY + 8;

function inEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number, pad = 0): boolean {
  const dx = (px - cx) / (rx + pad);
  const dy = (py - cy) / (ry + pad);
  return dx * dx + dy * dy <= 1;
}

function inCircle(px: number, py: number, cx: number, cy: number, r: number): boolean {
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function inMouth(px: number, py: number): boolean {
  return inEllipse(px, py, MX, MY, MW + 14, MH + 14);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
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
    background: [255, 238, 248],
    global: false,
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  });

  let stepIdx = 0;
  let stepDone = false;

  // Each boolean flips to true after ONE tap anywhere on the face/target area
  let foundDone = false;
  let shadowDone = false;
  let linerDone = false;
  let mascaraDone = false;
  let blushDone = false;
  let lipDone = false;

  let confetti: Confetti[] = [];

  function resetAll() {
    stepIdx = 0; stepDone = false;
    foundDone = false;
    shadowDone = false;
    linerDone = false;
    mascaraDone = false;
    blushDone = false;
    lipDone = false;
    confetti = [];
    onScore(0);
  }

  function currentStep(): StepId {
    return STEPS[stepIdx]?.id ?? "lipstick";
  }

  // Every step: 0 until done, then 1
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
        x: Math.random() * VW,
        y: -20 - Math.random() * 60,
        vx: (Math.random() - 0.5) * 80,
        vy: 80 + Math.random() * 120,
        color: cols[i % cols.length]!,
        angle: Math.random() * 360,
        av: (Math.random() - 0.5) * 300,
        life: 1,
      });
    }
  }

  k.scene("main", () => {
    resetAll();

    k.add([k.rect(VW, VH), k.color(255, 238, 248), k.pos(0, 0), k.z(-10)]);

    const instrBg = k.add([k.rect(VW, 72), k.color(255, 182, 215), k.pos(0, 0), k.fixed(), k.z(10)]);
    instrBg;
    const emojiLbl  = k.add([k.text("", { size: 28 }), k.anchor("center"), k.pos(30, 36), k.fixed(), k.z(11)]);
    const instrLbl  = k.add([k.text("", { size: 14, width: VW - 72, align: "left" }), k.color(110, 20, 70), k.pos(60, 14), k.fixed(), k.z(11)]);

    k.add([k.rect(VW - 40, 9, { radius: 5 }), k.color(220, 175, 200), k.pos(20, VH - 18), k.fixed(), k.z(10)]);
    const progBar     = k.add([k.rect(2, 9, { radius: 5 }), k.color(220, 60, 130), k.pos(20, VH - 18), k.fixed(), k.z(11)]);
    const stepCounter = k.add([k.text("", { size: 13 }), k.color(160, 60, 110), k.anchor("right"), k.pos(VW - 22, VH - 38), k.fixed(), k.z(11)]);

    const nextBtn = k.add([k.rect(160, 48, { radius: 24 }), k.color(220, 60, 130), k.anchor("center"), k.pos(VW / 2, VH - 58), k.fixed(), k.z(13), k.area(), k.opacity(0), "nextbtn"]);
    const nextTxt = k.add([k.text("Next Step ➜", { size: 16 }), k.color(255, 255, 255), k.anchor("center"), k.pos(VW / 2, VH - 58), k.fixed(), k.z(14), k.opacity(0)]);

    const restartBtn = k.add([k.rect(160, 48, { radius: 24 }), k.color(100, 60, 200), k.anchor("center"), k.pos(VW / 2, VH - 58), k.fixed(), k.z(13), k.area(), k.opacity(0), "restartbtn"]);
    const restartTxt = k.add([k.text("Play Again 🔄", { size: 16 }), k.color(255, 255, 255), k.anchor("center"), k.pos(VW / 2, VH - 58), k.fixed(), k.z(14), k.opacity(0)]);

    function showNext(v: boolean)    { nextBtn.opacity    = v ? 1 : 0; nextTxt.opacity    = v ? 1 : 0; }
    function showRestart(v: boolean) { restartBtn.opacity = v ? 1 : 0; restartTxt.opacity = v ? 1 : 0; }
    showNext(false); showRestart(false);

    function updateUI() {
      const s = STEPS[stepIdx];
      if (!s) return;
      emojiLbl.text    = s.emoji;
      instrLbl.text    = s.label;
      stepCounter.text = `${stepIdx + 1} / ${STEPS.length}`;
    }
    updateUI();

    nextBtn.onClick(() => {
      if (!stepDone) return;
      stepIdx++;
      stepDone = false;
      showNext(false);
      if (stepIdx >= STEPS.length) {
        onScore(100);
        spawnConfetti();
        k.wait(1.2, () => showRestart(true));
      } else {
        onScore(Math.round((stepIdx / STEPS.length) * 100));
        updateUI();
      }
    });

    restartBtn.onClick(() => k.go("main"));

    // ── ONE TAP anywhere on the relevant area = step complete ──────────────
    function handleTap(x: number, y: number) {
      if (stepDone || stepIdx >= STEPS.length) return;
      const s = currentStep();

      // Large hit areas so it's easy to tap
      const onFace  = inEllipse(x, y, FX, FY, FRX, FRY, 20);
      const onEyes  = inEllipse(x, y, ELX, ELY, EW + 18, EH + 18)
                   || inEllipse(x, y, ERX, ERY, EW + 18, EH + 18);
      const onCheeks = inCircle(x, y, CLX, CLY, CR + 24)
                    || inCircle(x, y, CRX, CRY, CR + 24);
      const onLips  = inMouth(x, y);

      if (s === "foundation" && onFace)   foundDone   = true;
      if (s === "eyeshadow"  && (onFace || onEyes))  shadowDone  = true;
      if (s === "eyeliner"   && (onFace || onEyes))  linerDone   = true;
      if (s === "mascara"    && (onFace || onEyes))  mascaraDone = true;
      if (s === "blush"      && (onFace || onCheeks)) blushDone  = true;
      if (s === "lipstick"   && (onFace || onLips))  lipDone     = true;
    }

    k.onMousePress((_btn) => { const mp = k.mousePos(); handleTap(mp.x, mp.y); });
    k.onTouchStart((t) => { handleTap(t.x, t.y); });

    // ── Update ─────────────────────────────────────────────────────────────
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
        if (prog >= 1) { stepDone = true; showNext(true); }
      }
    });

    // ── Draw ───────────────────────────────────────────────────────────────
    k.onDraw(() => {
      const isDone = stepIdx >= STEPS.length;
      const s = isDone ? "done" : currentStep();
      const skin: [number, number, number] = [...SKIN_FOUND];

      // Face shadow
      k.drawEllipse({ radiusX: FRX + 5, radiusY: FRY + 5, pos: k.vec2(FX + 5, FY + 7), color: k.rgb(170, 130, 110), opacity: 0.18 });
      // Face
      k.drawEllipse({ radiusX: FRX, radiusY: FRY, pos: k.vec2(FX, FY), color: k.rgb(...skin) });

      // Foundation shimmer
      if (foundDone) {
        k.drawEllipse({ radiusX: FRX - 4, radiusY: FRY - 4, pos: k.vec2(FX, FY), color: k.rgb(255, 230, 200), opacity: 0.22 });
      }

      // Hair
      k.drawEllipse({ radiusX: FRX + 10, radiusY: FRY * 0.6,  pos: k.vec2(FX, FY - FRY * 0.5),   color: k.rgb(55, 32, 16) });
      k.drawEllipse({ radiusX: 30,        radiusY: FRY * 0.75, pos: k.vec2(FX - FRX + 6, FY - 12), color: k.rgb(55, 32, 16) });
      k.drawEllipse({ radiusX: 30,        radiusY: FRY * 0.75, pos: k.vec2(FX + FRX - 6, FY - 12), color: k.rgb(55, 32, 16) });

      // Neck
      k.drawRect({ pos: k.vec2(FX - 24, FY + FRY - 12), width: 48, height: 55, color: k.rgb(...skin) });

      // Eyebrows
      k.drawRect({ pos: k.vec2(ELX - 20, ELY - 22), width: 40, height: 6, radius: 3, color: k.rgb(55, 32, 16) });
      k.drawRect({ pos: k.vec2(ERX - 20, ERY - 22), width: 40, height: 6, radius: 3, color: k.rgb(55, 32, 16) });

      // Eye shadow (both eyes at once)
      if (shadowDone) {
        k.drawEllipse({ radiusX: EW + 5, radiusY: EH + 7, pos: k.vec2(ELX, ELY - 2), color: k.rgb(155, 95, 210), opacity: 0.72 });
        k.drawEllipse({ radiusX: EW + 5, radiusY: EH + 7, pos: k.vec2(ERX, ERY - 2), color: k.rgb(155, 95, 210), opacity: 0.72 });
      }

      // Eye whites + iris + pupil + highlight
      k.drawEllipse({ radiusX: EW, radiusY: EH, pos: k.vec2(ELX, ELY), color: k.rgb(255, 255, 255) });
      k.drawEllipse({ radiusX: EW, radiusY: EH, pos: k.vec2(ERX, ERY), color: k.rgb(255, 255, 255) });
      k.drawCircle({ pos: k.vec2(ELX, ELY), radius: 8, color: k.rgb(75, 48, 18) });
      k.drawCircle({ pos: k.vec2(ERX, ERY), radius: 8, color: k.rgb(75, 48, 18) });
      k.drawCircle({ pos: k.vec2(ELX, ELY), radius: 4, color: k.rgb(8, 8, 8) });
      k.drawCircle({ pos: k.vec2(ERX, ERY), radius: 4, color: k.rgb(8, 8, 8) });
      k.drawCircle({ pos: k.vec2(ELX + 3, ELY - 3), radius: 2.5, color: k.rgb(255, 255, 255) });
      k.drawCircle({ pos: k.vec2(ERX + 3, ERY - 3), radius: 2.5, color: k.rgb(255, 255, 255) });

      // Eyeliner (both eyes at once)
      if (linerDone) {
        drawEyeliner(k, ELX, ELY, EW, EH);
        drawEyeliner(k, ERX, ERY, EW, EH);
      }

      // Mascara lashes (both eyes at once)
      if (mascaraDone) {
        drawLashes(k, ELX, ELY, EW, EH);
        drawLashes(k, ERX, ERY, EW, EH);
      }

      // Nose
      const noseC = k.rgb(Math.max(0, skin[0] - 32), Math.max(0, skin[1] - 32), Math.max(0, skin[2] - 32));
      k.drawLine({ p1: k.vec2(NX, NY - 10), p2: k.vec2(NX - 10, NY + 14), width: 2, color: noseC });
      k.drawLine({ p1: k.vec2(NX, NY - 10), p2: k.vec2(NX + 10, NY + 14), width: 2, color: noseC });
      k.drawLine({ p1: k.vec2(NX - 12, NY + 16), p2: k.vec2(NX + 12, NY + 16), width: 2, color: noseC });

      // Blush (both cheeks at once)
      if (blushDone) {
        k.drawCircle({ pos: k.vec2(CLX, CLY), radius: CR + 4, color: k.rgb(255, 140, 170), opacity: 0.52 });
        k.drawCircle({ pos: k.vec2(CRX, CRY), radius: CR + 4, color: k.rgb(255, 140, 170), opacity: 0.52 });
      }

      // Mouth
      const lipCol = lipDone
        ? k.rgb(210, 38, 85)
        : k.rgb(Math.max(0, skin[0] - 20), Math.max(0, skin[1] - 50), Math.max(0, skin[2] - 40));
      k.drawEllipse({ radiusX: MW,     radiusY: MH * 0.75, pos: k.vec2(MX, MY - 4), color: lipCol });
      k.drawEllipse({ radiusX: MW - 3, radiusY: MH,        pos: k.vec2(MX, MY + 6), color: lipCol });
      k.drawLine({ p1: k.vec2(MX - MW + 2, MY + 1), p2: k.vec2(MX + MW - 2, MY + 1), width: 1.5, color: k.rgb(Math.max(0, lipCol.r - 40), Math.max(0, lipCol.g - 20), Math.max(0, lipCol.b - 20)) });

      // Pulsing tap hint
      if (!isDone && !stepDone) {
        const pulse = 0.45 + 0.45 * Math.sin(k.time() * 5);
        drawHint(k, s, pulse);
      }

      // Progress bar
      const prog = isDone ? 1 : clamp01(stepProgress());
      progBar.width = Math.max(2, (VW - 40) * prog);

      // Step-complete shimmer
      if (stepDone && !isDone) {
        const t = (k.time() * 4) % 1;
        k.drawRect({ pos: k.vec2(0, 72), width: VW, height: VH - 72, color: k.rgb(255, 210, 240), opacity: Math.sin(t * Math.PI) * 0.12 });
      }

      // Done screen
      if (isDone) {
        for (const c of confetti) {
          k.drawRect({ pos: k.vec2(c.x - 5, c.y - 5), width: 10, height: 10, color: k.rgb(...c.color), opacity: c.life, angle: c.angle });
        }
        const t2 = k.time();
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2 + t2 * 1.2;
          const rr = FRX + 20 + Math.sin(t2 * 3 + i) * 8;
          k.drawCircle({ pos: k.vec2(FX + Math.cos(ang) * rr, FY + Math.sin(ang) * rr * 0.6), radius: 4, color: k.rgb(255, 220, 60), opacity: 0.85 });
        }
        k.drawText({ text: "✨ GORGEOUS! ✨",      size: 30, pos: k.vec2(FX, FY + FRY + 28), anchor: "center", color: k.rgb(200, 40, 120) });
        k.drawText({ text: "You look amazing! 💖", size: 16, pos: k.vec2(FX, FY + FRY + 62), anchor: "center", color: k.rgb(160, 60, 120) });
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

// ── Hint overlays ─────────────────────────────────────────────────────────────
function drawHint(k: K, s: string, pulse: number) {
  const FX = VW / 2, FY = 310, FRX = 88, FRY = 108;
  const ELX = FX - 33, ELY = FY - 22, ERX = FX + 33, ERY = FY - 22;
  const EW = 26, EH = 12;
  const CLX = FX - 62, CLY = FY + 14, CRX = FX + 62, CRY = FY + 14;
  const CR = 20;
  const MX = FX, MY = FY + 44, MW = 36, MH = 13;

  if (s === "foundation") {
    k.drawEllipse({ radiusX: FRX + 8, radiusY: FRY + 8, pos: k.vec2(FX, FY), color: k.rgb(228, 182, 148), opacity: pulse * 0.3 });
    k.drawText({ text: "👆 TAP THE FACE", size: 18, pos: k.vec2(FX, FY + FRY + 22), anchor: "center", color: k.rgb(180, 120, 60) });
  }
  if (s === "eyeshadow") {
    k.drawEllipse({ radiusX: EW + 14, radiusY: EH + 14, pos: k.vec2(ELX, ELY), color: k.rgb(155, 95, 210), opacity: pulse * 0.4 });
    k.drawEllipse({ radiusX: EW + 14, radiusY: EH + 14, pos: k.vec2(ERX, ERY), color: k.rgb(155, 95, 210), opacity: pulse * 0.4 });
    k.drawText({ text: "👆 TAP THE FACE", size: 18, pos: k.vec2(FX, FY + FRY + 22), anchor: "center", color: k.rgb(130, 60, 200) });
  }
  if (s === "eyeliner") {
    k.drawEllipse({ radiusX: EW + 14, radiusY: EH + 14, pos: k.vec2(ELX, ELY), color: k.rgb(30, 20, 20), opacity: pulse * 0.35 });
    k.drawEllipse({ radiusX: EW + 14, radiusY: EH + 14, pos: k.vec2(ERX, ERY), color: k.rgb(30, 20, 20), opacity: pulse * 0.35 });
    k.drawText({ text: "👆 TAP THE FACE", size: 18, pos: k.vec2(FX, FY + FRY + 22), anchor: "center", color: k.rgb(40, 30, 30) });
  }
  if (s === "mascara") {
    k.drawEllipse({ radiusX: EW + 14, radiusY: EH + 14, pos: k.vec2(ELX, ELY), color: k.rgb(20, 10, 10), opacity: pulse * 0.3 });
    k.drawEllipse({ radiusX: EW + 14, radiusY: EH + 14, pos: k.vec2(ERX, ERY), color: k.rgb(20, 10, 10), opacity: pulse * 0.3 });
    k.drawText({ text: "👆 TAP THE FACE", size: 18, pos: k.vec2(FX, FY + FRY + 22), anchor: "center", color: k.rgb(40, 30, 30) });
  }
  if (s === "blush") {
    k.drawCircle({ pos: k.vec2(CLX, CLY), radius: CR + 20, color: k.rgb(255, 140, 170), opacity: pulse * 0.4 });
    k.drawCircle({ pos: k.vec2(CRX, CRY), radius: CR + 20, color: k.rgb(255, 140, 170), opacity: pulse * 0.4 });
    k.drawText({ text: "👆 TAP THE FACE", size: 18, pos: k.vec2(FX, FY + FRY + 22), anchor: "center", color: k.rgb(200, 80, 120) });
  }
  if (s === "lipstick") {
    k.drawEllipse({ radiusX: MW + 12, radiusY: MH + 12, pos: k.vec2(MX, MY), color: k.rgb(210, 38, 85), opacity: pulse * 0.4 });
    k.drawText({ text: "👆 TAP THE FACE", size: 18, pos: k.vec2(FX, FY + FRY + 22), anchor: "center", color: k.rgb(180, 30, 70) });
  }
}

// ── Lash drawing ──────────────────────────────────────────────────────────────
function drawLashes(k: K, ex: number, ey: number, ew: number, eh: number) {
  const count = 8;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1) - 0.5;
    const bx = ex + t * ew * 1.9;
    const by = ey - eh * 0.88;
    const ang = t * 0.55;
    const len = 9 + Math.abs(t) * 5;
    k.drawLine({
      p1: k.vec2(bx, by),
      p2: k.vec2(bx + Math.sin(ang) * len * 0.4, by - Math.cos(ang) * len),
      width: 2.2,
      color: k.rgb(8, 8, 8),
    });
  }
}

// ── Eyeliner drawing ──────────────────────────────────────────────────────────
function drawEyeliner(k: K, ex: number, ey: number, ew: number, eh: number) {
  k.drawLine({ p1: k.vec2(ex - ew, ey + eh * 0.3), p2: k.vec2(ex + ew, ey + eh * 0.3), width: 2.5, color: k.rgb(12, 8, 8) });
  k.drawLine({ p1: k.vec2(ex - ew, ey - eh * 0.3), p2: k.vec2(ex + ew, ey - eh * 0.3), width: 2.5, color: k.rgb(12, 8, 8) });
}
