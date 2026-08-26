import { z } from "zod";
import { authenticateCronometer } from "./cronometer.js";
import { authenticateCronometerMobile } from "./mobile.js";

export const mobileSessionSchema = z.object({
  sessionKey: z.string().min(1),
  timezone: z.string().optional(),
  userId: z.number(),
});

export const webSessionSchema = z.object({
  cookies: z.string().min(1),
  userId: z.string().min(1),
});

export const authContextSchema = z.object({
  cronometerMobileSession: mobileSessionSchema,
  cronometerUsername: z.string().min(1),
  cronometerWebSession: webSessionSchema,
});

export type AuthContext = z.infer<typeof authContextSchema>;

export async function authenticateCronometerSessions(
  username: string,
  password: string,
  userCode = "",
): Promise<AuthContext> {
  const [webSession, mobileSession] = await Promise.all([
    authenticateCronometer(username, password, userCode),
    authenticateCronometerMobile(username, password, userCode),
  ]);

  return authContextSchema.parse({
    cronometerMobileSession: mobileSession,
    cronometerUsername: username,
    cronometerWebSession: webSession,
  });
}
