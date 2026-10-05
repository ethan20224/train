// Prints every prop obstacle circle (with its optional level) as JSON (used by scripts/walk-test.mjs).
import { CONCOURSE_OBSTACLES, FOOTBRIDGE_OBSTACLES, HOTEL_OBSTACLES, SHED_OBSTACLES } from '../src/obstacles';
console.log(JSON.stringify([...CONCOURSE_OBSTACLES, ...SHED_OBSTACLES, ...HOTEL_OBSTACLES, ...FOOTBRIDGE_OBSTACLES]));
