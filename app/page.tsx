import { HoraApp } from "@/components/hora-app";

export default async function Page({ searchParams }: { searchParams: Promise<{ reset?: string | string[] }> }) {
  const params = await searchParams;
  const resetToken = Array.isArray(params.reset) ? params.reset[0] : params.reset;
  return <HoraApp resetToken={resetToken} />;
}
