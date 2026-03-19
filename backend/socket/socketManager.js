// Singleton socket.io instance — import this anywhere to emit without circular deps
let _io = null;

function init(io) {
  _io = io;
}

function getIo() {
  return _io;
}

module.exports = { init, getIo };
