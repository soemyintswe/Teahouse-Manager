import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  menuCategoriesTable,
  menuItemsTable,
  pool,
  roomsTable,
  tablesTable,
} from "@workspace/db";

type TableSeed = {
  tableNumber: string;
  zone: string;
  capacity: number;
  category: "Standard" | "VIP" | "Buffer";
  status: "Active" | "Maintenance" | "Archived";
  isBooked: boolean;
  occupancyStatus: "available" | "occupied" | "payment_pending" | "paid" | "dirty";
  posX: number;
  posY: number;
  currentOrderId: number | null;
  qrCode: string;
};

type RoomSeed = {
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

type MenuCategorySeed = {
  name: string;
  nameMyanmar: string;
  sortOrder: number;
};

type MenuItemSeed = {
  categoryName: string;
  name: string;
  nameMyanmar: string;
  station: "salad" | "tea-coffee" | "juice" | "kitchen";
  description: string;
  price: string;
  available: "true" | "false";
  sortOrder: number;
  imageUrl?: string;
  customizationOptions?: string;
};

const TABLE_SEEDS: TableSeed[] = [
  { tableNumber: "H1", zone: "hall", capacity: 2, category: "Standard", status: "Active", isBooked: false, occupancyStatus: "available", currentOrderId: null, posX: 80, posY: 120, qrCode: "table-h1" },
  { tableNumber: "H2", zone: "hall", capacity: 4, category: "Standard", status: "Active", isBooked: false, occupancyStatus: "occupied", currentOrderId: null, posX: 220, posY: 120, qrCode: "table-h2" },
  { tableNumber: "H3", zone: "hall", capacity: 4, category: "VIP", status: "Active", isBooked: true, occupancyStatus: "available", currentOrderId: null, posX: 360, posY: 120, qrCode: "table-h3" },
  { tableNumber: "H4", zone: "hall", capacity: 6, category: "VIP", status: "Active", isBooked: false, occupancyStatus: "payment_pending", currentOrderId: null, posX: 500, posY: 120, qrCode: "table-h4" },
  { tableNumber: "H5", zone: "hall", capacity: 2, category: "Standard", status: "Active", isBooked: false, occupancyStatus: "available", currentOrderId: null, posX: 80, posY: 270, qrCode: "table-h5" },
  { tableNumber: "H6", zone: "hall", capacity: 4, category: "Buffer", status: "Maintenance", isBooked: false, occupancyStatus: "dirty", currentOrderId: null, posX: 220, posY: 270, qrCode: "table-h6" },
  { tableNumber: "H7", zone: "hall", capacity: 4, category: "Standard", status: "Active", isBooked: false, occupancyStatus: "available", currentOrderId: null, posX: 360, posY: 270, qrCode: "table-h7" },
  { tableNumber: "H8", zone: "hall", capacity: 8, category: "Buffer", status: "Archived", isBooked: false, occupancyStatus: "available", currentOrderId: null, posX: 500, posY: 270, qrCode: "table-h8" },
  { tableNumber: "A1", zone: "aircon", capacity: 2, category: "Standard", status: "Active", isBooked: false, occupancyStatus: "available", currentOrderId: null, posX: 90, posY: 110, qrCode: "table-a1" },
  { tableNumber: "A2", zone: "aircon", capacity: 4, category: "VIP", status: "Active", isBooked: false, occupancyStatus: "available", currentOrderId: null, posX: 240, posY: 110, qrCode: "table-a2" },
  { tableNumber: "A3", zone: "aircon", capacity: 4, category: "Standard", status: "Active", isBooked: true, occupancyStatus: "occupied", currentOrderId: null, posX: 390, posY: 110, qrCode: "table-a3" },
  { tableNumber: "A4", zone: "aircon", capacity: 6, category: "VIP", status: "Active", isBooked: false, occupancyStatus: "available", currentOrderId: null, posX: 540, posY: 110, qrCode: "table-a4" },
  { tableNumber: "A5", zone: "aircon", capacity: 2, category: "Standard", status: "Active", isBooked: false, occupancyStatus: "paid", currentOrderId: null, posX: 165, posY: 260, qrCode: "table-a5" },
  { tableNumber: "A6", zone: "aircon", capacity: 4, category: "Buffer", status: "Active", isBooked: false, occupancyStatus: "available", currentOrderId: null, posX: 465, posY: 260, qrCode: "table-a6" },
];

const ROOM_SEEDS: RoomSeed[] = [
  { code: "hall", name: "Hall Zone", isActive: true, sortOrder: 1 },
  { code: "aircon", name: "Air-con Room", isActive: true, sortOrder: 2 },
];

const MENU_CATEGORY_SEEDS: MenuCategorySeed[] = [
  { name: "Tea & Coffee", nameMyanmar: "Lahpet yay hnint coffee", sortOrder: 1 },
  { name: "Noodles", nameMyanmar: "Noodle myar", sortOrder: 2 },
  { name: "Rice Dishes", nameMyanmar: "Htamin hnaik myar", sortOrder: 3 },
  { name: "Snacks", nameMyanmar: "Akyaw snacks", sortOrder: 4 },
  { name: "Desserts", nameMyanmar: "Ahtote desserts", sortOrder: 5 },
];

const MENU_ITEM_SEEDS: MenuItemSeed[] = [
  {
    categoryName: "Tea & Coffee",
    name: "Myanmar Milk Tea",
    nameMyanmar: "Lahpet yay si",
    station: "tea-coffee",
    description: "Traditional strong tea with condensed milk",
    price: "1800",
    available: "true",
    sortOrder: 1,
    customizationOptions: JSON.stringify({ sugar: ["normal", "less", "no sugar"], size: ["regular", "large"] }),
  },
  {
    categoryName: "Tea & Coffee",
    name: "Black Coffee",
    nameMyanmar: "Coffee amae",
    station: "tea-coffee",
    description: "Freshly brewed black coffee",
    price: "2200",
    available: "true",
    sortOrder: 2,
    customizationOptions: JSON.stringify({ sugar: ["normal", "less", "no sugar"] }),
  },
  {
    categoryName: "Tea & Coffee",
    name: "Iced Lemon Tea",
    nameMyanmar: "Shauk chin lahpet yay aye",
    station: "juice",
    description: "Refreshing lemon tea over ice",
    price: "2500",
    available: "true",
    sortOrder: 3,
  },
  {
    categoryName: "Noodles",
    name: "Shan Noodle",
    nameMyanmar: "Shan khao swe",
    station: "kitchen",
    description: "Classic Shan-style rice noodle",
    price: "3800",
    available: "true",
    sortOrder: 1,
    customizationOptions: JSON.stringify({ spice: ["mild", "medium", "hot"] }),
  },
  {
    categoryName: "Noodles",
    name: "Mohinga",
    nameMyanmar: "Mohinga",
    station: "kitchen",
    description: "Rice noodle in fish broth",
    price: "3200",
    available: "true",
    sortOrder: 2,
  },
  {
    categoryName: "Noodles",
    name: "Nan Gyi Thoke",
    nameMyanmar: "Nan gyi thoke",
    station: "salad",
    description: "Thick rice noodle salad with chicken curry",
    price: "4200",
    available: "true",
    sortOrder: 3,
  },
  {
    categoryName: "Rice Dishes",
    name: "Fried Rice (Chicken)",
    nameMyanmar: "Kyet thar htamin kyaw",
    station: "kitchen",
    description: "Wok-fried rice with chicken and vegetables",
    price: "5500",
    available: "true",
    sortOrder: 1,
    customizationOptions: JSON.stringify({ addOn: ["egg", "extra chicken"] }),
  },
  {
    categoryName: "Rice Dishes",
    name: "Steamed Rice + Pork Curry",
    nameMyanmar: "Wet thar hin hnint htamin",
    station: "kitchen",
    description: "Warm steamed rice served with pork curry",
    price: "6200",
    available: "true",
    sortOrder: 2,
  },
  {
    categoryName: "Snacks",
    name: "Samosa",
    nameMyanmar: "Samosa",
    station: "kitchen",
    description: "Crispy pastry filled with potato",
    price: "1200",
    available: "true",
    sortOrder: 1,
  },
  {
    categoryName: "Snacks",
    name: "Spring Roll",
    nameMyanmar: "Spring roll",
    station: "kitchen",
    description: "Deep-fried vegetable spring roll",
    price: "1500",
    available: "true",
    sortOrder: 2,
  },
  {
    categoryName: "Desserts",
    name: "Coconut Jelly",
    nameMyanmar: "Ohn no kyauk kyaw",
    station: "juice",
    description: "Chilled coconut jelly dessert",
    price: "2000",
    available: "true",
    sortOrder: 1,
  },
  {
    categoryName: "Desserts",
    name: "Sticky Rice with Mango",
    nameMyanmar: "Thamin ne ma ngo",
    station: "kitchen",
    description: "Sweet sticky rice served with ripe mango",
    price: "4500",
    available: "true",
    sortOrder: 2,
  },
];

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  console.log("Seeding tables and menu data...");

  const result = await db.transaction(async (tx) => {
    const roomCodes = ROOM_SEEDS.map((room) => room.code);
    const existingRooms = await tx
      .select({ id: roomsTable.id, code: roomsTable.code })
      .from(roomsTable)
      .where(inArray(roomsTable.code, roomCodes));
    const roomIdByCode = new Map(existingRooms.map((room) => [room.code, room.id]));

    let roomsInserted = 0;
    let roomsUpdated = 0;

    for (const room of ROOM_SEEDS) {
      const existingId = roomIdByCode.get(room.code);
      if (existingId != null) {
        await tx
          .update(roomsTable)
          .set({
            name: room.name,
            isActive: room.isActive,
            sortOrder: room.sortOrder,
          })
          .where(eq(roomsTable.id, existingId));
        roomsUpdated += 1;
      } else {
        await tx.insert(roomsTable).values(room);
        roomsInserted += 1;
      }
    }

    const tableNumbers = TABLE_SEEDS.map((row) => row.tableNumber);
    const existingTables = await tx
      .select({ id: tablesTable.id, tableNumber: tablesTable.tableNumber })
      .from(tablesTable)
      .where(inArray(tablesTable.tableNumber, tableNumbers));
    const tableIdByNumber = new Map(existingTables.map((t) => [t.tableNumber, t.id]));

    let tablesInserted = 0;
    let tablesUpdated = 0;

    for (const row of TABLE_SEEDS) {
      const existingId = tableIdByNumber.get(row.tableNumber);
      if (existingId != null) {
        await tx.update(tablesTable).set(row).where(eq(tablesTable.id, existingId));
        tablesUpdated += 1;
      } else {
        await tx.insert(tablesTable).values(row);
        tablesInserted += 1;
      }
    }

    const categoryNames = MENU_CATEGORY_SEEDS.map((row) => row.name);
    const existingCategories = await tx
      .select({ id: menuCategoriesTable.id, name: menuCategoriesTable.name })
      .from(menuCategoriesTable)
      .where(inArray(menuCategoriesTable.name, categoryNames));
    const categoryIdByName = new Map(existingCategories.map((c) => [c.name, c.id]));

    let categoriesInserted = 0;
    let categoriesUpdated = 0;

    for (const row of MENU_CATEGORY_SEEDS) {
      const existingId = categoryIdByName.get(row.name);
      if (existingId != null) {
        await tx
          .update(menuCategoriesTable)
          .set({ nameMyanmar: row.nameMyanmar, sortOrder: row.sortOrder })
          .where(eq(menuCategoriesTable.id, existingId));
        categoriesUpdated += 1;
      } else {
        const [inserted] = await tx.insert(menuCategoriesTable).values(row).returning({
          id: menuCategoriesTable.id,
          name: menuCategoriesTable.name,
        });
        categoryIdByName.set(inserted.name, inserted.id);
        categoriesInserted += 1;
      }
    }

    const itemNames = MENU_ITEM_SEEDS.map((row) => row.name);
    const categoryIds = [...categoryIdByName.values()];
    const existingMenuItems =
      categoryIds.length > 0
        ? await tx
            .select({
              id: menuItemsTable.id,
              name: menuItemsTable.name,
              categoryId: menuItemsTable.categoryId,
            })
            .from(menuItemsTable)
            .where(and(inArray(menuItemsTable.name, itemNames), inArray(menuItemsTable.categoryId, categoryIds)))
        : [];
    const menuItemIdByKey = new Map(
      existingMenuItems.map((item) => [`${item.categoryId}::${item.name}`, item.id]),
    );

    let itemsInserted = 0;
    let itemsUpdated = 0;

    for (const row of MENU_ITEM_SEEDS) {
      const categoryId = categoryIdByName.get(row.categoryName);
      if (categoryId == null) {
        throw new Error(`Missing category for menu item: ${row.name} (${row.categoryName})`);
      }

      const payload = {
        categoryId,
        name: row.name,
        nameMyanmar: row.nameMyanmar,
        station: row.station,
        description: row.description,
        price: row.price,
        imageUrl: row.imageUrl,
        available: row.available,
        customizationOptions: row.customizationOptions,
        qrCode: `item-${slugify(row.name)}`,
        sortOrder: row.sortOrder,
      };

      const key = `${categoryId}::${row.name}`;
      const existingId = menuItemIdByKey.get(key);

      if (existingId != null) {
        await tx.update(menuItemsTable).set(payload).where(eq(menuItemsTable.id, existingId));
        itemsUpdated += 1;
      } else {
        await tx.insert(menuItemsTable).values(payload);
        itemsInserted += 1;
      }
    }

    return {
      roomsInserted,
      roomsUpdated,
      tablesInserted,
      tablesUpdated,
      categoriesInserted,
      categoriesUpdated,
      itemsInserted,
      itemsUpdated,
    };
  });

  console.log("Seed completed.");
  console.table(result);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
