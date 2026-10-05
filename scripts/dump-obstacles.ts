// Prints the prop obstacle circles as JSON (used by scripts/walk-test.mjs).
import { CONCOURSE_OBSTACLES, SHED_OBSTACLES } from '../src/obstacles';
console.log(JSON.stringify([...CONCOURSE_OBSTACLES, ...SHED_OBSTACLES]));
