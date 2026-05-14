# Plugin SDK

Feudal plugins are local, trusted manifests reviewed in Git. A plugin is a directory with `plugin.json` plus the entry module declared in that manifest.

## Minimal Worker Plugin

```ts
import {
  defineAcpWorkerExtension,
  definePluginManifest,
  definePluginPermission
} from "@feudal/contracts";

export default definePluginManifest({
  id: "local.code-review-bot",
  name: "Code Review Bot",
  version: "1.0.0",
  capabilities: ["code-review"],
  extensionPoints: [
    defineAcpWorkerExtension({
      type: "acp-worker",
      id: "local.code-review-bot.worker",
      workerName: "code-review-bot",
      displayName: "Code Review Bot",
      capabilities: ["code-review"],
      artifactName: "code-review.json"
    })
  ],
  entry: { module: "src/index.ts" },
  compatibility: {
    app: "feudal-coding-agents",
    minVersion: "1.0.0"
  },
  security: {
    permissions: [
      definePluginPermission({
        type: "filesystem",
        access: "read",
        target: "repository",
        justification: "Read source files before producing review findings"
      })
    ]
  }
});
```

## Security Controls

- Empty `security.permissions` is low risk.
- `process`, `secrets`, filesystem writes, and workflow admin permissions require explicit admin approval before enablement.
- The local marketplace endpoint reports compatibility and risk before a plugin is enabled.
- Remote install, dependency installation, and untrusted sandboxing are not part of this local SDK.

## Example Directory

See `plugins/examples/code-review-bot` for a discovery-compatible local example.
