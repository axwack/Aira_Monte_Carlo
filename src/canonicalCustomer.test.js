import { canonicalCustomerId } from "../functions/_shared/customers.js";

function fakeDb({ customers = [], aliases = [] } = {}) {
  return {
    customers, aliases,
    prepare(sql) {
      return {
        bind: (...a) => ({
          first: async () => {
            if (sql.includes("FROM customer_aliases")) return aliases.find(x => x.alias_id === a[0]) && { customer_id: aliases.find(x => x.alias_id === a[0]).customer_id };
            if (sql.includes("WHERE stripe_customer_id")) return customers.find(c => c.stripe_customer_id === a[0]) || null;
            if (sql.includes("lower(email)")) return customers.filter(c => c.email && c.email.toLowerCase() === a[0]).sort((x, y) => x.created_at - y.created_at)[0] || null;
            return null;
          },
          run: async () => { if (sql.includes("INSERT OR IGNORE INTO customer_aliases") && !aliases.find(x => x.alias_id === a[0])) aliases.push({ alias_id: a[0], customer_id: a[1] }); },
        }),
      };
    },
  };
}

describe("canonicalCustomerId — one row per email", () => {
  const first = { stripe_customer_id: "cus_A", email: "Me@Example.com", created_at: 1 };

  test("a new Stripe id with a known email aliases to the first row", async () => {
    const db = fakeDb({ customers: [first] });
    expect(await canonicalCustomerId(db, "cus_B", "me@example.com")).toBe("cus_A");
    expect(db.aliases).toEqual([{ alias_id: "cus_B", customer_id: "cus_A" }]);
  });

  test("the alias keeps resolving without an email (refunds, disputes)", async () => {
    const db = fakeDb({ customers: [first], aliases: [{ alias_id: "cus_B", customer_id: "cus_A" }] });
    expect(await canonicalCustomerId(db, "cus_B")).toBe("cus_A");
  });

  test("an existing row, or a brand-new email, keeps its own id", async () => {
    const db = fakeDb({ customers: [first] });
    expect(await canonicalCustomerId(db, "cus_A", "other@x.com")).toBe("cus_A");
    expect(await canonicalCustomerId(db, "cus_C", "new@x.com")).toBe("cus_C");
    expect(await canonicalCustomerId(db, "cus_D", null)).toBe("cus_D");
  });
});
