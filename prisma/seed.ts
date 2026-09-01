import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { OrderStatus } from "../lib/generated/prisma/enums";
import { hashPassword } from "../lib/auth/password";

// Deterministic Pseudo-Random Number Generator (Mulberry32)
function createRng(seed = 42) {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRODUCTS_CONFIG = [
  {
    key: "laptop",
    name: "Pro Laptop",
    price: 60000,
    category: "Laptops",
    description: "High-performance laptop engineered for power users and creators",
    active: true,
  },
  {
    key: "bag",
    name: "Laptop Bag",
    price: 2000,
    category: "Accessories",
    description: "Water-resistant padded laptop bag with multi-compartment storage",
    active: true,
  },
  {
    key: "mouse",
    name: "Wireless Mouse",
    price: 1500,
    category: "Accessories",
    description: "Ergonomic 2.4GHz & Bluetooth wireless mouse with precision optical tracking",
    active: true,
  },
  {
    key: "keyboard",
    name: "Mechanical Keyboard",
    price: 3000,
    category: "Peripherals",
    description: "Custom tactile mechanical keyboard with RGB backlighting and hot-swap switches",
    active: true,
  },
  {
    key: "monitor",
    name: "4K Monitor",
    price: 18000,
    category: "Displays",
    description: "27-inch 4K UHD IPS display with ultra-slim bezels and HDR400",
    active: true,
  },
  {
    key: "headphones",
    name: "Noise Cancelling Headphones",
    price: 5000,
    category: "Audio",
    description: "Premium active noise-cancelling over-ear headphones with 40h battery life",
    active: true,
  },
] as const;

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna", "Ishaan",
  "Shaurya", "Atharva", "Advik", "Pranav", "Kabir", "Ananya", "Diya", "Saanvi", "Aadhya", "Pari",
  "Kiara", "Myra", "Riya", "Anushka", "Aanya", "Pooja", "Neha", "Priya", "Sneha", "Kavya",
  "Rohan", "Vikram", "Rahul", "Amit", "Kunal", "Deepak", "Sameer", "Gaurav", "Manish", "Siddharth",
  "Tanvi", "Meera", "Shruti", "Swati", "Nisha", "Preeti", "Divya", "Shreya", "Rhea", "Simran",
  "Varun", "Abhishek", "Karan", "Yash", "Nikhil", "Tarun", "Harsh", "Akash", "Rajat", "Mohit"
];

const LAST_NAMES = [
  "Sharma", "Verma", "Patel", "Mehta", "Iyer", "Nair", "Reddy", "Rao", "Gupta", "Singh",
  "Kumar", "Chopra", "Joshi", "Bhat", "Deshmukh", "Kulkarni", "Shah", "Agarwal", "Mishra", "Pandey",
  "Saxena", "Malhotra", "Kapoor", "Banerjee", "Chatterjee", "Dutta", "Mukherjee", "Das", "Bose", "Ghosh",
  "Menon", "Pillai", "Nambiar", "Shetty", "Hegde", "Kamath", "Prabhu", "Choudhury", "Roy", "Sen"
];

async function seed() {
  console.log("🌱 Starting RazorGrowth seed process...");
  const rng = createRng(12345);

  const DEMO_MERCHANT_EMAIL = "merchant@technova.demo";

  // 1. Clean existing demo data in dependency order
  const existingMerchant = await prisma.merchant.findUnique({
    where: { email: DEMO_MERCHANT_EMAIL },
  });

  if (existingMerchant) {
    console.log(`🧹 Clearing existing demo data for merchant ${DEMO_MERCHANT_EMAIL}...`);
    await prisma.auditEvent.deleteMany({ where: { merchantId: existingMerchant.id } });
    await prisma.growthAction.deleteMany({ where: { merchantId: existingMerchant.id } });
    await prisma.opportunity.deleteMany({ where: { merchantId: existingMerchant.id } });
    await prisma.orderItem.deleteMany({
      where: { order: { merchantId: existingMerchant.id } },
    });
    await prisma.order.deleteMany({ where: { merchantId: existingMerchant.id } });
    await prisma.customer.deleteMany({ where: { merchantId: existingMerchant.id } });
    await prisma.product.deleteMany({ where: { merchantId: existingMerchant.id } });
    await prisma.merchant.delete({ where: { id: existingMerchant.id } });
    console.log("✅ Cleared previous demo data.");
  }

  // 2. Create Demo Merchant
  console.log("🏢 Creating demo merchant: TechNova Store...");
  const defaultPasswordHash = await hashPassword("Demo1234!");
  const merchant = await prisma.merchant.create({
    data: {
      name: "TechNova Store",
      email: DEMO_MERCHANT_EMAIL,
      passwordHash: defaultPasswordHash,
      currency: "INR",
    },
  });

  // 3. Create 6 Products
  console.log("📦 Creating 6 demo products...");
  const productData = PRODUCTS_CONFIG.map((p) => ({
    merchantId: merchant.id,
    name: p.name,
    description: p.description,
    category: p.category,
    price: p.price,
    active: p.active,
  }));

  await prisma.product.createMany({
    data: productData,
  });

  const createdProducts = await prisma.product.findMany({
    where: { merchantId: merchant.id },
  });

  const productMap = new Map<string, { id: string; price: number; name: string }>();
  for (const p of createdProducts) {
    const config = PRODUCTS_CONFIG.find((cfg) => cfg.name === p.name);
    if (config) {
      productMap.set(config.key, { id: p.id, price: Number(p.price), name: p.name });
    }
  }

  // 4. Create 500 Customers
  console.log("👥 Creating 500 customers...");
  const TOTAL_CUSTOMERS = 500;
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const baseCustomerTime = now - 150 * ONE_DAY_MS; // 150 days ago

  const customerRecords = [];
  for (let i = 0; i < TOTAL_CUSTOMERS; i++) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(i * 7 + Math.floor(i / FIRST_NAMES.length)) % LAST_NAMES.length];
    const customerCreatedAt = new Date(baseCustomerTime + Math.floor(rng() * 45) * ONE_DAY_MS);

    customerRecords.push({
      merchantId: merchant.id,
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i + 1}@technova-customer.demo`,
      createdAt: customerCreatedAt,
      updatedAt: customerCreatedAt,
    });
  }

  await prisma.customer.createMany({
    data: customerRecords,
  });

  const createdCustomers = await prisma.customer.findMany({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "asc" },
  });

  // 5. Generate 900 Orders with realistic purchase associations
  console.log("🛒 Generating 900 PAID orders with realistic cross-sell patterns...");

  // Customer order count distribution:
  // Customers 0..219   (220 customers) -> 1 order  = 220 orders
  // Customers 220..399 (180 customers) -> 2 orders = 360 orders
  // Customers 400..479 (80 customers)  -> 3 orders = 240 orders
  // Customers 480..499 (20 customers)  -> 4 orders = 80 orders
  // Total = 900 orders across 500 customers

  const orderRows: Array<{
    id: string;
    merchantId: string;
    customerId: string;
    status: OrderStatus;
    total: number;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  const orderItemRows: Array<{
    id: string;
    orderId: string;
    productId: string;
    quantity: number;
    unitPrice: number;
  }> = [];

  let totalOrdersCount = 0;
  const customerLastOrderDate = new Map<string, Date>();

  for (let i = 0; i < createdCustomers.length; i++) {
    const customer = createdCustomers[i];
    let ordersForThisCustomer = 1;
    if (i >= 220 && i < 400) {
      ordersForThisCustomer = 2;
    } else if (i >= 400 && i < 480) {
      ordersForThisCustomer = 3;
    } else if (i >= 480) {
      ordersForThisCustomer = 4;
    }

    // Assign customer persona / purchasing pattern
    const archVal = rng();
    let archetype: "LAPTOP_USER" | "DESK_USER" | "PERIPHERAL_USER" | "AUDIO_USER" | "GENERAL_USER";

    if (archVal < 0.35) {
      archetype = "LAPTOP_USER";
    } else if (archVal < 0.60) {
      archetype = "DESK_USER";
    } else if (archVal < 0.80) {
      archetype = "PERIPHERAL_USER";
    } else if (archVal < 0.95) {
      archetype = "AUDIO_USER";
    } else {
      archetype = "GENERAL_USER";
    }

    const customerBoughtProductKeys = new Set<string>();
    let currentOrderTime = new Date(
      customer.createdAt.getTime() + Math.floor(rng() * 3) * ONE_DAY_MS + Math.floor(rng() * 86400000)
    );

    for (let orderIdx = 0; orderIdx < ordersForThisCustomer; orderIdx++) {
      totalOrdersCount++;
      const orderId = `ord_${randomUUID().replace(/-/g, "")}`;
      const itemKeys: string[] = [];

      if (archetype === "LAPTOP_USER") {
        if (orderIdx === 0) {
          const p = rng();
          if (p < 0.50) {
            // Strong direct basket co-purchase: Laptop + Bag
            itemKeys.push("laptop", "bag");
          } else if (p < 0.70) {
            // Laptop + Wireless Mouse
            itemKeys.push("laptop", "mouse");
          } else if (p < 0.82) {
            // Laptop + Bag + Mouse
            itemKeys.push("laptop", "bag", "mouse");
          } else if (p < 0.92) {
            // Laptop standalone
            itemKeys.push("laptop");
          } else {
            // Laptop + Headphones
            itemKeys.push("laptop", "headphones");
          }
        } else if (orderIdx === 1) {
          if (!customerBoughtProductKeys.has("bag")) {
            // Strong sequential cross-sell: Laptop buyer returning for Laptop Bag
            const p = rng();
            if (p < 0.75) {
              itemKeys.push("bag");
            } else if (p < 0.90) {
              itemKeys.push("bag", "mouse");
            } else {
              itemKeys.push("mouse");
            }
          } else {
            const p = rng();
            if (p < 0.45) {
              itemKeys.push("mouse");
            } else if (p < 0.75) {
              itemKeys.push("headphones");
            } else if (p < 0.90) {
              itemKeys.push("keyboard");
            } else {
              itemKeys.push("bag");
            }
          }
        } else if (orderIdx === 2) {
          const p = rng();
          if (p < 0.40) itemKeys.push("headphones");
          else if (p < 0.75) itemKeys.push("mouse");
          else if (p < 0.90) itemKeys.push("keyboard");
          else itemKeys.push("bag");
        } else {
          const p = rng();
          if (p < 0.40) itemKeys.push("mouse");
          else if (p < 0.70) itemKeys.push("headphones");
          else itemKeys.push("bag");
        }
      } else if (archetype === "DESK_USER") {
        if (orderIdx === 0) {
          const p = rng();
          if (p < 0.45) {
            itemKeys.push("monitor", "keyboard");
          } else if (p < 0.70) {
            itemKeys.push("monitor", "mouse");
          } else if (p < 0.85) {
            itemKeys.push("monitor", "keyboard", "mouse");
          } else {
            itemKeys.push("monitor");
          }
        } else if (orderIdx === 1) {
          if (customerBoughtProductKeys.has("keyboard") && !customerBoughtProductKeys.has("mouse")) {
            const p = rng();
            if (p < 0.70) itemKeys.push("mouse");
            else if (p < 0.90) itemKeys.push("headphones");
            else itemKeys.push("keyboard");
          } else if (customerBoughtProductKeys.has("mouse") && !customerBoughtProductKeys.has("keyboard")) {
            const p = rng();
            if (p < 0.65) itemKeys.push("keyboard");
            else if (p < 0.90) itemKeys.push("headphones");
            else itemKeys.push("mouse");
          } else {
            const p = rng();
            if (p < 0.40) itemKeys.push("headphones");
            else if (p < 0.70) itemKeys.push("keyboard");
            else itemKeys.push("mouse");
          }
        } else {
          const p = rng();
          if (p < 0.45) itemKeys.push("headphones");
          else if (p < 0.75) itemKeys.push("mouse");
          else itemKeys.push("keyboard");
        }
      } else if (archetype === "PERIPHERAL_USER") {
        if (orderIdx === 0) {
          const p = rng();
          if (p < 0.55) {
            itemKeys.push("keyboard", "mouse");
          } else if (p < 0.80) {
            itemKeys.push("keyboard");
          } else {
            itemKeys.push("mouse");
          }
        } else if (orderIdx === 1) {
          if (customerBoughtProductKeys.has("keyboard") && !customerBoughtProductKeys.has("mouse")) {
            const p = rng();
            if (p < 0.75) itemKeys.push("mouse");
            else if (p < 0.90) itemKeys.push("headphones");
            else itemKeys.push("mouse", "headphones");
          } else if (customerBoughtProductKeys.has("mouse") && !customerBoughtProductKeys.has("keyboard")) {
            const p = rng();
            if (p < 0.65) itemKeys.push("keyboard");
            else if (p < 0.85) itemKeys.push("headphones");
            else itemKeys.push("keyboard", "headphones");
          } else {
            const p = rng();
            if (p < 0.50) itemKeys.push("headphones");
            else if (p < 0.75) itemKeys.push("monitor");
            else itemKeys.push("bag");
          }
        } else {
          const p = rng();
          if (p < 0.45) itemKeys.push("headphones");
          else if (p < 0.75) itemKeys.push("mouse");
          else if (p < 0.90) itemKeys.push("keyboard");
          else itemKeys.push("bag");
        }
      } else if (archetype === "AUDIO_USER") {
        if (orderIdx === 0) {
          const p = rng();
          if (p < 0.75) {
            itemKeys.push("headphones");
          } else if (p < 0.90) {
            itemKeys.push("headphones", "mouse");
          } else {
            itemKeys.push("headphones", "bag");
          }
        } else {
          const p = rng();
          if (p < 0.35) itemKeys.push("mouse");
          else if (p < 0.65) itemKeys.push("bag");
          else if (p < 0.85) itemKeys.push("keyboard");
          else itemKeys.push("headphones");
        }
      } else {
        // GENERAL_USER
        if (orderIdx === 0) {
          const p = rng();
          if (p < 0.35) itemKeys.push("bag");
          else if (p < 0.70) itemKeys.push("mouse");
          else if (p < 0.85) itemKeys.push("keyboard");
          else itemKeys.push("headphones");
        } else {
          const pool = ["bag", "mouse", "keyboard", "headphones"];
          itemKeys.push(pool[Math.floor(rng() * pool.length)]);
        }
      }

      // Ensure every order has at least 1 item
      if (itemKeys.length === 0) {
        itemKeys.push("mouse");
      }

      let orderTotal = 0;
      for (const key of itemKeys) {
        customerBoughtProductKeys.add(key);
        const prod = productMap.get(key)!;
        // Occasionally quantity = 2 for low-priced accessories
        let quantity = 1;
        if ((key === "mouse" || key === "bag") && rng() < 0.08) {
          quantity = 2;
        }

        const unitPrice = prod.price;
        orderTotal += unitPrice * quantity;

        orderItemRows.push({
          id: `itm_${randomUUID().replace(/-/g, "")}`,
          orderId,
          productId: prod.id,
          quantity,
          unitPrice,
        });
      }

      orderRows.push({
        id: orderId,
        merchantId: merchant.id,
        customerId: customer.id,
        status: OrderStatus.PAID,
        total: orderTotal,
        currency: "INR",
        createdAt: currentOrderTime,
        updatedAt: currentOrderTime,
      });

      customerLastOrderDate.set(customer.id, currentOrderTime);

      // Increment date for next order of this customer
      currentOrderTime = new Date(
        currentOrderTime.getTime() + Math.floor(5 + rng() * 18) * ONE_DAY_MS + Math.floor(rng() * 86400000)
      );
    }
  }

  // Insert orders in batches
  console.log(`📥 Inserting ${orderRows.length} orders into the database...`);
  const ORDER_BATCH_SIZE = 200;
  for (let i = 0; i < orderRows.length; i += ORDER_BATCH_SIZE) {
    const chunk = orderRows.slice(i, i + ORDER_BATCH_SIZE);
    await prisma.order.createMany({
      data: chunk,
    });
  }

  // Insert order items in batches
  console.log(`📥 Inserting ${orderItemRows.length} order items into the database...`);
  const ITEM_BATCH_SIZE = 300;
  for (let i = 0; i < orderItemRows.length; i += ITEM_BATCH_SIZE) {
    const chunk = orderItemRows.slice(i, i + ITEM_BATCH_SIZE);
    await prisma.orderItem.createMany({
      data: chunk,
    });
  }

  // 6. Verification and Summary
  console.log("\n📊 Verifying seeded data summary in database:");
  const merchantCount = await prisma.merchant.count({ where: { id: merchant.id } });
  const productCount = await prisma.product.count({ where: { merchantId: merchant.id } });
  const customerCount = await prisma.customer.count({ where: { merchantId: merchant.id } });
  const orderCount = await prisma.order.count({ where: { merchantId: merchant.id } });
  const paidOrderCount = await prisma.order.count({
    where: { merchantId: merchant.id, status: OrderStatus.PAID },
  });
  const orderItemCount = await prisma.orderItem.count({
    where: { order: { merchantId: merchant.id } },
  });
  const opportunityCount = await prisma.opportunity.count({
    where: { merchantId: merchant.id },
  });

  console.log(`  - Merchant: ${merchantCount} (TechNova Store)`);
  console.log(`  - Products: ${productCount} products`);
  console.log(`  - Customers: ${customerCount} customers`);
  console.log(`  - Total Orders: ${orderCount} (${paidOrderCount} PAID)`);
  console.log(`  - Order Items: ${orderItemCount} items`);
  console.log(`  - Opportunities: ${opportunityCount} (0 hardcoded - engine will discover)`);

  // Cross-sell association sanity check
  const laptopProduct = productMap.get("laptop")!;
  const bagProduct = productMap.get("bag")!;

  const laptopCustomers = await prisma.customer.findMany({
    where: {
      merchantId: merchant.id,
      orders: {
        some: {
          items: {
            some: { productId: laptopProduct.id },
          },
        },
      },
    },
    include: {
      orders: {
        include: {
          items: true,
        },
      },
    },
  });

  let laptopAndBagCustomers = 0;
  for (const cust of laptopCustomers) {
    const boughtBag = cust.orders.some((o) =>
      o.items.some((item) => item.productId === bagProduct.id)
    );
    if (boughtBag) laptopAndBagCustomers++;
  }

  const laptopToBagRate = ((laptopAndBagCustomers / laptopCustomers.length) * 100).toFixed(1);
  console.log(`\n🎯 Pattern Verification:`);
  console.log(
    `  - Pro Laptop buyers who also bought Laptop Bag: ${laptopAndBagCustomers}/${laptopCustomers.length} (${laptopToBagRate}%)`
  );
  console.log("✨ Seed completed successfully!");
}

seed()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("❌ Seed failed with error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
