(function () {
  const DATA_PATHS = {
    fieldDefinitions: "data/faltdefinitioner.json",
    species: "data/adelspindlingar.json"
  };

  const FIELD_LABELS = {
    skivfarg_unga: "Skivfärg som ung",
    koh_hatt: "KOH på hatt",
    koh_fotknol: "KOH på fotknöl",
    koh_kott: "KOH i kött",
    fotknol_form: "Fotknölens form",
    miljo: "Miljö",
    tradslag: "Associerade trädslag",
    hattfarg: "Hattfärg",
    hattfarg_beskrivning: "Hattfärg, beskrivning",
    fotfarg: "Fotfärg",
    fotfarg_beskrivning: "Fotfärg, beskrivning",
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
    "vetenskapligt_namn",
    "svenskt_namn",
    "skivfarg_unga",
    "koh_hatt",
    "koh_fotknol",
    "koh_kott",
    "fotknol_form",
    "miljo",
    "tradslag",
    "hattfarg",
    "hattfarg_beskrivning",
    "fotfarg",
    "fotfarg_beskrivning",
    "lukt",
    "fruktkroppstid",
    "viktiga_karaktarer",
    "forvaxlingsarter",
    "bilder"
  ];

  const MARKER_DETAIL_FIELDS = new Set([
    "skivfarg_unga",
    "koh_hatt",
    "koh_fotknol",
    "koh_kott",
    "hattfarg",
    "fotfarg"
  ]);

  const READONLY_DETAIL_FIELDS = new Set([
    "vetenskapligt_namn",
    "svenskt_namn"
  ]);

  const PRIMARY_DETAIL_FIELDS = new Set([
    "skivfarg_unga",
    "koh_hatt",
    "koh_fotknol",
    "koh_kott",
    "hattfarg",
    "hattfarg_beskrivning",
    "fotfarg",
    "fotfarg_beskrivning"
  ]);

  const ALL_SPECIES_COLUMNS = [
    { key: "vetenskapligt_namn", label: "Cortinarius", type: "name" },
    { key: "svenskt_namn", label: "Svenskt namn", type: "text" },
    { key: "skivfarg_unga", label: "Skivor (unga)", type: "values" },
    { key: "koh_hatt", label: "Hatt", type: "values" },
    { key: "koh_fotknol", label: "Fotknöl", type: "values" },
    { key: "koh_kott", label: "Kött", type: "values" }
  ];

  const DEFAULT_COMPARISON_FIELDS = [
    "skivfarg_unga",
    "koh_hatt",
    "koh_fotknol",
    "koh_kott",
    "fotknol_form",
    "miljo",
    "tradslag",
    "hattfarg",
    "hattfarg_beskrivning",
    "fotfarg",
    "fotfarg_beskrivning",
    "lukt",
    "fruktkroppstid"
  ];

  const OPTION_COLORS = {
    blå: "#3d6fb6",
    gul: "#d6a719",
    gråvit: "#d9ddd8",
    grön: "#4f8f59",
    röd: "#b64235",
    brun: "#76523d",
    ingen: "#eef0ea"
  };

  const OPTION_HELP_TEXTS = {
    skivfarg_unga: {
      blå: "Unga skivor blå, lila eller gråblå",
      gul: "Unga skivor gula, orangegula, gulbruna, gulgröna eller gröna",
      gråvit: "Unga skivor vita, grå, beige eller gråbruna (utan blåa, gula eller gröna toner)"
    }
  };

  const state = {
    fieldDefinitions: [],
    fields: [],
    species: [],
    evaluated: [],
    selectedSpeciesKey: null,
    compactSortKey: "svenskt_namn",
    allSpeciesSort: {
      key: "vetenskapligt_namn",
      direction: "asc"
    }
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindEvents();

    try {
      const data = await loadData();
      state.fieldDefinitions = normalizeFieldDefinitions(data.fieldDefinitions);
      state.fields = state.fieldDefinitions.filter(isFilterableField);
      state.species = data.species;
      renderFilterForm();
      renderAllSpeciesTable();
      updateResults();
    } catch (error) {
      showError(error);
    }
  }

  function cacheElements() {
    elements.form = document.querySelector("#filter-form");
    elements.resetAll = document.querySelector("#reset-all");
    elements.nameSearch = document.querySelector("#name-search");
    elements.sortResults = document.querySelector("#sort-results");
    elements.resultCounts = document.querySelector("#result-counts");
    elements.compactResults = document.querySelector("#compact-results");
    elements.comparison = document.querySelector("#comparison");
    elements.comparisonSummary = document.querySelector("#comparison-summary");
    elements.details = document.querySelector("#species-details");
    elements.allSpeciesTable = document.querySelector("#all-species-table");
    elements.error = document.querySelector("#load-error");
  }

  function bindEvents() {
    elements.form.addEventListener("change", updateResults);
    elements.resetAll.addEventListener("click", resetFilters);
    elements.nameSearch.addEventListener("input", renderCompactResults);
    elements.sortResults.addEventListener("click", toggleCompactResultSort);
    document.addEventListener("click", closeDotPickersOnOutsideClick);
    document.addEventListener("keydown", closeDotPickersOnEscape);
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
      .filter((field) => field.key);
  }

  function isFilterableField(field) {
    return field.type === "flerval" && field.options.length > 0 && !NON_FILTER_FIELDS.has(field.key);
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
      resetButton.title = `Återställ ${field.label}`;
      resetButton.setAttribute("aria-label", `Återställ ${field.label}`);
      resetButton.textContent = "🗑️";
      resetButton.addEventListener("click", () => resetFilterGroup(field.key));

      fieldset.append(legend, title);

      const optionsGrid = document.createElement("div");
      optionsGrid.className = "options-grid";

      field.options.forEach((option) => {
        const id = `filter-${field.key}-${slugify(option)}`;
        const label = document.createElement("label");
        label.className = "choice";
        label.htmlFor = id;
        label.title = getOptionHelpText(field.key, option) || option;

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
    }).sort(compareCompactResults);

    const sortsBySwedish = state.compactSortKey === "svenskt_namn";
    elements.sortResults.textContent = sortsBySwedish ? "↓ Svenskt namn" : "↓ Vetenskapligt namn";
    elements.sortResults.setAttribute(
      "aria-label",
      sortsBySwedish ? "Sortera efter vetenskapligt namn" : "Sortera efter svenskt namn"
    );

    elements.resultCounts.innerHTML = `
      ${fullCount} troliga och ${possibleCount} möjliga träffar.
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
      status.textContent = result.status === "full" ? "Trolig" : "Möjlig";

      button.append(swedishName, scientificName, status);
      fragment.append(button);
    });

    elements.compactResults.append(fragment);
  }

  function toggleCompactResultSort() {
    state.compactSortKey = state.compactSortKey === "svenskt_namn" ? "vetenskapligt_namn" : "svenskt_namn";
    renderCompactResults();
  }

  function compareCompactResults(a, b) {
    const primaryA = getCompactSortValue(a.species, state.compactSortKey);
    const primaryB = getCompactSortValue(b.species, state.compactSortKey);
    const primaryCompare = primaryA.localeCompare(primaryB, "sv");

    if (primaryCompare !== 0) {
      return primaryCompare;
    }

    const secondaryKey = state.compactSortKey === "svenskt_namn" ? "vetenskapligt_namn" : "svenskt_namn";
    return getCompactSortValue(a.species, secondaryKey).localeCompare(getCompactSortValue(b.species, secondaryKey), "sv");
  }

  function getCompactSortValue(species, key) {
    return key === "svenskt_namn" ? getDisplayName(species) : formatScientificName(species.vetenskapligt_namn);
  }

  function renderComparison(filters) {
    const selectedFields = [...new Set([...Object.keys(filters), ...DEFAULT_COMPARISON_FIELDS])];
    elements.comparison.replaceChildren();

    if (state.evaluated.length > 10) {
      elements.comparisonSummary.textContent = "Fyll i fler observationer för att visa en detaljerad jämförelse.";
      return;
    }

    if (state.evaluated.length === 0) {
      elements.comparisonSummary.textContent = "Inga arter återstår med de valda observationerna.";
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
      appendCell(row, result.status === "full" ? "Trolig" : "Möjlig", "compact-status-cell");

      selectedFields.forEach((field) => {
        const td = document.createElement("td");
        const cell = document.createElement("div");
        const evaluation = result.evaluations[field] || { state: "missing", values: [] };
        cell.className = `comparison-cell ${getCellClass(evaluation.state)}`;
        cell.title = getEvaluationLabel(evaluation.state);

        if (evaluation.state === "missing") {
          const missing = document.createElement("span");
          missing.className = "unknown-marker";
          missing.textContent = "?";
          missing.title = "Uppgift saknas";
          cell.append(missing);
        } else if (MARKER_DETAIL_FIELDS.has(field)) {
          cell.append(renderValueMarkers(evaluation.values));
        } else {
          const values = document.createElement("span");
          values.className = "cell-values";
          values.textContent = evaluation.values.length > 0 ? evaluation.values.join(", ") : "?";
          cell.append(values);
        }

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

    const form = document.createElement("form");
    form.className = "species-edit-form";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveSpeciesDetails(species, form);
    });

    const nameRow = document.createElement("div");
    nameRow.className = "species-edit-name-row";

    const swedishName = document.createElement("strong");
    swedishName.textContent = getDisplayName(species);

    const scientificName = document.createElement("span");
    scientificName.className = "scientific-name";
    scientificName.textContent = formatScientificName(species.vetenskapligt_namn);

    const lockButton = document.createElement("button");
    lockButton.type = "button";
    lockButton.className = "edit-lock-button";
    lockButton.setAttribute("aria-pressed", "false");
    lockButton.setAttribute("aria-label", "Lås upp redigering");
    lockButton.title = "Lås upp redigering";
    lockButton.textContent = "🔒";
    lockButton.addEventListener("click", () => toggleSpeciesEditLock(form, lockButton));

    nameRow.append(swedishName, scientificName, lockButton);
    form.append(nameRow);

    const advancedDetails = document.createElement("details");
    advancedDetails.className = "advanced-detail-fields";

    const advancedSummary = document.createElement("summary");
    advancedSummary.textContent = "Fler fält";
    advancedDetails.append(advancedSummary);

    DETAIL_FIELDS.forEach((field) => {
      if (READONLY_DETAIL_FIELDS.has(field)) {
        return;
      }

      const row = renderEditableDetailField(species, field);
      if (PRIMARY_DETAIL_FIELDS.has(field)) {
        form.append(row);
      } else {
        advancedDetails.append(row);
      }
    });

    form.append(advancedDetails);

    const actions = document.createElement("div");
    actions.className = "species-edit-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.className = "secondary-button";
    saveButton.textContent = "Spara och ladda ner JSON";

    actions.append(saveButton);
    form.append(actions);
    setSpeciesFormLocked(form, true);
    elements.details.append(form);
  }

  function toggleSpeciesEditLock(form, button) {
    const isUnlocking = button.getAttribute("aria-pressed") !== "true";
    setSpeciesFormLocked(form, !isUnlocking);
  }

  function setSpeciesFormLocked(form, isLocked) {
    const button = form.querySelector(".edit-lock-button");
    form.classList.toggle("is-locked", isLocked);

    if (button) {
      button.textContent = isLocked ? "🔒" : "🔓";
      button.setAttribute("aria-pressed", String(!isLocked));
      button.setAttribute("aria-label", isLocked ? "Lås upp redigering" : "Lås redigering");
      button.title = isLocked ? "Lås upp redigering" : "Lås redigering";
    }

    form.querySelectorAll("input, select, textarea, .dot-toggle, .dot-picker-dropdown summary, .single-picker-option, .single-picker-dropdown summary, .multi-text-picker-option, .multi-text-picker-dropdown summary, .species-edit-actions button").forEach((control) => {
      if (control.classList.contains("edit-lock-button")) {
        return;
      }

      control.disabled = isLocked;
    });

    if (isLocked) {
      closeOpenDotPickers();
      closeOpenSinglePickers();
      closeOpenMultiTextPickers();
    }
  }

  function renderEditableDetailField(species, fieldKey) {
    const field = getFieldDefinition(fieldKey);
    const wrapper = document.createElement("div");
    wrapper.className = "detail-edit-row";

    const label = document.createElement("label");
    label.htmlFor = `detail-${fieldKey}`;
    label.textContent = getFieldLabel(fieldKey);

    const controlWrap = document.createElement("div");
    controlWrap.className = "detail-control";

    const control = createDetailControl(species, field || { key: fieldKey, type: "text", options: [] });
    controlWrap.append(control);

    if (MARKER_DETAIL_FIELDS.has(fieldKey) && control.dataset.valueType !== "toggles") {
      const preview = document.createElement("div");
      preview.className = "detail-marker-preview";
      preview.append(renderValueMarkers(species[fieldKey]));
      control.addEventListener("change", () => {
        preview.replaceChildren(renderValueMarkers(readDetailControlValue(control, fieldKey)));
      });
      controlWrap.append(preview);
    }

    wrapper.append(label, controlWrap);
    return wrapper;
  }

  function createDetailControl(species, field) {
    const value = species[field.key];
    const id = `detail-${field.key}`;

    if (field.key === "fotknol_form") {
      return createSingleOptionControl(id, field, value);
    }

    if (MARKER_DETAIL_FIELDS.has(field.key)) {
      return createDotToggleControl(id, field, value);
    }

    if (field.type === "flerval" && field.options.length > 0) {
      return createMultiTextPickerControl(id, field, value);
    }

    if (field.type === "textlista") {
      return createTextareaControl(id, field.key, normalizeSpeciesValues(value).join("\n"), "lines");
    }

    if (field.type === "objektlista") {
      return createTextareaControl(id, field.key, JSON.stringify(Array.isArray(value) ? value : [], null, 2), "json");
    }

    const input = document.createElement("input");
    input.id = id;
    input.name = field.key;
    input.type = "text";
    input.value = typeof value === "string" ? value : normalizeSpeciesValues(value).join(", ");
    input.dataset.valueType = "text";
    return input;
  }

  function createSingleOptionControl(id, field, value) {
    const currentValue = normalizeSpeciesValues(value)[0] || "";
    let selectedValue = currentValue;
    const group = document.createElement("div");
    group.className = "single-picker";
    group.id = id;
    group.dataset.valueType = "single-array";

    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = field.key;
    hidden.value = currentValue;
    hidden.dataset.valueType = "single-array";
    group.append(hidden);

    const selectedPreview = document.createElement("div");
    selectedPreview.className = "single-picker-selected";
    updateSingleTextPreview(selectedPreview, selectedValue);
    group.append(selectedPreview);

    const dropdown = document.createElement("details");
    dropdown.className = "single-picker-dropdown";

    const summary = document.createElement("summary");
    summary.textContent = "▾";
    summary.setAttribute("aria-label", `Välj ${getFieldLabel(field.key)}`);
    summary.addEventListener("click", () => {
      closeOpenSinglePickers(dropdown);
    });
    dropdown.append(summary);

    const optionsWrap = document.createElement("div");
    optionsWrap.className = "single-picker-options";

    field.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "single-picker-option";
      button.textContent = option;
      button.dataset.value = option;
      button.setAttribute("aria-pressed", String(option === selectedValue));
      button.addEventListener("click", () => {
        selectedValue = selectedValue === option ? "" : option;
        hidden.value = selectedValue;
        updateSingleTextPreview(selectedPreview, selectedValue);
        optionsWrap.querySelectorAll(".single-picker-option").forEach((item) => {
          item.setAttribute("aria-pressed", String(item.dataset.value === selectedValue));
        });
        dropdown.removeAttribute("open");
      });
      optionsWrap.append(button);
    });

    dropdown.append(optionsWrap);
    group.append(dropdown);
    return group;
  }

  function updateSingleTextPreview(preview, selectedValue) {
    preview.textContent = selectedValue || "Inget valt";
  }

  function createMultiTextPickerControl(id, field, value) {
    const selected = new Set(normalizeSpeciesValues(value));
    const group = document.createElement("div");
    group.className = "multi-text-picker";
    group.id = id;
    group.dataset.valueType = "toggles";

    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = field.key;
    hidden.value = JSON.stringify(Array.from(selected));
    hidden.dataset.valueType = "toggles";
    group.append(hidden);

    const selectedPreview = document.createElement("div");
    selectedPreview.className = "multi-text-picker-selected";
    updateMultiTextPreview(selectedPreview, selected);
    group.append(selectedPreview);

    const dropdown = document.createElement("details");
    dropdown.className = "multi-text-picker-dropdown";

    const summary = document.createElement("summary");
    summary.textContent = "▾";
    summary.setAttribute("aria-label", `Välj ${getFieldLabel(field.key)}`);
    summary.addEventListener("click", () => {
      closeOpenMultiTextPickers(dropdown);
    });
    dropdown.append(summary);

    const optionsWrap = document.createElement("div");
    optionsWrap.className = "multi-text-picker-options";

    field.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "multi-text-picker-option";
      button.textContent = option;
      button.dataset.value = option;
      button.setAttribute("aria-pressed", String(selected.has(option)));
      button.addEventListener("click", () => {
        if (selected.has(option)) {
          selected.delete(option);
        } else {
          selected.add(option);
        }

        hidden.value = JSON.stringify(Array.from(selected));
        updateMultiTextPreview(selectedPreview, selected);
        updateMultiTextPressed(optionsWrap, selected);
      });
      optionsWrap.append(button);
    });

    dropdown.append(optionsWrap);
    group.append(dropdown);
    return group;
  }

  function updateMultiTextPreview(preview, selected) {
    preview.textContent = selected.size > 0 ? Array.from(selected).join(", ") : "Inget valt";
  }

  function updateMultiTextPressed(optionsWrap, selected) {
    optionsWrap.querySelectorAll(".multi-text-picker-option[data-value]").forEach((button) => {
      button.setAttribute("aria-pressed", String(selected.has(button.dataset.value)));
    });
  }

  function createDotToggleControl(id, field, value) {
    const selected = new Set(normalizeSpeciesValues(value));
    const options = getMarkerOptions(field);
    const group = document.createElement("div");
    group.className = "dot-picker";
    group.id = id;
    group.dataset.valueType = "toggles";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", getFieldLabel(field.key));

    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = field.key;
    hidden.value = JSON.stringify(Array.from(selected));
    hidden.dataset.valueType = "toggles";
    group.append(hidden);

    const selectedPreview = document.createElement("div");
    selectedPreview.className = "dot-picker-selected";
    selectedPreview.append(renderValueMarkers(Array.from(selected)));
    group.append(selectedPreview);

    const dropdown = document.createElement("details");
    dropdown.className = "dot-picker-dropdown";

    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", `Välj ${getFieldLabel(field.key)}`);
    summary.textContent = "▾";
    summary.addEventListener("click", () => {
      closeOpenDotPickers(dropdown);
    });
    dropdown.append(summary);

    const optionsWrap = document.createElement("div");
    optionsWrap.className = "dot-toggle-group";

    options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dot-toggle";
      button.dataset.value = option;
      button.title = option;
      button.setAttribute("aria-label", option);

      const marker = document.createElement("span");
      const key = option.toLocaleLowerCase("sv");
      marker.className = getMarkerClassName(key);
      if (key === "?") {
        marker.textContent = "?";
      }
      marker.style.setProperty("--marker-color", getOptionColor(option) || "#cfd2cc");
      button.append(marker);

      setDotToggleState(button, selected.has(option));

      button.addEventListener("click", () => {
        if (selected.has(option)) {
          selected.delete(option);
        } else {
          selected.add(option);
        }

        hidden.value = JSON.stringify(Array.from(selected));
        setDotToggleState(button, selected.has(option));
        selectedPreview.replaceChildren(renderValueMarkers(Array.from(selected)));
        group.dispatchEvent(new Event("change", { bubbles: true }));
      });

      optionsWrap.append(button);
    });

    dropdown.append(optionsWrap);
    group.append(dropdown);

    return group;
  }

  function setDotToggleState(button, isSelected) {
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  }

  function closeDotPickersOnOutsideClick(event) {
    if (!event.target.closest(".dot-picker-dropdown")) {
      closeOpenDotPickers();
    }

    if (!event.target.closest(".single-picker-dropdown")) {
      closeOpenSinglePickers();
    }

    if (!event.target.closest(".multi-text-picker-dropdown")) {
      closeOpenMultiTextPickers();
    }
  }

  function closeDotPickersOnEscape(event) {
    if (event.key === "Escape") {
      closeOpenDotPickers();
      closeOpenSinglePickers();
      closeOpenMultiTextPickers();
    }
  }

  function closeOpenDotPickers(exceptDropdown = null) {
    document.querySelectorAll(".dot-picker-dropdown[open]").forEach((dropdown) => {
      if (dropdown !== exceptDropdown) {
        dropdown.removeAttribute("open");
      }
    });
  }

  function closeOpenSinglePickers(exceptDropdown = null) {
    document.querySelectorAll(".single-picker-dropdown[open]").forEach((dropdown) => {
      if (dropdown !== exceptDropdown) {
        dropdown.removeAttribute("open");
      }
    });
  }

  function closeOpenMultiTextPickers(exceptDropdown = null) {
    document.querySelectorAll(".multi-text-picker-dropdown[open]").forEach((dropdown) => {
      if (dropdown !== exceptDropdown) {
        dropdown.removeAttribute("open");
      }
    });
  }

  function createTextareaControl(id, name, value, valueType) {
    const textarea = document.createElement("textarea");
    textarea.id = id;
    textarea.name = name;
    textarea.rows = valueType === "json" ? 5 : 3;
    textarea.value = value;
    textarea.dataset.valueType = valueType;
    return textarea;
  }

  function saveSpeciesDetails(species, form) {
    DETAIL_FIELDS.forEach((fieldKey) => {
      const control = form.elements[fieldKey];
      if (!control) {
        return;
      }

      species[fieldKey] = readDetailControlValue(control, fieldKey);
    });

    renderAllSpeciesTable();
    updateResults();
    state.selectedSpeciesKey = getSpeciesKey(species);
    renderSpeciesDetails(species);
    downloadUpdatedSpeciesJson();
    renderCompactResults();
  }

  function readDetailControlValue(control, fieldKey) {
    const type = control.dataset.valueType;

    if (type === "toggles") {
      try {
        const value = control.value || control.querySelector?.('input[type="hidden"]')?.value || "[]";
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    if (type === "single-array") {
      return control.value ? [control.value] : [];
    }

    if (type === "array") {
      return Array.from(control.selectedOptions).map((option) => option.value);
    }

    if (type === "lines") {
      return control.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    }

    if (type === "json") {
      const text = control.value.trim();
      if (!text) {
        return [];
      }

      try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.error(`Ogiltig JSON i ${fieldKey}`, error);
        alert(`${getFieldLabel(fieldKey)} innehåller ogiltig JSON. Fältet sparades som tom lista.`);
        return [];
      }
    }

    return control.value.trim();
  }

  function downloadUpdatedSpeciesJson() {
    const data = JSON.stringify({ arter: state.species }, null, 2);
    const blob = new Blob([`${data}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "adelspindlingar.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function renderAllSpeciesTable() {
    elements.allSpeciesTable.replaceChildren();

    const table = document.createElement("table");
    table.className = "species-directory-table";

    const thead = document.createElement("thead");
    const groupRow = document.createElement("tr");
    const headerRow = document.createElement("tr");

    const blankGroup = document.createElement("th");
    blankGroup.colSpan = 3;
    blankGroup.className = "blank-group-heading";
    groupRow.append(blankGroup);

    const kohGroup = document.createElement("th");
    kohGroup.colSpan = 3;
    kohGroup.scope = "colgroup";
    kohGroup.className = "koh-group-heading";
    kohGroup.textContent = "KOH";
    groupRow.append(kohGroup);

    ALL_SPECIES_COLUMNS.forEach((column) => {
      const th = document.createElement("th");
      th.scope = "col";
      if (column.type === "values") {
        th.className = "center-heading";
      }
      if (state.allSpeciesSort.key === column.key) {
        th.setAttribute("aria-sort", state.allSpeciesSort.direction === "asc" ? "ascending" : "descending");
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "sort-button";
      button.textContent = column.label;
      button.setAttribute("aria-label", `Sortera på ${column.label}`);

      if (state.allSpeciesSort.key === column.key) {
        button.dataset.direction = state.allSpeciesSort.direction;
      }

      button.addEventListener("click", () => sortAllSpeciesBy(column.key));
      th.append(button);
      headerRow.append(th);
    });

    thead.append(groupRow, headerRow);

    const tbody = document.createElement("tbody");
    getSortedAllSpecies().forEach((species) => {
      const row = document.createElement("tr");
      row.className = "clickable-row";
      row.tabIndex = 0;
      row.addEventListener("click", () => selectSpecies(species));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectSpecies(species);
        }
      });

      appendCell(row, getSpeciesEpithet(species.vetenskapligt_namn), "scientific-cell");
      appendCell(row, species.svenskt_namn || "-");

      ["skivfarg_unga", "koh_hatt", "koh_fotknol", "koh_kott"].forEach((field) => {
        const td = document.createElement("td");
        td.className = "marker-cell";
        td.append(renderValueMarkers(species[field]));
        row.append(td);
      });

      tbody.append(row);
    });

    table.append(thead, tbody);
    elements.allSpeciesTable.append(table);
  }

  function sortAllSpeciesBy(key) {
    if (state.allSpeciesSort.key === key) {
      state.allSpeciesSort.direction = state.allSpeciesSort.direction === "asc" ? "desc" : "asc";
    } else {
      state.allSpeciesSort.key = key;
      state.allSpeciesSort.direction = "asc";
    }

    renderAllSpeciesTable();
  }

  function getSortedAllSpecies() {
    const direction = state.allSpeciesSort.direction === "asc" ? 1 : -1;
    const key = state.allSpeciesSort.key;

    return [...state.species].sort((a, b) => {
      return getSortValue(a, key).localeCompare(getSortValue(b, key), "sv") * direction;
    });
  }

  function getSortValue(species, key) {
    if (key === "vetenskapligt_namn") {
      return getSpeciesEpithet(species.vetenskapligt_namn);
    }

    if (Array.isArray(species[key])) {
      return species[key].join(" ");
    }

    return String(species[key] || "");
  }

  function renderValueMarkers(value) {
    const values = normalizeSpeciesValues(value);
    const wrapper = document.createElement("div");
    wrapper.className = "value-markers";

    if (values.length === 0) {
      const unknown = document.createElement("span");
      unknown.className = "unknown-marker";
      unknown.textContent = "?";
      unknown.title = "Uppgift saknas";
      wrapper.append(unknown);
      return wrapper;
    }

    values.forEach((item) => {
      const key = item.toLocaleLowerCase("sv");
      const marker = document.createElement("span");
      marker.className = getMarkerClassName(key);
      if (key === "?") {
        marker.textContent = "?";
      }
      marker.title = item;
      marker.setAttribute("aria-label", item);

      const color = getOptionColor(item);
      if (color) {
        marker.style.setProperty("--marker-color", color);
      }

      wrapper.append(marker);
    });

    return wrapper;
  }

  function getMarkerOptions(field) {
    if (field.options.length > 0) {
      return field.options;
    }

    if (field.key === "hattfarg" || field.key === "fotfarg") {
      return ["blå", "gul", "gråvit", "grön", "röd", "brun", "?"];
    }

    return Object.keys(OPTION_COLORS);
  }

  function appendImportantCharacters(species) {
    const characters = normalizeSpeciesValues(species.viktiga_karaktarer);

    const heading = document.createElement("h3");
    heading.textContent = "Viktiga karaktärer";

    const content = characters.length > 0 ? renderTextList(characters) : renderMissingText();

    elements.details.append(heading, content);
  }

  function appendLookalikes(species) {
    const heading = document.createElement("h3");
    heading.textContent = "Förväxlingsarter";

    if (!Array.isArray(species.forvaxlingsarter) || species.forvaxlingsarter.length === 0) {
      elements.details.append(heading, renderMissingText());
      return;
    }

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
    const heading = document.createElement("h3");
    heading.textContent = "Bilder";

    if (!Array.isArray(species.bilder) || species.bilder.length === 0) {
      elements.details.append(heading, renderMissingText());
      return;
    }

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
    } else {
      elements.details.append(heading, renderMissingText());
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

  function appendDetail(list, label, value, useMarkers = false) {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    const values = normalizeSpeciesValues(value);

    term.textContent = label;

    if (useMarkers) {
      description.append(renderValueMarkers(value));
    } else if (values.length > 0) {
      description.textContent = values.join(", ");
    } else {
      description.append(renderMissingText());
    }

    wrapper.append(term, description);
    list.append(wrapper);
  }

  function renderTextList(values) {
    const list = document.createElement("ul");
    list.className = "detail-list";
    values.forEach((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      list.append(item);
    });
    return list;
  }

  function renderMissingText() {
    const missing = document.createElement("span");
    missing.className = "detail-missing";
    missing.textContent = "? Uppgift saknas";
    return missing;
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

  function getSpeciesEpithet(name) {
    return formatScientificName(name).replace(/^Cortinarius\s+/i, "");
  }

  function formatList(value) {
    const values = normalizeSpeciesValues(value);
    return values.length > 0 ? values.join(", ") : "-";
  }

  function getDisplayName(species) {
    return capitalizeFirst(species.svenskt_namn) || formatScientificName(species.vetenskapligt_namn) || "Namnlös art";
  }

  function capitalizeFirst(value) {
    const text = String(value || "").trim();
    return text ? text.charAt(0).toLocaleUpperCase("sv") + text.slice(1) : "";
  }

  function getSpeciesKey(species) {
    return `${species.vetenskapligt_namn || ""}|${species.svenskt_namn || ""}`;
  }

  function getFieldLabel(fieldKey) {
    const field = state.fields.find((candidate) => candidate.key === fieldKey);
    return field ? field.label : FIELD_LABELS[fieldKey] || humanizeKey(fieldKey);
  }

  function getFieldDefinition(fieldKey) {
    return state.fieldDefinitions.find((field) => field.key === fieldKey) || null;
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
    return key === "gul" || key === "gråvit" || key === "ingen" || key === "?" ? "#1f2924" : "#ffffff";
  }

  function getMarkerClassName(key) {
    if (key === "ingen") {
      return "value-marker no-reaction-marker";
    }

    if (key === "?") {
      return "value-marker question-marker";
    }

    return "value-marker";
  }

  function getOptionHelpText(fieldKey, option) {
    return OPTION_HELP_TEXTS[fieldKey]?.[String(option).toLocaleLowerCase("sv")] || "";
  }
}());
