export const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;
const EMAIL_CHARACTERS = "abcdefghjkmnpqrstuvwxyz23456789";
const PASSWORD_UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const PASSWORD_DIGITS = "23456789";
const PASSWORD_CHARACTERS = `${PASSWORD_UPPERCASE}${PASSWORD_UPPERCASE.toLowerCase()}${PASSWORD_DIGITS}`;

type TrialAccess = {
  active: boolean;
  trialExpiresAt: Date | string | null;
};

function expirationTime(value: Date | string | null) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function randomIndex(maximum: number) {
  const limit = Math.floor(256 / maximum) * maximum;
  const bytes = new Uint8Array(1);
  do crypto.getRandomValues(bytes); while (bytes[0] >= limit);
  return bytes[0] % maximum;
}

function randomCharacters(alphabet: string, length: number) {
  return Array.from({ length }, () => alphabet[randomIndex(alphabet.length)]).join("");
}

export function createTrialEmail() {
  return `t${randomCharacters(EMAIL_CHARACTERS, 6)}@h.local`;
}

export function createTrialPassword() {
  const characters = [
    randomCharacters(PASSWORD_UPPERCASE, 1),
    randomCharacters(PASSWORD_DIGITS, 1),
    ...randomCharacters(PASSWORD_CHARACTERS, 6),
  ];
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    [characters[index], characters[target]] = [characters[target], characters[index]];
  }
  return characters.join("");
}

export function createTrialExpiration(start = new Date()) {
  return new Date(start.getTime() + TRIAL_DURATION_MS);
}

export function isTrialExpired(value: Date | string | null, now = new Date()) {
  const expiresAt = expirationTime(value);
  return expiresAt !== null && expiresAt <= now.getTime();
}

export function userHasAccess(user: TrialAccess, now = new Date()) {
  return user.active && !isTrialExpired(user.trialExpiresAt, now);
}
