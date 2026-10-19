// Runs against a real MySQL/MariaDB test database, only when TEST_MYSQL_URL is set:
//   TEST_MYSQL_URL="mysql://user:pass@localhost:3306/placa_mysql" npx vitest run tests/mysql-integration.test.ts
// Never point it at the real shop database: it creates and deletes DEMO- rows.
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_MYSQL_URL;

describe.skipIf(!url)("MySQL/MariaDB database", () => {
  const tag = randomUUID().slice(0, 8);
  const cleanup: Array<() => Promise<unknown>> = [];

  beforeAll(() => {
    process.env.DATABASE_URL = url;
  });

  afterAll(async () => {
    for (const step of cleanup.reverse()) await step().catch(() => undefined);
    const { getDb } = await import("@/lib/db");
    await getDb().$disconnect();
  });

  it("rejects a duplicate category ignoring case and accents", async () => {
    const { createAdminCategory, deleteAdminCategory } = await import("@/lib/services/categories");
    const category = await createAdminCategory({ name: `DEMO Música ${tag}`, parentId: null, active: true });
    cleanup.push(() => deleteAdminCategory(category.id));
    await expect(
      createAdminCategory({ name: `demo musica ${tag.toUpperCase()}`, parentId: null, active: true }),
    ).rejects.toThrow("category_exists");
  });

  it("stores dates in UTC and changes a password with a new session version", async () => {
    const { getDb } = await import("@/lib/db");
    const { changeOwnPassword, createAdminUser, updateAdminUser } = await import("@/lib/services/admin-users");
    const password = `Demo-pass-${tag}-123`;
    const user = await createAdminUser({
      email: `demo-mysql-${tag}@example.com`,
      name: "DEMO MySQL",
      role: "ADMIN",
      password,
    });
    cleanup.push(() => getDb().adminUser.delete({ where: { id: user.id } }));

    const stored = await getDb().adminUser.findUniqueOrThrow({ where: { id: user.id } });
    expect(Math.abs(stored.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
    const [raw] = await getDb().$queryRaw<Array<{ drift: bigint | number }>>`
      SELECT TIMESTAMPDIFF(SECOND, createdAt, UTC_TIMESTAMP()) AS drift FROM admin_users WHERE id = ${user.id}`;
    expect(Math.abs(Number(raw.drift))).toBeLessThan(60);

    // Serializable transaction path.
    await updateAdminUser("dev", user.id, { name: "DEMO MySQL 2" });

    const result = await changeOwnPassword(user.id, password, `${password}-new`);
    expect(result).toEqual({ sessionVersion: stored.sessionVersion + 1 });
    const after = await getDb().adminUser.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.sessionVersion).toBe(stored.sessionVersion + 1);
    await expect(changeOwnPassword(user.id, password, `${password}-again`)).rejects.toThrow();
  });

  it("saves and reads maintenance mode, restoring the previous settings afterwards", async () => {
    const { getDb } = await import("@/lib/db");
    const { readMaintenanceState, setMaintenanceState } = await import("@/lib/services/maintenance");
    const db = getDb();
    const previous = await db.siteSetting.findUnique({
      where: { id: "default" },
      select: { maintenanceMode: true, maintenanceMessage: true },
    });
    cleanup.push(() =>
      previous
        ? db.siteSetting.update({ where: { id: "default" }, data: previous })
        : db.siteSetting.deleteMany({ where: { id: "default" } }),
    );

    const message = `DEMO manutenzione ${tag} è`;
    expect(await setMaintenanceState({ enabled: true, message })).toEqual({ enabled: true, message });
    expect(await readMaintenanceState()).toEqual({ enabled: true, message });
    expect(await setMaintenanceState({ enabled: false, message: "" })).toEqual({ enabled: false, message: "" });
    const stored = await db.siteSetting.findUniqueOrThrow({ where: { id: "default" } });
    expect(stored.maintenanceMessage).toBeNull();
    expect(stored.name.length).toBeGreaterThan(0);
  });

  it("marks a paid order once, discounts stock and keeps the address JSON", async () => {
    const { getDb } = await import("@/lib/db");
    const { fulfillPaidSession } = await import("@/lib/services/orders");
    const db = getDb();
    const category = await db.category.create({ data: { slug: `demo-mysql-${tag}`, name: `DEMO ${tag}` } });
    cleanup.push(() => db.category.delete({ where: { id: category.id } }));
    const product = await db.product.create({
      data: {
        referenceCode: `DEMO-MYSQL-${tag}`,
        name: "DEMO placa",
        categoryId: category.id,
        size: "20 × 30 cm",
        price: "5.00",
        quantity: 1,
        status: "PUBLISHED",
      },
    });
    cleanup.push(() => db.product.delete({ where: { id: product.id } }));

    const makeOrder = async (suffix: string) => {
      const order = await db.order.create({
        data: {
          orderNumber: `PL-T${tag.slice(0, 4).toUpperCase()}${suffix}`,
          stripeSessionId: `cs_test_demo_mysql_${tag}_${suffix}`,
          country: "IT",
          itemCount: 1,
          productsCents: 500,
          shippingCents: 0,
          platformFeeCents: 0,
          applicationFeeCents: 0,
          totalCents: 500,
          items: {
            create: [{ productId: product.id, referenceCode: product.referenceCode, name: "DEMO placa", unitPriceCents: 500, quantity: 1 }],
          },
        },
      });
      cleanup.push(() => db.order.delete({ where: { id: order.id } }));
      return order;
    };
    const session = (order: { id: string; stripeSessionId: string | null }) =>
      ({
        id: order.stripeSessionId,
        mode: "payment",
        payment_status: "paid",
        amount_total: 500,
        currency: "eur",
        metadata: { orderId: order.id },
        payment_intent: "pi_demo",
        customer_details: { email: "demo@example.com", name: "Demo Buyer", phone: null, tax_ids: [] },
        collected_information: {
          shipping_details: { name: "Demo Buyer", address: { line1: "Via Roma 1", city: "Milano", postal_code: "20100", country: "IT", line2: null, state: null } },
        },
      }) as unknown as Stripe.Checkout.Session;

    const first = await makeOrder("1");
    await fulfillPaidSession(session(first));
    await fulfillPaidSession(session(first)); // Stripe retries: no second discount.
    const paid = await db.order.findUniqueOrThrow({ where: { id: first.id } });
    expect(paid.status).toBe("PAID");
    expect(paid.shippingAddress).toMatchObject({ line1: "Via Roma 1", city: "Milano" });
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).quantity).toBe(0);

    const second = await makeOrder("2");
    await fulfillPaidSession(session(second));
    const review = await db.order.findUniqueOrThrow({ where: { id: second.id } });
    expect(review.status).toBe("NEEDS_REVIEW");
    expect(review.reviewReason).toBe(`stock:${product.referenceCode}`);
  });
});
