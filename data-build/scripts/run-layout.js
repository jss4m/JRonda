#!/usr/bin/env node
/**
 * Run map layout generator
 * node data-build/scripts/run-layout.js
 */
import { spawn } from 'child_process';
import { join } from 'path';

const layoutScript = join(process.cwd(), 'data-build/scripts/map-layout.js');

const child = spawn('node', [layoutScript], {
  stdio: 'inherit',
  cwd: process.cwd()
});

child.on('close', (code) => {
  if (code === 0) {
    console.log('Layout generation complete!');
    console.log('Next: Update src/core/layout-engine.js to use layouts');
  } else {
    console.error('Layout generation failed');
  }
  process.exit(code);
});

