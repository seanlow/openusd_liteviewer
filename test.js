
import * as THREE from
  "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const status = document.querySelector("#status");
const output = document.querySelector("#output");
const viewport = document.querySelector("#viewport");

async function main() {
  try {
    if (!viewport || !status || !output) {
      throw new Error(
        "Required HTML elements missing: #viewport, #status, or #output."
      );
    }

    status.textContent = "Initializing OpenUSD WASM…";

    const runtime =
      await window.UsdWebViewBindings.createRuntime({
        locateFile: path =>
          new URL(
            `./usd-webview-bindings/${path}`,
            import.meta.url
          ).href
      });

    await runtime.ready;

    // Load the USD fixture.
    const fixtureUrl = "./assets/feature-test.usda";
    const stagePath = "/feature-test.usda";

    status.textContent = "Loading feature-test.usda…";

    const response = await fetch(`${fixtureUrl}?v=${Date.now()}`);

    if (!response.ok) {
      throw new Error(
        `Failed to load ${fixtureUrl}: HTTP ${response.status}`
      );
    }

    const fixtureText = (await response.text())
      .replace(/^\uFEFF/, "")
      .trimStart();

    if (!fixtureText.startsWith("#usda 1.0")) {
      throw new Error(
        "Fetched asset does not start with #usda 1.0"
      );
    }

    console.log("FIXTURE URL:", response.url);
    console.log(
      "FIXTURE CONTENT TYPE:",
      response.headers.get("content-type")
    );
    console.log("FIXTURE LENGTH:", fixtureText.length);
    console.log(
      "FIXTURE HEADER:",
      JSON.stringify(fixtureText.slice(0, 160))
    );

    // Use the wrapper's supported VFS method.
    runtime.createDataFile(stagePath, fixtureText);

    const opened = runtime.openStage(stagePath, true);

    if (opened === false) {
      throw new Error(`Failed to open stage: ${stagePath}`);
    }

    const prims = runtime.getSceneGraph(stagePath);
    console.log("V4 STAGE PRIMS", prims);

    // Initialize the rendering scene.
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202630);

    const camera = new THREE.PerspectiveCamera(
      45,
      Math.max(viewport.clientWidth, 1) /
        Math.max(viewport.clientHeight, 1),
      0.01,
      10000
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true
    });

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, 2)
    );

    viewport.replaceChildren(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.8));

    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(5, 8, 10);
    scene.add(light);

    const previewMaterial = new THREE.MeshStandardMaterial({
      color: 0x3399dd,
      roughness: 0.65,
      metalness: 0,
      side: THREE.DoubleSide
    });

    // Create the OpenUSD stage driver.
    const driverCreated = runtime.createStageDriver(stagePath);

    if (!driverCreated) {
      throw new Error("Could not create the v4 stage driver.");
    }

    const drawResult = runtime.stageDriverDraw(
      stagePath,
      true
    );

    const meshes = drawResult?.meshes ?? [];

    console.log("V4 DRAW RESULT", drawResult);

    if (meshes.length === 0) {
      throw new Error(
        "The v4 stage driver returned zero meshes."
      );
    }

    // Store the actual Three.js objects created below.
    const renderedObjects = [];

    function updateUsdTime(timeCode) {
      runtime.stageDriverSetTime(stagePath, timeCode);

      const result = runtime.stageDriverDraw(
        stagePath,
        true
      );

      const usdMeshes = result?.meshes ?? [];

      for (const usdMesh of usdMeshes) {
        const threeMesh = renderedObjects.find(
          object => object.userData.usdPath === usdMesh.path
        );

        if (!threeMesh) {
          continue;
        }

        if (
          Array.isArray(usdMesh.matrix) &&
          usdMesh.matrix.length === 16
        ) {
          threeMesh.matrixAutoUpdate = false;
          threeMesh.matrix.fromArray(usdMesh.matrix);
          threeMesh.matrixWorldNeedsUpdate = true;
        }
      }

      renderer.render(scene, camera);

      const animated = usdMeshes.find(
        mesh => mesh.path === "/World/AnimatedTriangle"
      );

      console.log("Displayed USD time:", timeCode, {
        translation: animated?.matrix?.slice(12, 15) ?? null
      });
    }

    // Convert the USD mesh payloads into Three.js meshes.
    for (const data of meshes) {
      if (!data.positions || data.positions.length < 9) {
        console.warn(
          "Skipping mesh with no usable positions:",
          data.path
        );
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

      const object = new THREE.Mesh(
        geometry,
        previewMaterial
      );

      object.name = data.name ?? data.path;
      object.userData.usdPath = data.path;
      object.userData.materialPath =
        data.materialPath ?? null;

      if (data.matrix?.length === 16) {
        object.matrix.fromArray(data.matrix);
        object.matrixAutoUpdate = false;
      }

      scene.add(object);
      renderedObjects.push(object);
    }

    if (renderedObjects.length === 0) {
      throw new Error("No usable mesh objects were created.");
    }

   
    // Keep the camera fixed around the full animation range.
    // The fixture's translation moves from (1, 2, 3)
    // at frame 1 to (9, 10, 11) at frame 24.
    const center = new THREE.Vector3(5, 6, 7);
    const distance = 40;

    camera.position.set(
      center.x + distance * 0.5,
      center.y + distance * 0.35,
      center.z + distance
    );

    camera.near = 0.1;
    camera.far = 1000;
    camera.lookAt(center);
    camera.updateProjectionMatrix();


    // Add a timeline slider for the fixture's time range.
    const timeline = document.createElement("div");
    timeline.id = "usd-timeline";
    timeline.style.cssText =
      "display:flex;align-items:center;gap:12px;" +
      "margin:8px 0;font:14px sans-serif;color:inherit;";

    const timeLabel = document.createElement("label");
    timeLabel.htmlFor = "usd-time-slider";
    timeLabel.textContent = "USD Time";

    const timeSlider = document.createElement("input");
    timeSlider.id = "usd-time-slider";
    timeSlider.type = "range";
    timeSlider.min = "1";
    timeSlider.max = "24";
    timeSlider.step = "1";
    timeSlider.value = "1";
    timeSlider.style.cssText = "flex:1;min-width:120px;";

    const timeReadout = document.createElement("output");
    timeReadout.id = "usd-time-readout";
    timeReadout.textContent = "Time: 1 / 24";
    timeReadout.style.minWidth = "100px";

    timeline.append(
      timeLabel,
      timeSlider,
      timeReadout
    );

    viewport.parentElement.insertBefore(
      timeline,
      viewport
    );

    timeSlider.addEventListener("input", () => {
      const timeCode = Number(timeSlider.value);

      timeReadout.textContent =
        `Time: ${timeCode} / 24`;

      updateUsdTime(timeCode);
    });

    // Keep the renderer fitted to the viewport.
    function resizeViewport() {
      const width = Math.max(viewport.clientWidth, 1);
      const height = Math.max(viewport.clientHeight, 1);

      renderer.setSize(width, height, false);

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);
    }

    const resizeObserver = new ResizeObserver(
      resizeViewport
    );

    resizeObserver.observe(viewport);

    resizeViewport();

    // Initialize the displayed USD time after meshes exist.
    updateUsdTime(1);

    output.textContent = JSON.stringify(
      {
        fixture: fixtureUrl,
        stagePath,
        primCount: prims.length,
        driverCreated,
        meshCount: meshes.length,
        renderedObjectCount: renderedObjects.length,
        meshes: meshes.map(mesh => ({
          path: mesh.path,
          name: mesh.name,
          vertexCount: mesh.positions?.length / 3,
          normalCount: mesh.normals?.length / 3,
          hasMatrix: mesh.matrix?.length === 16,
          materialPath: mesh.materialPath ?? null
        }))
      },
      null,
      2
    );

    status.textContent =
      `V4 stage rendered — ${prims.length} prims, ` +
      `${renderedObjects.length} mesh(es)`;

    console.log(
      "V4 RENDER SUMMARY",
      output.textContent
    );
  } catch (error) {
    status.textContent =
      "FAILED — See error details below.";

    output.textContent =
      error?.stack || String(error);

    console.error(error);
  }
}

main();
