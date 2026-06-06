#!/usr/bin/env node
require('node:child_process')
  .spawn(process.execPath, [require('node:path').join(__dirname, '..', 'dist', 'cli.js'), ...process.argv.slice(2)], { stdio: 'inherit' })
  .on('exit', (code) => process.exit(code ?? 0));
