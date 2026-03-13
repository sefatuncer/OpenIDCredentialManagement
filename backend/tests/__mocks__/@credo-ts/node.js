module.exports = {
  agentDependencies: {
    FileSystem: class FileSystem {},
    EventEmitterClass: require('events').EventEmitter,
    fetch: global.fetch || (() => Promise.reject(new Error('fetch not available'))),
    WebSocketClass: class WebSocket {},
  },
}
