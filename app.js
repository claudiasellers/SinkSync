(() => {
  "use strict";

  const STORAGE_KEY = "sinksync-progress-v1";
  const collectibles = [
    { id: "mug", image: "assets/collectible-moon-mug.webp", name: "Moon mug", cost: 1, rarity: "cozy find" },
    { id: "sprout", image: "assets/collectible-window-sprout.webp", name: "Window sprout", cost: 4, rarity: "small wonder" },
    { id: "lamp", image: "assets/collectible-soft-lamp.webp", name: "Soft lamp", cost: 8, rarity: "warm find" },
    { id: "fern", image: "assets/collectible-night-fern.webp", name: "Night fern", cost: 14, rarity: "lush find" },
    { id: "radio", image: "assets/collectible-tiny-radio.webp", name: "Tiny radio", cost: 22, rarity: "good company" },
    { id: "rare", image: "assets/collectible-star-cactus.webp", name: "Star cactus", cost: Infinity, rarity: "rare boss find", rare: true }
  ];

  const tinySteps = [
    { step: "Put your phone somewhere you can still see this.", smaller: "Move the phone one hand-width away from the sink." },
    { step: "Stand in front of the sink. Don’t clean anything yet.", smaller: "Put both feet on the floor. Now point your body toward the sink." },
    { step: "Find your sponge or dish brush. Put it beside the sink.", smaller: "Look for the sponge. You do not have to pick it up yet." },
    { step: "Turn on the water. Aim for warm, not hot.", smaller: "Touch the faucet handle. That is the entire step." },
    { step: "Choose the least gross thing you can see.", smaller: "Just look. Find one cup, fork, or plate that feels least bad." },
    { step: "Pick it up by the cleanest-looking edge.", smaller: "Put one finger on its cleanest-looking edge." },
    { step: "Push any solid food into the trash or disposal.", smaller: "Use a fork or paper towel as a barrier. Move just the biggest piece." },
    { step: "Put one squeeze of soap on the sponge or brush.", smaller: "Pick up the soap bottle. Don’t squeeze it yet." },
    { step: "Wet the sponge or brush.", smaller: "Move the sponge under the water for one second." },
    { step: "Scrub only the front or inside of the dish.", smaller: "Make three little circles in one spot." },
    { step: "Flip it over. Scrub the back.", smaller: "Turn the dish over. That is the whole step." },
    { step: "Rinse until you can’t see bubbles.", smaller: "Put one edge under the water. Let the water do the work." },
    { step: "Put it in the drying rack.", smaller: "Move it toward the rack. You can set it down anywhere safe." }
  ];

  const defaults = { totalDrops: 0, totalItems: 0, sessions: 0, unlocked: [], sound: true };
  let saved = loadProgress();
  let state = freshSession();
  let timerId = null;
  let dropId = null;
  let scrubProgress = 0;
  let scrubLastX = null;
  let scrubLastDirection = 0;
  let scrubActive = false;
  let scrubStartedAt = 0;
  let scrubTurns = 0;
  let scrubFinishing = false;
  let lastBubbleAt = 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  class SinkAudio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.playing = false;
      this.step = 0;
      this.loop = null;
      this.layers = 1;
      this.boss = false;
    }
    ensure() {
      if (!saved.sound) return false;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.42;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
      return true;
    }
    unlock(playCue = false) {
      if (!this.ensure()) return;
      const confirm = () => {
        if (!playCue || !saved.sound) return;
        this.tone(659.25, .1, "sine", .075);
        setTimeout(() => this.tone(880, .13, "sine", .055), 70);
      };
      if (this.ctx.state === "running") confirm();
      else this.ctx.resume().then(confirm).catch(() => {});
    }
    start() {
      if (!this.ensure()) return;
      this.stopLoop();
      this.playing = true;
      this.step = 0;
      this.scheduleLoop();
    }
    stopLoop() {
      if (this.loop) clearInterval(this.loop);
      this.loop = null;
    }
    stop() { this.playing = false; this.stopLoop(); }
    setLayers(value) { this.layers = Math.max(1, Math.min(4, value)); }
    setBoss(value) {
      this.boss = value;
      if (this.playing) this.start();
    }
    scheduleLoop() {
      const interval = this.boss ? 112 : 192;
      const tick = () => {
        if (!this.playing || !saved.sound || !this.ctx) return;
        const s = this.step++ % 16;
        if (s % 4 === 0) this.kick(this.boss ? .2 : .15);
        // The first layer must survive small phone and laptop speakers.
        if (!this.boss && (s === 2 || s === 10)) {
          const pulseNotes = [196, 220];
          this.tone(pulseNotes[s === 2 ? 0 : 1], .3, "triangle", .062);
        }
        if (this.layers >= 2 && s % 2 === 0) this.hat(s % 4 === 2 ? .05 : .034);
        if (this.layers >= 3 && s % 4 === 0) {
          const notes = this.boss ? [98, 110, 131, 147] : [146.8, 164.8, 196, 164.8];
          this.tone(notes[Math.floor(s / 4)], .18, "triangle", .06);
        }
        if (this.layers >= 4 && (s === 2 || s === 6 || s === 10 || s === 14)) {
          const notes = this.boss ? [392, 440, 523, 587] : [293.7, 329.6, 392, 329.6];
          this.tone(notes[(s - 2) / 4], .13, "sine", .045);
        }
      };
      tick();
      this.loop = setInterval(tick, interval);
    }
    tone(freq, duration, type = "sine", volume = .04) {
      if (!this.ensure()) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(gain); gain.connect(this.master); osc.start(now); osc.stop(now + duration + .03);
    }
    kick(volume) {
      if (!this.ensure()) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(105, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + .11);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .14);
      osc.connect(gain); gain.connect(this.master); osc.start(now); osc.stop(now + .15);
    }
    hat(volume) {
      if (!this.ensure()) return;
      const now = this.ctx.currentTime;
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * .035, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      source.buffer = buffer; filter.type = "highpass"; filter.frequency.value = 6500;
      gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.0001, now + .035);
      source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start(now);
    }
    chime() {
      if (!this.ensure()) return;
      [523.25, 783.99].forEach((note, index) => setTimeout(() => this.tone(note, .28, "sine", .065), index * 65));
    }
    complete(boss = false) {
      if (!this.ensure()) return;
      const notes = boss ? [392, 523.25, 659.25] : [523.25, 659.25, 783.99];
      notes.forEach((note, index) => setTimeout(() => this.tone(note, .2, "sine", .042), index * 52));
    }
    reward() {
      if (!this.ensure()) return;
      [392, 493.9, 587.3, 784].forEach((note, index) => setTimeout(() => this.tone(note, .34, "triangle", .055), index * 95));
    }
    blip() { this.tone(440 + Math.random() * 70, .08, "sine", .028); }
  }

  const audio = new SinkAudio();

  function freshSession() {
    return { phase: "entry", elapsed: 0, items: 0, drops: 0, momentum: 1, bossLeft: 60, bossItems: 0, rareWon: false, lastReward: null, sequenceIndex: 0, sequenceSmaller: false, sequenceDetour: false };
  }

  function loadProgress() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
    catch { return { ...defaults }; }
  }
  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    renderPersistent();
  }
  function vibrate(pattern) { if ("vibrate" in navigator) navigator.vibrate(pattern); }

  function showView(name) {
    $$(".view").forEach(view => {
      const active = view.id === "view-" + name;
      view.classList.toggle("active", active);
      view.setAttribute("aria-hidden", String(!active));
    });
    state.phase = name;
    document.body.classList.toggle("sequence-active", name === "sequence");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return m + ":" + s;
  }

  function startPrimer() {
    stopTimers();
    state = freshSession();
    scrubProgress = 0;
    scrubLastX = null;
    scrubLastDirection = 0;
    scrubActive = false;
    scrubStartedAt = 0;
    scrubTurns = 0;
    scrubFinishing = false;
    lastBubbleAt = 0;
    $("#scrubMeter").style.setProperty("--progress", "0%");
    $("#scrubPad").setAttribute("aria-valuenow", "0");
    $("#scrubPad").classList.remove("active", "scrub-complete");
    $("#scrubGrime").style.opacity = ".92";
    $("#scrubBubbles").replaceChildren();
    $("#scrubSuccess").hidden = true;
    $("#scrubLabel").textContent = "scrub back + forth";
    showView("primer");
  }

  function startSession(skipPrimer = false) {
    state = freshSession();
    state.phase = "session";
    state.items = skipPrimer ? 0 : 1;
    showView("session");
    renderSession();
    audio.setBoss(false);
    audio.setLayers(1);
    audio.start();
    saved.sessions += 1;
    persist();
    timerId = setInterval(() => {
      state.elapsed += 1;
      $("#sessionTimer").textContent = formatTime(state.elapsed);
      if (state.elapsed % 18 === 0) earnDrop(1, "a drop found");
    }, 1000);
    dropId = setInterval(() => earnDrop(1, "momentum drop"), 42000);
    announce("Session started. One item already counts.");
  }

  function stopTimers() {
    clearInterval(timerId); clearInterval(dropId);
    timerId = null; dropId = null;
  }

  function renderPersistent() {
    $("#headerDropCount").textContent = saved.totalDrops;
    $("#entryDrops").textContent = saved.totalDrops;
    $("#entryItems").textContent = saved.totalItems;
    $("#entrySessions").textContent = saved.sessions;
    const unlocked = collectibles.filter(c => saved.unlocked.includes(c.id));
    $("#roomProgress").textContent = unlocked.length + (unlocked.length === 1 ? " thing found" : " things found");
    $("#entryShelf").innerHTML = unlocked.length
      ? unlocked.slice(-5).map(c => `<span class="shelf-sprite" title="${c.name}"><img src="${c.image}" alt=""></span>`).join("")
      : '<span class="shelf-empty">Your first tiny start<br>puts something here.</span>';
    renderCollection();
    $("#soundIcon").textContent = saved.sound ? "♪" : "×";
    const soundButton = $('[data-action="sound"]');
    soundButton.setAttribute("aria-pressed", String(!saved.sound));
    soundButton.setAttribute("aria-label", saved.sound ? "Mute sound" : "Turn sound on");
  }

  function unlockEligible() {
    let newest = null;
    collectibles.filter(c => !c.rare && saved.totalDrops >= c.cost).forEach(c => {
      if (!saved.unlocked.includes(c.id)) { saved.unlocked.push(c.id); newest = c; }
    });
    return newest;
  }

  function earnDrop(amount, message) {
    state.drops += amount;
    saved.totalDrops += amount;
    const unlocked = unlockEligible();
    if (unlocked) state.lastReward = unlocked;
    persist();
    renderSession();
    const toast = $("#dropToast");
    toast.textContent = "+ " + amount + " " + message;
    toast.classList.remove("show"); void toast.offsetWidth; toast.classList.add("show");
    audio.blip();
  }

  function renderSession() {
    $("#sessionTimer").textContent = formatTime(state.elapsed);
    $("#itemCount").textContent = state.items;
    $("#sessionDrops").textContent = state.drops;
    const names = ["soft pulse", "rhythm joined", "bassline joined", "melody joined"];
    $("#momentumText").textContent = names[state.momentum - 1];
    $$(".layer-bars span").forEach((bar, i) => bar.classList.toggle("on", i < state.momentum));
    audio.setLayers(state.momentum);
    const next = collectibles.find(c => !c.rare && !saved.unlocked.includes(c.id));
    $("#mysteryObject").innerHTML = next
      ? `<img src="${next.image}" alt="">`
      : '<span class="all-found-spark">✦</span>';
    $("#mysteryObject").style.filter = next ? "blur(7px) grayscale(1)" : "none";
    $("#unlockText").textContent = next
      ? Math.max(0, next.cost - saved.totalDrops) + " drops until it comes into focus."
      : "Your shelf is glowing. You found every cozy thing.";
  }

  function checkIn() {
    state.momentum = Math.min(4, state.momentum + 1);
    if (state.momentum === 4) earnDrop(1, "rhythm drop");
    renderSession();
    vibrate(18);
    $("#momentumOrb").animate(
      [{ transform: "scale(.94)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }],
      { duration: 420, easing: "cubic-bezier(.2,.85,.25,1)" }
    );
    announce("Music momentum: " + $("#momentumText").textContent);
  }

  function addItem(isBoss = false) {
    state.items += 1;
    if (isBoss) {
      state.bossItems = Math.min(3, state.bossItems + 1);
      $("#bossProgress span").forEach((dot, i) => dot.classList.toggle("done", i < state.bossItems));
      $("#bossCountText").textContent = state.bossItems + " of 3 washed";
      $("#bossProgress").setAttribute("aria-label", state.bossItems + " of 3 things washed");
      celebrateCompletion($('[data-action="boss-item"]'), { boss: true, label: state.bossItems + " of 3 washed" });
      if (state.bossItems >= 3) {
        state.rareWon = true;
        if (!saved.unlocked.includes("rare")) saved.unlocked.push("rare");
        state.lastReward = collectibles.find(c => c.id === "rare");
        setTimeout(() => finishSession(true), 420);
      }
    } else {
      if (state.items % 3 === 0) {
        state.momentum = Math.min(4, state.momentum + 1);
        earnDrop(1, "rack drop");
      }
      renderSession();
      celebrateCompletion($('[data-action="item"]'), { label: "+1 washed" });
    }
  }

  function openBreaker() {
    stopTimers();
    audio.stop();
    audio.chime();
    $("#tapoutCopy").textContent = state.items
      ? "You washed " + state.items + (state.items === 1 ? " thing. That’s a win." : " things. That’s a win.")
      : "Showing up counts. Leave the rest.";
    $("#breakerDialog").showModal();
    vibrate([35, 45, 35]);
  }

  function resumeSession() {
    $("#breakerDialog").close();
    audio.start();
    timerId = setInterval(() => {
      state.elapsed += 1;
      $("#sessionTimer").textContent = formatTime(state.elapsed);
      if (state.elapsed % 18 === 0) earnDrop(1, "a drop found");
    }, 1000);
    dropId = setInterval(() => earnDrop(1, "momentum drop"), 42000);
  }


  function startSequence(startIndex = 0) {
    if ($("#breakerDialog").open) $("#breakerDialog").close();
    stopTimers();
    audio.stop();
    state.sequenceIndex = startIndex;
    state.sequenceSmaller = false;
    state.sequenceDetour = false;
    $("#sequenceCard").hidden = false;
    $("#sequenceFinish").hidden = true;
    $(".sequence-exit").hidden = false;
    showView("sequence");
    renderSequence();
    timerId = setInterval(() => { state.elapsed += 1; }, 1000);
    announce("One-step mode started. " + tinySteps[state.sequenceIndex].step);
  }

  function renderSequence() {
    const current = tinySteps[state.sequenceIndex];
    const stepNumber = state.sequenceIndex + 1;
    $("#sequenceCounter").textContent = "Step " + stepNumber + " of " + tinySteps.length;
    $("#sequenceProgress").setAttribute("aria-valuenow", String(stepNumber));
    $("#sequenceProgressBar").style.width = (stepNumber / tinySteps.length * 100) + "%";
    $("#sequenceInstructionLabel").textContent = state.sequenceSmaller ? "Smaller version" : "Do this now";
    $("#sequenceInstruction").textContent = state.sequenceSmaller ? current.smaller : current.step;
    $("#sequenceInstruction").classList.toggle("smaller", state.sequenceSmaller);
    const smallerButton = $('[data-action="sequence-smaller"] span:last-child');
    smallerButton.textContent = state.sequenceSmaller ? "Show original step" : "Make it smaller";
    requestAnimationFrame(() => $("#sequenceInstruction").focus({ preventScroll: true }));
  }

  function sequenceDone() {
    if (state.sequenceDetour) {
      state.sequenceDetour = false;
      state.sequenceSmaller = false;
      renderSequence();
      announce("Good. Back to the same step.");
      return;
    }
    if (state.sequenceIndex < tinySteps.length - 1) {
      state.sequenceIndex += 1;
      state.sequenceSmaller = false;
      renderSequence();
      audio.blip();
      vibrate(12);
      announce(tinySteps[state.sequenceIndex].step);
      return;
    }
    celebrateCompletion($('[data-action="sequence-done"]'), { label: "one whole dish ✓" });
    state.items += 1;
    state.drops += 1;
    saved.totalDrops += 1;
    const unlocked = unlockEligible();
    if (unlocked) state.lastReward = unlocked;
    persist();
    $("#sequenceCard").hidden = true;
    $("#sequenceFinish").hidden = false;
    $(".sequence-exit").hidden = true;
    audio.reward();
    vibrate([22, 30, 45]);
    announce("One complete dish. You may stop, repeat, or return to the music.");
  }

  function toggleSequenceSize() {
    state.sequenceSmaller = !state.sequenceSmaller;
    state.sequenceDetour = false;
    renderSequence();
    announce($("#sequenceInstruction").textContent);
  }

  function openSequenceHelp() {
    $("#sequenceHelpDialog").showModal();
  }

  function setSequenceDetour(message) {
    $("#sequenceHelpDialog").close();
    state.sequenceDetour = true;
    state.sequenceSmaller = false;
    $("#sequenceCounter").textContent = "Blocker workaround";
    $("#sequenceInstructionLabel").textContent = "Try this first";
    $("#sequenceInstruction").classList.add("smaller");
    $("#sequenceInstruction").textContent = message;
    $('[data-action="sequence-smaller"] span:last-child').textContent = "Make it smaller";
    requestAnimationFrame(() => $("#sequenceInstruction").focus({ preventScroll: true }));
    announce(message);
  }

  function resumeFlowFromSequence() {
    stopTimers();
    showView("session");
    renderSession();
    audio.setBoss(false);
    audio.setLayers(state.momentum);
    audio.start();
    timerId = setInterval(() => {
      state.elapsed += 1;
      $("#sessionTimer").textContent = formatTime(state.elapsed);
      if (state.elapsed % 18 === 0) earnDrop(1, "a drop found");
    }, 1000);
    dropId = setInterval(() => earnDrop(1, "momentum drop"), 42000);
    announce("Back in flow. Keep the next thing small.");
  }

  function startBoss() {
    $("#breakerDialog").close();
    state.bossLeft = 60;
    state.bossItems = 0;
    showView("boss");
    $("#bossTimer").textContent = "60";
    $("#bossCountText").textContent = "0 of 3 washed";
    $("#bossProgress").setAttribute("aria-label", "0 of 3 things washed");
    $("#bossProgress span").forEach(dot => dot.classList.remove("done"));
    audio.setBoss(true); audio.setLayers(4); audio.start();
    timerId = setInterval(() => {
      state.bossLeft -= 1;
      state.elapsed += 1;
      $("#bossTimer").textContent = state.bossLeft;
      if (state.bossLeft <= 0) finishSession(false);
    }, 1000);
  }

  function finishSession(bossWon = false) {
    stopTimers();
    audio.stop();
    const sessionReward = state.lastReward || collectibles.find(c => saved.unlocked.includes(c.id)) || collectibles[0];
    if (!saved.unlocked.includes(sessionReward.id) && !sessionReward.rare) saved.unlocked.push(sessionReward.id);
    if (!saved.unlocked.includes("mug")) saved.unlocked.push("mug");
    saved.totalItems += state.items;
    if (state.drops === 0) {
      state.drops = 1;
      saved.totalDrops += 1;
      unlockEligible();
    }
    persist();
    $("#finalItems").textContent = state.items;
    $("#finalTime").textContent = formatTime(state.elapsed);
    $("#finalDrops").textContent = state.drops;
    $("#rewardObject").innerHTML = `<img src="${sessionReward.image}" alt="">`;
    $("#rewardName").textContent = sessionReward.name;
    $("#rewardRarity").textContent = sessionReward.rarity;
    if (bossWon) {
      $("#completeEyebrow").textContent = "Boss cleared";
      $("#complete-title").innerHTML = "You beat the wall.<br><em>Now walk away.</em>";
      $("#completeMessage").textContent = "Three extra things, one rare find, and no requirement to keep going.";
      audio.reward();
    } else {
      $("#completeEyebrow").textContent = "That counts";
      $("#complete-title").innerHTML = "You made the sink<br><em>less impossible.</em>";
      $("#completeMessage").textContent = state.items
        ? "You washed " + state.items + (state.items === 1 ? " thing. The rest can wait." : " things. The rest can wait.")
        : "You interrupted the freeze. That is still information, not failure.";
      audio.chime();
    }
    showView("complete");
  }

  function renderCollection() {
    $("#collectionGrid").innerHTML = collectibles.map(c => {
      const unlocked = saved.unlocked.includes(c.id);
      const requirement = c.rare ? "win a Boss Fight" : c.cost + " drops";
      return `<div class="collectible ${unlocked ? "unlocked" : ""}">
        <span class="object" aria-hidden="true"><img src="${c.image}" alt=""></span>
        <strong>${unlocked ? c.name : "Not found yet"}</strong>
        <small>${unlocked ? c.rarity : requirement}</small>
      </div>`;
    }).join("");
  }


  function celebrateCompletion(source, options = {}) {
    if (!source) return;
    const boss = Boolean(options.boss);
    const rect = source.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    const palette = boss
      ? ["#f1bf4b", "#d55c50", "#fff0c7", "#6aa7d8"]
      : ["#9dcc6f", "#6aa7d8", "#f1bf4b", "#fff0c7"];

    source.classList.remove("completion-pop");
    void source.offsetWidth;
    source.classList.add("completion-pop");

    const bloom = document.createElement("div");
    bloom.className = "completion-bloom" + (boss ? " boss" : "");
    bloom.style.setProperty("--bloom-x", originX + "px");
    bloom.style.setProperty("--bloom-y", originY + "px");

    const burst = document.createElement("div");
    burst.className = "completion-burst";
    burst.style.setProperty("--origin-x", originX + "px");
    burst.style.setProperty("--origin-y", originY + "px");

    const ring = document.createElement("span");
    ring.className = "completion-ring";
    burst.appendChild(ring);

    const count = boss ? 16 : 12;
    for (let i = 0; i < count; i++) {
      const particle = document.createElement("span");
      const angle = (Math.PI * 2 * i / count) + (Math.random() * .24 - .12);
      const distance = (boss ? 72 : 54) + Math.random() * (boss ? 62 : 46);
      particle.className = "completion-particle";
      particle.style.setProperty("--travel-x", Math.cos(angle) * distance + "px");
      particle.style.setProperty("--travel-y", Math.sin(angle) * distance - 16 + "px");
      particle.style.setProperty("--particle-size", (4 + Math.random() * 5) + "px");
      particle.style.setProperty("--particle-color", palette[i % palette.length]);
      particle.style.setProperty("--particle-rotation", (120 + Math.random() * 220) + "deg");
      particle.style.setProperty("--particle-delay", (Math.random() * .07) + "s");
      burst.appendChild(particle);
    }

    const label = document.createElement("span");
    label.className = "completion-label";
    label.textContent = options.label || "+1 washed";
    burst.appendChild(label);

    document.body.append(bloom, burst);
    audio.complete(boss);
    vibrate(boss ? [20, 28, 38] : [14, 24, 28]);

    setTimeout(() => source.classList.remove("completion-pop"), 650);
    setTimeout(() => { bloom.remove(); burst.remove(); }, 1050);
  }

  function announce(message) {
    $("#announcer").textContent = "";
    setTimeout(() => $("#announcer").textContent = message, 20);
  }

  function returnHome() {
    stopTimers(); audio.stop();
    if ($("#breakerDialog").open) $("#breakerDialog").close();
    showView("entry"); renderPersistent();
  }

  function toggleSound() {
    saved.sound = !saved.sound;
    persist();
    if (!saved.sound) audio.stop();
    else {
      audio.unlock(true);
      if (state.phase === "session" || state.phase === "boss") audio.start();
    }
    announce(saved.sound ? "Sound on" : "Sound off");
  }

  function resetProgress() {
    const confirmed = window.confirm(
      "Reset all SinkSync progress? This clears every drop, washed-item count, session, and shelf unlock."
    );
    if (!confirmed) return;

    stopTimers();
    audio.stop();
    localStorage.removeItem(STORAGE_KEY);
    saved = { ...defaults, unlocked: [] };
    state = freshSession();
    if ($("#collectionDialog").open) $("#collectionDialog").close();
    renderPersistent();
    showView("entry");
    announce("SinkSync progress reset to zero.");
  }

  function updateScrubVisuals(progress) {
    const rounded = Math.round(progress);
    $("#scrubMeter").style.setProperty("--progress", rounded + "%");
    $("#scrubPad").setAttribute("aria-valuenow", rounded);
    $("#scrubGrime").style.opacity = String(Math.max(0, .92 * (1 - rounded / 100)));
    $("#scrubLabel").textContent = rounded >= 94
      ? "one last good scrub"
      : rounded > 68
        ? "keep that rhythm"
        : rounded > 32
          ? "yep, exactly that"
          : "scrub back + forth";
  }

  function spawnScrubBubbles(clientX, clientY, count = 1, force = false) {
    const now = performance.now();
    if (!force && now - lastBubbleAt < 55) return;
    lastBubbleAt = now;
    const pad = $("#scrubPad");
    const rect = pad.getBoundingClientRect();
    const baseX = Math.max(14, Math.min(rect.width - 14, clientX - rect.left));
    const baseY = Math.max(18, Math.min(rect.height - 12, clientY - rect.top));

    for (let i = 0; i < count; i++) {
      const bubble = document.createElement("span");
      bubble.className = "scrub-bubble";
      bubble.style.setProperty("--bubble-left", (baseX + Math.random() * 28 - 14) + "px");
      bubble.style.setProperty("--bubble-top", (baseY + Math.random() * 18 - 9) + "px");
      bubble.style.setProperty("--bubble-size", (7 + Math.random() * 9) + "px");
      bubble.style.setProperty("--bubble-drift", (Math.random() * 28 - 14) + "px");
      $("#scrubBubbles").appendChild(bubble);
      setTimeout(() => bubble.remove(), 900);
    }
  }

  function finishScrub() {
    if (scrubFinishing) return;
    scrubFinishing = true;
    scrubActive = false;
    scrubProgress = 100;
    updateScrubVisuals(100);

    const pad = $("#scrubPad");
    pad.classList.remove("active");
    pad.classList.add("scrub-complete");
    $("#scrubSuccess").hidden = false;

    const rect = pad.getBoundingClientRect();
    for (let i = 0; i < 9; i++) {
      setTimeout(() => {
        spawnScrubBubbles(
          rect.left + rect.width * (.2 + Math.random() * .6),
          rect.top + rect.height * (.28 + Math.random() * .48),
          1,
          true
        );
      }, i * 45);
    }

    celebrateCompletion(pad, { label: "one fork clean ✓" });
    announce("You did the hard part. You started. Your sink is about to look so clean.");
    setTimeout(() => startSession(false), 2900);
  }

  function scrubMove(x, y) {
    if (scrubFinishing) return;
    if (scrubLastX === null) { scrubLastX = x; return; }
    const delta = x - scrubLastX;
    const direction = Math.sign(delta);
    if (Math.abs(delta) > 2) {
      const changedDirection = direction !== scrubLastDirection && scrubLastDirection !== 0;
      if (changedDirection) scrubTurns += 1;
      const elapsed = performance.now() - scrubStartedAt;
      const movementGain = Math.min(Math.abs(delta), 28) * .065;
      const turnGain = changedDirection ? 1.25 : 0;
      scrubProgress = Math.min(96, scrubProgress + movementGain + turnGain);
      if (scrubProgress >= 94 && elapsed >= 3200 && scrubTurns >= 5) scrubProgress = 100;
      scrubLastDirection = direction;
      scrubLastX = x;
      const rounded = Math.round(scrubProgress);
      updateScrubVisuals(rounded);
      spawnScrubBubbles(x, y, changedDirection ? 2 : 1);
      if (rounded >= 100) finishScrub();
    }
  }

  $("#scrubPad").addEventListener("pointerdown", e => {
    if (scrubFinishing) return;
    scrubActive = true; scrubLastX = e.clientX; scrubLastDirection = 0;
    scrubStartedAt = performance.now(); scrubTurns = 0;
    e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.classList.add("active");
    audio.unlock(false);
  });
  $("#scrubPad").addEventListener("pointermove", e => { if (scrubActive) scrubMove(e.clientX, e.clientY); });
  $("#scrubPad").addEventListener("pointerup", e => { scrubActive = false; scrubLastX = null; e.currentTarget.classList.remove("active"); });
  $("#scrubPad").addEventListener("pointercancel", e => { scrubActive = false; scrubLastX = null; e.currentTarget.classList.remove("active"); });
  $("#scrubPad").addEventListener("keydown", e => {
    if (!scrubFinishing && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === " ")) {
      e.preventDefault(); scrubProgress = Math.min(100, scrubProgress + 12);
      updateScrubVisuals(scrubProgress);
      const rect = $("#scrubPad").getBoundingClientRect();
      spawnScrubBubbles(rect.left + rect.width / 2, rect.top + rect.height / 2, 2, true);
      if (scrubProgress >= 100) finishScrub();
    }
  });

  document.addEventListener("click", e => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "begin") { audio.unlock(true); startPrimer(); }
    if (action === "quick-session") { audio.unlock(false); startSession(true); }
    if (action === "home") returnHome();
    if (action === "restart") startPrimer();
    if (action === "sound") toggleSound();
    if (action === "checkin") checkIn();
    if (action === "item") addItem(false);
    if (action === "ugh") openBreaker();
    if (action === "resume") resumeSession();
    if (action === "tapout") {
      if ($("#breakerDialog").open) $("#breakerDialog").close();
      if ($("#sequenceHelpDialog").open) $("#sequenceHelpDialog").close();
      finishSession(false);
    }
    if (action === "sequence") startSequence(0);
    if (action === "sequence-done") sequenceDone();
    if (action === "sequence-smaller") toggleSequenceSize();
    if (action === "sequence-blocked") openSequenceHelp();
    if (action === "sequence-repeat") startSequence(4);
    if (action === "sequence-flow") resumeFlowFromSequence();
    if (action === "close-help") $("#sequenceHelpDialog").close();
    if (action === "help-gross") setSequenceDetour("Use a dry paper towel, fork, or spatula as a barrier. Move only the biggest gross piece.");
    if (action === "help-space") setSequenceDetour("Make one landing spot. Move exactly one clean or dry thing out of the rack.");
    if (action === "help-frozen") setSequenceDetour("Do not lift anything. Put one fingertip on the cleanest object you can see.");
    if (action === "help-lost") {
      $("#sequenceHelpDialog").close();
      state.sequenceDetour = false;
      state.sequenceSmaller = false;
      renderSequence();
      announce($("#sequenceInstruction").textContent);
    }
    if (action === "boss") startBoss();
    if (action === "boss-item") addItem(true);
    if (action === "collection") { renderCollection(); $("#collectionDialog").showModal(); }
    if (action === "close-collection") $("#collectionDialog").close();
    if (action === "reset-progress") resetProgress();
  });

  $("#breakerDialog").addEventListener("cancel", e => { e.preventDefault(); resumeSession(); });
  $("#sequenceHelpDialog").addEventListener("cancel", e => { e.preventDefault(); e.currentTarget.close(); });
  $("#collectionDialog").addEventListener("click", e => {
    if (e.target === $("#collectionDialog")) $("#collectionDialog").close();
  });

  renderPersistent();
  showView("entry");
})();
