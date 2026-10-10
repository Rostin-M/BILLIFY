"use client";

/**
 * ÚNICA FUENTE DE DATOS del panel de plataforma: hooks sobre el router tRPC
 * `platform`. Las pantallas (`_screens`) solo conocen estos hooks y sus formas
 * (`QueryState`, `ListState`, `ActionState`); los componentes de `_components`
 * reciben todo por props con los tipos de `~/lib/platform/contract`.
 *
 * - Listas: paginación por cursor ("cargar más") con useInfiniteQuery.
 * - Acciones: al terminar bien invalidan todo el router `platform` (resumen,
 *   listas, detalle, pagos y bitácora cambian juntos con cada acción).
 * - Sesión: si el servidor responde UNAUTHORIZED (sesión vencida o revocada),
 *   se cierra la sesión local y se va al login con `?expired=1`.
 */

import { useCallback, useEffect } from "react";

import {
  type ExtendTrialInput,
  type GrantPlanInput,
  type GrantResult,
  type ListAuditInput,
  type ListBusinessesInput,
  type ListPaymentsInput,
  type Page,
  type PlatformAuditRow,
  type PlatformBusinessDetail,
  type PlatformBusinessRow,
  type PlatformOverview,
  type PlatformPaymentRow,
  type ResolvePaymentReviewInput,
  type RevokeGrantInput,
} from "~/lib/platform/contract";
import { signOutAndClear } from "~/lib/clientSignOut";
import { firstErrorMessage } from "~/lib/parseZodError";
import { api } from "~/trpc/react";

export type QueryState<T> = {
  data: T | undefined;
  /** Primera carga (aún no hay datos que mostrar). */
  isPending: boolean;
  error: string | null;
  refetch: () => void;
};

export type ListState<T> = {
  items: T[];
  /** Primera página cargando. */
  isPending: boolean;
  error: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  refetch: () => void;
};

export type ActionState<I, O> = {
  /** Ejecuta la acción; rechaza con un Error de mensaje legible si falla. */
  run: (input: I) => Promise<O>;
  isPending: boolean;
};

/* ── Errores y sesión ── */

/** Forma mínima de un error de tRPC en el cliente. */
type ClientError = { message: string; data?: { code?: string } | null };

const SESSION_EXPIRED_URL = "/auth/login?expired=1";
let leavingForLogin = false;

/** Cierra la sesión local y va al login avisando que venció. Solo actúa una vez. */
export function leaveExpiredSession(): void {
  if (leavingForLogin) return;
  leavingForLogin = true;
  void signOutAndClear(SESSION_EXPIRED_URL);
}

function isUnauthorized(error: ClientError | null | undefined): boolean {
  return error?.data?.code === "UNAUTHORIZED";
}

function messageOf(error: ClientError): string {
  if (isUnauthorized(error)) return "Tu sesión venció. Vuelve a iniciar sesión.";
  if (error.data?.code === "TOO_MANY_REQUESTS") return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  return firstErrorMessage(error.message);
}

/** Errores que reintentar no arregla: sesión, permisos, entrada inválida, no existe. */
const FINAL_CODES = new Set(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST", "CONFLICT", "TOO_MANY_REQUESTS"]);

function retry(failureCount: number, error: ClientError): boolean {
  if (error.data?.code && FINAL_CODES.has(error.data.code)) return false;
  return failureCount < 2;
}

function useSessionGuard(error: ClientError | null): void {
  const unauthorized = isUnauthorized(error);
  useEffect(() => {
    if (unauthorized) leaveExpiredSession();
  }, [unauthorized]);
}

/* ── Adaptadores de React Query a las formas del panel ── */

type QueryLike<T> = {
  data: T | undefined;
  isPending: boolean;
  error: ClientError | null;
  refetch: () => unknown;
};

function useQueryState<T>(query: QueryLike<T>): QueryState<T> {
  useSessionGuard(query.error);
  const { refetch } = query;
  return {
    data: query.data,
    isPending: query.isPending,
    // Si falla una recarga en segundo plano se siguen mostrando los datos que ya había.
    error: query.error && query.data === undefined ? messageOf(query.error) : null,
    refetch: useCallback(() => void refetch(), [refetch]),
  };
}

type InfiniteLike<T> = {
  data: { pages: Page<T>[] } | undefined;
  isPending: boolean;
  error: ClientError | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  refetch: () => unknown;
};

function useListState<T>(query: InfiniteLike<T>, enabled = true): ListState<T> {
  useSessionGuard(query.error);
  const { fetchNextPage, refetch } = query;
  return {
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
    // Una consulta deshabilitada queda "pending" para React Query, pero no está cargando.
    isPending: enabled && query.isPending,
    error: query.error ? messageOf(query.error) : null,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: useCallback(() => void fetchNextPage(), [fetchNextPage]),
    refetch: useCallback(() => void refetch(), [refetch]),
  };
}

const nextCursor = <T,>(page: Page<T>) => page.nextCursor ?? undefined;

type MutationLike<I, O> = { mutateAsync: (input: I) => Promise<O>; isPending: boolean };

function useActionState<I, O>(mutation: MutationLike<I, O>): ActionState<I, O> {
  const { mutateAsync } = mutation;
  const run = useCallback(
    async (input: I) => {
      try {
        return await mutateAsync(input);
      } catch (error) {
        const clientError = error as ClientError;
        if (isUnauthorized(clientError)) leaveExpiredSession();
        throw new Error(messageOf(clientError));
      }
    },
    [mutateAsync],
  );
  return { run, isPending: mutation.isPending };
}

/** Tras una acción cambian a la vez el resumen, las listas, el detalle, los pagos y la bitácora. */
function useInvalidatePlatform(): () => Promise<void> {
  const utils = api.useUtils();
  return useCallback(() => utils.platform.invalidate(), [utils]);
}

/* ── Consultas ── */

export function useOverview(): QueryState<PlatformOverview> {
  return useQueryState<PlatformOverview>(api.platform.overview.useQuery(undefined, { retry }));
}

export function useBusinesses(
  input: Omit<ListBusinessesInput, "cursor">,
  options: { enabled?: boolean } = {},
): ListState<PlatformBusinessRow> {
  const enabled = options.enabled ?? true;
  return useListState<PlatformBusinessRow>(
    api.platform.listBusinesses.useInfiniteQuery(input, { getNextPageParam: nextCursor, retry, enabled }),
    enabled,
  );
}

export function useBusiness(
  businessId: string,
  options: { enabled?: boolean } = {},
): QueryState<PlatformBusinessDetail> {
  return useQueryState<PlatformBusinessDetail>(
    api.platform.getBusiness.useQuery({ businessId }, { retry, enabled: options.enabled ?? true }),
  );
}

export function usePayments(input: Omit<ListPaymentsInput, "cursor">): ListState<PlatformPaymentRow> {
  return useListState<PlatformPaymentRow>(
    api.platform.listPayments.useInfiniteQuery(input, { getNextPageParam: nextCursor, retry }),
  );
}

export function useAudit(input: Omit<ListAuditInput, "cursor">): ListState<PlatformAuditRow> {
  return useListState<PlatformAuditRow>(
    api.platform.listAudit.useInfiniteQuery(input, { getNextPageParam: nextCursor, retry }),
  );
}

/* ── Acciones ── */

export function useGrantPlan(): ActionState<GrantPlanInput, GrantResult> {
  const onSuccess = useInvalidatePlatform();
  return useActionState<GrantPlanInput, GrantResult>(api.platform.grantPlan.useMutation({ onSuccess }));
}

export function useExtendTrial(): ActionState<ExtendTrialInput, GrantResult> {
  const onSuccess = useInvalidatePlatform();
  return useActionState<ExtendTrialInput, GrantResult>(api.platform.extendTrial.useMutation({ onSuccess }));
}

export function useRevokeGrant(): ActionState<RevokeGrantInput, GrantResult> {
  const onSuccess = useInvalidatePlatform();
  return useActionState<RevokeGrantInput, GrantResult>(api.platform.revokeGrant.useMutation({ onSuccess }));
}

export function useResolvePaymentReview(): ActionState<ResolvePaymentReviewInput, { paymentId: string }> {
  const onSuccess = useInvalidatePlatform();
  return useActionState<ResolvePaymentReviewInput, { paymentId: string }>(
    api.platform.resolvePaymentReview.useMutation({ onSuccess }),
  );
}
