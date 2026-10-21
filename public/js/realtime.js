/* A single shared Socket.IO connection for every dashboard page. */
let socket = null;
const listeners = new Map();
const REALTIME_EVENTS = [
  'connected',
  'fleet:summary',
  'fleet:tick',
  'fleet:positions',
  'shipment:created',
  'shipment:updated',
  'alert:new',
  'alert:updated',
  'alerts:bulk-updated',
  'notification:new',
  'driver:update',
];

function dispatch(event, payload) {
  for (const handler of listeners.get(event) || []) {
    try {
      handler(payload);
    } catch (error) {
      console.error(`[fleettrack] Realtime handler failed for ${event}`, error);
    }
  }
  window.dispatchEvent(new CustomEvent(`fleettrack:${event}`, { detail: payload }));
}

export function connectRealtime() {
  if (socket) return socket;
  if (!window.io) {
    console.warn('[fleettrack] Socket.IO client is unavailable.');
    return null;
  }

  socket = window.io({
    path: '/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    timeout: 12000,
  });

  for (const event of REALTIME_EVENTS) {
    socket.on(event, (payload) => dispatch(event, payload));
  }

  socket.on('connect_error', (error) => {
    dispatch('connection:error', { message: error?.message || 'Realtime connection unavailable' });
  });

  socket.on('disconnect', (reason) => {
    dispatch('connection:state', { state: 'disconnected', reason });
  });

  socket.on('connect', () => {
    dispatch('connection:state', { state: 'connected' });
  });

  return socket;
}

export function onRealtime(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

export function offRealtime(event, handler) {
  listeners.get(event)?.delete(handler);
}

export function getRealtimeSocket() {
  return connectRealtime();
}

export function isRealtimeConnected() {
  return Boolean(socket?.connected);
}
