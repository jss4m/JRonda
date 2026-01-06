export const busConfig = {
  mode: "bus",

  status: {
    renderable: true,
    routable: true
  },

  subtypes: {
    feeder: {
      routes: "feeder-routes.txt",
      stops: "feeder-stops.txt",
      routeLabelField: "route_long_name"
    },
    rapid: {
      routes: "rapidbus-routes.txt",
      stops: "rapidbus-stops.txt",
      routeLabelField: "route_short_name"
    }
  },

  stopIdentity: {
    strategy: "coordinateTolerance",
    toleranceMeters: 15,
    global: true
  },

  directionality: {
    bidirectional: false
  },

  proximityLinking: {
    enabled: true,
    targetModes: ["rail", "hoho", "gokl"],
    radiusMeters: 120,
    linkType: "transferEdge",
    flags: {
      isConnecting: true,
      isInterchange: false
    }
  },

  flags: {
    supports: ["isOKU", "isInterchange", "isConnecting", "isLoop"],
    source: "config"
  }
};
