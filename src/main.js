import OBR from "@owlbear-rodeo/sdk";
import { CONDITIONS, CATEGORY_LABELS, CATEGORY_ORDER } from "./conditions.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const EXT_ID = "rodeo.owlbear.pf2e-hud";
const PLAYER_META_KEY = `${EXT_ID}/player-state`;
const GM_META_KEY = `${EXT_ID}/gm-state`;

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  // Shared player state (stored in OBR player metadata)
  charName: "",
  actions: [false, false, false],   // true = used
  reactionUsed: false,
  slowedValue: 0,
  stunnedValue: 0,
  conditions: {},   // { conditionId: number (value or 1 for simple) }
  persistentDamage: [], // [{ id, type, amount }]
  round: 1,

  // GM-only state (stored in OBR room metadata)
  gmChars: [],           // [{ id, name, conditions: {}, actions: [], reactionUsed: bool, persistentDamage: [] }]
  selectedGmCharId: null,

  // UI / Transient
  activeTab: "actions",
  conditionSearch: "",
  pdType: "Bleed",
  pdAmount: "1d6",
  isGM: false,
};

let unsubscribePlayer = null;
let unsubscribeRoom = null;

// ─── OBR Init ────────────────────────────────────────────────────────────────
OBR.onReady(async () => {
  try {
    const role = await OBR.player.getRole();
    state.isGM = role === "GM";

    // Load player state from OBR metadata
    await loadPlayerState();
    // Load GM state if GM
    if (state.isGM) await loadGMState();

    // Subscribe to remote changes
    unsubscribePlayer = OBR.player.onChange(async (player) => {
      const meta = player.metadata?.[PLAYER_META_KEY];
      if (meta) mergePlayerState(meta);
      render();
    });

    if (state.isGM) {
      unsubscribeRoom = OBR.room.onMetadataChange(async (meta) => {
        const gmMeta = meta[GM_META_KEY];
        if (gmMeta) mergeGMState(gmMeta);
        render();
      });
    }

    document.getElementById("loading").classList.add("hidden");
    document.getElementById("app").style.display = "flex";
    render();
  } catch (err) {
    console.error("PF2e HUD init error:", err);
    document.querySelector(".loading-text").textContent = "Error: " + err.message;
  }
});

// ─── State Persistence ───────────────────────────────────────────────────────
async function loadPlayerState() {
  const player = await OBR.player.getMetadata();
  const meta = player[PLAYER_META_KEY];
  if (meta) mergePlayerState(meta);
}

function mergePlayerState(meta) {
  state.charName         = meta.charName         ?? state.charName;
  state.actions          = meta.actions          ?? state.actions;
  state.reactionUsed     = meta.reactionUsed     ?? state.reactionUsed;
  state.slowedValue      = meta.slowedValue      ?? state.slowedValue;
  state.stunnedValue     = meta.stunnedValue     ?? state.stunnedValue;
  state.conditions       = meta.conditions       ?? state.conditions;
  state.persistentDamage = meta.persistentDamage ?? state.persistentDamage;
  state.round            = meta.round            ?? state.round;
}

async function savePlayerState() {
  await OBR.player.setMetadata({
    [PLAYER_META_KEY]: {
      charName:         state.charName,
      actions:          state.actions,
      reactionUsed:     state.reactionUsed,
      slowedValue:      state.slowedValue,
      stunnedValue:     state.stunnedValue,
      conditions:       state.conditions,
      persistentDamage: state.persistentDamage,
      round:            state.round,
    },
  });
}

async function loadGMState() {
  const meta = await OBR.room.getMetadata();
  const gmMeta = meta[GM_META_KEY];
  if (gmMeta) mergeGMState(gmMeta);
}

function mergeGMState(meta) {
  state.gmChars = meta.gmChars ?? state.gmChars;
}

async function saveGMState() {
  await OBR.room.setMetadata({
    [GM_META_KEY]: {
      gmChars: state.gmChars,
    },
  });
}

// ─── Action helpers ──────────────────────────────────────────────────────────
function availableActions() {
  const penaltyFromStunned = Math.min(3, state.stunnedValue);
  const penaltyFromSlowed  = Math.min(3, state.slowedValue);
  const penalty = Math.max(penaltyFromStunned, penaltyFromSlowed);
  return Math.max(0, 3 - penalty);
}

function resetTurn() {
  state.actions      = [false, false, false];
  state.reactionUsed = false;
  // Reduce stun/slow
  if (state.stunnedValue > 0) state.stunnedValue = Math.max(0, state.stunnedValue - 3);
  if (state.frightened() > 0) { // frightened drops by 1 per turn
    const f = state.conditions["frightened"];
    if (f && f > 1) state.conditions["frightened"] = f - 1;
    else delete state.conditions["frightened"];
  }
  // Increase round
  state.round++;
  savePlayerState();
}

// Tiny helper so we don't get undefined errors
state.frightened = () => state.conditions["frightened"] ?? 0;

// ─── Condition helpers ────────────────────────────────────────────────────────
function getCondition(id) { return CONDITIONS.find(c => c.id === id); }

function addCondition(id) {
  const cond = getCondition(id);
  if (!cond) return;
  if (state.conditions[id] === undefined) {
    state.conditions[id] = cond.valued ? 1 : 1;
  }
  savePlayerState();
}

// ─── GM Condition helpers ─────────────────────────────────────────────────────
function getGMChar(id) { return state.gmChars.find(c => c.id === id); }

function removeCondition(id) {
  delete state.conditions[id];
  savePlayerState();
}

function incrementCondition(id) {
  if (state.conditions[id] !== undefined) state.conditions[id]++;
  savePlayerState();
}

function decrementCondition(id) {
  if (state.conditions[id] !== undefined) {
    if (state.conditions[id] <= 1) delete state.conditions[id];
    else state.conditions[id]--;
  }
  savePlayerState();
}

function addGMCondition(charId, condId) {
  const char = getGMChar(charId);
  if (!char) return;
  if (char.conditions[condId] === undefined) char.conditions[condId] = 1;
  saveGMState();
}
function removeGMCondition(charId, condId) {
  const char = getGMChar(charId);
  if (!char) return;
  delete char.conditions[condId];
  saveGMState();
}
function incGMCondition(charId, condId) {
  const char = getGMChar(charId);
  if (!char || char.conditions[condId] === undefined) return;
  char.conditions[condId]++;
  saveGMState();
}
function decGMCondition(charId, condId) {
  const char = getGMChar(charId);
  if (!char || char.conditions[condId] === undefined) return;
  if (char.conditions[condId] <= 1) delete char.conditions[condId];
  else char.conditions[condId]--;
  saveGMState();
}

// ─── Render ──────────────────────────────────────────────────────────────────
function render() {
  // Capture active input element and selections to maintain focus layout
  const activeId = document.activeElement ? document.activeElement.id : null;
  const selectionStart = activeId ? document.activeElement.selectionStart : null;
  const selectionEnd = activeId ? document.activeElement.selectionEnd : null;

  const app = document.getElementById("app");
  app.innerHTML = buildApp();
  attachListeners();

  // Safely return focus and cursor positioning back to the active element
  if (activeId) {
    const activeEl = document.getElementById(activeId);
    if (activeEl) {
      activeEl.focus();
      if (selectionStart !== null && selectionEnd !== null && typeof activeEl.setSelectionRange === "function") {
        activeEl.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  }
}

function buildApp() {
  const tabs = state.isGM
    ? [
        { id: "actions", label: "◆ Actions" },
        { id: "conditions", label: "⚠ Conditions" },
        { id: "gm", label: "GM View" },
      ]
    : [
        { id: "actions", label: "◆ Actions" },
        { id: "conditions", label: "⚠ Conditions" },
      ];

  return `
    <div class="hud-header">
      <div class="hud-title">PF2<span>e</span> HUD</div>
      ${state.isGM ? `<span style="font-size:10px;color:var(--gold-dim);letter-spacing:.06em;font-weight:700">GM</span>` : ""}
    </div>
    <div class="tab-bar">
      ${tabs.map(t => `
        <button class="tab-btn ${state.activeTab === t.id ? "active" : ""}" data-tab="${t.id}">
          ${t.label}
        </button>`).join("")}
    </div>
    <div class="tab-content">
      ${state.activeTab === "actions"    ? buildActionsTab() : ""}
      ${state.activeTab === "conditions" ? buildConditionsTab(state.conditions, false) : ""}
      ${state.activeTab === "gm"         ? buildGMTab() : ""}
    </div>
  `;
}

// ─── Actions Tab ─────────────────────────────────────────────────────────────
function buildActionsTab() {
  const avail = availableActions();

  // Build the three action pips
  const pipHTML = [0, 1, 2].map(i => {
    const locked  = i >= avail;
    const used    = state.actions[i] && !locked;
    const cls     = locked ? "pip used" : used ? "pip used" : "pip available";
    const label   = locked ? "—" : used ? "✕" : (i + 1).toString();
    const tipAction = locked ? "" : `data-toggle-action="${i}"`;
    return `<div class="${cls}" ${tipAction} title="${locked ? "Locked by Slowed/Stunned" : used ? "Click to restore" : "Click to use"}">
      <div class="pip-inner">${label}</div>
    </div>`;
  }).join("");

  // Reaction
  const rxCls = state.reactionUsed ? "pip reaction-pip used" : "pip reaction-pip available";
  const rxLabel = state.reactionUsed ? "✕" : "⟳";
  const reactionPip = `<div class="${rxCls}" data-toggle-reaction title="${state.reactionUsed ? "Click to restore reaction" : "Click to use reaction"}">
    <div class="pip-inner">${rxLabel}</div>
  </div>`;

  // Active condition chips (shown inline in action tab too)
  const activeCondIds = Object.keys(state.conditions);
  const chipHTML = activeCondIds.length === 0
    ? `<span class="active-conditions-empty">No active conditions</span>`
    : activeCondIds.map(id => {
        const cond = getCondition(id);
        if (!cond) return "";
        const val = state.conditions[id];
        const bg = cond.color + "33";
        const border = cond.color + "99";
        const valBadge = cond.valued ? `<span class="active-chip-value">${val}</span>` : "";
        return `<div class="active-chip" style="background:${bg};border-color:${border};color:${cond.color === "#E0E0E0" ? "#ccc" : cond.color}">
          <span class="active-chip-icon">${cond.icon}</span>
          <span class="active-chip-name">${cond.name}</span>
          ${valBadge}
          <button class="active-chip-remove" data-remove-cond="${id}" title="Remove">×</button>
        </div>`;
      }).join("");

  return `
    <div class="action-panel">
      <div class="char-name-row">
        <input class="char-name-input" id="charNameInput"
          placeholder="Enter your character's name…"
          value="${escHtml(state.charName)}" />
      </div>

      <div class="round-row">
        <div class="round-label">Round</div>
        <button class="mod-stepper round-stepper" data-dec-round title="Decrease round">−</button>
        <div class="round-num">${state.round}</div>
        <button class="mod-stepper round-stepper" data-inc-round title="Increase round">+</button>
        <button class="reset-btn" data-reset-turn title="End turn: reset actions, drop frightened, reduce stun/slow">End Turn</button>
      </div>

      <div>
        <div class="action-row" style="margin-bottom:8px">
          <div class="action-label">Actions</div>
          <div class="pips">${pipHTML}</div>
        </div>
        <div class="action-row">
          <div class="action-label">Reaction</div>
          <div class="pips">${reactionPip}</div>
        </div>
      </div>

      <div class="action-modifiers">
        <div class="mod-label">Slowed</div>
        <div class="mod-control">
          <button class="mod-stepper" data-dec-slowed">−</button>
          <div class="mod-value">${state.slowedValue}</div>
          <button class="mod-stepper" data-inc-slowed">+</button>
        </div>
        <div style="width:1px;background:var(--border);height:18px;margin:0 8px"></div>
        <div class="mod-label">Stunned</div>
        <div class="mod-control">
          <button class="mod-stepper" data-dec-stunned">−</button>
          <div class="mod-value">${state.stunnedValue}</div>
          <button class="mod-stepper" data-inc-stunned">+</button>
        </div>
      </div>

      <div>
        <div class="section-label" style="padding:4px 0 6px">Active Conditions</div>
        <div class="active-conditions">${chipHTML}</div>
      </div>

      ${buildPersistentDamageSection(state.persistentDamage, false)}
    </div>
  `;
}

// ─── Persistent Damage Tracker Component ─────────────────────────────────────
function buildPersistentDamageSection(pdArray, isGM, gmCharId = null) {
  const list = pdArray || [];
  const chips = list.length === 0
    ? `<span class="active-conditions-empty">No persistent damage</span>`
    : list.map(pd => {
        const removeAttr = isGM
          ? `data-gm-remove-pd="${pd.id}" data-gm-char="${gmCharId}"`
          : `data-remove-pd="${pd.id}"`;
        return `
          <div class="active-chip" style="background:rgba(231,76,60,0.15);border-color:rgba(231,76,60,0.6);color:#e74c3c">
            <span class="active-chip-icon">💧</span>
            <span class="active-chip-name"><strong>${escHtml(pd.type)}</strong>: ${escHtml(pd.amount)}</span>
            <button class="active-chip-remove" ${removeAttr} title="Remove">×</button>
          </div>`;
      }).join("");

  const typeId = isGM ? `gmPdType` : `pdType`;
  const amountId = isGM ? `gmPdAmount` : `pdAmount`;
  const btnAttr = isGM ? `data-gm-add-pd="${gmCharId}"` : `data-add-pd`;

  const types = ["Bleed", "Acid", "Cold", "Electricity", "Fire", "Force", "Mental", "Poison", "Sonic", "Spirit"];
  const options = types.map(t => `<option value="${t}" ${state.pdType === t ? "selected" : ""}>${t}</option>`).join("");

  return `
    <div class="pd-section" style="margin-top:12px; padding-top:10px; border-top:1px solid var(--border-light)">
      <div class="section-label" style="padding:0 0 6px">Persistent Damage</div>
      <div class="active-conditions" style="margin-bottom:6px; min-height: 32px;">${chips}</div>
      <div style="display:flex;gap:6px">
        <select class="char-name-input" id="${typeId}" style="flex:1;height:24px;padding:0 4px;font-size:11px;background:var(--bg-light);border:1px solid var(--border)">
          ${options}
        </select>
        <input class="char-name-input" id="${amountId}" placeholder="e.g. 1d6" value="${escHtml(state.pdAmount)}" style="width:65px;height:24px;padding:0 4px;font-size:11px;text-align:center;background:var(--bg-light);border:1px solid var(--border)" />
        <button class="cond-add-btn" ${btnAttr} style="height:24px;width:24px;line-height:20px;padding:0">+</button>
      </div>
    </div>
  `;
}

// ─── Conditions Tab ───────────────────────────────────────────────────────────
function buildConditionsTab(conditionsObj, isGM, gmCharId = null) {
  const query = state.conditionSearch.toLowerCase().trim();

  // Active strip
  const activeIds = Object.keys(conditionsObj);
  const chipHTML = activeIds.length === 0
    ? `<span class="active-conditions-empty">No active conditions</span>`
    : activeIds.map(id => {
        const cond = getCondition(id);
        if (!cond) return "";
        const val = conditionsObj[id];
        const bg = cond.color + "33";
        const border = cond.color + "99";
        const textColor = cond.color === "#E0E0E0" ? "#ccc" : cond.color;
        const valBadge = cond.valued ? `<span class="active-chip-value">${val}</span>` : "";
        const removeAttr = isGM
          ? `data-gm-remove-cond="${id}" data-gm-char="${gmCharId}"`
          : `data-remove-cond="${id}"`;
        return `<div class="active-chip" style="background:${bg};border-color:${border};color:${textColor}">
          <span class="active-chip-icon">${cond.icon}</span>
          <span class="active-chip-name">${cond.name}</span>
          ${valBadge}
          <button class="active-chip-remove" ${removeAttr} title="Remove">×</button>
        </div>`;
      }).join("");

  // Grouped condition list
  const grouped = {};
  for (const cat of CATEGORY_ORDER) grouped[cat] = [];
  for (const cond of CONDITIONS) {
    if (query && !cond.name.toLowerCase().includes(query) && !cond.summary.toLowerCase().includes(query)) continue;
    if (!grouped[cond.category]) grouped[cond.category] = [];
    grouped[cond.category].push(cond);
  }

  const listHTML = CATEGORY_ORDER.map(cat => {
    const items = grouped[cat];
    if (!items || items.length === 0) return "";
    return `
      <div class="condition-category">
        <div class="section-label">${CATEGORY_LABELS[cat] ?? cat}</div>
        ${items.map(cond => buildConditionItem(cond, conditionsObj, isGM, gmCharId)).join("")}
      </div>`;
  }).join("");

  return `
    <div class="condition-search-row">
      <input class="condition-search" id="conditionSearch"
        placeholder="Search conditions…"
        value="${escHtml(state.conditionSearch)}" />
    </div>
    <div style="padding:6px 10px 4px;border-bottom:1px solid var(--border)">
      <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-dim);margin-bottom:5px">Active</div>
      <div class="active-conditions" style="min-height:36px">${chipHTML}</div>
    </div>
    ${listHTML}
  `;
}

function buildConditionItem(cond, conditionsObj, isGM, gmCharId) {
  const isActive = conditionsObj[cond.id] !== undefined;
  const val = conditionsObj[cond.id] ?? 0;

  const addAttr = isGM
    ? `data-gm-add-cond="${cond.id}" data-gm-char="${gmCharId}"`
    : `data-add-cond="${cond.id}"`;
  const remAttr = isGM
    ? `data-gm-remove-cond="${cond.id}" data-gm-char="${gmCharId}"`
    : `data-remove-cond="${cond.id}"`;
  const incAttr = isGM
    ? `data-gm-inc-cond="${cond.id}" data-gm-char="${gmCharId}"`
    : `data-inc-cond="${cond.id}"`;
  const decAttr = isGM
    ? `data-gm-dec-cond="${cond.id}" data-gm-char="${gmCharId}"`
    : `data-dec-cond="${cond.id}"`;

  const valuedBadge = cond.valued ? `<span class="cond-valued-badge">Valued</span>` : "";

  let controls;
  if (!isActive) {
    controls = `<button class="cond-add-btn" ${addAttr} title="Add ${cond.name}">+</button>`;
  } else if (cond.valued) {
    controls = `
      <div class="cond-value-ctrl">
        <button class="cond-val-btn" ${decAttr}>−</button>
        <div class="cond-current-val">${val}</div>
        <button class="cond-val-btn" ${incAttr}>+</button>
      </div>
      <button class="cond-remove-btn" ${remAttr} title="Remove ${cond.name}">×</button>`;
  } else {
    controls = `<button class="cond-remove-btn" ${remAttr} title="Remove ${cond.name}">×</button>`;
  }

  const dotColor = isActive ? cond.color : "var(--border-light)";

  return `
    <div class="condition-item ${isActive ? "is-active" : ""}" style="border-left:3px solid ${dotColor}">
      <div class="cond-icon">${cond.icon}</div>
      <div class="cond-info">
        <div class="cond-name">${cond.name}${valuedBadge}</div>
        <div class="cond-desc">${escHtml(cond.summary)}</div>
      </div>
      <div class="cond-controls">${controls}</div>
    </div>`;
}

// ─── GM Tab ──────────────────────────────────────────────────────────────────
function buildGMTab() {
  const chars = state.gmChars;
  const sel = state.selectedGmCharId;
  const selChar = chars.find(c => c.id === sel);

  const charListHTML = chars.length === 0
    ? `<div class="gm-empty">No characters tracked yet.<br>Add one below.</div>`
    : chars.map(char => {
        const activeIds = Object.keys(char.conditions ?? {});
        let chips = activeIds.map(id => {
          const cond = getCondition(id);
          if (!cond) return "";
          const val = char.conditions[id];
          return `<span class="gm-mini-chip" style="background:${cond.color}22;border-color:${cond.color}88;color:${cond.color}">
            ${cond.icon} ${cond.name}${cond.valued ? " " + val : ""}
          </span>`;
        }).join("");

        // Also display persistent damage chips in GM tracking side rows
        const pdChips = (char.persistentDamage || []).map(pd => {
          return `<span class="gm-mini-chip" style="background:rgba(231,76,60,0.15);border-color:rgba(231,76,60,0.5);color:#e74c3c">💧 ${pd.type} ${pd.amount}</span>`;
        }).join("");

        return `
          <div class="gm-char-row ${char.id === sel ? "selected" : ""}" data-select-char="${char.id}">
            <div style="flex:1">
              <div class="gm-char-name">${escHtml(char.name)}</div>
              ${(chips || pdChips) ? `<div class="gm-char-chips">${chips}${pdChips}</div>` : ""}
            </div>
            <button class="gm-delete-btn" data-delete-char="${char.id}" title="Remove character">🗑</button>
          </div>`;
      }).join("");

  const condPanel = selChar
    ? `<div class="section-label" style="margin-top:4px">Conditions & FX — ${escHtml(selChar.name)}</div>
       ${buildPersistentDamageSection(selChar.persistentDamage ?? [], true, selChar.id)}
       <div style="margin-top: 10px;">
         ${buildConditionsTab(selChar.conditions ?? {}, true, selChar.id)}
       </div>`
    : `<div class="gm-empty" style="margin-top:12px">Select a character above<br>to manage their conditions.</div>`;

  return `
    <div class="gm-panel">
      <div class="gm-add-char">
        <input class="gm-add-input" id="gmAddInput" placeholder="Character or NPC name…" />
        <button class="gm-add-btn-submit" id="gmAddBtn">+ Add</button>
      </div>
      ${charListHTML}
    </div>
    ${condPanel}
  `;
}

// ─── Event Listeners ─────────────────────────────────────────────────────────
function attachListeners() {
  // Tab switching
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeTab = btn.dataset.tab;
      render();
    });
  });

  // Character name
  const nameInput = document.getElementById("charNameInput");
  if (nameInput) {
    nameInput.addEventListener("change", () => {
      state.charName = nameInput.value;
      savePlayerState();
    });
  }

  // Action pips
  document.querySelectorAll("[data-toggle-action]").forEach(el => {
    el.addEventListener("click", () => {
      const i = parseInt(el.dataset.toggleAction);
      if (i >= availableActions()) return;
      state.actions[i] = !state.actions[i];
      savePlayerState();
      render();
    });
  });

  // Reaction
  const rxPip = document.querySelector("[data-toggle-reaction]");
  if (rxPip) {
    rxPip.addEventListener("click", () => {
      state.reactionUsed = !state.reactionUsed;
      savePlayerState();
      render();
    });
  }

  // Slowed / Stunned
  document.querySelector("[data-inc-slowed]")?.addEventListener("click", () => { state.slowedValue++; savePlayerState(); render(); });
  document.querySelector("[data-dec-slowed]")?.addEventListener("click", () => { if (state.slowedValue > 0) state.slowedValue--; savePlayerState(); render(); });
  document.querySelector("[data-inc-stunned]")?.addEventListener("click", () => { state.stunnedValue++; savePlayerState(); render(); });
  document.querySelector("[data-dec-stunned]")?.addEventListener("click", () => { if (state.stunnedValue > 0) state.stunnedValue--; savePlayerState(); render(); });

  // Round
  document.querySelector("[data-inc-round]")?.addEventListener("click", () => { state.round++; savePlayerState(); render(); });
  document.querySelector("[data-dec-round]")?.addEventListener("click", () => { if (state.round > 1) state.round--; savePlayerState(); render(); });

  // End turn
  document.querySelector("[data-reset-turn]")?.addEventListener("click", () => { resetTurn(); render(); });

  // Condition search
  const condSearch = document.getElementById("conditionSearch");
  if (condSearch) {
    condSearch.addEventListener("input", () => {
      state.conditionSearch = condSearch.value;
      render();
    });
  }

  // Player conditions
  document.querySelectorAll("[data-add-cond]").forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); addCondition(el.dataset.addCond); render(); });
  });
  document.querySelectorAll("[data-remove-cond]").forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); removeCondition(el.dataset.removeCond); render(); });
  });
  document.querySelectorAll("[data-inc-cond]").forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); incrementCondition(el.dataset.incCond); render(); });
  });
  document.querySelectorAll("[data-dec-cond]").forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); decrementCondition(el.dataset.decCond); render(); });
  });

  // Player Persistent Damage UI Listeners
  const pdTypeEl = document.getElementById("pdType");
  if (pdTypeEl) pdTypeEl.addEventListener("change", () => { state.pdType = pdTypeEl.value; });
  
  const pdAmountEl = document.getElementById("pdAmount");
  if (pdAmountEl) pdAmountEl.addEventListener("input", () => { state.pdAmount = pdAmountEl.value; });

  document.querySelector("[data-add-pd]")?.addEventListener("click", () => {
    if (!state.persistentDamage) state.persistentDamage = [];
    state.persistentDamage.push({
      id: crypto.randomUUID(),
      type: state.pdType,
      amount: state.pdAmount || "1d6"
    });
    savePlayerState();
    render();
  });

  document.querySelectorAll("[data-remove-pd]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      state.persistentDamage = state.persistentDamage.filter(d => d.id !== el.dataset.removePd);
      savePlayerState();
      render();
    });
  });

  // GM: add character
  const gmAddBtn = document.getElementById("gmAddBtn");
  const gmAddInput = document.getElementById("gmAddInput");
  if (gmAddBtn && gmAddInput) {
    const doAdd = () => {
      const name = gmAddInput.value.trim();
      if (!name) return;
      state.gmChars.push({ id: crypto.randomUUID(), name, conditions: {}, actions: [false,false,false], reactionUsed: false, persistentDamage: [] });
      saveGMState();
      render();
    };
    gmAddBtn.addEventListener("click", doAdd);
    gmAddInput.addEventListener("keydown", e => { if (e.key === "Enter") doAdd(); });
  }

  // GM: select / delete character
  document.querySelectorAll("[data-select-char]").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-delete-char]")) return;
      state.selectedGmCharId = el.dataset.selectChar;
      render();
    });
  });
  document.querySelectorAll("[data-delete-char]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      state.gmChars = state.gmChars.filter(c => c.id !== el.dataset.deleteChar);
      if (state.selectedGmCharId === el.dataset.deleteChar) state.selectedGmCharId = null;
      saveGMState();
      render();
    });
  });

  // GM: conditions on selected character
  document.querySelectorAll("[data-gm-add-cond]").forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); addGMCondition(el.dataset.gmChar, el.dataset.gmAddCond); render(); });
  });
  document.querySelectorAll("[data-gm-remove-cond]").forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); removeGMCondition(el.dataset.gmChar, el.dataset.gmRemoveCond); render(); });
  });
  document.querySelectorAll("[data-gm-inc-cond]").forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); incGMCondition(el.dataset.gmChar, el.dataset.gmIncCond); render(); });
  });
  document.querySelectorAll("[data-gm-dec-cond]").forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); decGMCondition(el.dataset.gmChar, el.dataset.gmDecCond); render(); });
  });

  // GM Persistent Damage UI Listeners
  const gmPdTypeEl = document.getElementById("gmPdType");
  if (gmPdTypeEl) gmPdTypeEl.addEventListener("change", () => { state.pdType = gmPdTypeEl.value; });
  
  const gmPdAmountEl = document.getElementById("gmPdAmount");
  if (gmPdAmountEl) gmPdAmountEl.addEventListener("input", () => { state.pdAmount = gmPdAmountEl.value; });

  document.querySelectorAll("[data-gm-add-pd]").forEach(el => {
    el.addEventListener("click", () => {
      const charId = el.dataset.gmAddPd;
      const char = getGMChar(charId);
      if (!char) return;
      if (!char.persistentDamage) char.persistentDamage = [];
      char.persistentDamage.push({
        id: crypto.randomUUID(),
        type: state.pdType,
        amount: state.pdAmount || "1d6"
      });
      saveGMState();
      render();
    });
  });

  document.querySelectorAll("[data-gm-remove-pd]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const charId = el.dataset.gmChar;
      const char = getGMChar(charId);
      if (!char || !char.persistentDamage) return;
      char.persistentDamage = char.persistentDamage.filter(d => d.id !== el.dataset.gmRemovePd);
      saveGMState();
      render();
    });
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}