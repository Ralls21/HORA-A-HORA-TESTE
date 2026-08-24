import { NextResponse } from "next/server";

export function errorResponse(error: unknown, fallback = "Não foi possível concluir esta ação.", status = 500) {
  console.error(error);
  return NextResponse.json({ error: fallback }, { status });
}

export function databaseErrorMessage(error: unknown, fallback = "Não foi possível acessar o banco de dados.") {
  const details = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/DATABASE_URL não configurada/i.test(details)) {
    return "O banco de dados não está conectado. Avise o administrador.";
  }
  if (/42P01|42703|relation .+ does not exist|column .+ does not exist|no unique or exclusion constraint matching/i.test(details)) {
    return "O banco de dados precisa ser atualizado. Execute as migrações e tente novamente.";
  }
  if (/fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|connection|timeout|socket/i.test(details)) {
    return "Não foi possível conectar ao banco de dados agora. Tente novamente em alguns instantes.";
  }
  return fallback;
}

export function databaseErrorResponse(error: unknown, fallback?: string) {
  console.error(error);
  const resolvedFallback = fallback ?? "Não foi possível acessar o banco de dados.";
  const message = databaseErrorMessage(error, resolvedFallback);
  const status = message === resolvedFallback ? 500 : 503;
  const response = NextResponse.json({ error: message }, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function unauthorized() {
  return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Você não tem permissão para esta ação." }, { status: 403 });
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export class RequestBodyError extends Error {}

export async function readJson<T = unknown>(request: Request, maxBytes = 32_768): Promise<T> {
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new RequestBodyError("A solicitação é grande demais.");
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new RequestBodyError("Não foi possível ler a solicitação.");
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RequestBodyError("A solicitação é grande demais.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RequestBodyError("Envie um JSON válido.");
  }
}

export function requestBodyErrorResponse(error: unknown) {
  if (!(error instanceof RequestBodyError)) return null;
  return NextResponse.json({ error: error.message }, { status: 400 });
}
