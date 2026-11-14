import { ConfigError, loadEnv } from "../config/env.js";
import { closeDb, connectDb } from "../db/connect.js";
import { createMongoUserRepository } from "../modules/users/users.mongo.js";
import { ROLES } from "../modules/users/users.types.js";
import type { Role } from "../modules/users/users.types.js";

/**
 * Bootstraps the first staff member. Staff cannot create themselves from the website on purpose.
 *
 *   npm run admin:grant -- person@example.rw              make this existing account an admin
 *   npm run admin:grant -- person@example.rw editor       give another role (learner|intern|supervisor|support|editor|admin)
 *
 * The person registers and verifies their email first. They must then set up two-step verification
 * at their next sign-in, so a stolen password alone never reaches the console.
 * Run it from a trusted machine with MONGODB_URI set; it is a human tool, not part of the service.
 */
/* eslint-disable no-console */
async function main(): Promise<void> {
  const [email, roleArg = "admin"] = process.argv.slice(2);
  if (email === undefined) throw new Error("Usage: npm run admin:grant -- <email> [role]");
  const role = ROLES.find((r) => r === roleArg);
  if (role === undefined)
    throw new Error(`Unknown role "${roleArg}". Use one of: ${ROLES.join(", ")}`);

  const env = loadEnv();
  if (env.MONGODB_URI === undefined) throw new ConfigError(["MONGODB_URI is required"]);
  await connectDb(env.MONGODB_URI);
  try {
    const users = createMongoUserRepository();
    const user = await users.findByEmail(email.trim().toLowerCase());
    if (user === null) throw new Error("No account with that email. Ask them to register first.");
    if (user.emailVerifiedAt === undefined)
      throw new Error("That account has not verified its email yet.");
    const roles: Role[] = [...new Set<Role>([...user.roles, role])];
    await users.setRoles(user.id, roles);
    console.log(`${user.email} now has roles: ${roles.join(", ")}`);
    console.log("They will be asked to set up two-step verification at their next sign-in.");
  } finally {
    await closeDb();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
