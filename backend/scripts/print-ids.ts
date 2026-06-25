/* Print all hero ids (space-separated) for the bash driver. */
import { HEROES } from './heroes-data.js';
process.stdout.write(HEROES.map((h) => h.id).join(' '));
