import type { GrandLineSaga, GrandLineArc } from "./types.js";

import { EAST_BLUE_SAGA, EAST_BLUE_ARCS } from "./sagas/east-blue.js";
import { ALABASTA_SAGA, ALABASTA_ARCS } from "./sagas/alabasta.js";
import { SKY_ISLAND_SAGA, SKY_ISLAND_ARCS } from "./sagas/sky-island.js";
import { WATER_SEVEN_SAGA, WATER_SEVEN_ARCS } from "./sagas/water-seven.js";
import { THRILLER_BARK_SAGA, THRILLER_BARK_ARCS } from "./sagas/thriller-bark.js";
import { SUMMIT_WAR_SAGA, SUMMIT_WAR_ARCS } from "./sagas/summit-war.js";
import { FISHMAN_ISLAND_SAGA, FISHMAN_ISLAND_ARCS } from "./sagas/fishman-island.js";
import { DRESSROSA_SAGA, DRESSROSA_ARCS } from "./sagas/dressrosa.js";
import { FOUR_EMPERORS_SAGA, FOUR_EMPERORS_ARCS } from "./sagas/four-emperors.js";
import { WANO_SAGA, WANO_ARCS } from "./sagas/wano.js";
import { FINAL_SAGA_SAGA, FINAL_SAGA_ARCS } from "./sagas/final-saga.js";

export const SAGAS: GrandLineSaga[] = [
  EAST_BLUE_SAGA,
  ALABASTA_SAGA,
  SKY_ISLAND_SAGA,
  WATER_SEVEN_SAGA,
  THRILLER_BARK_SAGA,
  SUMMIT_WAR_SAGA,
  FISHMAN_ISLAND_SAGA,
  DRESSROSA_SAGA,
  FOUR_EMPERORS_SAGA,
  WANO_SAGA,
  FINAL_SAGA_SAGA,
];

export const ARCS: GrandLineArc[] = [
  ...EAST_BLUE_ARCS,
  ...ALABASTA_ARCS,
  ...SKY_ISLAND_ARCS,
  ...WATER_SEVEN_ARCS,
  ...THRILLER_BARK_ARCS,
  ...SUMMIT_WAR_ARCS,
  ...FISHMAN_ISLAND_ARCS,
  ...DRESSROSA_ARCS,
  ...FOUR_EMPERORS_ARCS,
  ...WANO_ARCS,
  ...FINAL_SAGA_ARCS,
];
