import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  buyerRequestsTable,
  companiesTable,
  commissionsTable,
  dealsTable,
  documentsTable,
  insertBuyerRequestSchema,
  insertCompanySchema,
  insertCommissionSchema,
  insertDealSchema,
  insertDocumentSchema,
  insertMatchSchema,
  insertMessageSchema,
  insertProductSchema,
  insertSellerListingSchema,
  insertUserSchema,
  matchesTable,
  messagesTable,
  productsTable,
  sellerListingsTable,
  usersTable,
  type InsertBuyerRequest,
  type InsertCompany,
  type InsertCommission,
  type InsertDeal,
  type InsertDocument,
  type InsertMatch,
  type InsertMessage,
  type InsertProduct,
  type InsertSellerListing,
  type InsertUser,
} from "@workspace/db";

const DEFAULT_LIST_LIMIT = 100;

function normalizedLimit(limit?: number) {
  if (limit === undefined) return DEFAULT_LIST_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("limit must be an integer between 1 and 500");
  }
  return limit;
}

export const usersService = {
  list: (limit?: number) =>
    db
      .select()
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt))
      .limit(normalizedLimit(limit)),
  getById: async (id: string) => {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id));
    return user;
  },
  create: async (input: InsertUser) => {
    const [user] = await db
      .insert(usersTable)
      .values(insertUserSchema.parse(input))
      .returning();
    return user;
  },
  update: async (id: string, input: Partial<InsertUser>) => {
    const [user] = await db
      .update(usersTable)
      .set(insertUserSchema.partial().parse(input))
      .where(eq(usersTable.id, id))
      .returning();
    return user;
  },
  delete: async (id: string) => {
    const [user] = await db
      .delete(usersTable)
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id });
    return user;
  },
};

export const companiesService = {
  list: (limit?: number) =>
    db
      .select()
      .from(companiesTable)
      .orderBy(desc(companiesTable.createdAt))
      .limit(normalizedLimit(limit)),
  getById: async (id: string) => {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, id));
    return company;
  },
  create: async (input: InsertCompany) => {
    const [company] = await db
      .insert(companiesTable)
      .values(insertCompanySchema.parse(input))
      .returning();
    return company;
  },
  update: async (id: string, input: Partial<InsertCompany>) => {
    const [company] = await db
      .update(companiesTable)
      .set(insertCompanySchema.partial().parse(input))
      .where(eq(companiesTable.id, id))
      .returning();
    return company;
  },
  delete: async (id: string) => {
    const [company] = await db
      .delete(companiesTable)
      .where(eq(companiesTable.id, id))
      .returning({ id: companiesTable.id });
    return company;
  },
};

export const productsService = {
  list: (limit?: number) =>
    db
      .select()
      .from(productsTable)
      .orderBy(desc(productsTable.createdAt))
      .limit(normalizedLimit(limit)),
  getById: async (id: string) => {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, id));
    return product;
  },
  create: async (input: InsertProduct) => {
    const [product] = await db
      .insert(productsTable)
      .values(insertProductSchema.parse(input))
      .returning();
    return product;
  },
  update: async (id: string, input: Partial<InsertProduct>) => {
    const [product] = await db
      .update(productsTable)
      .set(insertProductSchema.partial().parse(input))
      .where(eq(productsTable.id, id))
      .returning();
    return product;
  },
  delete: async (id: string) => {
    const [product] = await db
      .delete(productsTable)
      .where(eq(productsTable.id, id))
      .returning({ id: productsTable.id });
    return product;
  },
};

export const sellerListingsService = {
  list: (limit?: number) =>
    db
      .select()
      .from(sellerListingsTable)
      .orderBy(desc(sellerListingsTable.createdAt))
      .limit(normalizedLimit(limit)),
  getById: async (id: string) => {
    const [listing] = await db
      .select()
      .from(sellerListingsTable)
      .where(eq(sellerListingsTable.id, id));
    return listing;
  },
  create: async (input: InsertSellerListing) => {
    const [listing] = await db
      .insert(sellerListingsTable)
      .values(insertSellerListingSchema.parse(input))
      .returning();
    return listing;
  },
  update: async (id: string, input: Partial<InsertSellerListing>) => {
    const [listing] = await db
      .update(sellerListingsTable)
      .set(insertSellerListingSchema.partial().parse(input))
      .where(eq(sellerListingsTable.id, id))
      .returning();
    return listing;
  },
  delete: async (id: string) => {
    const [listing] = await db
      .delete(sellerListingsTable)
      .where(eq(sellerListingsTable.id, id))
      .returning({ id: sellerListingsTable.id });
    return listing;
  },
};

export const buyerRequestsService = {
  list: (limit?: number) =>
    db
      .select()
      .from(buyerRequestsTable)
      .orderBy(desc(buyerRequestsTable.createdAt))
      .limit(normalizedLimit(limit)),
  getById: async (id: string) => {
    const [request] = await db
      .select()
      .from(buyerRequestsTable)
      .where(eq(buyerRequestsTable.id, id));
    return request;
  },
  create: async (input: InsertBuyerRequest) => {
    const [request] = await db
      .insert(buyerRequestsTable)
      .values(insertBuyerRequestSchema.parse(input))
      .returning();
    return request;
  },
  update: async (id: string, input: Partial<InsertBuyerRequest>) => {
    const [request] = await db
      .update(buyerRequestsTable)
      .set(insertBuyerRequestSchema.partial().parse(input))
      .where(eq(buyerRequestsTable.id, id))
      .returning();
    return request;
  },
  delete: async (id: string) => {
    const [request] = await db
      .delete(buyerRequestsTable)
      .where(eq(buyerRequestsTable.id, id))
      .returning({ id: buyerRequestsTable.id });
    return request;
  },
};

export const matchesService = {
  list: (limit?: number) =>
    db
      .select()
      .from(matchesTable)
      .orderBy(desc(matchesTable.createdAt))
      .limit(normalizedLimit(limit)),
  getById: async (id: string) => {
    const [match] = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.id, id));
    return match;
  },
  create: async (input: InsertMatch) => {
    const [match] = await db
      .insert(matchesTable)
      .values(insertMatchSchema.parse(input))
      .returning();
    return match;
  },
  update: async (id: string, input: Partial<InsertMatch>) => {
    const [match] = await db
      .update(matchesTable)
      .set(insertMatchSchema.partial().parse(input))
      .where(eq(matchesTable.id, id))
      .returning();
    return match;
  },
  delete: async (id: string) => {
    const [match] = await db
      .delete(matchesTable)
      .where(eq(matchesTable.id, id))
      .returning({ id: matchesTable.id });
    return match;
  },
};

export const dealsService = {
  list: (limit?: number) =>
    db
      .select()
      .from(dealsTable)
      .orderBy(desc(dealsTable.createdAt))
      .limit(normalizedLimit(limit)),
  getById: async (id: string) => {
    const [deal] = await db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.id, id));
    return deal;
  },
  create: async (input: InsertDeal) => {
    const [deal] = await db
      .insert(dealsTable)
      .values(insertDealSchema.parse(input))
      .returning();
    return deal;
  },
  update: async (id: string, input: Partial<InsertDeal>) => {
    const [deal] = await db
      .update(dealsTable)
      .set(insertDealSchema.partial().parse(input))
      .where(eq(dealsTable.id, id))
      .returning();
    return deal;
  },
  delete: async (id: string) => {
    const [deal] = await db
      .delete(dealsTable)
      .where(eq(dealsTable.id, id))
      .returning({ id: dealsTable.id });
    return deal;
  },
};

export const documentsService = {
  list: (limit?: number) =>
    db
      .select()
      .from(documentsTable)
      .orderBy(desc(documentsTable.createdAt))
      .limit(normalizedLimit(limit)),
  getById: async (id: string) => {
    const [document] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, id));
    return document;
  },
  create: async (input: InsertDocument) => {
    const [document] = await db
      .insert(documentsTable)
      .values(insertDocumentSchema.parse(input))
      .returning();
    return document;
  },
  update: async (id: string, input: Partial<InsertDocument>) => {
    const [document] = await db
      .update(documentsTable)
      .set(insertDocumentSchema.partial().parse(input))
      .where(eq(documentsTable.id, id))
      .returning();
    return document;
  },
  delete: async (id: string) => {
    const [document] = await db
      .delete(documentsTable)
      .where(eq(documentsTable.id, id))
      .returning({ id: documentsTable.id });
    return document;
  },
};

export const messagesService = {
  list: (limit?: number) =>
    db
      .select()
      .from(messagesTable)
      .orderBy(desc(messagesTable.createdAt))
      .limit(normalizedLimit(limit)),
  getById: async (id: string) => {
    const [message] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, id));
    return message;
  },
  create: async (input: InsertMessage) => {
    const [message] = await db
      .insert(messagesTable)
      .values(insertMessageSchema.parse(input))
      .returning();
    return message;
  },
  update: async (id: string, input: Partial<InsertMessage>) => {
    const [message] = await db
      .update(messagesTable)
      .set(insertMessageSchema.partial().parse(input))
      .where(eq(messagesTable.id, id))
      .returning();
    return message;
  },
  delete: async (id: string) => {
    const [message] = await db
      .delete(messagesTable)
      .where(eq(messagesTable.id, id))
      .returning({ id: messagesTable.id });
    return message;
  },
};

export const commissionsService = {
  list: (limit?: number) =>
    db
      .select()
      .from(commissionsTable)
      .orderBy(desc(commissionsTable.createdAt))
      .limit(normalizedLimit(limit)),
  getById: async (id: string) => {
    const [commission] = await db
      .select()
      .from(commissionsTable)
      .where(eq(commissionsTable.id, id));
    return commission;
  },
  create: async (input: InsertCommission) => {
    const [commission] = await db
      .insert(commissionsTable)
      .values(insertCommissionSchema.parse(input))
      .returning();
    return commission;
  },
  update: async (id: string, input: Partial<InsertCommission>) => {
    const [commission] = await db
      .update(commissionsTable)
      .set(insertCommissionSchema.partial().parse(input))
      .where(eq(commissionsTable.id, id))
      .returning();
    return commission;
  },
  delete: async (id: string) => {
    const [commission] = await db
      .delete(commissionsTable)
      .where(eq(commissionsTable.id, id))
      .returning({ id: commissionsTable.id });
    return commission;
  },
};