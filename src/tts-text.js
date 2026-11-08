const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function spellBelowHundred(value) {
  if (value < 10) return digits[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  if (tens === 1) return `mười${ones ? ` ${ones === 5 ? 'lăm' : digits[ones]}` : ''}`;
  const ending = ones ? (ones === 1 ? 'mốt' : ones === 4 ? 'tư' : ones === 5 ? 'lăm' : digits[ones]) : '';
  return `${digits[tens]} mươi${ending ? ` ${ending}` : ''}`;
}

function spellBelowThousand(value, hasHigherGroup = false) {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (!hundreds && hasHigherGroup) return `không trăm${rest < 10 ? ` lẻ ${digits[rest]}` : ` ${spellBelowHundred(rest)}`}`;
  if (!hundreds) return spellBelowHundred(rest);
  if (!rest) return `${digits[hundreds]} trăm`;
  return `${digits[hundreds]} trăm${rest < 10 ? ` lẻ ${digits[rest]}` : ` ${spellBelowHundred(rest)}`}`;
}

function spellVietnameseNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return String(value);
  if (number < 1000) return spellBelowThousand(number);

  const scales = ['', 'nghìn', 'triệu', 'tỷ'];
  const groups = [];
  let remaining = number;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  if (groups.length > scales.length) return spellDigits(String(number));

  const spoken = [];
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index];
    if (!group) continue;
    const hasHigherGroup = spoken.length > 0;
    spoken.push(`${spellBelowThousand(group, hasHigherGroup)}${scales[index] ? ` ${scales[index]}` : ''}`);
  }
  return spoken.join(' ');
}

function spellDigits(value) {
  return String(value).split('').map(digit => digits[Number(digit)]).join(' ');
}

function spellNumberIdentifier(value) {
  return String(value).replace(/\d+/g, spellDigits).replace(/\./g, ' chấm ').replace(/-/g, ' gạch ngang ').replace(/:/g, ' hai chấm ');
}

/** Convert numeric forms only for TTS. The original narration remains unchanged for captions. */
export function prepareVietnameseTtsText(text) {
  return String(text || '')
    // Brand pronunciation is only for speech; captions keep the official spelling.
    .replace(/\bLAM\s+AI\s+LAB\b/giu, 'lâm ây ai láp')
    // Standards are identifiers: read each digit (ISO 9001 → ISO chín không không một).
    .replace(/\b(ISO|IATF|IEC|TCVN|QCVN|ASTM|EN)\s*(\d+(?:[.-]\d+)*(?::\d+(?:[.-]\d+)*)?)/giu,
      (_, name, identifier) => `${name} ${spellNumberIdentifier(identifier)}`)
    // PLC/device addresses are also identifiers, not cardinal quantities (X0, Y0, Q0.0).
    .replace(/\b([A-Z]{1,5})(\d+(?:\.\d+)*)\b/g,
      (_, prefix, address) => `${prefix} ${spellNumberIdentifier(address)}`)
    // Clause numbers retain their conventional “chấm” reading.
    .replace(/((?:điều\s+khoản|khoản|mục|clause|section)\s*)(\d+(?:\.\d+)+)/giu,
      (_, prefix, reference) => prefix + reference.split('.').map(spellVietnameseNumber).join(' chấm '))
    // A comma between groups of three digits is a thousands separator.
    .replace(/\b\d{1,3}(?:,\d{3})+\b/g, value => spellVietnameseNumber(value.replace(/,/g, '')))
    // Common video ratios are spoken as ratios, rather than as clock times.
    .replace(/\b(16:9|9:16)\b/g, value => value === '16:9' ? 'mười sáu trên chín' : 'chín trên mười sáu')
    .replace(/\b(\d+)\s*%/g, (_, value) => `${spellVietnameseNumber(value)} phần trăm`)
    // Decimal comma and decimal point are both commonly used in Vietnamese material.
    .replace(/\b(\d+)[,.](\d+)\b/g,
      (_, whole, fraction) => `${spellVietnameseNumber(whole)} phẩy ${spellVietnameseNumber(fraction)}`)
    // Remaining whole numbers (e.g. “2 lần”).
    .replace(/\b\d+\b/g, value => spellVietnameseNumber(value));
}
