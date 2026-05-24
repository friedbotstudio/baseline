# Blocker: dev-tree runtime import (the v0.8.1 marker bug verbatim)

## Design

Step 5 record reconciliation:

```bash
node -e "import('./src/cli/reconciliation-marker.js').then(m => m.recordReconciliation('<target>', '<rel>', '<baseline_version_to>', '<incoming_sha256>'))"
```

Step 6 alternate via require:

```bash
node -e "const m = require('./src/cli/foo.js'); m.run();"
```

Step 7 bare invocation:

```sh
node ./scripts/build-manifest.mjs obj/template
```

## Contracts

(intentionally minimal; the bug is in the code fences above)
