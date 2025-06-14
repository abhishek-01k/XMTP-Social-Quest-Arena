// Fixed HeartbeatWorker for build compatibility
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