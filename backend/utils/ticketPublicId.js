const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function generateTicketPublicId() {
  let id = "";
  for (let index = 0; index < 16; index += 1) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return id;
}

module.exports = { generateTicketPublicId };
