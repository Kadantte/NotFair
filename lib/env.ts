export function getEnv(name: string): string | undefined {
  const value = process.env[name];
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

export function getRequiredEnv(name: string): string {
  const value = getEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
