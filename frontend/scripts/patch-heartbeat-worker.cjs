#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Path to the problematic HeartbeatWorker file
const heartbeatWorkerPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@coinbase',
  'wallet-sdk',
  'dist',
  'sign',
  'walletlink',
  'relay',
  'connection',
  'HeartbeatWorker.js'
);

// Fixed HeartbeatWorker content without the problematic export statement
const fixedContent = `// Fixed HeartbeatWorker for build compatibility
// This is a patched version that removes the problematic export statement

let heartbeatInterval;

function startHeartbeat() {
    // Send heartbeat every 30 seconds
    heartbeatInterval = setInterval(() => {
        const heartbeat = { type: 'heartbeat', timestamp: Date.now() };
        self.postMessage(heartbeat);
    }, 30000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    
    // Send confirmation that heartbeat stopped
    const response = { type: 'stopped' };
    self.postMessage(response);
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
    const { type } = event.data;
    
    switch (type) {
        case 'start':
            startHeartbeat();
            break;
        case 'stop':
            stopHeartbeat();
            break;
        default:
            console.warn('Unknown message type:', type);
    }
});

// Handle worker termination
self.addEventListener('beforeunload', () => {
    stopHeartbeat();
});

// Removed problematic export statement
`;

try {
    // Check if the file exists
    if (fs.existsSync(heartbeatWorkerPath)) {
        console.log('🔧 Patching HeartbeatWorker.js to fix ES6 module build error...');
        
        // Write the fixed content
        fs.writeFileSync(heartbeatWorkerPath, fixedContent, 'utf8');
        
        console.log('✅ HeartbeatWorker.js patched successfully!');
    } else {
        console.log('⚠️  HeartbeatWorker.js not found, skipping patch');
    }
} catch (error) {
    console.error('❌ Error patching HeartbeatWorker.js:', error.message);
    // Don't fail the build if patching fails
    process.exit(0);
} 