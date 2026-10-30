import type { HomeConfig } from "./config";

/**
 * PLACEHOLDER: example entity ids only. Replace with the real rooms/entities
 * (same shape) before connecting to Home Assistant.
 */
export const placeholderConfig: HomeConfig = {
  rooms: [
    {
      id: "tv_room",
      name: "TV Room",
      occupancySensors: ["binary_sensor.tv_room_motion"],
      lights: ["light.tv_room_lamp", "light.tv_room_ceiling"],
      fans: ["fan.tv_room_ceiling_fan"],
    },
    {
      id: "kitchen",
      name: "Kitchen",
      occupancySensors: ["binary_sensor.kitchen_motion"],
      lights: ["light.kitchen_main"],
      fans: [],
    },
    {
      id: "garage",
      name: "Garage",
      occupancySensors: ["binary_sensor.garage_motion"],
      lights: ["light.garage_overhead"],
      fans: ["fan.garage_exhaust"],
    },
  ],
  zones: {
    house: ["binary_sensor.house_person_detected"],
    yard: ["binary_sensor.front_yard_person_detected"],
    backyard: ["binary_sensor.backyard_person_detected"],
  },
  garage: { doorEntity: "cover.garage_door" },
  exteriorDoors: [
    { entity: "binary_sensor.front_door", name: "Front door" },
    { entity: "binary_sensor.back_door", name: "Back door" },
  ],
  importantDevices: [
    { entity: "lock.front_door", name: "Front door lock", batteryEntity: "sensor.front_door_lock_battery" },
    { entity: "binary_sensor.smoke_hallway", name: "Hallway smoke detector", batteryEntity: "sensor.smoke_hallway_battery" },
    { entity: "camera.driveway", name: "Driveway camera" },
  ],
};
