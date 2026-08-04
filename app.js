(function () {
  const DATA_PATHS = {
    fieldDefinitions: "data/faltdefinitioner.json",
    species: "data/adelspindlingar.json"
  };

  const FIELD_LABELS = {
    skivfarg_unga: "Skivfärg hos unga fruktkroppar",
    koh_hatt: "KOH på hatt",
    koh_fotknol: "KOH på fotknöl",
    koh_kott: "KOH i kött",
    fotknol_form: "Fotknölens form",
    miljo: "Miljö",
    tradslag: "Associerade trädslag",
    hattfarg: "Hattfärg",
    fotfarg: "Fotfärg",
    lukt: "Lukt",
    fruktkroppstid: "Fruktkroppstid",
    viktiga_karaktarer: "Viktiga karaktärer",
    forvaxlingsarter: "Förväxlingsarter",
    bilder: "Bilder"
  };

  const NON_FILTER_FIELDS = new Set([
    "vetenskapligt_namn",
    "svenskt_namn",
    "viktiga_karaktarer",
    "forvaxlingsarter",
    "bilder"
  ]);

  const DETAIL_FIELDS = [
    "skivfarg_unga",
    "koh_hatt",
    "koh_fotknol",
    "koh_kott",
    "fotknol_form",
    "miljo",
    "tradslag",
    "hattfarg",
    "fotfarg",
    "lukt",
    "fruktkroppstid"
  ];

  const OPTION_COLORS = {
    blå: "#3d6fb6",
    gul: "#d6a719",
    gråvit: "#d9ddd8",
    röd: "#b64235",
    brun: "#76523d",
    ingen: "#eef0ea"
  };

  const state = {
    fields: [],
    species: [],
    evaluated: [],
    selectedSpeciesKey: null
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindEvents();

    try {
      const data = await loadData();
      state.fields = normalizeFieldDefinitions(data.fieldDefinitions);
      state.species = data.species;
      renderFilterForm();
      updateResults();
    } catch (error) {
      showError(error);
    }
  }

  function cacheElements() {
    elements.form = document.querySelector("#filter-form");
    elements.resetAll = document.querySelector("#reset-all");
    elements.nameSearch = document.querySelector("#name-search");
    elements.resultCounts = document.querySelector("#result-counts");
    elements.compactResults = document.querySelector("#compact-results");
    elements.comparison = document.querySelector("#comparison");
    elements.comparisonSummary = document.querySelector("#comparison-summary");
    elements.details = document.querySelector("#species-details");
    elements.error = document.querySelector("#load-error");
  }

  function bindEvents() {
    elements.form.addEventListener("change", updateResults);
    elements.resetAll.addEventListener("click", resetFilters);
    elements.nameSearch.addEventListener("input", renderCompactResults);
  }

  async function loadData() {
    const [fieldResponse, speciesResponse] = await Promise.all([
      fetch(DATA_PATHS.fieldDefinitions),
      fetch(DATA_PATHS.species)
    ]);

    if (!fieldResponse.ok) {
      throw new Error(`Kunde inte ladda ${DATA_PATHS.fieldDefinitions}: ${fieldResponse.status}`);
    }

    if (!speciesResponse.ok) {
      throw new Error(`Kunde inte ladda ${DATA_PATHS.species}: ${speciesResponse.status}`);
    }

    const [fieldDefinitions, speciesData] = await Promise.all([
      fieldResponse.json(),
      speciesResponse.json()
    ]);

    if (!fieldDefinitions || typeof fieldDefinitions.faltdefinitioner !== "object") {
      throw new Error("faltdefinitioner.json saknar objektet faltdefinitioner.");
    }

    if (!speciesData || !Array.isArray(speciesData.arter)) {
      throw new Error("adelspindlingar.json saknar listan arter.");
    }

    return {
      fieldDefinitions: fieldDefinitions.faltdefinitioner,
      species: speciesData.arter
    };
  }

  function normalizeFieldDefinitions(definitions) {
    return Object.entries(definitions)
      .map(([key, definition]) => {
        const isSimpleList = Array.isArray(definition);
        const type = isSimpleList ? "flerval" : definition.typ;
        const options = isSimpleList ? definition : definition.alternativ;

        return {
          key,
          label: FIELD_LABELS[key] || humanizeKey(key),
          type,
          options: Array.isArray(options) ? options.filter(Boolean) : []
        };
      })
      .filter((field) => {
        return field.type === "flerval" && field.options.length > 0 && !NON_FILTER_FIELDS.has(field.key);
      });
  }

  function renderFilterForm() {
    elements.form.replaceChildren();

    if (state.fields.length === 0) {
      const message = document.createElement("p");
      message.className = "muted";
      message.textContent = "Det finns inga filterbara fält med alternativ ännu.";
      elements.form.append(message);
      return;
    }

    const fragment = document.createDocumentFragment();

    state.fields.forEach((field) => {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "filter-group";
      fieldset.dataset.field = field.key;

      const legend = document.createElement("legend");
      legend.className = "visually-hidden";
      legend.textContent = field.label;

      const title = document.createElement("h3");
      title.className = "filter-title";
      title.textContent = field.label;

      const resetButton = document.createElement("button");
      resetButton.className = "reset-group";
      resetButton.type = "button";
      resetButton.textContent = "Återställ";
      resetButton.addEventListener("click", () => resetFilterGroup(field.key));

      fieldset.append(legend, title);

      const optionsGrid = document.createElement("div");
      optionsGrid.className = "options-grid";

      field.options.forEach((option) => {
        const id = `filter-${field.key}-${slugify(option)}`;
        const label = document.createElement("label");
        label.className = "choice";
        label.htmlFor = id;

        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = id;
        input.name = field.key;
        input.value = option;

        const text = document.createElement("span");
        const color = getOptionColor(option);

        if (color) {
          label.classList.add("choice-with-swatch");
          text.style.setProperty("--choice-color", color);
          text.style.setProperty("--choice-text-color", getOptionTextColor(option));
        }

        const optionText = document.createElement("span");
        optionText.textContent = option;
        text.append(optionText);

        label.append(input, text);
        optionsGrid.append(label);
      });

      fieldset.append(optionsGrid, resetButton);
      fragment.append(fieldset);
    });

    elements.form.append(fragment);
  }

  function getSelectedFilters() {
    return state.fields.reduce((filters, field) => {
      const checked = Array.from(elements.form.querySelectorAll(`input[name="${cssEscape(field.key)}"]:checked`))
        .map((input) => input.value);

      if (checked.length > 0) {
        filters[field.key] = checked;
      }

      return filters;
    }, {});
  }

  function evaluateSpecies(species, filters) {
    const evaluations = {};
    let hasMissing = false;

    for (const [field, selectedValues] of Object.entries(filters)) {
      const values = normalizeSpeciesValues(species[field]);

      if (values.length === 0) {
        evaluations[field] = {
          state: "missing",
          values
        };
        hasMissing = true;
        continue;
      }

      const matches = values.some((value) => selectedValues.includes(value));
      evaluations[field] = {
        state: matches ? "match" : "contradiction",
        values
      };

      if (!matches) {
        return {
          species,
          status: "contradiction",
          missingFields: [],
          evaluations
        };
      }
    }

    return {
      species,
      status: hasMissing ? "possible" : "full",
      missingFields: Object.entries(evaluations)
        .filter(([, result]) => result.state === "missing")
        .map(([field]) => field),
      evaluations
    };
  }

  function filterSpecies(filters) {
    return state.species
      .map((species) => evaluateSpecies(species, filters))
      .filter((result) => result.status !== "contradiction")
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "full" ? -1 : 1;
        }

        return getDisplayName(a.species).localeCompare(getDisplayName(b.species), "sv");
      });
  }

  function updateResults() {
    const filters = getSelectedFilters();
    state.evaluated = filterSpecies(filters);

    if (!state.evaluated.some((result) => getSpeciesKey(result.species) === state.selectedSpeciesKey)) {
      state.selectedSpeciesKey = null;
    }

    renderCompactResults();
    renderComparison(filters);

    if (state.selectedSpeciesKey) {
      const selected = state.evaluated.find((result) => getSpeciesKey(result.species) === state.selectedSpeciesKey);
      renderSpeciesDetails(selected ? selected.species : null);
    } else {
      renderSpeciesDetails(null);
    }
  }

  function renderCompactResults() {
    const query = elements.nameSearch.value.trim().toLocaleLowerCase("sv");
    const fullCount = state.evaluated.filter((result) => result.status === "full").length;
    const possibleCount = state.evaluated.filter((result) => result.status === "possible").length;
    const filteredByName = state.evaluated.filter((result) => {
      if (!query) {
        return true;
      }

      const haystack = `${getDisplayName(result.species)} ${formatScientificName(result.species.vetenskapligt_namn)}`.toLocaleLowerCase("sv");
      return haystack.includes(query);
    });

    elements.resultCounts.innerHTML = `
      <strong>${state.evaluated.length}</strong>
      ${fullCount} fullständiga träffar, ${possibleCount} möjliga träffar.
    `;

    elements.compactResults.replaceChildren();

    if (filteredByName.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Inga arter matchar namnsökningen.";
      elements.compactResults.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();

    filteredByName.forEach((result) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "species-button";
      button.setAttribute("aria-pressed", String(getSpeciesKey(result.species) === state.selectedSpeciesKey));
      button.addEventListener("click", () => selectSpecies(result.species));

      const swedishName = document.createElement("span");
      swedishName.className = "species-name";
      swedishName.textContent = getDisplayName(result.species);

      const scientificName = document.createElement("span");
      scientificName.className = "scientific-name";
      scientificName.textContent = formatScientificName(result.species.vetenskapligt_namn);

      const status = document.createElement("span");
      status.className = `status-badge ${result.status === "full" ? "status-full" : "status-possible"}`;
      status.textContent = result.status === "full" ? "Full träff" : "Möjlig - uppgifter saknas";

      button.append(swedishName, scientificName, status);
      fragment.append(button);
    });

    elements.compactResults.append(fragment);
  }

  function renderComparison(filters) {
    const selectedFields = Object.keys(filters);
    elements.comparison.replaceChildren();

    if (state.evaluated.length > 10) {
      elements.comparisonSummary.textContent = "Fyll i fler observationer för att visa en detaljerad jämförelse.";
      return;
    }

    if (state.evaluated.length === 0) {
      elements.comparisonSummary.textContent = "Inga arter återstår med de valda observationerna.";
      return;
    }

    if (selectedFields.length === 0) {
      elements.comparisonSummary.textContent = "Välj minst en observation för att jämföra karaktärer.";
      return;
    }

    elements.comparisonSummary.textContent = `${state.evaluated.length} arter visas i jämförelsen.`;

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    const headerRow = document.createElement("tr");

    ["Svenskt namn", "Vetenskapligt namn", "Träffstatus", ...selectedFields.map(getFieldLabel), "Viktiga karaktärer"].forEach((heading) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = heading;
      headerRow.append(th);
    });

    thead.append(headerRow);

    state.evaluated.forEach((result) => {
      const row = document.createElement("tr");
      row.className = "clickable-row";
      row.tabIndex = 0;
      row.addEventListener("click", () => selectSpecies(result.species));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectSpecies(result.species);
        }
      });

      appendCell(row, getDisplayName(result.species));
      appendCell(row, formatScientificName(result.species.vetenskapligt_namn), "scientific-cell");
      appendCell(row, result.status === "full" ? "Full träff" : "Möjlig - uppgifter saknas");

      selectedFields.forEach((field) => {
        const td = document.createElement("td");
        const cell = document.createElement("div");
        const evaluation = result.evaluations[field] || { state: "missing", values: [] };
        cell.className = `comparison-cell ${getCellClass(evaluation.state)}`;
        cell.textContent = getEvaluationLabel(evaluation.state);

        const values = document.createElement("span");
        values.className = "cell-values";
        values.textContent = evaluation.values.length > 0 ? evaluation.values.join(", ") : "Ingen uppgift";
        cell.append(values);
        td.append(cell);
        row.append(td);
      });

      appendCell(row, formatList(result.species.viktiga_karaktarer));
      tbody.append(row);
    });

    table.append(thead, tbody);
    elements.comparison.append(table);
  }

  function renderSpeciesDetails(species) {
    elements.details.replaceChildren();

    if (!species) {
      const message = document.createElement("p");
      message.className = "muted";
      message.textContent = "Välj en art i träfflistan eller tabellen för att visa detaljer.";
      elements.details.append(message);
      return;
    }

    const title = document.createElement("h3");
    title.textContent = getDisplayName(species);

    const scientific = document.createElement("p");
    scientific.className = "scientific-name";
    scientific.textContent = formatScientificName(species.vetenskapligt_namn);

    const details = document.createElement("dl");
    details.className = "details-grid";

    DETAIL_FIELDS.forEach((field) => {
      const values = normalizeSpeciesValues(species[field]);
      if (values.length > 0) {
        appendDetail(details, getFieldLabel(field), values.join(", "));
      }
    });

    elements.details.append(title, scientific, details);

    appendImportantCharacters(species);
    appendLookalikes(species);
    appendImages(species);
  }

  function appendImportantCharacters(species) {
    const characters = normalizeSpeciesValues(species.viktiga_karaktarer);
    if (characters.length === 0) {
      return;
    }

    const heading = document.createElement("h3");
    heading.textContent = "Viktiga karaktärer";

    const list = document.createElement("ul");
    list.className = "detail-list";
    characters.forEach((character) => {
      const item = document.createElement("li");
      item.textContent = character;
      list.append(item);
    });

    elements.details.append(heading, list);
  }

  function appendLookalikes(species) {
    if (!Array.isArray(species.forvaxlingsarter) || species.forvaxlingsarter.length === 0) {
      return;
    }

    const heading = document.createElement("h3");
    heading.textContent = "Förväxlingsarter";

    const list = document.createElement("ul");
    list.className = "detail-list";

    species.forvaxlingsarter.forEach((lookalike) => {
      const item = document.createElement("li");
      const name = [
        lookalike.svenskt_namn,
        formatScientificName(lookalike.vetenskapligt_namn)
      ].filter(Boolean).join(" - ");
      const difference = lookalike.skillnad ? `: ${lookalike.skillnad}` : "";
      item.textContent = `${name}${difference}`;
      list.append(item);
    });

    elements.details.append(heading, list);
  }

  function appendImages(species) {
    if (!Array.isArray(species.bilder) || species.bilder.length === 0) {
      return;
    }

    const heading = document.createElement("h3");
    heading.textContent = "Bilder";

    const grid = document.createElement("div");
    grid.className = "image-grid";

    species.bilder.forEach((image) => {
      if (!image.fil) {
        return;
      }

      const figure = document.createElement("figure");
      figure.className = "image-card";

      const img = document.createElement("img");
      img.src = image.fil;
      img.alt = image.bildtext || getDisplayName(species);
      img.loading = "lazy";
      img.addEventListener("error", () => {
        figure.classList.add("hidden");
      });

      const caption = document.createElement("figcaption");
      caption.textContent = [image.bildtext, image.fotograf, image.licens].filter(Boolean).join(" | ");

      figure.append(img, caption);
      grid.append(figure);
    });

    if (grid.children.length > 0) {
      elements.details.append(heading, grid);
    }
  }

  function selectSpecies(species) {
    state.selectedSpeciesKey = getSpeciesKey(species);
    renderSpeciesDetails(species);
    renderCompactResults();
  }

  function resetFilters() {
    elements.form.reset();
    elements.nameSearch.value = "";
    state.selectedSpeciesKey = null;
    updateResults();
  }

  function resetFilterGroup(fieldKey) {
    elements.form.querySelectorAll(`input[name="${cssEscape(fieldKey)}"]`).forEach((input) => {
      input.checked = false;
    });
    updateResults();
  }

  function showError(error) {
    console.error(error);
    elements.error.hidden = false;
    elements.error.textContent = [
      "JSON-filerna kunde inte laddas eller har oväntad struktur.",
      "Kör projektet genom en lokal webbserver, till exempel VS Codes Live Server, eftersom fetch() normalt inte fungerar via file://.",
      `Tekniskt fel: ${error.message}`
    ].join(" ");
    elements.resultCounts.textContent = "Kunde inte ladda arter.";
  }

  function appendCell(row, text, className) {
    const td = document.createElement("td");
    if (className) {
      td.className = className;
    }
    td.textContent = text || "-";
    row.append(td);
  }

  function appendDetail(list, label, value) {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    wrapper.append(term, description);
    list.append(wrapper);
  }

  function normalizeSpeciesValues(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean).map(String);
    }

    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }

    return [];
  }

  function formatScientificName(name) {
    if (!name) {
      return "";
    }

    const trimmed = String(name).trim();
    return trimmed.startsWith("Cortinarius") ? trimmed : `Cortinarius ${trimmed}`;
  }

  function formatList(value) {
    const values = normalizeSpeciesValues(value);
    return values.length > 0 ? values.join(", ") : "-";
  }

  function getDisplayName(species) {
    return species.svenskt_namn || formatScientificName(species.vetenskapligt_namn) || "Namnlös art";
  }

  function getSpeciesKey(species) {
    return `${species.vetenskapligt_namn || ""}|${species.svenskt_namn || ""}`;
  }

  function getFieldLabel(fieldKey) {
    const field = state.fields.find((candidate) => candidate.key === fieldKey);
    return field ? field.label : FIELD_LABELS[fieldKey] || humanizeKey(fieldKey);
  }

  function getCellClass(stateName) {
    if (stateName === "match") {
      return "cell-match";
    }

    if (stateName === "contradiction") {
      return "cell-contradiction";
    }

    return "cell-missing";
  }

  function getEvaluationLabel(stateName) {
    if (stateName === "match") {
      return "✓ Stämmer";
    }

    if (stateName === "contradiction") {
      return "✕ Motsäger";
    }

    return "? Uppgift saknas";
  }

  function humanizeKey(key) {
    return key.replaceAll("_", " ").replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("sv"));
  }

  function slugify(value) {
    return String(value)
      .toLocaleLowerCase("sv")
      .replace(/[^a-z0-9åäö]+/gi, "-")
      .replace(/^-+|-+$/g, "");
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }

    return String(value).replace(/"/g, '\\"');
  }

  function getOptionColor(option) {
    return OPTION_COLORS[String(option).toLocaleLowerCase("sv")] || null;
  }

  function getOptionTextColor(option) {
    const key = String(option).toLocaleLowerCase("sv");
    return key === "gul" || key === "gråvit" || key === "ingen" ? "#1f2924" : "#ffffff";
  }
}());
