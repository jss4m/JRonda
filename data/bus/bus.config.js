export const BUS_MODES = {
  RAPID: {
    source: "GTFS",
    scheduling: "SCHEDULED",
    routable: true
  },
  FEEDER: {
    source: "GTFS",
    scheduling: "SCHEDULED",
    routable: true
  },
  GOKL: {
    source: "CANONICAL",
    scheduling: "FREQUENCY",
    routable: true,
    isFree: true
  },
  TOURIST: {
    source: "CANONICAL",
    scheduling: "FIXED_LOOP",
    routable: false
  }
};
