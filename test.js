
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

const sampleUsd = `#usda 1.0
(
    defaultPrim = "World"
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "World"
{
    def Cube "Cube"
    {
        double size = 2
        color3f[] primvars:displayColor = [(0.2, 0.6, 0.9)]

        double3 xformOp:translate = (3, 2, 1)
        uniform token[] xformOpOrder = ["xformOp:translate"]

    }
}

def Mesh "TransformProbe"
{
    point3f[] points = [
        (-1, 0, 0),
        (1, 0, 0),
        (0, 1, 0)
    ]
    int[] faceVertexCounts = [3]
    int[] faceVertexIndices = [0, 1, 2]

    double3 xformOp:translate = (3, 2, 1)
    uniform token[] xformOpOrder = ["xformOp:translate"]
}

`;

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
    status.textContent = "1/3 — Initializing OpenUSD WASM…";

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

    console.log("ExtractStageEnvironment export:", typeof module.ExtractStageEnvironment);
    console.log("Module exports matching Environment:",
      Object.keys(module).filter(k => k.toLowerCase().includes("environment"))
    );


    status.textContent = "2/3 — Opening test stage…";

    const stagePath = "/smoke-test.usda";
    const bytes = new TextEncoder().encode(sampleUsd);

    runtime.createDataFile(stagePath, bytes);

    const opened = runtime.openStage(stagePath, true);

    if (opened === false) {
      throw new Error("OpenUSD reported that the stage failed to open.");
    }

    status.textContent = "3/3 — Reading parsed scene graph…";

    const graph = runtime.getSceneGraph(stagePath);


    const result = runtime.getPrimAttributes(
      stagePath,
      "/World/Cube"
    );

    // output.textContent =
    //   "=== CUBE ATTRIBUTES ===\n" +
    //   JSON.stringify(result, null, 2);

    // status.textContent = "Attribute test completed.";


    const transforms = runtime.extractTransformsAtTime(stagePath, 0);

    console.log("Transforms:", transforms);
    console.log("Return type:", typeof transforms);

    output.textContent =
      "=== CUBE ATTRIBUTES ===\n" +
      JSON.stringify(result, null, 2) + "\n" +


      "=== TRANSFORMS AT TIME 0 ===\n" +
      (transforms === undefined
        ? "Returned undefined"
        : JSON.stringify(transforms, null, 2));

    status.textContent = "Transform and Attribute test completed.";



    // const relationships = runtime.inspectPrimRelationships(
    //   stagePath,
    //   "/World/Cube"
    // );

    // console.log("Relationships:", relationships);
    // console.log("Return type:", typeof relationships);

    // output.textContent =
    //   "=== CUBE RELATIONSHIPS ===\n" +
    //   (relationships === undefined
    //     ? "Returned undefined"
    //     : JSON.stringify(relationships, null, 2));

    // status.textContent = "Relationship test completed.";


    

    // const rawEnvironment = module.ExtractStageEnvironment(stagePath);

    // console.log("Raw return:", rawEnvironment);
    // console.log("Return type:", typeof rawEnvironment);
    // console.log("Is undefined:", rawEnvironment === undefined);
    // console.log("Is null:", rawEnvironment === null);


    // const stageEnvironment = runtime.extractStageEnvironment(stagePath);

    // output.textContent = [
    //   "=== STAGE ENVIRONMENT ===",
    //   print(stageEnvironment)
    // ].join("\n");

    // status.textContent = "SUCCESS — Stage environment returned.";

    // console.log({ stageEnvironment });



    // const worldAttributes = runtime.getPrimAttributes(
    //   stagePath,
    //   "/World"
    // );

    // output.textContent = [
    //   "=== WORLD ATTRIBUTES ===",
    //   print(worldAttributes)
    // ].join("\n");

    // status.textContent = "SUCCESS — World attributes returned.";

    // console.log({ worldAttributes });



    // status.textContent = "Inspecting USD prim attributes…";

    // const cubeAttributes = runtime.getPrimAttributes(stagePath, "/World/Cube");

    // const worldAttributes = runtime.getPrimAttributes(stagePath, "/World");

    // const stageEnvironment = runtime.extractStageEnvironment(stagePath);

    // const cubeRelationships = runtime.inspectPrimRelationships(stagePath, "/World/Cube");

    // output.textContent = [
    //   "=== SCENE GRAPH ===",
    //   print(graph),
    //   "",
    //   "=== CUBE ATTRIBUTES ===",
    //   print(cubeAttributes),
    //   "",
    //   "=== WORLD ATTRIBUTES ===",
    //   print(worldAttributes),
    //   "",
    //   "=== STAGE ENVIRONMENT ===",
    //   print(stageEnvironment),
    //   "",
    //   "=== CUBE RELATIONSHIPS ===",
    //   print(cubeRelationships)
    // ].join("\n");

    // status.textContent =
    //   "SUCCESS — Stage and prim inspection completed.";

    // console.log({
    //   graph,
    //   cubeAttributes,
    //   worldAttributes,
    //   stageEnvironment,
    //   cubeRelationships
    // });

/******/

  //   output.textContent =
  //     "openStage() result:\n" + print(opened) +
  //     "\n\ngetSceneGraph() result:\n" + print(graph);

  //   status.textContent =
  //     "SUCCESS — Runtime initialized and stage inspection returned.";
  } catch (error) {
    status.textContent = "FAILED — See error details below.";
    output.textContent =
      `${error?.stack || error}\n\n` +
      "Open browser DevTools (F12) and check the Console and Network tabs.";
    console.error(error);
  }
}

main();
