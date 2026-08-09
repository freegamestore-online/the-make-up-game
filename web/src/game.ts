import kaplay from "kaplay";

type K = ReturnType<typeof kaplay>;

const VW = 400;
const VH = 650;

// ─── Palette ────────────────────────────────────────────────────────────────
const SKIN_DIRTY   = [120, 90, 70] as const;
const SKIN_CLEAN   = [255, 213, 185] as const;
const SKIN_FOUND   = [230, 185, 155] as const;

// ─── Step definitions ────────────────────────────────────────────────────────
const STEPS = [
  { id: "dirty",      label: "Eww! Wash the dirty face with water",   icon: "💧" },
  { id: "soap",       label: "Apply soap and scrub!",                  icon: "🧼" },
  { id: "rinse",      label: "Rinse off the bubbles with water",       icon: "💧" },
  { id: "foundation", label: "Apply foundation evenly",                icon: "🧴" },
  { id: "rub",        label: "Rub the foundation in smoothly",         icon: "🫧" },
  { id: "eyeshadow",  label: "Apply eye shadow",                       icon: "👁️" },
  { id: "eyeliner",   label: "Draw the eye liner",                     icon: "🖊️" },
  { id: "mascara",    label: "Apply mascara",                          icon: "✨" },
  { id: "blush",      label: "Add blush to the cheeks",                icon: "🌸" },
  { id: "lipstick",   label: "Apply lipstick",                         icon: "💄" },
  { id: "done",       label: "You're done! Gorgeous! 💖",              icon: "🌟" },
];

export function startGame(canvas: HTMLCanvasElement, onScore: (n: number) => void): () => void {
  const k = kaplay({
    canvas,
    width: VW,
    height: VH,
    letterbox: true,
    background: [255, 240, 248],
    global: false,
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  });

  let stepIndex = 0;
  onScore(0);

  // ── Shared drawing canvas (offscreen) for scrub/paint effects ──
  // We track "coverage" as a simple counter 0–1 for each step
  let coverage = 0;
  let stepComplete = false;
  let isPointerDown = false;
  let lastPointer = { x: 0, y: 0 };

  // Per-step state
  let bubbleParticles: Array<{ x: number; y: number; r: number; life: number }> = [];
  let bubbleSpawnTimer = 0;
  let waterDrops: Array<{ x: number; y: number; vy: number; life: number }> = [];

  // Eyeliner drawing points
  let linerPointsL: Array<{ x: number; y: number }> = [];
  let linerPointsR: Array<{ x: number; y: number }> = [];
  let linerPhase = 0; // 0 = left eye, 1 = right eye

  // Mascara brush progress
  let mascaraL = 0;
  let mascaraR = 0;

  // Blush applied
  let blushL = 0;
  let blushR = 0;

  // Lipstick applied
  let lipCoverage = 0;

  // Foundation applied (0–1)
  let foundCoverage = 0;
  let rubCoverage = 0;

  // Eyeshadow
  let eyeshadowL = 0;
  let eyeshadowR = 0;

  // ── Face geometry (centered) ──
  const FX = VW / 2;
  const FY = VH / 2 - 10;
  const FRX = 85; // face rx
  const FRY = 105; // face ry

  // Eyes
  const ELX = FX - 32, ELY = FY - 18;
  const ERX = FX + 32, ERY = FY - 18;
  const EW = 28, EH = 13;

  // Nose
  const NX = FX, NY = FY + 10;

  // Mouth
  const MX = FX, MY = FY + 42;
  const MW = 38, MH = 14;

  // Cheeks
  const CLX = FX - 60, CLY = FY + 12;
  const CRX = FX + 60, CRY = FY + 12;
  const CR = 22;

  function inFace(x: number, y: number, margin = 10): boolean {
    const dx = (x - FX) / (FRX + margin);
    const dy = (y - FY) / (FRY + margin);
    return dx * dx + dy * dy <= 1;
  }

  function inEye(x: number, y: number, ex: number, ey: number): boolean {
    const dx = (x - ex) / (EW + 8);
    const dy = (y - ey) / (EH + 8);
    return dx * dx + dy * dy <= 1;
  }

  function inCheek(x: number, y: number, cx: number, cy: number): boolean {
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= (CR + 12) * (CR + 12);
  }

  function inMouth(x: number, y: number): boolean {
    const dx = (x - MX) / (MW + 10);
    const dy = (y - MY) / (MH + 10);
    return dx * dx + dy * dy <= 1;
  }

  function lerp3(a: readonly [number,number,number], b: readonly [number,number,number], t: number): [number,number,number] {
    return [
      Math.round(a[0] + (b[0]-a[0])*t),
      Math.round(a[1] + (b[1]-a[1])*t),
      Math.round(a[2] + (b[2]-a[2])*t),
    ];
  }

  // ── Main scene ─────────────────────────────────────────────────────────────
  k.scene("main", () => {
    stepIndex = 0;
    coverage = 0;
    stepComplete = false;
    bubbleParticles = [];
    waterDrops = [];
    linerPointsL = [];
    linerPointsR = [];
    linerPhase = 0;
    mascaraL = 0; mascaraR = 0;
    blushL = 0; blushR = 0;
    lipCoverage = 0;
    foundCoverage = 0;
    rubCoverage = 0;
    eyeshadowL = 0; eyeshadowR = 0;
    isPointerDown = false;
    onScore(0);

    // ── BG gradient ──
    k.add([
      k.rect(VW, VH),
      k.color(255, 235, 245),
      k.pos(0, 0),
      k.fixed(),
      k.z(-10),
    ]);

    // ── Instruction bar ──
    const instrBg = k.add([
      k.rect(VW, 64),
      k.color(255, 192, 220),
      k.pos(0, 0),
      k.fixed(),
      k.z(10),
    ]);
    instrBg;

    const instrText = k.add([
      k.text("", { size: 15, width: VW - 32, align: "center" }),
      k.color(100, 20, 60),
      k.anchor("center"),
      k.pos(VW / 2, 32),
      k.fixed(),
      k.z(11),
    ]);

    // ── Step icon pill ──
    const stepLabel = k.add([
      k.text("", { size: 22 }),
      k.anchor("center"),
      k.pos(VW / 2, VH - 30),
      k.fixed(),
      k.z(11),
    ]);

    // ── Progress bar ──
    const progBg = k.add([
      k.rect(VW - 40, 8, { radius: 4 }),
      k.color(220, 180, 200),
      k.pos(20, VH - 14),
      k.fixed(),
      k.z(11),
    ]);
    progBg;

    const progBar = k.add([
      k.rect(1, 8, { radius: 4 }),
      k.color(220, 80, 140),
      k.pos(20, VH - 14),
      k.fixed(),
      k.z(12),
    ]);

    // ── Next button (appears when step complete) ──
    const nextBtn = k.add([
      k.rect(140, 44, { radius: 22 }),
      k.color(220, 80, 140),
      k.anchor("center"),
      k.pos(VW / 2, VH - 60),
      k.fixed(),
      k.z(13),
      k.area(),
      k.opacity(0),
      "nextbtn",
    ]);
    const nextTxt = k.add([
      k.text("Next ➜", { size: 18 }),
      k.color(255, 255, 255),
      k.anchor("center"),
      k.pos(VW / 2, VH - 60),
      k.fixed(),
      k.z(14),
      k.opacity(0),
    ]);

    function showNext(show: boolean) {
      nextBtn.opacity = show ? 1 : 0;
      nextTxt.opacity = show ? 1 : 0;
      (nextBtn.area as unknown as { disabled: boolean }).disabled = !show;
    }
    showNext(false);

    nextBtn.onClick(() => {
      if (!stepComplete) return;
      stepIndex++;
      coverage = 0;
      stepComplete = false;
      bubbleParticles = [];
      waterDrops = [];
      showNext(false);
      updateStep();
      if (stepIndex < STEPS.length - 1) {
        onScore(Math.round((stepIndex / (STEPS.length - 1)) * 100));
      } else {
        onScore(100);
      }
    });

    function updateStep() {
      const s = STEPS[stepIndex];
      if (!s) return;
      instrText.text = s.icon + "  " + s.label;
      stepLabel.text = `Step ${stepIndex + 1} / ${STEPS.length - 1}`;
      if (stepIndex >= STEPS.length - 1) {
        stepLabel.text = "🌟 Complete!";
        instrText.text = "💖 You're done! Gorgeous!";
        showNext(false);
        stepComplete = true;
        onScore(100);
      }
    }
    updateStep();

    // ── Main draw loop ──────────────────────────────────────────────────────
    k.onDraw(() => {
      const step = STEPS[stepIndex]?.id ?? "done";

      // ── Skin colour based on step ──
      let skinColor: [number,number,number];
      if (step === "dirty") {
        skinColor = [...SKIN_DIRTY];
      } else if (step === "soap") {
        skinColor = lerp3(SKIN_DIRTY, SKIN_CLEAN, coverage * 0.5);
      } else if (step === "rinse") {
        skinColor = lerp3(lerp3(SKIN_DIRTY, SKIN_CLEAN, 0.5), SKIN_CLEAN, coverage);
      } else if (step === "foundation") {
        skinColor = lerp3(SKIN_CLEAN, SKIN_FOUND, foundCoverage);
      } else {
        skinColor = [...SKIN_FOUND];
      }

      // Face shadow
      k.drawEllipse({
        radiusX: FRX + 4,
        radiusY: FRY + 4,
        pos: k.vec2(FX + 4, FY + 6),
        color: k.rgb(180, 140, 120),
        opacity: 0.18,
      });

      // Face
      k.drawEllipse({
        radiusX: FRX,
        radiusY: FRY,
        pos: k.vec2(FX, FY),
        color: k.rgb(skinColor[0], skinColor[1], skinColor[2]),
      });

      // ── Dirty spots ──
      if (step === "dirty" || step === "soap") {
        const spots = [
          { x: FX - 30, y: FY - 40, r: 14 },
          { x: FX + 40, y: FY - 20, r: 10 },
          { x: FX - 10, y: FY + 30, r: 12 },
          { x: FX + 20, y: FY + 50, r: 8 },
          { x: FX - 50, y: FY + 10, r: 9 },
          { x: FX + 10, y: FY - 60, r: 7 },
        ];
        const fade = step === "dirty" ? 1 : Math.max(0, 1 - coverage * 1.5);
        for (const sp of spots) {
          k.drawCircle({
            pos: k.vec2(sp.x, sp.y),
            radius: sp.r,
            color: k.rgb(80, 50, 30),
            opacity: 0.55 * fade,
          });
        }
      }

      // ── Hair ──
      k.drawEllipse({
        radiusX: FRX + 8,
        radiusY: FRY * 0.65,
        pos: k.vec2(FX, FY - FRY * 0.45),
        color: k.rgb(60, 35, 20),
      });
      // Hair sides
      k.drawEllipse({
        radiusX: 28,
        radiusY: FRY * 0.8,
        pos: k.vec2(FX - FRX + 8, FY - 10),
        color: k.rgb(60, 35, 20),
      });
      k.drawEllipse({
        radiusX: 28,
        radiusY: FRY * 0.8,
        pos: k.vec2(FX + FRX - 8, FY - 10),
        color: k.rgb(60, 35, 20),
      });

      // ── Neck ──
      k.drawRect({
        pos: k.vec2(FX - 22, FY + FRY - 10),
        width: 44,
        height: 50,
        color: k.rgb(skinColor[0], skinColor[1], skinColor[2]),
      });

      // ── Eyebrows ──
      const browColor = k.rgb(60, 35, 20);
      k.drawRect({ pos: k.vec2(ELX - 18, ELY - 20), width: 36, height: 5, radius: 3, color: browColor });
      k.drawRect({ pos: k.vec2(ERX - 18, ERY - 20), width: 36, height: 5, radius: 3, color: browColor });

      // ── Eye shadow ──
      if (eyeshadowL > 0) {
        k.drawEllipse({
          radiusX: EW + 4,
          radiusY: EH + 6,
          pos: k.vec2(ELX, ELY - 3),
          color: k.rgb(160, 100, 200),
          opacity: eyeshadowL * 0.7,
        });
      }
      if (eyeshadowR > 0) {
        k.drawEllipse({
          radiusX: EW + 4,
          radiusY: EH + 6,
          pos: k.vec2(ERX, ERY - 3),
          color: k.rgb(160, 100, 200),
          opacity: eyeshadowR * 0.7,
        });
      }

      // ── Eyes whites ──
      k.drawEllipse({ radiusX: EW, radiusY: EH, pos: k.vec2(ELX, ELY), color: k.rgb(255, 255, 255) });
      k.drawEllipse({ radiusX: EW, radiusY: EH, pos: k.vec2(ERX, ERY), color: k.rgb(255, 255, 255) });
      // Iris
      k.drawCircle({ pos: k.vec2(ELX, ELY), radius: 8, color: k.rgb(80, 50, 20) });
      k.drawCircle({ pos: k.vec2(ERX, ERY), radius: 8, color: k.rgb(80, 50, 20) });
      // Pupil
      k.drawCircle({ pos: k.vec2(ELX, ELY), radius: 4, color: k.rgb(10, 10, 10) });
      k.drawCircle({ pos: k.vec2(ERX, ERY), radius: 4, color: k.rgb(10, 10, 10) });
      // Highlight
      k.drawCircle({ pos: k.vec2(ELX + 3, ELY - 3), radius: 2, color: k.rgb(255, 255, 255) });
      k.drawCircle({ pos: k.vec2(ERX + 3, ERY - 3), radius: 2, color: k.rgb(255, 255, 255) });

      // ── Eyeliner ──
      if (linerPointsL.length > 1) {
        for (let i = 1; i < linerPointsL.length; i++) {
          const a = linerPointsL[i - 1]!;
          const b = linerPointsL[i]!;
          k.drawLine({ p1: k.vec2(a.x, a.y), p2: k.vec2(b.x, b.y), width: 2.5, color: k.rgb(20, 10, 10) });
        }
      }
      if (linerPointsR.length > 1) {
        for (let i = 1; i < linerPointsR.length; i++) {
          const a = linerPointsR[i - 1]!;
          const b = linerPointsR[i]!;
          k.drawLine({ p1: k.vec2(a.x, a.y), p2: k.vec2(b.x, b.y), width: 2.5, color: k.rgb(20, 10, 10) });
        }
      }

      // ── Mascara lashes ──
      drawLashes(k, ELX, ELY, EW, EH, mascaraL);
      drawLashes(k, ERX, ERY, EW, EH, mascaraR);

      // ── Nose ──
      k.drawLine({ p1: k.vec2(NX - 8, NY + 12), p2: k.vec2(NX, NY - 8), width: 2, color: k.rgb(skinColor[0]-30, skinColor[1]-30, skinColor[2]-30) });
      k.drawLine({ p1: k.vec2(NX + 8, NY + 12), p2: k.vec2(NX, NY - 8), width: 2, color: k.rgb(skinColor[0]-30, skinColor[1]-30, skinColor[2]-30) });
      k.drawLine({ p1: k.vec2(NX - 10, NY + 14), p2: k.vec2(NX + 10, NY + 14), width: 2, color: k.rgb(skinColor[0]-30, skinColor[1]-30, skinColor[2]-30) });

      // ── Blush ──
      if (blushL > 0) {
        k.drawCircle({ pos: k.vec2(CLX, CLY), radius: CR, color: k.rgb(255, 150, 170), opacity: blushL * 0.55 });
      }
      if (blushR > 0) {
        k.drawCircle({ pos: k.vec2(CRX, CRY), radius: CR, color: k.rgb(255, 150, 170), opacity: blushR * 0.55 });
      }

      // ── Mouth ──
      const lipR = lipCoverage > 0 ? k.rgb(200, 40, 80) : k.rgb(skinColor[0]-20, skinColor[1]-50, skinColor[2]-40);
      // Upper lip
      k.drawEllipse({ radiusX: MW, radiusY: MH * 0.7, pos: k.vec2(MX, MY - 4), color: lipR });
      // Lower lip
      k.drawEllipse({ radiusX: MW - 4, radiusY: MH, pos: k.vec2(MX, MY + 5), color: lipR });
      // Lip line
      k.drawLine({ p1: k.vec2(MX - MW + 2, MY), p2: k.vec2(MX + MW - 2, MY), width: 1.5, color: k.rgb(lipR.r - 30, lipR.g - 20, lipR.b - 20) });

      // ── Foundation rubbing overlay ──
      if (step === "rub" && rubCoverage > 0) {
        k.drawEllipse({
          radiusX: FRX,
          radiusY: FRY,
          pos: k.vec2(FX, FY),
          color: k.rgb(SKIN_FOUND[0], SKIN_FOUND[1], SKIN_FOUND[2]),
          opacity: Math.min(rubCoverage, 1) * 0.5,
        });
      }

      // ── Bubbles (soap step) ──
      for (const b of bubbleParticles) {
        k.drawCircle({ pos: k.vec2(b.x, b.y), radius: b.r, color: k.rgb(200, 230, 255), opacity: b.life * 0.5 });
        k.drawCircle({ pos: k.vec2(b.x - b.r * 0.3, b.y - b.r * 0.3), radius: b.r * 0.25, color: k.rgb(255, 255, 255), opacity: b.life * 0.8 });
      }

      // ── Water drops (rinse step) ──
      for (const d of waterDrops) {
        k.drawCircle({ pos: k.vec2(d.x, d.y), radius: 4, color: k.rgb(100, 180, 255), opacity: d.life * 0.7 });
      }

      // ── Scrub brush cursor indicator ──
      if (isPointerDown && (step === "dirty" || step === "soap" || step === "rinse" || step === "foundation" || step === "rub" || step === "eyeshadow" || step === "mascara" || step === "blush" || step === "lipstick")) {
        const brushColor = getBrushColor(step);
        k.drawCircle({ pos: k.vec2(lastPointer.x, lastPointer.y), radius: 18, color: k.rgb(...brushColor), opacity: 0.35 });
        k.drawCircle({ pos: k.vec2(lastPointer.x, lastPointer.y), radius: 18, color: k.rgb(...brushColor), opacity: 0.0, outline: { width: 2, color: k.rgb(...brushColor) } });
      }

      // ── Progress bar ──
      const prog = getProgress();
      progBar.width = Math.max(1, (VW - 40) * prog);

      // ── Step complete flash ──
      if (stepComplete && step !== "done") {
        const t = (k.time() * 3) % 1;
        const alpha = Math.sin(t * Math.PI) * 0.15;
        k.drawRect({ pos: k.vec2(0, 0), width: VW, height: VH, color: k.rgb(255, 200, 230), opacity: alpha });
      }

      // ── Done confetti ──
      if (step === "done") {
        const t = k.time();
        for (let i = 0; i < 18; i++) {
          const angle = (i / 18) * Math.PI * 2 + t * 0.8;
          const r = 120 + Math.sin(t * 2 + i) * 30;
          const cx = FX + Math.cos(angle) * r;
          const cy = FY + Math.sin(angle) * r * 0.5 - 20;
          const colors: [number,number,number][] = [[255,80,140],[255,200,50],[100,200,255],[200,100,255],[80,220,120]];
          const col = colors[i % 5]!;
          k.drawRect({ pos: k.vec2(cx - 5, cy - 5), width: 10, height: 10, color: k.rgb(...col), angle: t * 120 + i * 30 });
        }
        // "GORGEOUS!" text
        k.drawText({
          text: "✨ GORGEOUS! ✨",
          size: 28,
          pos: k.vec2(FX, FY + FRY + 30),
          anchor: "center",
          color: k.rgb(200, 40, 120),
        });
      }
    });

    // ── Update loop ─────────────────────────────────────────────────────────
    k.onUpdate(() => {
      const step = STEPS[stepIndex]?.id ?? "done";
      const dt = k.dt();

      // Bubble animation
      if (step === "soap" && isPointerDown) {
        bubbleSpawnTimer += dt;
        if (bubbleSpawnTimer > 0.05) {
          bubbleSpawnTimer = 0;
          if (inFace(lastPointer.x, lastPointer.y)) {
            for (let i = 0; i < 3; i++) {
              bubbleParticles.push({
                x: lastPointer.x + (Math.random() - 0.5) * 30,
                y: lastPointer.y + (Math.random() - 0.5) * 30,
                r: 4 + Math.random() * 10,
                life: 1,
              });
            }
          }
        }
      }

      // Bubble float & fade
      for (const b of bubbleParticles) {
        b.y -= dt * 15;
        b.life -= dt * 0.4;
      }
      bubbleParticles = bubbleParticles.filter(b => b.life > 0);

      // Water drops (rinse)
      if (step === "rinse" && isPointerDown) {
        if (Math.random() < 0.4) {
          waterDrops.push({
            x: lastPointer.x + (Math.random() - 0.5) * 40,
            y: lastPointer.y,
            vy: 60 + Math.random() * 80,
            life: 1,
          });
        }
      }
      for (const d of waterDrops) {
        d.y += d.vy * dt;
        d.life -= dt * 1.5;
      }
      waterDrops = waterDrops.filter(d => d.life > 0);

      // Check completion
      if (!stepComplete) {
        const prog = getProgress();
        if (prog >= 1) {
          stepComplete = true;
          showNext(step !== "done");
        }
      }
    });

    function getProgress(): number {
      const step = STEPS[stepIndex]?.id ?? "done";
      switch (step) {
        case "dirty":      return coverage;
        case "soap":       return coverage;
        case "rinse":      return coverage;
        case "foundation": return foundCoverage;
        case "rub":        return rubCoverage;
        case "eyeshadow":  return Math.min(1, (eyeshadowL + eyeshadowR) / 2);
        case "eyeliner": {
          const lDone = linerPointsL.length > 6 ? 1 : linerPointsL.length / 7;
          const rDone = linerPointsR.length > 6 ? 1 : linerPointsR.length / 7;
          return (lDone + rDone) / 2;
        }
        case "mascara":    return Math.min(1, (mascaraL + mascaraR) / 2);
        case "blush":      return Math.min(1, (blushL + blushR) / 2);
        case "lipstick":   return lipCoverage;
        case "done":       return 1;
        default:           return 0;
      }
    }

    // ── Pointer input ───────────────────────────────────────────────────────
    function handlePointerMove(pos: { x: number; y: number }) {
      const step = STEPS[stepIndex]?.id ?? "done";
      if (!isPointerDown) return;

      const px = pos.x, py = pos.y;
      lastPointer = { x: px, y: py };

      if (step === "dirty" || step === "rinse") {
        if (inFace(px, py)) coverage = Math.min(1, coverage + 0.012);
      }
      if (step === "soap") {
        if (inFace(px, py)) coverage = Math.min(1, coverage + 0.01);
      }
      if (step === "foundation") {
        if (inFace(px, py)) foundCoverage = Math.min(1, foundCoverage + 0.015);
      }
      if (step === "rub") {
        if (inFace(px, py)) rubCoverage = Math.min(1, rubCoverage + 0.012);
      }
      if (step === "eyeshadow") {
        if (inEye(px, py, ELX, ELY)) eyeshadowL = Math.min(1, eyeshadowL + 0.04);
        if (inEye(px, py, ERX, ERY)) eyeshadowR = Math.min(1, eyeshadowR + 0.04);
      }
      if (step === "eyeliner") {
        if (linerPhase === 0) {
          if (inEye(px, py, ELX, ELY)) {
            linerPointsL.push({ x: px, y: py });
            if (linerPointsL.length >= 8) linerPhase = 1;
          }
        } else {
          if (inEye(px, py, ERX, ERY)) {
            linerPointsR.push({ x: px, y: py });
          }
        }
      }
      if (step === "mascara") {
        if (inEye(px, py, ELX, ELY)) mascaraL = Math.min(1, mascaraL + 0.05);
        if (inEye(px, py, ERX, ERY)) mascaraR = Math.min(1, mascaraR + 0.05);
      }
      if (step === "blush") {
        if (inCheek(px, py, CLX, CLY)) blushL = Math.min(1, blushL + 0.04);
        if (inCheek(px, py, CRX, CRY)) blushR = Math.min(1, blushR + 0.04);
      }
      if (step === "lipstick") {
        if (inMouth(px, py)) lipCoverage = Math.min(1, lipCoverage + 0.05);
      }
    }

    k.onMouseMove((pos) => {
      lastPointer = { x: pos.x, y: pos.y };
      handlePointerMove(pos);
    });
    k.onMousePress(() => { isPointerDown = true; });
    k.onMouseRelease(() => { isPointerDown = false; });

    // Touch
    k.onTouchStart((touch) => {
      isPointerDown = true;
      lastPointer = { x: touch.x, y: touch.y };
    });
    k.onTouchMove((touch) => {
      lastPointer = { x: touch.x, y: touch.y };
      handlePointerMove(touch);
    });
    k.onTouchEnd(() => { isPointerDown = false; });

    updateStep();
  });

  k.go("main");
  return () => k.quit();
}

// ── Lash drawing helper ───────────────────────────────────────────────────────
function drawLashes(k: K, ex: number, ey: number, ew: number, eh: number, amount: number) {
  if (amount <= 0) return;
  const count = 7;
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) - 0.5;
    const bx = ex + t * ew * 1.8;
    const by = ey - eh * 0.85;
    const angle = t * 0.6;
    const len = (8 + Math.abs(t) * 4) * amount;
    k.drawLine({
      p1: k.vec2(bx, by),
      p2: k.vec2(bx + Math.sin(angle) * len * 0.5, by - Math.cos(angle) * len),
      width: 2,
      color: k.rgb(10, 10, 10),
      opacity: amount,
    });
  }
}

// ── Brush colour per step ─────────────────────────────────────────────────────
function getBrushColor(step: string): [number, number, number] {
  switch (step) {
    case "dirty":      return [100, 180, 255];
    case "soap":       return [200, 230, 255];
    case "rinse":      return [100, 180, 255];
    case "foundation": return [230, 185, 155];
    case "rub":        return [210, 165, 135];
    case "eyeshadow":  return [160, 100, 200];
    case "mascara":    return [20, 10, 10];
    case "blush":      return [255, 150, 170];
    case "lipstick":   return [200, 40, 80];
    default:           return [200, 200, 200];
  }
}
