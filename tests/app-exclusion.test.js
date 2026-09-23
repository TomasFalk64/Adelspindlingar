const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Minimal DOM for exercising the real renderers and their button handlers.
class Element {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.events = {};
    this.attributes = {};
    this.dataset = {};
    this.className = "";
    this.value = "";
    this.style = { setProperty() {} };
    this.classList = {
      add: (name) => { this.className += ` ${name}`; },
      contains: (name) => this.className.split(/\s+/).includes(name)
    };
  }
  append(...children) {
    children.forEach((child) => {
      if (child.tag === "fragment") this.append(...child.children);
      else { child.parent = this; this.children.push(child); }
    });
  }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  addEventListener(type, handler) { this.events[type] = handler; }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(selector.startsWith(".") && child.classList.contains(selector.slice(1)) ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }
  closest(selector) {
    if (selector.split(", ").some((part) => this.classList.contains(part.slice(1)))) return this;
    return this.parent?.closest(selector);
  }
  focus() { this.focused = true; }
}

function fixture() {
  const context = vm.createContext({ document: {
    addEventListener() {},
    createElement: (tag) => new Element(tag),
    createDocumentFragment: () => new Element("fragment")
  } });
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  vm.runInContext(source.replace('document.addEventListener("DOMContentLoaded", init);',
    'globalThis.api = {state, elements, filterSpecies, getSpeciesKey, getExclusionKey, isManuallyExcluded, renderCompactResults, renderComparison, renderLookalikeComparison, renderCustomComparison};'), context);
  const api = context.api;
  const { state, elements } = api;
  for (const key of ["form", "nameSearch", "sortResults", "resultCounts", "compactResults", "comparison", "comparisonSummary", "comparisonLikelyOnly", "comparisonDifferingOnly", "lookalikeComparison", "lookalikeComparisonSummary", "comparisonDifferingOnlyDuplicate", "customComparison", "customComparisonSummary", "customComparisonDifferingOnly"]) {
    elements[key] = new Element();
  }
  elements.compactResults.className = "compact-results";
  for (const key of ["customSpeciesSearch", "customSpeciesSuggestions", "customSpeciesSearchStatus"]) elements[key] = new Element();
  for (const key of ["comparison", "lookalikeComparison", "customComparison"]) elements[key].className = "comparison";
  state.species = [
    { svenskt_namn: "Alfa", vetenskapligt_namn: "Cortinarius alfa", hattfarg: [], viktiga_karaktarer: ["Alfas kännetecken"] },
    { svenskt_namn: "Beta", vetenskapligt_namn: "Cortinarius beta", hattfarg: ["brun"] },
    { svenskt_namn: "Gamma", vetenskapligt_namn: "Cortinarius gamma", hattfarg: ["vit"] }
  ];
  state.species[1].forvaxlingsarter = [state.species[0], state.species[2]];
  state.selectedSpeciesKey = api.getSpeciesKey(state.species[1]);
  state.customSpeciesKeys = state.species.map(api.getSpeciesKey);
  const render = (filters = {}) => {
    state.evaluated = api.filterSpecies(filters);
    api.renderCompactResults();
    api.renderComparison(filters);
    api.renderLookalikeComparison(filters);
    api.renderCustomComparison(filters);
  };
  render();
  return { ...api, render };
}

const rows = (container) => container.children[0].children[1].children;
const names = (container) => rows(container).map((row) => row.children[1].textContent);
const control = (container, name) => rows(container).find((row) => row.children[1].textContent === name).children[0].children[0];
function click(button) {
  let stopped = false;
  button.events.click({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true, "must not open species details");
}

test("exclusion synchronizes tables, retains information, and restores from another table", () => {
  const { elements, state, isManuallyExcluded } = fixture();
  const original = control(elements.comparison, "Beta");
  assert.equal(original.textContent, "⊘");
  assert.equal(original.title, "Uteslut arten");
  assert.equal(original.getAttribute("aria-label"), "Uteslut arten");
  click(original);
  for (const container of [elements.comparison, elements.lookalikeComparison, elements.customComparison]) {
    assert.deepEqual(names(container), ["Alfa", "Gamma", "Beta"]);
    const excluded = rows(container).at(-1);
    assert.ok(excluded.classList.contains("is-manually-excluded"));
    assert.ok(excluded.classList.contains("excluded-group-start"));
    assert.equal(control(container, "Beta").textContent, "↶");
    assert.equal(control(container, "Beta").title, "Ta tillbaka arten");
    assert.equal(control(container, "Beta").getAttribute("aria-label"), "Ta tillbaka arten");
  }
  assert.ok(control(elements.comparison, "Beta").focused);
  assert.ok(elements.compactResults.children.at(-1).classList.contains("is-manually-excluded"));
  assert.equal(state.selectedSpeciesKey, "Cortinarius beta|Beta");
  assert.equal(isManuallyExcluded({ ...state.species[1], svenskt_namn: "Ändrat namn" }), true);
  click(control(elements.lookalikeComparison, "Beta"));
  assert.deepEqual(names(elements.comparison), ["Alfa", "Beta", "Gamma"]);
  assert.equal(elements.comparison.querySelectorAll(".excluded-group-start").length, 0);
  assert.equal(rows(elements.comparison)[0].children.at(-1).textContent, "Alfas kännetecken");
});

test("exclusions survive filter changes; active matches sort by status and excluded matches alphabetically", () => {
  const { elements, render, filterSpecies, state, isManuallyExcluded } = fixture();
  click(control(elements.comparison, "Gamma"));
  click(control(elements.comparison, "Alfa"));
  render({ hattfarg: ["brun"] });
  assert.deepEqual(names(elements.comparison), ["Beta", "Alfa"]);
  assert.equal(isManuallyExcluded(state.species[2]), true);
  assert.deepEqual(Array.from(filterSpecies({ hattfarg: ["brun"] }), (result) => result.status), ["full", "possible"]);
  render({ hattfarg: ["vit", "brun"] });
  assert.deepEqual(names(elements.comparison), ["Beta", "Alfa", "Gamma"]);
  assert.equal(elements.comparison.querySelectorAll(".excluded-group-start").length, 1);
  click(control(elements.customComparison, "Alfa"));
  render({ hattfarg: ["vit", "brun"] });
  assert.deepEqual(names(elements.comparison), ["Beta", "Alfa", "Gamma"]);
  render({});
  assert.deepEqual(names(elements.comparison), ["Alfa", "Beta", "Gamma"]);
  assert.equal(isManuallyExcluded(state.species[2]), true);
});

test("all excluded rows remain visible and the custom remove action stays separate", () => {
  const { elements, state, isManuallyExcluded, getExclusionKey } = fixture();
  for (const name of ["Gamma", "Beta", "Alfa"]) click(control(elements.customComparison, name));
  assert.deepEqual(names(elements.comparison), ["Alfa", "Beta", "Gamma"]);
  assert.equal(elements.comparison.querySelectorAll(".excluded-group-start").length, 1);
  assert.equal(elements.comparison.querySelectorAll(".is-manually-excluded").length, 3);
  const row = rows(elements.customComparison)[0];
  row.events.keydown({ target: row.children[0].children[0], key: "Enter", preventDefault() { assert.fail("must not intercept button activation"); } });
  click(row.children.at(-1).children[0]);
  assert.deepEqual(names(elements.customComparison), ["Beta", "Gamma"]);
  assert.equal(isManuallyExcluded(state.species[0]), true);
  assert.equal(rows(elements.comparison).length, 3);
  assert.equal(getExclusionKey({ id: 123, vetenskapligt_namn: "old" }), getExclusionKey({ id: 123, vetenskapligt_namn: "new" }));
});
