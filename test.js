
const status = document.querySelector("#status");
const output = document.querySelector("#output");


window.addEventListener("error", (event) => {
  status.textContent = "JavaScript error";
  output.textContent =
    event.message + "\n" +
    (event.filename || "") + ":" + event.lineno;
});

window.addEventListener("unhandledrejection", (event) => {
  status.textContent = "Initialization promise rejected";
  output.textContent = String(
    event.reason?.stack || event.reason
  );
});


function print(value) {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function main() {
  try {
    status.textContent = "Initializing OpenUSD WASM…";

    const runtime =
      await window.UsdWebViewBindings.createRuntime({
        locateFile: (path) =>
          new URL(
            `./usd-webview-bindings/${path}`,
            import.meta.url
          ).href
      });

    await runtime.ready;

    const module = window.__USD_WEBVIEW_MODULE__;
      
    const response = await fetch(
      "./assets/feature-test.usda?v=2"
    );

    if (!response.ok) {
      throw new Error(`Asset fetch failed: HTTP ${response.status}`);
    }

    
    const sourceText = (await response.text()).replace(/^\uFEFF/, "").trimStart();

    console.log("First line:", sourceText.split(/\r?\n/, 1)[0]);
    console.log("Starts with #usda:", sourceText.startsWith("#usda 1.0"));

    if (!sourceText.startsWith("#usda 1.0")) {
      throw new Error("Fetched asset does not start with #usda 1.0");
    }

    const featureBytes = new TextEncoder().encode(sourceText);   
    const usdpath = "/feature-test.usda";
    runtime.createDataFile(usdpath, featureBytes);

    function test(name, fn) {
      try {
        console.log(name, fn());
      } catch (e) {
        console.log(name, "ERROR:", e.message);
      }
    }

    function attrs(path) {
      return runtime.getPrimAttributes(usdpath, path).map(a => ({
        name: a.name,
        authored: a.isAuthored,
        value: a.value
      })).filter(a => a.authored || a.name.startsWith("inputs:"));
    }

    test("STAGE", () => {
      const s = runtime.openStage(usdpath);
      return s && {
        prims: s.primCount,
        meshes: s.meshPrimCount,
        start: s.startTimeCode,
        end: s.endTimeCode,
        fps: s.timeCodesPerSecond
      };
    });

    for (const t of [1, 12, 24]) {
      test(`TRANSFORM t=${t}`, () =>
        runtime.extractTransformsAtTime(usdpath, t).map(x => ({
          path: x.path,
          translation: [x.matrix[12], x.matrix[13], x.matrix[14]]
        }))
      );
    }

    test("LIGHT INPUTS", () =>
      attrs("/World/ModernLight").filter(a =>
        ["inputs:color", "inputs:intensity", "inputs:exposure",
        "color", "intensity"].includes(a.name)
      )
    );

    test("LIGHT EXTRACTION", () =>
      runtime.extractStageLights(usdpath, 12).map(l => ({
        path: l.path,
        color: l.color,
        intensity: l.intensity,
        exposure: l.exposure
      }))
    );

    test("ENVIRONMENT", () => {
      const result = runtime.extractStageEnvironment(usdpath);
      return result ?? "undefined";
    });

    test("SHADER INPUTS", () =>
      attrs("/World/Looks/TestMaterial/PreviewSurface")
    );

    test("MATERIAL EXTRACTION", () =>
      runtime.extractMaterialPayloads(usdpath).map(m => ({
        path: m.path,
        roughness: m.roughness,
        metallic: m.metallic,
        opacity: m.opacity
      }))
    );

    output.textContent =
      "=== MATERIAL ATTRIBUTES ===\n" +
      (runtime === undefined
        ? "Returned undefined"
        : JSON.stringify(runtime.getPrimAttributes(usdpath, "/World/Looks/TestMaterial", null, 2)) + "\n");

    output.textContent +=
      "=== SHADER RELATIONSHIPS ===\n" +
      (runtime === undefined
        ? "Returned undefined"
        : JSON.stringify(runtime.getPrimAttributes(usdpath, "/World/Looks/TestMaterial/PreviewSurface", null, 2)));

    console.log(
    "MATERIAL ATTRIBUTES",
    runtime.getPrimAttributes(
      usdpath,
      "/World/Looks/TestMaterial"
    )
    );

    console.log(
    "SHADER ATTRIBUTES",
    runtime.getPrimAttributes(
      usdpath,
      "/World/Looks/TestMaterial/PreviewSurface"
    )
    );

  } catch (error) {
    status.textContent = "FAILED — See error details below.";
    output.textContent =
      `${error?.stack || error}\n\n` +
      "Open browser DevTools (F12) and check the Console and Network tabs.";
    console.error(error);
  }
}

main();
