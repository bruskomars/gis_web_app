require([
  "esri/config",
  "esri/Map",
  "esri/views/MapView",
  "esri/WebMap",
  "esri/widgets/Legend",
  "esri/widgets/LayerList",
  "esri/Graphic",
  "esri/layers/GraphicsLayer",
  "esri/widgets/FeatureTable",
  "esri/layers/FeatureLayer",
], (
  esriConfig,
  Map,
  MapView,
  WebMap,
  Legend,
  LayerList,
  Graphic,
  GraphicsLayer,
  FeatureTable,
  FeatureLayer,
) => {
  esriConfig.apiKey = "USER YOUR API KEY";

  const map = new WebMap({
    portalItem: {
      id: "391a540d56b64375a0f76d4778d1880a",
    },
  });

  const view = new MapView({
    container: "viewDiv",
    map: map,
    center: [121.894019, 14.359301], // Longitude, Latitude
    zoom: 5, // Zoom level
  });

  const legend = new Legend({
    view: view,
  });
  view.ui.add(legend, {
    position: "bottom-right",
  });

  const featureLayer = new FeatureLayer({
    url: "https://services3.arcgis.com/PDfv0I40sqpcaZxV/arcgis/rest/services/PHL_ADM2_PSA_NAMRIA_updated_diss3_pop/FeatureServer",
  });
  map.add(featureLayer);

  const featureTable = new FeatureTable({
    view: view,
    layer: featureLayer,
    container: "tableDiv",
  });

  const layerList = new LayerList({
    view: view,
  });
  view.ui.add(layerList, {
    position: "top-right",
  });

  // layer dropdown list
  view.ui.add(document.getElementById("layerListDropdown"), "top-left");

  view.when(() => {
    const select = document.getElementById("layerName");
    map.layers.forEach((layer) => {
      let option = document.createElement("option");
      option.textContent = layer.title;
      option.value = layer.id;
      select.appendChild(option);
    });

    select.addEventListener("change", (e) => {
      const selectedId = e.target.value;
      const selectedLayer = map.layers.find((l) => l.id === selectedId);

      if (selectedLayer) {
        console.log(`Switch to ${selectedLayer}`);
        featureTable.layer = selectedLayer;

        selectedLayer.when(() => {
          populateFieldDropdown(selectedLayer);
        });
      } else {
        console.warn("No layer found for id:", selectedId);
      }
    });
  });

  // query records
  view.ui.add(document.getElementById("queryDiv"), "top-left");
  $("#queryBtn").on("click", queryRecords);

  //get latlong when clicking on the map
  view.on("pointer-move", (e) => {
    const point = view.toMap({ x: event.x, y: event.y });
    if (point) {
      $("#mapCoords").html(
        `Latitude: ${point.latitude.toFixed(6)} Longitude: ${point.longitude.toFixed(6)}`,
      );
    }
  });

  // populate dropdown for field search
  featureLayer.when(() => {
    populateFieldDropdown(featureLayer);
  });

  // Export handlers
  document.getElementById("exportCSV").addEventListener("click", () => {
    featureTable.layer.queryFeatures().then((result) => {
      const csv = featuresToCSV(result.features);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "results.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  document.getElementById("exportGeoJSON").addEventListener("click", () => {
    featureTable.layer.queryFeatures().then((result) => {
      const geojson = featuresToGeoJSON(result.features);
      const blob = new Blob([JSON.stringify(geojson)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "results.geojson";
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  function queryRecords() {
    map.when(() => {
      const input = $("#searchInput").val();

      // get all feature layer
      const layers = map.layers.filter((layer) => layer.type === "feature");

      layers.forEach((layer) => {
        let query = layer.createQuery();

        query.where = `NAME='${input}'`;
        query.outFields = ["*"];
        query.returnGeometry = true;

        layer
          .queryFeatures(query)
          .then((result) => {
            layer.visible = true;

            if (result.features.length > 0) {
              const gLayer = new GraphicsLayer({
                title: `Query Result: ${input}`,
              });

              result.features.forEach((f) => {
                const graphic = new Graphic({
                  geometry: f.geometry,
                  attributes: f.attributes,
                  symbol: {
                    type: "simple-fill", // adjust depending on geometry type
                    color: [255, 0, 0, 0.2],
                    outline: {
                      color: [255, 0, 0],
                      width: 2,
                    },
                  },
                });
                gLayer.add(graphic);
              });
              map.add(gLayer);
              view.goTo(result.features.map((f) => f.geometry));
            } else {
              layer.visible = false;
              // alert("No records found with the query");
            }
          })
          .catch((error) => {
            layer.visible = false;
          });
      });
    });
  }

  function populateFieldDropdown(layer) {
    view.when(() => {
      const fields = layer.fields;
      const selectFieldSearch = document.getElementById("fieldSearch");
      selectFieldSearch.innerHTML = "";

      fields.forEach((f) => {
        // console.log(f.name);
        let option = document.createElement("option");
        option.textContent = f.alias;
        option.value = f.name;
        selectFieldSearch.appendChild(option);
      });

      $("#filterTableBtn").off("click").on("click", filterTable);
    });
  }

  function filterTable() {
    const queryField = $("#fieldSearch").val().trim();

    const queryVal = $("#valueSearch").val().trim();
    const safeVal = queryVal.replace(/'/g, "''");

    const field = featureTable.layer.fields.find((f) => f.name === queryField);

    let sql;

    if (queryField && queryVal) {
      if (field.type === "string") {
        sql = `${queryField} LIKE '%${safeVal}%'`;
      } else {
        sql = `${queryField} = ${queryVal}`;
      }
      featureTable.layer.definitionExpression = sql;
      featureTable.refresh();
    } else {
      // Clear filter if inputs are empty
      featureTable.layer.definitionExpression = null;
      featureTable.refresh();
    }
  }

  // Utility: convert features to CSV
  function featuresToCSV(features) {
    if (!features.length) return "";

    const fields = Object.keys(features[0].attributes);
    const header = fields.join(",");
    const rows = features.map((f) =>
      fields.map((field) => `"${f.attributes[field]}"`).join(","),
    );

    return [header, ...rows].join("\n");
  }

  // Utility: convert features to GeoJSON
  function featuresToGeoJSON(features) {
    return {
      type: "FeatureCollection",
      features: features.map((f) => ({
        type: "Feature",
        geometry: f.geometry.toJSON(),
        properties: f.attributes,
      })),
    };
  }

  //
});
