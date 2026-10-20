
import * as THREE from
  "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const status = document.querySelector("#status");
const output = document.querySelector("#output");
const viewport = document.querySelector("#viewport");
const hierarchy = document.querySelector("#hierarchy");
const primDetails = document.querySelector("#prim-details");

async function main() {
  if (!status || !output || !viewport || !hierarchy || !primDetails) {
    throw new Error("Missing required viewer UI elements in index.html");
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202630);

  const camera = new THREE.PerspectiveCamera(
    45,
    Math.max(viewport.clientWidth, 1) /
      Math.max(viewport.clientHeight, 1),
    0.1,
    1000
  );

  // Preserve the established USD stage framing.
  const cameraTarget = new THREE.Vector3(5, 6, 7);
  camera.position.set(25, 20, 47);
  camera.lookAt(cameraTarget);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  viewport.replaceChildren(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.8));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2);
  keyLight.position.set(5, 8, 10);
  scene.add(keyLight);

  // ------------------------------------------------------------
  // Embedded default example: a real 3D cube, created in JavaScript.
  // It does not require a USD file or a network request.
  // ------------------------------------------------------------

  const embeddedCubeGeometry = new THREE.BoxGeometry(2, 2, 2);
  const embeddedCubeMaterial = new THREE.MeshStandardMaterial({
    color: 0x3388ee,
    roughness: 0.4,
    metalness: 0.1
  });

  const embeddedCube = new THREE.Mesh(
    embeddedCubeGeometry,
    embeddedCubeMaterial
  );

  embeddedCube.name = "Embedded JavaScript Cube";
  embeddedCube.position.copy(cameraTarget);
  scene.add(embeddedCube);

  const axes = new THREE.AxesHelper(3);
  axes.position.copy(cameraTarget);
  scene.add(axes);

  let runtime = null;
  let activeStagePath = null;
  let activeStageStart = 1;
  let activeStageEnd = 1;
  let stageObjects = [];
  let activePrims = [];
  let selectedPrimPath = null;
  let selectedMesh = null;
  let loadSequence = 0;

  function render() {
    renderer.render(scene, camera);
  }

  // ------------------------------------------------------------
  // UI: file picker and optional bundled USDZ sample.
  // File selection remains active after every load.
  // ------------------------------------------------------------

  const controls = document.createElement("div");
  controls.style.cssText =
    "display:flex;flex-wrap:wrap;align-items:center;gap:10px;" +
    "margin:8px 0;font:14px sans-serif;color:inherit;";

  const fileLabel = document.createElement("label");
  fileLabel.textContent = "Open USD file: ";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".usd,.usda,.usdc,.usdz";
  fileInput.setAttribute("aria-label", "Choose USD, USDA, USDC, or USDZ");

  const bundledButton = document.createElement("button");
  bundledButton.type = "button";
  bundledButton.textContent = "Load sample1.usdz";

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.textContent = "Show embedded cube";

  const fileHelp = document.createElement("span");
  fileHelp.textContent = "The embedded cube is available by default.";
  fileHelp.style.opacity = "0.75";

  fileLabel.appendChild(fileInput);
  controls.append(fileLabel, bundledButton, resetButton, fileHelp);
  status.parentElement.insertBefore(controls, status.nextSibling);

  // Timeline UI.
  const timeline = document.createElement("div");
  timeline.style.cssText =
    "display:flex;align-items:center;gap:12px;" +
    "margin:8px 0;font:14px sans-serif;color:inherit;";

  const timeLabel = document.createElement("label");
  timeLabel.textContent = "USD Time";
  timeLabel.htmlFor = "usd-time-slider";

  const timeSlider = document.createElement("input");
  timeSlider.id = "usd-time-slider";
  timeSlider.type = "range";
  timeSlider.min = "1";
  timeSlider.max = "1";
  timeSlider.step = "1";
  timeSlider.value = "1";
  timeSlider.style.cssText = "flex:1;min-width:120px;";

  const timeReadout = document.createElement("output");
  timeReadout.textContent = "Embedded cube";
  timeReadout.style.minWidth = "130px";

  timeline.append(timeLabel, timeSlider, timeReadout);
  controls.after(timeline);

  function setTimeline(start, end, isUsd) {
    activeStageStart = start;
    activeStageEnd = end;

    timeSlider.min = String(start);
    timeSlider.max = String(Math.max(start, end));
    timeSlider.value = String(start);
    timeSlider.disabled = !isUsd || start === end;

    timeReadout.textContent = isUsd
      ? `Time: ${start} / ${end}`
      : "Embedded cube";
  }

  function renderHierarchy(prims, stagePath = null) {
    hierarchy.replaceChildren();
    activePrims = Array.isArray(prims) ? prims : [];

    if (!activePrims.length) {
      const empty = document.createElement("div");
      empty.textContent = stagePath ? "No prim hierarchy was returned." : "/World/Cube (embedded example)";
      hierarchy.appendChild(empty);
      selectedPrimPath = null;
      selectedMesh = null;
      primDetails.textContent = stagePath
        ? "No prim details available."
        : JSON.stringify({ path: "/World/Cube", type: "Cube", source: "Embedded JavaScript example" }, null, 2);
      return;
    }

    for (const prim of activePrims) {
      const path = prim.path ?? prim.primPath ?? prim.name ?? String(prim);
      const type = prim.typeName ?? prim.type ?? prim.primType ?? "Prim";
      const row = document.createElement("button");
      row.type = "button";
      row.className = "prim-row";
      row.dataset.primPath = path;
      row.setAttribute("aria-pressed", "false");

      const pathLabel = document.createElement("span");
      pathLabel.textContent = path;
      const typeLabel = document.createElement("span");
      typeLabel.className = "prim-type";
      typeLabel.textContent = type;
      row.append(pathLabel, typeLabel);
      row.addEventListener("click", () => selectPrim(path, stagePath));
      hierarchy.appendChild(row);
    }

    selectedPrimPath = null;
    selectedMesh = null;
    primDetails.textContent = "Select a prim to inspect its attributes and highlight matching geometry.";
  }

  function selectPrim(path, stagePath) {
    selectedPrimPath = path;
    for (const row of hierarchy.querySelectorAll(".prim-row")) {
      row.setAttribute("aria-pressed", String(row.dataset.primPath === path));
    }

    selectedMesh = stageObjects.find(object => object.userData.usdPath === path) ?? null;
    for (const object of stageObjects) {
      const material = object.material;
      if (!material || Array.isArray(material)) continue;
      if (object.userData.baseColor === undefined) {
        object.userData.baseColor = material.color.getHex();
      }
      material.color.setHex(object === selectedMesh ? 0xffc857 : object.userData.baseColor);
      material.emissive?.setHex(object === selectedMesh ? 0x4a2b00 : 0x000000);
    }

    let attributes = null;
    try {
      if (stagePath && typeof runtime?.getPrimAttributes === "function") {
        attributes = runtime.getPrimAttributes(stagePath, path) ?? [];
      }
    } catch (error) {
      attributes = { inspectionError: error?.message ?? String(error) };
    }

    const prim = activePrims.find(item =>
      (item.path ?? item.primPath ?? item.name ?? String(item)) === path
    );
    primDetails.textContent = JSON.stringify({
      path,
      type: prim?.typeName ?? prim?.type ?? prim?.primType ?? "Unknown",
      renderedInViewport: Boolean(selectedMesh),
      attributes: attributes ?? "Attribute inspection is unavailable for this prim."
    }, null, 2);
    render();
  }

  function showEmbeddedCube() {
    for (const object of stageObjects) {
      scene.remove(object);
      object.geometry?.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    }

    stageObjects = [];
    renderHierarchy([], null);
    embeddedCube.visible = true;
    axes.visible = true;
    activeStagePath = null;

    setTimeline(1, 1, false);

    status.textContent = "Ready — embedded 3D cube.";
    output.textContent = JSON.stringify({
      example: "Embedded JavaScript cube",
      externalFilesRequired: false,
      controls: "Drag to orbit; wheel to zoom; right/middle drag to pan"
    }, null, 2);

    render();
  }

  // ------------------------------------------------------------
  // Camera interaction.
  // Left drag = orbit. Right/middle drag = pan. Wheel = zoom.
  // ------------------------------------------------------------

  const canvas = renderer.domElement;
  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";

  const drag = {
    pointerId: null,
    action: null,
    x: 0,
    y: 0
  };

  const offset = new THREE.Vector3();
  const spherical = new THREE.Spherical();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const pan = new THREE.Vector3();

  function renderCamera() {
    camera.lookAt(cameraTarget);
    camera.updateMatrixWorld();
    render();
  }

  function orbit(dx, dy) {
    offset.copy(camera.position).sub(cameraTarget);
    spherical.setFromVector3(offset);
    spherical.theta -= dx * 0.005;
    spherical.phi -= dy * 0.005;
    spherical.phi = THREE.MathUtils.clamp(
      spherical.phi,
      0.01,
      Math.PI - 0.01
    );
    spherical.makeSafe();

    offset.setFromSpherical(spherical);
    camera.position.copy(cameraTarget).add(offset);
    renderCamera();
  }

  function zoom(deltaY) {
    offset.copy(camera.position).sub(cameraTarget);
    const distance = THREE.MathUtils.clamp(
      offset.length() * Math.exp(deltaY * 0.001),
      0.1,
      10000
    );
    offset.setLength(distance);
    camera.position.copy(cameraTarget).add(offset);
    renderCamera();
  }

  function panCamera(dx, dy) {
    camera.updateMatrixWorld();

    const distance = camera.position.distanceTo(cameraTarget);
    const viewHeight =
      2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const scale = viewHeight / Math.max(canvas.clientHeight, 1);

    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

    pan.copy(right)
      .multiplyScalar(-dx * scale)
      .addScaledVector(up, dy * scale);

    camera.position.add(pan);
    cameraTarget.add(pan);
    renderCamera();
  }

  canvas.addEventListener("contextmenu", event => event.preventDefault());

  canvas.addEventListener("pointerdown", event => {
    if (event.button === 0) drag.action = "orbit";
    else if (event.button === 1 || event.button === 2) drag.action = "pan";
    else return;

    drag.pointerId = event.pointerId;
    drag.x = event.clientX;
    drag.y = event.clientY;
    canvas.style.cursor = drag.action === "orbit" ? "grabbing" : "move";

    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", event => {
    if (event.pointerId !== drag.pointerId || !drag.action) return;

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;

    if (drag.action === "orbit") orbit(dx, dy);
    else panCamera(dx, dy);

    event.preventDefault();
  });

  function endDrag(event) {
    if (event.pointerId !== drag.pointerId) return;

    drag.pointerId = null;
    drag.action = null;
    canvas.style.cursor = "grab";

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    zoom(event.deltaY);
  }, { passive: false });

  function resize() {
    const width = Math.max(viewport.clientWidth, 1);
    const height = Math.max(viewport.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(viewport);

  // The cube appears immediately, even before WASM has initialized.
  showEmbeddedCube();

  // ------------------------------------------------------------
  // Initialize the existing OpenUSD WASM wrapper.
  // ------------------------------------------------------------

  status.textContent = "Initializing OpenUSD runtime…";

  try {
    runtime = await window.UsdWebViewBindings.createRuntime({
      locateFile: path =>
        new URL(
          `./usd-webview-bindings/${path}`,
          import.meta.url
        ).href
    });

    await runtime.ready;
    status.textContent = "Ready — embedded cube. Choose a USD file to load.";
  } catch (error) {
    status.textContent =
      "Embedded cube ready; OpenUSD runtime failed to initialize.";
    output.textContent = error?.stack || String(error);
    console.error(error);
    return;
  }

  // ------------------------------------------------------------
  // Reusable USD stage loader.
  // A new selection invokes this function every time.
  // ------------------------------------------------------------

  async function loadUsdFile(file, isBundled = false) {
    const thisLoad = ++loadSequence;
    const extension = isBundled
      ? "usdz"
      : file.name.split(".").pop().toLowerCase();

    if (!["usd", "usda", "usdc", "usdz"].includes(extension)) {
      status.textContent = "Unsupported file type.";
      return;
    }

    let stagePath = `/viewer-stage-${thisLoad}.${extension}`;

    try {
      status.textContent = `Reading ${isBundled ? "sample1.usdz" : file.name}…`;

      let bytes;

      if (isBundled) {
        const response = await fetch("./assets/sample1.usdz");

        if (!response.ok) {
          throw new Error(
            `Failed to load bundled sample: HTTP ${response.status}`
          );
        }

        bytes = new Uint8Array(await response.arrayBuffer());
      } else {
        bytes = new Uint8Array(await file.arrayBuffer());
      }

      if (thisLoad !== loadSequence) return;

      let usdaText = null;

      if (extension === "usda") {
        usdaText = new TextDecoder("utf-8")
          .decode(bytes)
          .replace(/^\uFEFF/, "")
          .trimStart();

        if (!usdaText.startsWith("#usda 1.0")) {
          throw new Error("The selected USDA file has an invalid header.");
        }
      }

      status.textContent = `Opening ${isBundled ? "sample1.usdz" : file.name}…`;

      // USDA is text. USDC/USDZ remain binary.
      runtime.createDataFile(
        stagePath,
        usdaText !== null ? usdaText : bytes
      );

      const opened = runtime.openStage(stagePath, true);

      if (opened === false) {
        throw new Error(`The wrapper could not open ${stagePath}`);
      }

      const prims = runtime.getSceneGraph(stagePath) ?? [];

      const driver = runtime.createStageDriver(stagePath);

      if (!driver) {
        throw new Error("Could not create the USD stage driver.");
      }

      const drawResult = runtime.stageDriverDraw(stagePath, true);
      const meshes = drawResult?.meshes ?? [];

      if (thisLoad !== loadSequence) return;

      if (meshes.length === 0) {
        throw new Error(
          "The stage opened, but the renderer returned no meshes."
        );
      }

      const newObjects = [];

      for (const data of meshes) {
        if (!data.positions || data.positions.length < 9) {
          console.warn("Skipping mesh without usable positions:", data.path);
          continue;
        }

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(data.positions, 3)
        );

        if (data.normals?.length === data.positions.length) {
          geometry.setAttribute(
            "normal",
            new THREE.BufferAttribute(data.normals, 3)
          );
        } else {
          geometry.computeVertexNormals();
        }

        const material = new THREE.MeshStandardMaterial({
          color: 0x8eb9e8,
          roughness: 0.55,
          metalness: 0.05,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = data.name ?? data.path ?? "USD Mesh";
        mesh.userData.usdPath = data.path ?? null;
        mesh.userData.baseColor = mesh.material.color.getHex();

        if (Array.isArray(data.matrix) && data.matrix.length === 16) {
          mesh.matrix.fromArray(data.matrix);
          mesh.matrixAutoUpdate = false;
        }

        newObjects.push(mesh);
      }

      if (newObjects.length === 0) {
        throw new Error("No renderable mesh geometry was found in the stage.");
      }

      if (thisLoad !== loadSequence) {
        for (const object of newObjects) {
          object.geometry.dispose();
          object.material.dispose();
        }
        return;
      }

      // Replace the displayed stage only after the new stage renders.
      for (const object of stageObjects) {
        scene.remove(object);
        object.geometry?.dispose();
        object.material?.dispose();
      }

      stageObjects = newObjects;
      for (const object of stageObjects) scene.add(object);
      renderHierarchy(prims, stagePath);

      embeddedCube.visible = false;
      axes.visible = false;
      activeStagePath = stagePath;

      // Parse timeline metadata only when the selected file is USDA text.
      const startMatch = usdaText?.match(
        /\bstartTimeCode\s*=\s*(-?\d+(?:\.\d+)?)/
      );
      const endMatch = usdaText?.match(
        /\bendTimeCode\s*=\s*(-?\d+(?:\.\d+)?)/
      );

      const start = startMatch ? Number(startMatch[1]) : 1;
      const end = endMatch ? Number(endMatch[1]) : 1;
      const validRange =
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        end >= start;

      setTimeline(
        validRange ? start : 1,
        validRange ? end : 1,
        true
      );

      status.textContent =
        `Loaded ${isBundled ? "sample1.usdz" : file.name} — ` +
        `${prims.length} prims, ${stageObjects.length} mesh(es)`;

      output.textContent = JSON.stringify({
        source: isBundled ? "./assets/sample1.usdz" : file.name,
        stagePath,
        primCount: prims.length,
        meshCount: stageObjects.length,
        timeline: {
          start: validRange ? start : 1,
          end: validRange ? end : 1,
          note: usdaText
            ? "Parsed from USDA metadata when present"
            : "Binary stage: default single-frame range"
        },
        meshes: meshes.map(mesh => ({
          path: mesh.path,
          name: mesh.name,
          vertexCount: mesh.positions?.length / 3,
          hasMatrix: mesh.matrix?.length === 16
        }))
      }, null, 2);

      render();

      console.log("Loaded USD stage:", {
        stagePath,
        primCount: prims.length,
        meshes
      });
    } catch (error) {
      // Keep the current scene visible if a new file fails to load.
      if (thisLoad === loadSequence) {
        status.textContent =
          `Could not load ${isBundled ? "sample1.usdz" : file.name}.`;
        output.textContent = error?.stack || String(error);
      }

      console.error("USD stage loading failed:", error);
    }
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    await loadUsdFile(file, false);

    // Let the user select the same file again if needed.
    fileInput.value = "";
  });

  bundledButton.addEventListener("click", async () => {
    await loadUsdFile(null, true);
  });

  resetButton.addEventListener("click", showEmbeddedCube);

  timeSlider.addEventListener("input", () => {
    const timeCode = Number(timeSlider.value);

    if (!activeStagePath) return;

    try {
      runtime.stageDriverSetTime(activeStagePath, timeCode);

      const result = runtime.stageDriverDraw(activeStagePath, true);
      const meshes = result?.meshes ?? [];

      for (const data of meshes) {
        const object = stageObjects.find(
          item => item.userData.usdPath === data.path
        );

        if (!object) continue;

        if (Array.isArray(data.matrix) && data.matrix.length === 16) {
          object.matrixAutoUpdate = false;
          object.matrix.fromArray(data.matrix);
          object.matrixWorldNeedsUpdate = true;
        }
      }

      timeReadout.textContent =
        `Time: ${timeCode} / ${activeStageEnd}`;

      render();
    } catch (error) {
      console.error("Could not update USD time:", error);
    }
  });

  resize();
}

main().catch(error => {
  console.error(error);
  if (status) status.textContent = "Viewer initialization failed.";
  if (output) output.textContent = error?.stack || String(error);
});
