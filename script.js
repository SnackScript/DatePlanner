"use strict";

// Alle persönlichen und funktionalen Einstellungen an einer Stelle.
const CONFIG = Object.freeze({
  yourName: "Luca",
  recipientName: "Anja",
  yourEmail: "luca311.h@gmail.com",
  websiteTitle: "Date Planner",
  meetingDurationHours: 5,
  defaultTheme: "auto"
});

const ACTIVITIES = [
  ["Kaffee trinken", "☕"], ["Spaziergang", "♧"], ["Minigolf", "⛳"],
  ["Bowling", "◉"], ["Escape Room", "⌁"], ["Picknick", "♢"],
  ["Sonnenuntergang", "☀"], ["Cocktailbar", "♨"], ["Frühstück", "◒"],
  ["Brunch", "✤"], ["Überraschung", "✦"]
];
const RESTAURANTS = [
  ["Italienisch", "🍝"], ["Sushi", "🍣"], ["Burger", "🍔"],
  ["Steak", "♨"], ["Asiatisch", "🥢"], ["Tapas", "◌"],
  ["Café", "☕"], ["Pizza", "🍕"], ["Fine Dining", "✧"], ["Etwas anderes", "+"]
];
const STORAGE_KEY = "datePlannerProgressV1";
const THEME_KEY = "datePlannerTheme";
const ACCESS_KEY = "datePlannerUnlocked";
const STEP_NAMES = ["Zeitpunkt", "Aktivität", "Restaurant", "Nachricht", "Zusammenfassung"];
const initialState = () => ({ step: 1, date: "", time: "", activity: "", restaurant: "", other: "", message: "" });
let state = initialState();
let countdownTimer = null;

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function normalizeName(value) {
  return value.trim().toLocaleLowerCase("de-DE");
}

function validateName(value) {
  return normalizeName(value) === normalizeName(CONFIG.recipientName);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  const effectiveDark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  $("meta[name='theme-color']").content = effectiveDark ? "#171315" : "#fff8f4";
}

function cycleTheme() {
  const current = document.documentElement.dataset.theme;
  setTheme(current === "auto" ? "light" : current === "light" ? "dark" : "auto");
  showToast(`Farbschema: ${{ auto: "System", light: "Hell", dark: "Dunkel" }[document.documentElement.dataset.theme]}`);
}

function unlockPlanner({ fresh = false } = {}) {
  sessionStorage.setItem(ACCESS_KEY, "true");
  $("#gate").hidden = true;
  $("#gate").classList.remove("active");
  $("#planner").hidden = false;
  document.title = `${CONFIG.websiteTitle} · für dich`;

  const saved = restoreProgress();
  if (!fresh && saved && hasMeaningfulProgress(saved)) {
    $("#intro").hidden = true;
    $("#resume-prompt").hidden = false;
    setTimeout(() => $("#resume-continue").focus(), 100);
  } else {
    $("#intro").hidden = false;
    setTimeout(() => $("#start-button").focus(), 100);
  }
  createHeartBurst();
}

function startWizard(reset = false) {
  if (reset) {
    state = initialState();
    localStorage.removeItem(STORAGE_KEY);
    syncInputs();
  }
  $("#intro").hidden = true;
  $("#resume-prompt").hidden = true;
  $("#wizard").hidden = false;
  showStep(state.step || 1);
}

function hasMeaningfulProgress(saved) {
  return saved && (saved.step > 1 || saved.date || saved.time || saved.activity || saved.restaurant || saved.message);
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function restoreProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return null;
    state = { ...initialState(), ...saved, step: Math.min(5, Math.max(1, Number(saved.step) || 1)) };
    syncInputs();
    return state;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function resetPlanner() {
  if (!confirm("Möchtest du deine bisherige Auswahl wirklich löschen und neu beginnen?")) return;
  clearInterval(countdownTimer);
  state = initialState();
  localStorage.removeItem(STORAGE_KEY);
  syncInputs();
  startWizard();
  showToast("Alles bereit für einen neuen Plan.");
}

function syncInputs() {
  $("#date-input").value = state.date;
  $("#time-input").value = state.time;
  $("#other-input").value = state.other;
  $("#message-input").value = state.message;
  $("#char-count").textContent = state.message.length;
  updateChoiceUI("activity", state.activity);
  updateChoiceUI("restaurant", state.restaurant);
  $("#other-field").hidden = state.restaurant !== "Etwas anderes";
}

function updateProgressBar() {
  const percentage = state.step * 20;
  $("#progress-fill").style.width = `${percentage}%`;
  $(".progress-track").setAttribute("aria-valuenow", state.step);
  $("#step-label").textContent = `Schritt ${state.step} von 5`;
  $("#step-name").textContent = STEP_NAMES[state.step - 1];
  $("#back-button").hidden = state.step === 1;
  $("#next-button").hidden = state.step === 5;
}

function showStep(step) {
  state.step = Math.min(5, Math.max(1, step));
  $$(".step").forEach(section => {
    const active = Number(section.dataset.step) === state.step;
    section.hidden = !active;
    section.classList.toggle("active", active);
  });
  updateProgressBar();
  if (state.step === 5) {
    renderSummary();
    startCountdown();
    launchConfetti();
  }
  saveProgress();
  const heading = $(`.step[data-step="${state.step}"] h2`);
  heading?.setAttribute("tabindex", "-1");
  heading?.focus({ preventScroll: true });
  scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function validateCurrentStep() {
  const error = $(`.step[data-step="${state.step}"] .step-error`);
  if (error) error.textContent = "";
  if (state.step === 1) {
    state.date = $("#date-input").value;
    state.time = $("#time-input").value;
    if (!state.date || !state.time) return setStepError("Bitte wähle ein Datum und eine Uhrzeit aus.");
    if (getMeetingDate() <= new Date()) return setStepError("Dieser Zeitpunkt liegt schon in der Vergangenheit. Such bitte einen zukünftigen aus.");
  }
  if (state.step === 2 && !state.activity) return setStepError("Wähle bitte eine Aktivität aus, die dir gefällt.");
  if (state.step === 3) {
    if (!state.restaurant) return setStepError("Wähle bitte eine kulinarische Richtung aus.");
    state.other = $("#other-input").value.trim();
    if (state.restaurant === "Etwas anderes" && !state.other) return setStepError("Verrätst du mir noch deinen eigenen Vorschlag?");
  }
  state.message = $("#message-input").value.trim();
  saveProgress();
  return true;
}

function setStepError(message) {
  const error = $(`.step[data-step="${state.step}"] .step-error`);
  if (error) error.textContent = message;
  return false;
}

function makeChoices(containerId, values, stateKey) {
  const container = $(`#${containerId}`);
  const fragment = document.createDocumentFragment();
  values.forEach(([label, icon], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.dataset.value = label;
    button.dataset.group = stateKey;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    button.tabIndex = index === 0 ? 0 : -1;
    button.innerHTML = `<span class="choice-icon" aria-hidden="true">${icon}</span><span class="choice-label">${label}</span>`;
    button.addEventListener("click", () => selectChoice(stateKey, label));
    button.addEventListener("keydown", handleChoiceKeys);
    fragment.append(button);
  });
  container.append(fragment);
}

function selectChoice(group, value) {
  state[group] = value;
  if (group === "restaurant" && value !== "Etwas anderes") state.other = "";
  updateChoiceUI(group, value);
  $("#other-field").hidden = state.restaurant !== "Etwas anderes";
  if (state.restaurant === "Etwas anderes") setTimeout(() => $("#other-input").focus(), 120);
  saveProgress();
}

function updateChoiceUI(group, value) {
  $$(`.choice[data-group="${group}"]`).forEach(button => {
    const selected = button.dataset.value === value;
    button.setAttribute("aria-checked", String(selected));
    button.tabIndex = selected || (!value && button === $$(`.choice[data-group="${group}"]`)[0]) ? 0 : -1;
  });
}

function handleChoiceKeys(event) {
  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
  event.preventDefault();
  const choices = $$(`.choice[data-group="${event.currentTarget.dataset.group}"]`);
  const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
  const target = choices[(choices.indexOf(event.currentTarget) + direction + choices.length) % choices.length];
  target.focus(); target.click();
}

function getMeetingDate() {
  return new Date(`${state.date}T${state.time}:00`);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function renderSummary() {
  const rows = [
    ["Datum", state.date ? formatDate(getMeetingDate()) : "–"], ["Uhrzeit", state.time ? `${state.time} Uhr` : "–"],
    ["Aktivität", state.activity || "–"], ["Restaurant", state.restaurant || "–"]
  ];
  if (state.other) rows.push(["Eigener Vorschlag", state.other]);
  rows.push(["Deine Nachricht", state.message || "Keine Nachricht – Vorfreude reicht völlig."]);
  $("#summary").replaceChildren(...rows.map(([term, value]) => {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt"); const dd = document.createElement("dd");
    dt.textContent = term; dd.textContent = value; wrapper.append(dt, dd); return wrapper;
  }));
  $("#config-warning").hidden = CONFIG.yourEmail !== "MEINE_EMAIL";
}

function startCountdown() {
  clearInterval(countdownTimer);
  const update = () => {
    const diff = getMeetingDate() - new Date();
    if (diff <= 0) { $("#countdown").textContent = "Heute ist es so weit. ♥"; clearInterval(countdownTimer); return; }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff % 86400000 / 3600000);
    const minutes = Math.floor(diff % 3600000 / 60000);
    $("#countdown").textContent = `Noch ${days ? `${days} Tag${days === 1 ? "" : "e"}, ` : ""}${hours} Std. und ${minutes} Min. bis zu unserem Date.`;
  };
  update(); countdownTimer = setInterval(update, 60000);
}

function calendarDescription() {
  return [`Aktivität: ${state.activity}`, `Restaurant: ${state.restaurant}`, state.other && `Eigener Vorschlag: ${state.other}`, state.message && `Nachricht: ${state.message}`].filter(Boolean).join("\n");
}

function toICSDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICS(value) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function createICS() {
  const start = getMeetingDate();
  const end = new Date(start.getTime() + CONFIG.meetingDurationHours * 3600000);
  const uid = `${Date.now()}-dateplanner@local`;
  const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Date Planner//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${toICSDate(new Date())}`, `DTSTART:${toICSDate(start)}`, `DTEND:${toICSDate(end)}`, `SUMMARY:${escapeICS(`Date mit ${CONFIG.yourName}`)}`, `DESCRIPTION:${escapeICS(calendarDescription())}`, "STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = "date-mit-luca.ics"; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast("Kalenderdatei wurde erstellt.");
}

function sendEmail() {
  if (CONFIG.yourEmail === "MEINE_EMAIL") {
    showToast("Bitte zuerst deine E-Mail-Adresse in script.js eintragen."); return;
  }
  const body = [`Hallo ${CONFIG.yourName},`, "", "hier ist meine Auswahl für unser Date:", "", `Datum: ${formatDate(getMeetingDate())}`, `Uhrzeit: ${state.time} Uhr`, `Aktivität: ${state.activity}`, `Restaurant: ${state.restaurant}`, state.other && `Eigener Vorschlag: ${state.other}`, `Persönliche Nachricht: ${state.message || "–"}`, "", "Ich freue mich!"].filter(line => line !== false && line !== "").join("\n");
  location.href = `mailto:${encodeURIComponent(CONFIG.yourEmail)}?subject=${encodeURIComponent("Unser Date")}&body=${encodeURIComponent(body)}`;
}

function createHeartBurst() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < 9; i++) {
    const heart = document.createElement("span");
    heart.textContent = "♥"; heart.style.cssText = `position:fixed;z-index:60;left:50%;top:50%;color:var(--primary);pointer-events:none;transition:transform .9s ease,opacity .9s;`;
    document.body.append(heart);
    requestAnimationFrame(() => { heart.style.transform = `translate(${(Math.random()-.5)*280}px,${(Math.random()-.7)*230}px) rotate(${Math.random()*90}deg) scale(${.5+Math.random()})`; heart.style.opacity = "0"; });
    setTimeout(() => heart.remove(), 950);
  }
}

function launchConfetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = $("#confetti"), context = canvas.getContext("2d");
  canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; context.scale(devicePixelRatio, devicePixelRatio);
  const colors = ["#c85d69", "#e58c77", "#efb6b8", "#f0c98b"];
  const pieces = Array.from({ length: 70 }, () => ({ x: Math.random()*innerWidth, y:-20-Math.random()*200, size:4+Math.random()*7, speed:2+Math.random()*3, drift:(Math.random()-.5)*2, turn:Math.random()*6, color:colors[Math.floor(Math.random()*colors.length)] }));
  let frame = 0;
  function draw() {
    context.clearRect(0,0,innerWidth,innerHeight);
    pieces.forEach(p => { p.y += p.speed; p.x += p.drift; p.turn += .08; context.save(); context.translate(p.x,p.y); context.rotate(p.turn); context.fillStyle=p.color; context.fillRect(-p.size/2,-p.size/2,p.size,p.size*.65); context.restore(); });
    if (frame++ < 240) requestAnimationFrame(draw); else context.clearRect(0,0,innerWidth,innerHeight);
  } draw();
}

function showToast(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function addRipple(event) {
  const button = event.currentTarget, rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height), wave = document.createElement("span");
  wave.className = "ripple-wave"; wave.style.width = wave.style.height = `${size}px`;
  wave.style.left = `${event.clientX - rect.left - size/2}px`; wave.style.top = `${event.clientY - rect.top - size/2}px`;
  button.append(wave); setTimeout(() => wave.remove(), 600);
}

function initializeParticles() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const fragment = document.createDocumentFragment();
  for (let i=0;i<12;i++) { const p=document.createElement("span");p.className="particle";p.textContent=i%3?"•":"♥";p.style.left=`${Math.random()*100}%`;p.style.animationDuration=`${12+Math.random()*14}s`;p.style.animationDelay=`-${Math.random()*20}s`;fragment.append(p); }
  $("#particles").append(fragment);
}

function init() {
  document.title = CONFIG.websiteTitle;
  $("#brand-title").textContent = CONFIG.websiteTitle;
  $("#footer-name").textContent = CONFIG.yourName;
  setTheme(localStorage.getItem(THEME_KEY) || CONFIG.defaultTheme);
  makeChoices("activity-choices", ACTIVITIES, "activity");
  makeChoices("restaurant-choices", RESTAURANTS, "restaurant");
  initializeParticles();
  const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  $("#date-input").min = today.toISOString().slice(0,10);

  $("#name-form").addEventListener("submit", event => {
    event.preventDefault();
    const input = $("#name-input"), error = $("#name-error");
    if (validateName(input.value)) { error.textContent = ""; unlockPlanner(); }
    else { error.textContent = "Diese Einladung scheint leider nicht für dich bestimmt zu sein."; input.select(); }
  });
  $("#theme-toggle").addEventListener("click", cycleTheme);
  $("#start-button").addEventListener("click", () => startWizard(true));
  $("#resume-continue").addEventListener("click", () => startWizard());
  $("#resume-new").addEventListener("click", () => startWizard(true));
  $("#reset-button").addEventListener("click", resetPlanner);
  $("#next-button").addEventListener("click", () => { if (validateCurrentStep()) showStep(state.step + 1); });
  $("#back-button").addEventListener("click", () => { syncStateFromFields(); showStep(state.step - 1); });
  $("#date-input").addEventListener("change", syncStateFromFields);
  $("#time-input").addEventListener("change", syncStateFromFields);
  $("#other-input").addEventListener("input", syncStateFromFields);
  $("#message-input").addEventListener("input", () => { syncStateFromFields(); $("#char-count").textContent = $("#message-input").value.length; });
  $("#message-inspiration").addEventListener("click", () => {
    const ideas = ["Ich freue mich jetzt schon auf die Zeit mit dir. ♥", "Klingt nach einem ziemlich guten Plan, finde ich.", "Eine kleine Überraschung darf trotzdem noch bleiben."];
    $("#message-input").value = ideas[Math.floor(Math.random()*ideas.length)]; syncStateFromFields(); $("#char-count").textContent = state.message.length;
  });
  $("#calendar-button").addEventListener("click", createICS);
  $("#email-button").addEventListener("click", sendEmail);
  $$(".ripple").forEach(button => button.addEventListener("pointerdown", addRipple));

  if (sessionStorage.getItem(ACCESS_KEY) === "true") unlockPlanner();
  else setTimeout(() => $("#name-input").focus(), 250);
}

function syncStateFromFields() {
  state.date = $("#date-input").value; state.time = $("#time-input").value;
  state.other = $("#other-input").value.trim(); state.message = $("#message-input").value;
  saveProgress();
}

document.addEventListener("DOMContentLoaded", init);
