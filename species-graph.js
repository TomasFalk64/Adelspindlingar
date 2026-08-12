(function () {
  const GRAPH_PATH = "data/Artgraf_Uppland_50m.json";
  const DEFAULT_MIN_WEIGHT = 1;
  const MAX_VISIBLE_SPECIES = 10;
  const GRAPH_CONTEXT = "Uppland - arter sedda inom 50m";

  let graphPromise = null;
  let activeNetwork = null;

  window.SpeciesGraph = {
    open
  };

  async function open(species) {
    const speciesName = getSpeciesName(species);
    const overlay = createModal(speciesName);
    document.body.append(overlay.root);
    overlay.closeButton.focus();

    if (!speciesName) {
      setStatus(overlay, "Ingen art är vald.");
      return;
    }

    setStatus(overlay, "Laddar grafdata...");

    try {
      const graph = await loadGraph();
      renderGraphModal(overlay, graph, speciesName);
    } catch (error) {
      console.error(error);
      setStatus(overlay, "Grafdata kunde inte laddas.");
    }
  }

  function createModal(speciesName) {
    const root = document.createElement("div");
    root.className = "modal-overlay species-graph-overlay";

    const modal = document.createElement("div");
    modal.className = "species-graph-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Nätverksgraf");

    const header = document.createElement("div");
    header.className = "species-graph-head";

    const titleWrap = document.createElement("div");
    const titleLine = document.createElement("div");
    titleLine.className = "species-graph-title-line";
    const title = document.createElement("h3");
    title.textContent = "Nätverksgraf";
    const context = document.createElement("p");
    context.className = "species-graph-context";
    context.textContent = GRAPH_CONTEXT;
    titleLine.append(title, context);
    const subtitle = document.createElement("p");
    subtitle.className = "species-graph-species-name";
    subtitle.textContent = speciesName || "Ingen art vald";
    titleWrap.append(titleLine, subtitle);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "species-graph-close";
    closeButton.textContent = "x";
    closeButton.setAttribute("aria-label", "Stäng");
    closeButton.title = "Stäng";

    header.append(titleWrap, closeButton);

    const controls = document.createElement("label");
    controls.className = "species-graph-control";

    const controlText = document.createElement("span");
    controlText.textContent = "Minsta kantvikt";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "1";
    slider.value = String(DEFAULT_MIN_WEIGHT);
    slider.step = "1";

    const value = document.createElement("span");
    value.className = "species-graph-weight";
    value.textContent = String(DEFAULT_MIN_WEIGHT);

    controls.append(controlText, slider, value);

    const status = document.createElement("p");
    status.className = "species-graph-status";
    status.setAttribute("aria-live", "polite");

    const canvas = document.createElement("div");
    canvas.className = "species-graph-canvas";

    modal.append(header, controls, status, canvas);
    root.append(modal);

    function close() {
      if (activeNetwork) {
        activeNetwork.destroy();
        activeNetwork = null;
      }
      document.removeEventListener("keydown", onKeydown);
      root.remove();
    }

    function onKeydown(event) {
      if (event.key === "Escape") {
        close();
      }
    }

    closeButton.addEventListener("click", close);
    root.addEventListener("click", (event) => {
      if (event.target === root) {
        close();
      }
    });
    document.addEventListener("keydown", onKeydown);

    return { root, modal, closeButton, slider, value, status, canvas };
  }

  async function loadGraph() {
    if (!graphPromise) {
      graphPromise = fetch(GRAPH_PATH).then((response) => {
        if (!response.ok) {
          throw new Error(`Kunde inte ladda ${GRAPH_PATH}: ${response.status}`);
        }
        return response.json();
      });
    }

    return graphPromise;
  }

  function renderGraphModal(overlay, graph, speciesName) {
    if (!graph || typeof graph !== "object" || Array.isArray(graph) || Object.keys(graph).length === 0) {
      setStatus(overlay, "Grafen är tom.");
      return;
    }

    const speciesKey = findGraphKey(graph, speciesName);
    if (!speciesKey) {
      setStatus(overlay, `${speciesName} saknas i grafen.`);
      return;
    }

    const weights = collectWeights(graph[speciesKey]);
    if (weights.length === 0) {
      setStatus(overlay, `${speciesKey} har inga gemensamma arter i grafen.`);
      return;
    }

    const maxWeight = Math.max(...weights);
    const initialWeight = getMinWeightForMaxSpecies(weights);
    overlay.slider.min = String(DEFAULT_MIN_WEIGHT);
    overlay.slider.max = String(maxWeight);
    overlay.slider.value = String(initialWeight);
    overlay.value.textContent = overlay.slider.value;

    const render = () => {
      const minWeight = Number(overlay.slider.value);
      overlay.value.textContent = String(minWeight);
      drawNetwork(overlay, graph, speciesKey, minWeight);
    };

    overlay.slider.addEventListener("input", render);
    render();
  }

  function drawNetwork(overlay, graph, speciesKey, minWeight) {
    if (!window.vis?.DataSet || !window.vis?.Network) {
      setStatus(overlay, "vis-network kunde inte laddas.");
      return;
    }

    const centerEdges = getNeighbors(graph[speciesKey])
      .filter((edge) => edge.weight >= minWeight)
      .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name, "sv"));
    if (centerEdges.length === 0) {
      setStatus(overlay, "Inga gemensamma arter vid vald kantvikt.");
      clearNetwork(overlay);
      return;
    }

    const nodeNames = new Set([speciesKey]);
    centerEdges.forEach((edge) => nodeNames.add(edge.name));

    const nodes = Array.from(nodeNames).map((name) => ({
      id: name,
      label: name,
      shape: "dot",
      size: name === speciesKey ? 24 : 12 + Math.min(18, getTotalWeight(graph[name]) / 180),
      color: name === speciesKey
        ? { background: "#476f56", border: "#31513e" }
        : { background: "#dceee2", border: "#8cac92" },
      font: {
        color: "#1f2924",
        face: "Segoe UI"
      }
    }));

    const edgeMap = new Map();
    centerEdges.forEach((edge) => addEdge(edgeMap, speciesKey, edge.name, edge.weight));

    Array.from(nodeNames).forEach((fromName) => {
      getNeighbors(graph[fromName]).forEach((edge) => {
        if (nodeNames.has(edge.name) && edge.weight >= minWeight) {
          addEdge(edgeMap, fromName, edge.name, edge.weight);
        }
      });
    });

    const edges = Array.from(edgeMap.values()).map((edge) => ({
      from: edge.from,
      to: edge.to,
      label: String(edge.weight),
      value: edge.weight,
      width: 1 + Math.min(8, edge.weight / 180),
      color: { color: "#8a8060", highlight: "#476f56" },
      font: {
        align: "middle",
        color: "#667269",
        size: 11
      }
    }));

    setStatus(overlay, `${nodes.length} arter och ${edges.length} kanter visas.`);
    clearNetwork(overlay);

    activeNetwork = new window.vis.Network(overlay.canvas, {
      nodes: new window.vis.DataSet(nodes),
      edges: new window.vis.DataSet(edges)
    }, {
      autoResize: true,
      interaction: {
        hover: true,
        multiselect: true
      },
      physics: {
        stabilization: true,
        barnesHut: {
          gravitationalConstant: -5200,
          springLength: 140,
          springConstant: 0.045
        }
      },
      edges: {
        smooth: {
          type: "continuous"
        }
      }
    });
  }

  function clearNetwork(overlay) {
    if (activeNetwork) {
      activeNetwork.destroy();
      activeNetwork = null;
    }
    overlay.canvas.replaceChildren();
  }

  function setStatus(overlay, message) {
    overlay.status.textContent = message;
  }

  function findGraphKey(graph, speciesName) {
    const wanted = normalizeName(speciesName);
    return Object.keys(graph).find((name) => normalizeName(name) === wanted) || "";
  }

  function getNeighbors(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [];
    }

    return Object.entries(value)
      .map(([name, edge]) => ({
        name,
        weight: Number(edge?.weight)
      }))
      .filter((edge) => edge.name && Number.isFinite(edge.weight));
  }

  function collectWeights(value) {
    return getNeighbors(value).map((edge) => edge.weight);
  }

  function getMinWeightForMaxSpecies(weights) {
    const maxNeighbors = MAX_VISIBLE_SPECIES - 1;
    if (weights.length <= maxNeighbors) {
      return Math.min(DEFAULT_MIN_WEIGHT, Math.max(...weights));
    }

    const uniqueWeights = Array.from(new Set(weights)).sort((a, b) => a - b);
    const threshold = uniqueWeights.find((weight) => weights.filter((candidate) => candidate >= weight).length <= maxNeighbors);
    return threshold || Math.max(...weights);
  }

  function addEdge(edgeMap, from, to, weight) {
    if (from === to) {
      return;
    }

    const ids = [from, to].sort((a, b) => a.localeCompare(b, "sv"));
    const key = ids.join("\u0000");
    const existing = edgeMap.get(key);
    if (!existing || weight > existing.weight) {
      edgeMap.set(key, { from: ids[0], to: ids[1], weight });
    }
  }

  function getTotalWeight(value) {
    return collectWeights(value).reduce((sum, weight) => sum + weight, 0);
  }

  function getSpeciesName(species) {
    return String(species?.svenskt_namn || species?.vetenskapligt_namn || "").trim();
  }

  function normalizeName(value) {
    return String(value || "").trim().toLocaleLowerCase("sv");
  }
})();
