import { z } from "zod";

export const mobileSessionSchema = z.object({
  sessionKey: z.string().min(1),
  timezone: z.string().optional(),
  userId: z.number(),
});

export const webSessionSchema = z.object({
  cookies: z.string().min(1),
  userId: z.string().min(1),
});

export const authPropsSchema = z.object({
  cronometerMobileSession: mobileSessionSchema,
  cronometerUsername: z.string().min(1),
  cronometerWebSession: webSessionSchema,
});

export type AuthContext = z.infer<typeof authPropsSchema>;

/** Resolves the stored Cronometer session for the current request, or null when not connected. */
export type GetAuthContext = () => AuthContext | null;

export interface CronometerToolOptions {
  getAuthContext: GetAuthContext;
}
