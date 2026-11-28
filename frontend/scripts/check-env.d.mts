export function checkEnv(env: Record<string, string | undefined>): {
  errors: string[];
  warnings: string[];
  summary: string;
};
