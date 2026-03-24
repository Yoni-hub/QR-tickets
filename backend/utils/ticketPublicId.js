const { randomBytes } = require("crypto");

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CHARS_LEN = CHARS.length; // 62

function generateTicketPublicId() {
  let id = "";
  // Use rejection sampling to avoid modulo bias:
  // 256 / 62 = 4 full groups → reject bytes >= 248 (4 * 62)
  const REJECT_THRESHOLD = 256 - (256 % CHARS_LEN); // 248
  while (id.length < 16) {
    const buf = randomBytes(32);
    for (let i = 0; i < buf.length && id.length < 16; i++) {
      if (buf[i] < REJECT_THRESHOLD) {
        id += CHARS[buf[i] % CHARS_LEN];
      }
    }
  }
  return id;
}

module.exports = { generateTicketPublicId };
