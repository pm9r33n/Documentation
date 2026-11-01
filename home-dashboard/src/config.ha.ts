import type { HomeConfig } from "./config";

/**
 * Real Home Assistant entities (discovered read-only). Replace/extend as sensors are added.
 *
 * v1 scope decisions:
 * - TV Room, Kitchen, Bedroom, Hallway have no occupancy sensor: left out of auto-off. Household
 *   presence for them comes from the person.* trackers in `zones.house`.
 * - Dog room (basement) left out: its motion/person sensors are unavailable and dogs would hold
 *   "occupied" permanently. Its person-occupancy camera sensor still feeds house presence.
 * - Backyard: Ring Stick Up Cam motion, via packages/home_dashboard_signals.yaml (on for 5 min after each
 *   motion event; unavailable when Ring is offline, which counts as presence). Presence-only signal.
 * - No exterior door sensors exist: `exteriorDoors` empty keeps `door_open_late` inactive.
 */
export const haConfig: HomeConfig = {
  rooms: [
    {
      id: "loveshack",
      name: "Loveshack",
      occupancySensors: ["binary_sensor.loveshack_occupancy"],
      lights: ["light.carrie", "light.pops"],
      fans: [],
    },
    {
      id: "upstairs",
      name: "Upstairs",
      occupancySensors: ["binary_sensor.upstairs_occupancy"],
      lights: [],
      fans: [],
    },
    {
      id: "trevar_s_room",
      name: "Trevar's room",
      occupancySensors: ["binary_sensor.trevar_occupancy"],
      lights: [],
      fans: [],
    },
    {
      id: "garage",
      name: "Garage",
      occupancySensors: ["binary_sensor.akamatis_smart_device_1c921c_presence", "binary_sensor.ratgdov2_5i_e45c0a_motion"],
      lights: ["light.ratgdov2_5i_e45c0a_light"],
      fans: [],
    },
  ],
  zones: {
    house: [
      "person.paul_green",
      "person.carrie",
      "person.shaughn",
      "person.trevar",
      "binary_sensor.dogz_person_occupancy",
    ],
    yard: [
      "binary_sensor.porch_person_occupancy",
      "binary_sensor.reolink_doorbell_person_occupancy",
      "binary_sensor.doorbell_person",
    ],
    backyard: ["binary_sensor.backyard_ring_motion_recent"],
  },
  garage: { doorEntity: "cover.ratgdov2_5i_e45c0a_door" },
  exteriorDoors: [],
  importantDevices: [
    { entity: "cover.ratgdov2_5i_e45c0a_door", name: "Garage door opener" },
    { entity: "camera.reolink_doorbell", name: "Doorbell camera" },
    { entity: "camera.backyard_live_view", name: "Backyard camera", batteryEntity: "sensor.backyard_battery" },
    { entity: "camera.dogz", name: "Dog room camera" },
  ],
};
