(() => {
  "use strict";

  const STORAGE_KEY = "sinksync-progress-v1";
  const collectibles = [
    { id: "mug", icon: "☕", name: "Moon mug", cost: 1, rarity: "cozy find" },
    { id: "sprout", icon: "🌱", name: "Window sprout", cost: 4, rarity: "small wonder" },
    { id: "lamp", icon: "🏮", name: "Soft lamp", cost: 8, rarity: "warm find" },
    { id: "fern", icon: "🪴", name: "Night fern", cost: 14, rarity: "lush find" },
    { id: "radio", icon: "📻", name: "Tiny radio", cost: 22, rarity: "good company" },
    { id: "rare", icon: "🌵", name: "Star cactus", cost: Infinity, rarity: "rare boss find", rare: true }
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
        this.master.gain.value = 0.12;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return true;
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
      this.loop = setInterval(() => {
        if (!this.playing || !saved.sound || !this.ctx) return;
        const s = this.step++ % 16;
        if (s % 4 === 0) this.kick(this.boss ? 0.16 : 0.11);
        if (this.layers >= 2 && s % 2 === 0) this.hat(s % 4 === 2 ? 0.035 : 0.022);
        if (this.layers >= 3 && s % 4 === 0) {
          const notes = this.boss ? [98, 110, 131, 147] : [73.4, 82.4, 98, 82.4];
          this.tone(notes[Math.floor(s / 4)], .16, "triangle", 0.045);
        }
        if (this.layers >= 4 && (s === 2 || s === 6 || s === 10 || s === 14)) {
          const notes = this.boss ? [392, 440, 523, 587] : [293.7, 329.6, 392, 329.6];
          this.tone(notes[(s - 2) / 4], .1, "sine", 0.026);
        }
      }, interval);
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
    reward() {
      if (!this.ensure()) return;
      [392, 493.9, 587.3, 784].forEach((note, index) => setTimeout(() => this.tone(note, .34, "triangle", .055), index * 95));
    }
    blip() { this.tone(440 + Math.random() * 70, .08, "sine", .028); }
  }

  const audio = new SinkAudio();

  function freshSession() {
    return { phase: "entry", elapsed: 0, items: 0, drops: 0, momentum: 1, bossLeft: 60, bossItems: 0, rareWon: false, lastReward: null };
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
    scrubStartedAt = 0;
    scrubTurns = 0;
    $("#scrubMeter").style.setProperty("--progress", "0%");
    $("#scrubPad").setAttribute("aria-valuenow", "0");
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
      ? unlocked.slice(-5).map(c => `<span title="${c.name}">${c.icon}</span>`).join("")
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
    $("#mysteryObject").textContent = next ? next.icon : "✦";
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
      audio.blip(); vibrate(25);
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
      renderSession(); audio.blip(); vibrate(15);
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
    $("#rewardObject").textContent = sessionReward.icon;
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
        <span class="object" aria-hidden="true">${unlocked ? c.icon : "?"}</span>
        <strong>${unlocked ? c.name : "Not found yet"}</strong>
        <small>${unlocked ? c.rarity : requirement}</small>
      </div>`;
    }).join("");
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
    else if (state.phase === "session" || state.phase === "boss") audio.start();
    announce(saved.sound ? "Sound on" : "Sound off");
  }

  function scrubMove(x) {
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
      $("#scrubMeter").style.setProperty("--progress", rounded + "%");
      $("#scrubPad").setAttribute("aria-valuenow", rounded);
      $("#scrubLabel").textContent = rounded >= 94
        ? "one last good scrub"
        : rounded > 68
          ? "keep that rhythm"
          : rounded > 32
            ? "yep, exactly that"
            : "scrub back + forth";
      if (rounded >= 100) {
        scrubActive = false;
        $("#scrubPad").classList.remove("active");
        vibrate([30, 30, 50]);
        audio.chime();
        setTimeout(() => startSession(false), 380);
      }
    }
  }

  $("#scrubPad").addEventListener("pointerdown", e => {
    scrubActive = true; scrubLastX = e.clientX; scrubLastDirection = 0;
    scrubStartedAt = performance.now(); scrubTurns = 0;
    e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.classList.add("active");
    audio.ensure();
  });
  $("#scrubPad").addEventListener("pointermove", e => { if (scrubActive) scrubMove(e.clientX); });
  $("#scrubPad").addEventListener("pointerup", e => { scrubActive = false; scrubLastX = null; e.currentTarget.classList.remove("active"); });
  $("#scrubPad").addEventListener("pointercancel", e => { scrubActive = false; scrubLastX = null; e.currentTarget.classList.remove("active"); });
  $("#scrubPad").addEventListener("keydown", e => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault(); scrubProgress = Math.min(100, scrubProgress + 12);
      $("#scrubMeter").style.setProperty("--progress", scrubProgress + "%");
      $("#scrubPad").setAttribute("aria-valuenow", Math.round(scrubProgress));
      if (scrubProgress >= 100) startSession(false);
    }
  });

  document.addEventListener("click", e => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "begin") { audio.ensure(); startPrimer(); }
    if (action === "quick-session") { audio.ensure(); startSession(true); }
    if (action === "home") returnHome();
    if (action === "restart") startPrimer();
    if (action === "sound") toggleSound();
    if (action === "checkin") checkIn();
    if (action === "item") addItem(false);
    if (action === "ugh") openBreaker();
    if (action === "resume") resumeSession();
    if (action === "tapout") {
      if ($("#breakerDialog").open) $("#breakerDialog").close();
      finishSession(false);
    }
    if (action === "boss") startBoss();
    if (action === "boss-item") addItem(true);
    if (action === "collection") { renderCollection(); $("#collectionDialog").showModal(); }
    if (action === "close-collection") $("#collectionDialog").close();
  });

  $("#breakerDialog").addEventListener("cancel", e => { e.preventDefault(); resumeSession(); });
  $("#collectionDialog").addEventListener("click", e => {
    if (e.target === $("#collectionDialog")) $("#collectionDialog").close();
  });

  renderPersistent();
  showView("entry");
})();
