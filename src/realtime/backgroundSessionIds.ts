/** Rust WebSocket still open while this file's editor is unmounted. */
export const persistedWsSessionIds = new Set<string>();

/** Rust Socket.IO client still open while editor is unmounted. */
export const persistedSioSessionIds = new Set<string>();

/** Rust MQTT client still open while editor is unmounted. */
export const persistedMqttSessionIds = new Set<string>();
