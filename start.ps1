$ErrorActionPreference = "Stop"

$bundledNode = "C:\Users\jenni\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = if (Test-Path $bundledNode) { $bundledNode } else { "node" }

& $node server/index.js
