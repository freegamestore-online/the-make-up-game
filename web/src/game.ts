import kaplay from "kaplay";

type K = ReturnType<typeof kaplay>;

const VW = 400;
const VH = 680;

// ── Skin colour palette ───────────────────────────────────────────────────────
const SKIN_DIRTY: [number, number, number] = [110, 82, 58];
const SKIN_CLEAN: [number, number, number] = [255, 214, 186];
const SKIN_FOUND: [number, number, number] = [228, 182, 148];

// ── Step definitions ──────────────────────────────────────────────────────────
const STEPS = [
  { id: "water1",     emoji: "💧", label: "Splash water on the dirty face!" },
  { id: "soap",       emoji: "🧼", label: "Rub soap all over the face!" },
  { id: "water2",     emoji: "💧", label: "Rinse the bubbles off with water!" },
  { id: "foundation", emoji: "🧴", label: "Dab foundation all over the face!" },
  { id: "rub",        emoji: "🤲", label: "Rub the foundation in evenly!" },
  { id: "eyeshadow",  emoji: "👁️",  label: "Sweep eye shadow on both eyelids!" },
  { id: "eyeliner",   emoji: "🖊️",  label: "Draw eye liner on both eyes!" },
  { id: "mascara",    emoji: "✨", label: "Brush mascara on the lashes!" },
  { id: "blush",      emoji: "🌸", label: "Dab blush on both cheeks!" },
  { id: "lipstick",   emoji: "💄", label: "Apply lipstick to the lips!" },
] as const;

type StepId = typeof STEPS[number]["id"];

// ── Face geometry ─────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  return inEllipse(px, py, MX, MY, MW + 8, MH + 8);
}

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── Particle types ────────────────────────────────────────────────────────────
interface Drop {
  x: number; y: number; vy: number; life: number; r: number;
}
interface Bubble {
  x: number; y: number; r: number; life: number; vx: number; vy: number;
}
interface Confetti {
  x: number; y: number; vx: number; vy: number; color: [number, number, number]; angle: number; av: number; life: number;
}

// ─────────────────────────────────────────────────────────────────────────────
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

  // ── Game state ──────────────────────────────────────────────────────────────
  let stepIdx = 0;
  let stepDone = false;
  let isDown = false;
  let ptr = { x: VW / 2, y: VH / 2 };

  // Per-step progress (all 0–1)
  let water1 = 0;
  let soapCov = 0;
  let water2 = 0;
  let foundCov = 0;
  let rubCov = 0;
  let shadowL = 0, shadowR = 0;
  let linerL: { x: number; y: number }[] = [];
  let linerR: { x: number; y: number }[] = [];
  let linerPhase = 0; // 0=left,1=right
  let mascaraL = 0, mascaraR = 0;
  let blushL = 0, blushR = 0;
  let lipCov = 0;

  // Particles
  let drops: Drop[] = [];
  let bubbles: Bubble[] = [];
  let confetti: Confetti[] = [];

  function resetAll() {
    stepIdx = 0; stepDone = false; isDown = false;
    water1 = 0; soapCov = 0; water2 = 0; foundCov = 0; rubCov = 0;
    shadowL = 0; shadowR = 0;
    linerL = []; linerR = []; linerPhase = 0;
    mascaraL = 0; mascaraR = 0;
    blushL = 0; blushR = 0;
    lipCov = 0;
    drops = []; bubbles = []; confetti = [];
    onScore(0);
  }

  function currentStep(): StepId {
    return STEPS[stepIdx]?.id ?? "lipstick";
  }

  function stepProgress(): number {
    const s = currentStep();
    if (s === "water1")     return water1;
    if (s === "soap")       return soapCov;
    if (s === "water2")     return water2;
    if (s === "foundation") return foundCov;
    if (s === "rub")        return rubCov;
    if (s === "eyeshadow")  return clamp01((shadowL + shadowR) / 2);
    if (s === "eyeliner") {
      const l = Math.min(linerL.length / 10, 1);
      const r = Math.min(linerR.length / 10, 1);
      return (l + r) / 2;
    }
    if (s === "mascara")  return clamp01((mascaraL + mascaraR) / 2);
    if (s === "blush")    return clamp01((blushL + blushR) / 2);
    if (s === "lipstick") return lipCov;
    return 0;
  }

  // ── Scene ───────────────────────────────────────────────────────────────────
  k.scene("main", () => {
    resetAll();

    // Background
    k.add([k.rect(VW, VH), k.color(255, 238, 248), k.pos(0, 0), k.z(-10)]);

    // Top instruction bar
    const instrBg = k.add([k.rect(VW, 72), k.color(255, 182, 215), k.pos(0, 0), k.fixed(), k.z(10)]);
    instrBg;

    const emojiLbl = k.add([
      k.text("", { size: 28 }),
      k.anchor("center"),
      k.pos(30, 36),
      k.fixed(), k.z(11),
    ]);

    const instrLbl = k.add([
      k.text("", { size: 14, width: VW - 72, align: "left" }),
      k.color(110, 20, 70),
      k.pos(60, 14),
      k.fixed(), k.z(11),
    ]);

    // Progress bar bg
    k.add([k.rect(VW - 40, 9, { radius: 5 }), k.color(220, 175, 200), k.pos(20, VH - 18), k.fixed(), k.z(10)]);
    const progBar = k.add([k.rect(2, 9, { radius: 5 }), k.color(220, 60, 130), k.pos(20, VH - 18), k.fixed(), k.z(11)]);

    // Step counter
    const stepCounter = k.add([
      k.text("", { size: 13 }),
      k.color(160, 60, 110),
      k.anchor("right"),
      k.pos(VW - 22, VH - 38),
      k.fixed(), k.z(11),
    ]);

    // Next button
    const nextBtn = k.add([
      k.rect(160, 48, { radius: 24 }),
      k.color(220, 60, 130),
      k.anchor("center"),
      k.pos(VW / 2, VH - 58),
      k.fixed(), k.z(13),
      k.area(),
      k.opacity(0),
      "nextbtn",
    ]);
    const nextTxt = k.add([
      k.text("Next Step ➜", { size: 16 }),
      k.color(255, 255, 255),
      k.anchor("center"),
      k.pos(VW / 2, VH - 58),
      k.fixed(), k.z(14),
      k.opacity(0),
    ]);

    // Restart button (shown on done screen)
    const restartBtn = k.add([
      k.rect(160, 48, { radius: 24 }),
      k.color(100, 60, 200),
      k.anchor("center"),
      k.pos(VW / 2, VH - 58),
      k.fixed(), k.z(13),
      k.area(),
      k.opacity(0),
      "restartbtn",
    ]);
    const restartTxt = k.add([
      k.text("Play Again 🔄", { size: 16 }),
      k.color(255, 255, 255),
      k.anchor("center"),
      k.pos(VW / 2, VH - 58),
      k.fixed(), k.z(14),
      k.opacity(0),
    ]);

    function showNext(v: boolean) {
      nextBtn.opacity = v ? 1 : 0;
      nextTxt.opacity = v ? 1 : 0;
    }
    function showRestart(v: boolean) {
      restartBtn.opacity = v ? 1 : 0;
      restartTxt.opacity = v ? 1 : 0;
    }
    showNext(false);
    showRestart(false);

    function updateUI() {
      const s = STEPS[stepIdx];
      if (!s) return;
      emojiLbl.text = s.emoji;
      instrLbl.text = s.label;
      stepCounter.text = `${stepIdx + 1} / ${STEPS.length}`;
    }
    updateUI();

    nextBtn.onClick(() => {
      if (!stepDone) return;
      stepIdx++;
      stepDone = false;
      drops = []; bubbles = [];
      showNext(false);
      if (stepIdx >= STEPS.length) {
        // All done!
        onScore(100);
        spawnConfetti();
        showRestart(false);
        // Show restart after a moment
        k.wait(1.2, () => showRestart(true));
      } else {
        onScore(Math.round((stepIdx / STEPS.length) * 100));
        updateUI();
      }
    });

    restartBtn.onClick(() => {
      k.go("main");
    });

    // ── Particle spawning ──────────────────────────────────────────────────
    function spawnDrop(x: number, y: number) {
      drops.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 10,
        vy: 50 + Math.random() * 100,
        life: 1,
        r: 3 + Math.random() * 3,
      });
    }

    function spawnBubble(x: number, y: number) {
      bubbles.push({
        x: x + (Math.random() - 0.5) * 24,
        y: y + (Math.random() - 0.5) * 24,
        r: 5 + Math.random() * 12,
        life: 1,
        vx: (Math.random() - 0.5) * 20,
        vy: -15 - Math.random() * 25,
      });
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

    // ── Pointer handling ───────────────────────────────────────────────────
    function onMove(x: number, y: number) {
      ptr = { x, y };
      if (!isDown || stepIdx >= STEPS.length) return;
      const s = currentStep();
      const inFace = inEllipse(x, y, FX, FY, FRX, FRY, 12);

      if (s === "water1" && inFace) {
        water1 = clamp01(water1 + 0.013);
        for (let i = 0; i < 2; i++) spawnDrop(x, y);
      }
      if (s === "soap" && inFace) {
        soapCov = clamp01(soapCov + 0.011);
        if (Math.random() < 0.4) spawnBubble(x, y);
      }
      if (s === "water2" && inFace) {
        water2 = clamp01(water2 + 0.013);
        for (let i = 0; i < 2; i++) spawnDrop(x, y);
      }
      if (s === "foundation" && inFace) {
        foundCov = clamp01(foundCov + 0.014);
      }
      if (s === "rub" && inFace) {
        rubCov = clamp01(rubCov + 0.013);
      }
      if (s === "eyeshadow") {
        if (inEllipse(x, y, ELX, ELY, EW + 10, EH + 10)) shadowL = clamp01(shadowL + 0.045);
        if (inEllipse(x, y, ERX, ERY, EW + 10, EH + 10)) shadowR = clamp01(shadowR + 0.045);
      }
      if (s === "eyeliner") {
        if (linerPhase === 0 && inEllipse(x, y, ELX, ELY, EW + 14, EH + 14)) {
          linerL.push({ x, y });
          if (linerL.length >= 10) linerPhase = 1;
        } else if (linerPhase === 1 && inEllipse(x, y, ERX, ERY, EW + 14, EH + 14)) {
          linerR.push({ x, y });
        }
      }
      if (s === "mascara") {
        if (inEllipse(x, y, ELX, ELY, EW + 12, EH + 14)) mascaraL = clamp01(mascaraL + 0.05);
        if (inEllipse(x, y, ERX, ERY, EW + 12, EH + 14)) mascaraR = clamp01(mascaraR + 0.05);
      }
      if (s === "blush") {
        if (inCircle(x, y, CLX, CLY, CR + 16)) blushL = clamp01(blushL + 0.04);
        if (inCircle(x, y, CRX, CRY, CR + 16)) blushR = clamp01(blushR + 0.04);
      }
      if (s === "lipstick" && inMouth(x, y)) {
        lipCov = clamp01(lipCov + 0.055);
      }
    }

    k.onMouseMove((p) => { ptr = { x: p.x, y: p.y }; onMove(p.x, p.y); });
    k.onMousePress(() => { isDown = true; });
    k.onMouseRelease(() => { isDown = false; });
    k.onTouchStart((t) => { isDown = true; ptr = { x: t.x, y: t.y }; });
    k.onTouchMove((t) => { onMove(t.x, t.y); });
    k.onTouchEnd(() => { isDown = false; });

    // ── Update ─────────────────────────────────────────────────────────────
    k.onUpdate(() => {
      const dt = k.dt();

      // Particles
      for (const d of drops) { d.y += d.vy * dt; d.life -= dt * 1.8; }
      drops = drops.filter(d => d.life > 0);

      for (const b of bubbles) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt * 0.5;
      }
      bubbles = bubbles.filter(b => b.life > 0);

      for (const c of confetti) {
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.angle += c.av * dt; c.life -= dt * 0.3;
      }
      confetti = confetti.filter(c => c.life > 0);

      // Check step completion
      if (!stepDone && stepIdx < STEPS.length) {
        const prog = stepProgress();
        progBar.width = Math.max(2, (VW - 40) * prog);
        if (prog >= 1) {
          stepDone = true;
          showNext(true);
        }
      }
    });

    // ── Draw ───────────────────────────────────────────────────────────────
    k.onDraw(() => {
      const isDone = stepIdx >= STEPS.length;
      const s = isDone ? "done" : currentStep();

      // ── Skin colour ──
      let skin: [number, number, number];
      if (s === "water1") {
        skin = lerp3(SKIN_DIRTY, SKIN_CLEAN, water1 * 0.4);
      } else if (s === "soap") {
        skin = lerp3(SKIN_DIRTY, SKIN_CLEAN, 0.4 + soapCov * 0.3);
      } else if (s === "water2") {
        skin = lerp3(lerp3(SKIN_DIRTY, SKIN_CLEAN, 0.7), SKIN_CLEAN, water2);
      } else if (s === "foundation") {
        skin = lerp3(SKIN_CLEAN, SKIN_FOUND, foundCov);
      } else if (s === "done") {
        skin = [...SKIN_FOUND];
      } else {
        skin = [...SKIN_FOUND];
      }

      // ── Face shadow ──
      k.drawEllipse({ radiusX: FRX + 5, radiusY: FRY + 5, pos: k.vec2(FX + 5, FY + 7), color: k.rgb(170, 130, 110), opacity: 0.18 });

      // ── Face ──
      k.drawEllipse({ radiusX: FRX, radiusY: FRY, pos: k.vec2(FX, FY), color: k.rgb(...skin) });

      // ── Dirt patches ──
      if (s === "water1" || s === "soap") {
        const fade = s === "water1" ? Math.max(0, 1 - water1 * 1.2) : Math.max(0, 1 - soapCov * 1.5) * 0.6;
        const spots = [
          { x: FX - 32, y: FY - 44, r: 16 }, { x: FX + 42, y: FY - 18, r: 12 },
          { x: FX - 12, y: FY + 32, r: 14 }, { x: FX + 22, y: FY + 52, r: 9 },
          { x: FX - 52, y: FY + 8,  r: 11 }, { x: FX + 8,  y: FY - 62, r: 8 },
          { x: FX + 55, y: FY + 30, r: 7  }, { x: FX - 20, y: FY - 10, r: 6 },
        ];
        for (const sp of spots) {
          k.drawCircle({ pos: k.vec2(sp.x, sp.y), radius: sp.r, color: k.rgb(72, 44, 22), opacity: 0.6 * fade });
          k.drawCircle({ pos: k.vec2(sp.x + 4, sp.y - 3), radius: sp.r * 0.4, color: k.rgb(50, 30, 10), opacity: 0.4 * fade });
        }
        // Grime streaks
        if (fade > 0.05) {
          k.drawLine({ p1: k.vec2(FX - 20, FY - 70), p2: k.vec2(FX + 10, FY - 20), width: 4, color: k.rgb(80, 50, 20), opacity: 0.35 * fade });
          k.drawLine({ p1: k.vec2(FX + 30, FY + 10), p2: k.vec2(FX + 60, FY + 55), width: 3, color: k.rgb(80, 50, 20), opacity: 0.3 * fade });
        }
      }

      // ── Hair (drawn over face top) ──
      k.drawEllipse({ radiusX: FRX + 10, radiusY: FRY * 0.6, pos: k.vec2(FX, FY - FRY * 0.5), color: k.rgb(55, 32, 16) });
      k.drawEllipse({ radiusX: 30, radiusY: FRY * 0.75, pos: k.vec2(FX - FRX + 6, FY - 12), color: k.rgb(55, 32, 16) });
      k.drawEllipse({ radiusX: 30, radiusY: FRY * 0.75, pos: k.vec2(FX + FRX - 6, FY - 12), color: k.rgb(55, 32, 16) });

      // ── Neck ──
      k.drawRect({ pos: k.vec2(FX - 24, FY + FRY - 12), width: 48, height: 55, color: k.rgb(...skin) });

      // ── Eyebrows ──
      k.drawRect({ pos: k.vec2(ELX - 20, ELY - 22), width: 40, height: 6, radius: 3, color: k.rgb(55, 32, 16) });
      k.drawRect({ pos: k.vec2(ERX - 20, ERY - 22), width: 40, height: 6, radius: 3, color: k.rgb(55, 32, 16) });

      // ── Eye shadow ──
      if (shadowL > 0) k.drawEllipse({ radiusX: EW + 5, radiusY: EH + 7, pos: k.vec2(ELX, ELY - 2), color: k.rgb(155, 95, 210), opacity: shadowL * 0.72 });
      if (shadowR > 0) k.drawEllipse({ radiusX: EW + 5, radiusY: EH + 7, pos: k.vec2(ERX, ERY - 2), color: k.rgb(155, 95, 210), opacity: shadowR * 0.72 });

      // ── Eye whites ──
      k.drawEllipse({ radiusX: EW, radiusY: EH, pos: k.vec2(ELX, ELY), color: k.rgb(255, 255, 255) });
      k.drawEllipse({ radiusX: EW, radiusY: EH, pos: k.vec2(ERX, ERY), color: k.rgb(255, 255, 255) });
      // Iris
      k.drawCircle({ pos: k.vec2(ELX, ELY), radius: 8, color: k.rgb(75, 48, 18) });
      k.drawCircle({ pos: k.vec2(ERX, ERY), radius: 8, color: k.rgb(75, 48, 18) });
      // Pupil
      k.drawCircle({ pos: k.vec2(ELX, ELY), radius: 4, color: k.rgb(8, 8, 8) });
      k.drawCircle({ pos: k.vec2(ERX, ERY), radius: 4, color: k.rgb(8, 8, 8) });
      // Highlight
      k.drawCircle({ pos: k.vec2(ELX + 3, ELY - 3), radius: 2.5, color: k.rgb(255, 255, 255) });
      k.drawCircle({ pos: k.vec2(ERX + 3, ERY - 3), radius: 2.5, color: k.rgb(255, 255, 255) });

      // ── Eyeliner ──
      drawPolyLine(k, linerL, 2.5, k.rgb(12, 8, 8));
      drawPolyLine(k, linerR, 2.5, k.rgb(12, 8, 8));

      // ── Mascara lashes ──
      drawLashes(k, ELX, ELY, EW, EH, mascaraL);
      drawLashes(k, ERX, ERY, EW, EH, mascaraR);

      // ── Nose ──
      const noseC = k.rgb(Math.max(0, skin[0] - 32), Math.max(0, skin[1] - 32), Math.max(0, skin[2] - 32));
      k.drawLine({ p1: k.vec2(NX, NY - 10), p2: k.vec2(NX - 10, NY + 14), width: 2, color: noseC });
      k.drawLine({ p1: k.vec2(NX, NY - 10), p2: k.vec2(NX + 10, NY + 14), width: 2, color: noseC });
      k.drawLine({ p1: k.vec2(NX - 12, NY + 16), p2: k.vec2(NX + 12, NY + 16), width: 2, color: noseC });

      // ── Blush ──
      if (blushL > 0) k.drawCircle({ pos: k.vec2(CLX, CLY), radius: CR + 4, color: k.rgb(255, 140, 170), opacity: blushL * 0.52 });
      if (blushR > 0) k.drawCircle({ pos: k.vec2(CRX, CRY), radius: CR + 4, color: k.rgb(255, 140, 170), opacity: blushR * 0.52 });

      // ── Mouth ──
      const lipCol = lipCov > 0
        ? k.rgb(Math.round(210 * lipCov + (skin[0] - 20) * (1 - lipCov)), Math.round(38 * lipCov + (skin[1] - 50) * (1 - lipCov)), Math.round(85 * lipCov + (skin[2] - 40) * (1 - lipCov)))
        : k.rgb(Math.max(0, skin[0] - 20), Math.max(0, skin[1] - 50), Math.max(0, skin[2] - 40));
      // Upper lip
      k.drawEllipse({ radiusX: MW, radiusY: MH * 0.75, pos: k.vec2(MX, MY - 4), color: lipCol });
      // Lower lip
      k.drawEllipse({ radiusX: MW - 3, radiusY: MH, pos: k.vec2(MX, MY + 6), color: lipCol });
      // Lip line
      k.drawLine({ p1: k.vec2(MX - MW + 2, MY + 1), p2: k.vec2(MX + MW - 2, MY + 1), width: 1.5, color: k.rgb(Math.max(0, lipCol.r - 40), Math.max(0, lipCol.g - 20), Math.max(0, lipCol.b - 20)) });

      // ── Soap bubbles ──
      for (const b of bubbles) {
        k.drawCircle({ pos: k.vec2(b.x, b.y), radius: b.r, color: k.rgb(210, 235, 255), opacity: b.life * 0.45 });
        k.drawCircle({ pos: k.vec2(b.x - b.r * 0.35, b.y - b.r * 0.35), radius: b.r * 0.28, color: k.rgb(255, 255, 255), opacity: b.life * 0.75 });
        k.drawCircle({ pos: k.vec2(b.x, b.y), radius: b.r, color: k.rgb(180, 210, 255), opacity: b.life * 0.2, outline: { width: 1, color: k.rgb(180, 210, 255) } });
      }

      // ── Water drops ──
      for (const d of drops) {
        k.drawEllipse({ radiusX: d.r * 0.7, radiusY: d.r, pos: k.vec2(d.x, d.y), color: k.rgb(100, 175, 255), opacity: d.life * 0.75 });
      }

      // ── Foundation rub sheen ──
      if (s === "rub" && rubCov > 0) {
        k.drawEllipse({ radiusX: FRX - 4, radiusY: FRY - 4, pos: k.vec2(FX, FY), color: k.rgb(255, 230, 200), opacity: Math.sin(rubCov * Math.PI) * 0.28 });
      }

      // ── Cursor brush indicator ──
      if (isDown && !isDone) {
        const bc = brushColor(s);
        k.drawCircle({ pos: k.vec2(ptr.x, ptr.y), radius: 16, color: k.rgb(...bc), opacity: 0.32 });
        k.drawCircle({ pos: k.vec2(ptr.x, ptr.y), radius: 16, color: k.rgb(...bc), opacity: 0.0, outline: { width: 2, color: k.rgb(...bc) } });
      }

      // ── Progress bar fill ──
      const prog = isDone ? 1 : stepProgress();
      progBar.width = Math.max(2, (VW - 40) * prog);

      // ── Step-complete shimmer ──
      if (stepDone && !isDone) {
        const t = (k.time() * 4) % 1;
        k.drawRect({ pos: k.vec2(0, 72), width: VW, height: VH - 72, color: k.rgb(255, 210, 240), opacity: Math.sin(t * Math.PI) * 0.12 });
      }

      // ── Done screen overlay ──
      if (isDone) {
        // Confetti
        for (const c of confetti) {
          k.drawRect({ pos: k.vec2(c.x - 5, c.y - 5), width: 10, height: 10, color: k.rgb(...c.color), opacity: c.life, angle: c.angle });
        }
        // Sparkle ring
        const t2 = k.time();
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2 + t2 * 1.2;
          const rr = FRX + 20 + Math.sin(t2 * 3 + i) * 8;
          k.drawCircle({ pos: k.vec2(FX + Math.cos(ang) * rr, FY + Math.sin(ang) * rr * 0.6), radius: 4, color: k.rgb(255, 220, 60), opacity: 0.85 });
        }
        // Done label
        k.drawText({ text: "✨ GORGEOUS! ✨", size: 30, pos: k.vec2(FX, FY + FRY + 28), anchor: "center", color: k.rgb(200, 40, 120) });
        k.drawText({ text: "You look amazing! 💖", size: 16, pos: k.vec2(FX, FY + FRY + 62), anchor: "center", color: k.rgb(160, 60, 120) });
        // Override instruction bar
        emojiLbl.text = "🌟";
        instrLbl.text = "All done! You're gorgeous!";
        stepCounter.text = `${STEPS.length} / ${STEPS.length}`;
      }
    });

    updateUI();
  });

  k.go("main");
  return () => k.quit();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function drawLashes(k: K, ex: number, ey: number, ew: number, eh: number, amount: number) {
  if (amount <= 0) return;
  const count = 8;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1) - 0.5;
    const bx = ex + t * ew * 1.9;
    const by = ey - eh * 0.88;
    const ang = t * 0.55;
    const len = (9 + Math.abs(t) * 5) * amount;
    k.drawLine({
      p1: k.vec2(bx, by),
      p2: k.vec2(bx + Math.sin(ang) * len * 0.4, by - Math.cos(ang) * len),
      width: 2.2,
      color: k.rgb(8, 8, 8),
      opacity: amount,
    });
  }
}

function drawPolyLine(k: K, pts: { x: number; y: number }[], width: number, color: ReturnType<K["rgb"]>) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    k.drawLine({ p1: k.vec2(a.x, a.y), p2: k.vec2(b.x, b.y), width, color });
  }
}

function brushColor(step: string): [number, number, number] {
  switch (step) {
    case "water1":     return [100, 180, 255];
    case "soap":       return [200, 235, 255];
    case "water2":     return [100, 180, 255];
    case "foundation": return [228, 182, 148];
    case "rub":        return [210, 162, 128];
    case "eyeshadow":  return [155, 95, 210];
    case "eyeliner":   return [20, 12, 12];
    case "mascara":    return [20, 12, 12];
    case "blush":      return [255, 140, 170];
    case "lipstick":   return [210, 38, 85];
    default:           return [200, 200, 200];
  }
}
