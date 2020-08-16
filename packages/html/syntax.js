/* © 2020 Robert Grimm */

const ESCAPES = {
  '"': '&#x22;',
  '&': '&amp;',
  "'": '&#x27;',
  '/': '&#x2f;',
  '<': '&lt;',
  '=': '&#x3d;',
  '>': '&gt;',
  '`': '&#x60;',
};

// https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html#rule-1-html-encode-before-inserting-untrusted-data-into-html-element-content
// recommends escaping slash, even though it is not strictly necessary.

const ESCAPE_TEXT = /[&<>]/gu;

export const escapeText = text =>
  String(text).replace(ESCAPE_TEXT, c => ESCAPES[c]);
