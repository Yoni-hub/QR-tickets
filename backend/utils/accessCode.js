const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ORGANIZER_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*_-+=?";

function randomCode(length) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return value;
}

function randomCodeFromCharset(length, charset) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += charset[Math.floor(Math.random() * charset.length)];
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

async function generateOrganizerAccessCode(isAvailableFn) {
  for (let tries = 0; tries < 300; tries += 1) {
    const length = 12 + Math.floor(Math.random() * 5);
    const code = randomCodeFromCharset(length, ORGANIZER_CHARS);
    if (await isAvailableFn(code)) {
      return code;
    }
  }
  throw new Error("Unable to generate unique organizer access code.");
}

module.exports = { generateAccessCode, generateOrganizerAccessCode };
