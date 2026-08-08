// plotly.js-dist-min ships no types of its own; it's the same public API as
// plotly.js, just pre-bundled, so re-point TS at @types/plotly.js.
declare module "plotly.js-dist-min" {
  export * from "plotly.js";
  import * as Plotly from "plotly.js";
  export default Plotly;
}
