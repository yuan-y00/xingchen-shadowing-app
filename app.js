const datasets = {
  interview: {
    label: "Interview",
    file: "data/interview_sentences.json",
    audioMode: "mp3",
    storageKey: "interview-shadowing-progress-v1",
  },
  xingchen: {
    label: "Xingchen",
    file: "data/xingchen_sentences.json",
    audioMode: "tts",
    storageKey: "xingchen-shadowing-progress-v2",
  },
};

const state = {
  datasetKey: "interview",
  sentences: [],
  completed: new Set(),
  currentIndex: 0,
  mode: "idle",
  autoPractice: false,
  isSpaceDown: false,
  voices: [],
  utterance: null,
  rate: 1,
};

const els = {
  player: document.getElementById("player"),
  sentenceList: document.getElementById("sentenceList"),
  statusText: document.getElementById("statusText"),
  progressCount: document.getElementById("progressCount"),
  progressPercent: document.getElementById("progressPercent"),
  progressFill: document.getElementById("progressFill"),
  hintPanel: document.querySelector(".hint-panel span"),
  projectSelect: document.getElementById("projectSelect"),
  rateSelect: document.getElementById("rateSelect"),
  startBtn: document.getElementById("startBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  replayBtn: document.getElementById("replayBtn"),
  restartBtn: document.getElementById("restartBtn"),
  autoScrollToggle: document.getElementById("autoScrollToggle"),
};

const settingsKey = "shadowing-lab-settings-v1";
const ttsSupported =
  "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

function currentDataset() {
  return datasets[state.datasetKey];
}

function saveSettings() {
  localStorage.setItem(
    settingsKey,
    JSON.stringify({
      datasetKey: state.datasetKey,
      rate: state.rate,
    }),
  );
}

function loadSettings() {
  const raw = localStorage.getItem(settingsKey);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (datasets[data.datasetKey]) state.datasetKey = data.datasetKey;
    state.rate = Number(data.rate) || 1;
  } catch {
    state.datasetKey = "interview";
    state.rate = 1;
  }
}

function saveProgress() {
  const dataset = currentDataset();
  localStorage.setItem(
    dataset.storageKey,
    JSON.stringify({
      completed: [...state.completed],
      currentIndex: state.currentIndex,
    }),
  );
}

function loadProgress() {
  const raw = localStorage.getItem(currentDataset().storageKey);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    state.completed = new Set(data.completed || []);
    const maxIndex = Math.max(state.sentences.length - 1, 0);
    state.currentIndex = Math.min(data.currentIndex || 0, maxIndex);
  } catch {
    state.completed = new Set();
    state.currentIndex = 0;
  }
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function updateProgress() {
  const total = state.sentences.length;
  const done = state.completed.size;
  const pct = total ? Math.round((done / total) * 100) : 0;
  els.progressCount.textContent = `${done} / ${total}`;
  els.progressPercent.textContent = `${pct}%`;
  els.progressFill.style.width = `${pct}%`;
}

function updateHintText() {
  if (!els.hintPanel) return;
  els.hintPanel.textContent =
    "Listen first -> press Space to stop this one and play the next sentence.";
}

function sentenceCard(id) {
  return document.querySelector(`[data-id="${id}"]`);
}

function makeMetaSpan(className, text) {
  const span = document.createElement("span");
  if (className) span.className = className;
  span.textContent = text;
  return span;
}

function render() {
  const frag = document.createDocumentFragment();
  let lastSection = "";

  state.sentences.forEach((item, index) => {
    if (state.datasetKey === "xingchen" && item.section !== lastSection) {
      const heading = document.createElement("h2");
      heading.className = "section-heading";
      heading.textContent = item.section;
      frag.append(heading);
      lastSection = item.section;
    }

    const card = document.createElement("article");
    card.className = "sentence-card";
    card.dataset.id = String(item.id);

    const play = document.createElement("button");
    play.className = "icon-btn play-btn";
    play.type = "button";
    play.title = "Play this sentence";
    play.textContent = "▶";
    play.addEventListener("click", () => {
      state.autoPractice = false;
      playSentence(index);
    });

    const body = document.createElement("div");
    if (state.datasetKey !== "xingchen") {
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.append(
        makeMetaSpan("speaker", item.speaker || currentDataset().label),
        makeMetaSpan("", `#${String(item.id).padStart(3, "0")}`),
        makeMetaSpan("section", item.section || currentDataset().label),
      );
      body.append(meta);
    }

    const english = document.createElement("p");
    english.className = "english";
    english.textContent = item.english;

    body.append(english);

    if (item.literal_zh) {
      const zh = document.createElement("p");
      zh.className = "zh";
      zh.textContent = item.literal_zh;
      body.append(zh);
    }

    const done = document.createElement("button");
    done.className = "icon-btn done-btn";
    done.type = "button";
    done.title = "Mark as complete";
    done.textContent = "✓";
    done.addEventListener("click", () => {
      toggleComplete(item.id);
    });

    card.append(play, body, done);
    frag.append(card);
  });

  els.sentenceList.replaceChildren(frag);
  refreshCards();
  updateProgress();
}

function refreshCards() {
  state.sentences.forEach((item, index) => {
    const card = sentenceCard(item.id);
    if (!card) return;
    card.classList.toggle("done", state.completed.has(item.id));
    card.classList.toggle("current", index === state.currentIndex);
    card.classList.toggle(
      "holding",
      index === state.currentIndex && state.mode === "recording",
    );
  });
}

function scrollToCurrent() {
  if (!els.autoScrollToggle.checked) return;
  const current = state.sentences[state.currentIndex];
  if (!current) return;
  sentenceCard(current.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function populateVoices() {
  if (!ttsSupported) {
    state.voices = [];
    return;
  }

  const available = window.speechSynthesis.getVoices();
  state.voices = available.filter((voice) => /^en/i.test(voice.lang));
}

function updateVoiceControls() {
  const isTts = currentDataset().audioMode === "tts";
  els.rateSelect.disabled = !isTts || !ttsSupported;
}

function naturalVoiceScore(voice) {
  const name = voice.name || "";
  const lang = voice.lang || "";
  let score = 0;
  if (/^en-US$/i.test(lang)) score += 120;
  else if (/^en-/i.test(lang)) score += 60;
  if (/Natural/i.test(name)) score += 80;
  if (/Online/i.test(name)) score += 40;
  if (/Microsoft/i.test(name)) score += 20;
  if (/Jenny|Aria|Ava|Emma|Guy|Brian|Andrew|Ryan|Michelle|Roger/i.test(name)) score += 20;
  if (/Multilingual/i.test(name)) score -= 15;
  return score;
}

function selectedVoice() {
  return [...state.voices].sort((a, b) => naturalVoiceScore(b) - naturalVoiceScore(a))[0] || null;
}

function normalizeSentences(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.value)) return data.value;
  return [];
}

function stopPlayback() {
  els.player.pause();
  els.player.currentTime = 0;

  if (ttsSupported) {
    if (state.utterance) {
      state.utterance.onend = null;
      state.utterance.onerror = null;
    }
    window.speechSynthesis.cancel();
    state.utterance = null;
  }
}

function finishPlaying() {
  const item = state.sentences[state.currentIndex];
  if (!item || state.mode !== "playing") return;
  state.mode = "waiting";
  setStatus(`Sentence ${item.id} finished. Press Space for the next sentence.`);
  refreshCards();
}

function playSentence(index = state.currentIndex, options = {}) {
  if (!state.sentences[index]) return;
  if (!options.skipStop) stopPlayback();

  state.currentIndex = index;
  const item = state.sentences[index];
  state.mode = "playing";
  setStatus(`Playing sentence ${item.id}. Press Space to stop this one and play the next sentence.`);
  refreshCards();
  scrollToCurrent();
  saveProgress();

  if (currentDataset().audioMode === "mp3") {
    els.player.src = item.audio;
    els.player.currentTime = 0;
    els.player.play().catch(() => {
      setStatus("Click Start Practice or a play button to enable audio playback.");
    });
    return;
  }

  if (!ttsSupported) {
    state.mode = "idle";
    setStatus("This browser does not support built-in speech playback.");
    refreshCards();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(item.english);
  const voice = selectedVoice();
  utterance.lang = voice?.lang || "en-US";
  utterance.voice = voice;
  utterance.rate = state.rate;
  utterance.pitch = 1;
  utterance.onend = finishPlaying;
  utterance.onerror = () => {
    state.mode = "idle";
    setStatus("Speech playback failed. Try another browser voice.");
    refreshCards();
  };
  state.utterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function markComplete(id) {
  state.completed.add(id);
  updateProgress();
  refreshCards();
  saveProgress();
}

function toggleComplete(id) {
  if (state.completed.has(id)) {
    state.completed.delete(id);
  } else {
    state.completed.add(id);
  }
  updateProgress();
  refreshCards();
  saveProgress();
}

function moveToNextAndPlay(options = {}) {
  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.sentences.length) {
    state.autoPractice = false;
    state.mode = "finished";
    setStatus("Finished. Nice work.");
    refreshCards();
    return;
  }
  playSentence(nextIndex, options);
}

function switchToNextSentence() {
  if (state.mode === "loading" || !state.sentences.length) return;
  const item = state.sentences[state.currentIndex];
  if (item) markComplete(item.id);
  state.autoPractice = true;
  stopPlayback();
  if (currentDataset().audioMode !== "tts") {
    moveToNextAndPlay({ skipStop: true });
    return;
  }
  window.setTimeout(() => {
    moveToNextAndPlay({ skipStop: true });
  }, 120);
}

async function loadDataset(key) {
  if (!datasets[key]) return;
  stopPlayback();

  state.datasetKey = key;
  state.sentences = [];
  state.completed = new Set();
  state.currentIndex = 0;
  state.mode = "loading";
  state.autoPractice = false;
  state.isSpaceDown = false;
  els.projectSelect.value = key;
  updateVoiceControls();
  updateHintText();
  saveSettings();
  setStatus(`Loading ${currentDataset().label}...`);

  try {
    if (window.SHADOWING_DATA?.[key]) {
      state.sentences = normalizeSentences(window.SHADOWING_DATA[key]);
    } else {
      const response = await fetch(currentDataset().file, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.sentences = normalizeSentences(await response.json());
    }
    loadProgress();
    render();
    const current = state.sentences[state.currentIndex];
    state.mode = "idle";
    setStatus(
      current
        ? `${currentDataset().label} ready at sentence ${current.id}.`
        : `No sentences found for ${currentDataset().label}.`,
    );
    scrollToCurrent();
  } catch (error) {
    console.error(error);
    state.mode = "idle";
    render();
    setStatus(`Could not load ${currentDataset().label}.`);
  }
}

els.player.addEventListener("ended", finishPlaying);

els.projectSelect.addEventListener("change", () => {
  loadDataset(els.projectSelect.value);
});

els.rateSelect.addEventListener("change", () => {
  state.rate = Number(els.rateSelect.value) || 1;
  saveSettings();
});

els.startBtn.addEventListener("click", () => {
  state.autoPractice = true;
  if (state.mode === "waiting") {
    setStatus("Press Space to stop this one and play the next sentence.");
    return;
  }
  playSentence(state.currentIndex);
});

els.pauseBtn.addEventListener("click", () => {
  stopPlayback();
  state.autoPractice = false;
  state.mode = "paused";
  setStatus("Paused. Press Start Practice to continue.");
  refreshCards();
});

els.replayBtn.addEventListener("click", () => {
  playSentence(state.currentIndex);
});

els.restartBtn.addEventListener("click", () => {
  stopPlayback();
  state.completed.clear();
  state.currentIndex = 0;
  state.mode = "idle";
  state.autoPractice = false;
  setStatus("Progress reset. Press Start Practice when ready.");
  updateProgress();
  refreshCards();
  scrollToCurrent();
  saveProgress();
});

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLButtonElement
  ) {
    return;
  }
  event.preventDefault();
  if (state.isSpaceDown) return;
  state.isSpaceDown = true;
  switchToNextSentence();
});

document.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLButtonElement
  ) {
    return;
  }
  event.preventDefault();
  state.isSpaceDown = false;
});

async function init() {
  loadSettings();
  els.projectSelect.value = state.datasetKey;
  els.rateSelect.value = String(state.rate);
  populateVoices();
  if (ttsSupported) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }
  await loadDataset(state.datasetKey);
}

init().catch((error) => {
  console.error(error);
  setStatus("Could not load the practice tool.");
});
