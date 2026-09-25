import { z } from "zod";

// Zod v4 probes `new Function` for its JIT, which our CSP (no 'unsafe-eval') blocks and
// reports as a violation. Jitless mode avoids the probe entirely.
z.config({ jitless: true });

export { z };
