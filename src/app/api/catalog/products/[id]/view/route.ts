import { getDb, isDatabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Invalid product" }, { status: 400 });
  }

  try {
    const result = await getDb().product.updateMany({
      where: { id, status: "PUBLISHED", category: { active: true } },
      data: { viewCount: { increment: 1 } },
    });
    if (result.count === 0) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Could not record product view" }, { status: 503 });
  }
}
