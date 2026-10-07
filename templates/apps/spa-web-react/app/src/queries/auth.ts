import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { User } from "@/api/client";
import { ApiError, NETWORK_ERROR, unwrap } from "@/api/problem";

export const meKey = ["me"] as const;
export const providersKey = ["auth", "providers"] as const;

/** The signed-in user, or null when signed out (401). Anything else is an error. */
export async function fetchMe(): Promise<User | null> {
  let result;
  try {
    result = await api.GET("/v1/auth/me");
  } catch {
    throw new ApiError(NETWORK_ERROR);
  }
  if (result.response.status === 401) return null;
  if (!result.data) throw new ApiError("Couldn't check your session.", result.response.status);
  return result.data;
}

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: fetchMe, staleTime: Infinity });
}

/** Which sign-in methods the API has enabled; UIs render only those. */
export function useProviders() {
  return useQuery({
    queryKey: providersKey,
    queryFn: () => unwrap(() => api.GET("/v1/auth/providers"), "Couldn't load the sign-in options."),
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      unwrap(() => api.POST("/v1/auth/session", { body }), "Couldn't sign you in. Try again.", {
        401: "Email or password is incorrect. Check them and try again.",
      }),
    onSuccess: (user) => qc.setQueryData(meKey, user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string; name?: string }) =>
      unwrap(() => api.POST("/v1/auth/register", { body }), "Couldn't create your account. Try again.", {
        403: "Registration is closed. Ask an administrator for an account.",
      }),
    onSuccess: (user) => qc.setQueryData(meKey, user),
  });
}

export function useVerifyMagicLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      unwrap(() => api.POST("/v1/auth/magic-link/verify", { body: { token } }), "Couldn't sign you in with this link.", {
        401: "This sign-in link has expired or was already used.",
      }),
    onSuccess: (user) => qc.setQueryData(meKey, user),
  });
}

export function useRequestMagicLink() {
  return useMutation({
    mutationFn: (email: string) =>
      unwrap(() => api.POST("/v1/auth/magic-link", { body: { email, client: "web" } }), "Couldn't send the link. Try again."),
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(() => api.DELETE("/v1/auth/session"), "Couldn't sign you out. Try again."),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["notes"] });
      qc.setQueryData(meKey, null);
    },
  });
}
