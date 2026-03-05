const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomCode(length) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return value;
}

async function generateAccessCode(isAvailableFn) {
  for (let tries = 0; tries < 200; tries += 1) {
    const code = randomCode(6);
    if (await isAvailableFn(code)) {
      return code;
    }
  }
  throw new Error("Unable to generate unique access code.");
}

module.exports = { generateAccessCode };
