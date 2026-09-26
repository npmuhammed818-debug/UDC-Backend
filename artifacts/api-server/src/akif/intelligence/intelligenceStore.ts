import { and, desc, eq, ilike, or } from "drizzle-orm";
import {
  akifCompaniesTable,
  akifDataRecordsTable,
  akifDataSourcesTable,
  akifMarketSignalsTable,
  akifProductObservationsTable,
  akifProductsTable,
  db,
} from "@workspace/db";

export function listAkifDataSources() {
  return db.select().from(akifDataSourcesTable)
    .orderBy(akifDataSourcesTable.name);
}

export async function findAkifCompanies(input: {
  country?: string;
  query?: string;
  limit?: number;
}) {
  const conditions = [
    ...(input.country ? [ilike(akifCompaniesTable.country, input.country)] : []),
    ...(input.query
      ? [
          or(
            ilike(akifCompaniesTable.companyName, `%${input.query}%`),
            ilike(akifCompaniesTable.website, `%${input.query}%`),
          )!,
        ]
      : []),
  ];

  return db.select().from(akifCompaniesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(akifCompaniesTable.updatedAt))
    .limit(input.limit ?? 50);
}

export async function getAkifCompanyDossier(id: string) {
  const [company] = await db.select().from(akifCompaniesTable)
    .where(eq(akifCompaniesTable.id, id)).limit(1);
  if (!company) return null;

  const source = company.sourceId
    ? (await db.select().from(akifDataSourcesTable)
        .where(eq(akifDataSourcesTable.id, company.sourceId)).limit(1))[0] ?? null
    : null;

  const relatedRecords = await db.select().from(akifDataRecordsTable)
    .where(
      or(
        ilike(akifDataRecordsTable.productName, `%${company.companyName}%`),
        company.country ? eq(akifDataRecordsTable.country, company.country) : undefined!,
      ),
    )
    .orderBy(desc(akifDataRecordsTable.collectedAt))
    .limit(25);

  return {
    company,
    source,
    relatedRecords,
    notice:
      "This is source evidence and enrichment context. A discovered company is not UDC-verified until the verification workflow is completed.",
  };
}

export function findAkifProducts(query: string, limit = 25) {
  return db.select().from(akifProductsTable)
    .where(or(
      ilike(akifProductsTable.productName, `%${query}%`),
      ilike(akifProductsTable.normalizedName, `%${query}%`),
      ilike(akifProductsTable.hsCode, `%${query}%`),
    ))
    .orderBy(desc(akifProductsTable.confidence))
    .limit(limit);
}

export function findAkifMarketSignals(input: {
  country?: string;
  hsCode?: string;
  limit?: number;
}) {
  const conditions = [
    ...(input.country ? [ilike(akifMarketSignalsTable.country, input.country)] : []),
    ...(input.hsCode ? [eq(akifMarketSignalsTable.hsCode, input.hsCode)] : []),
  ];
  return db.select().from(akifMarketSignalsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(akifMarketSignalsTable.createdAt))
    .limit(input.limit ?? 100);
}

export function findAkifObservations(input: {
  country?: string;
  hsCode?: string;
  limit?: number;
}) {
  const conditions = [
    ...(input.country
      ? [
          or(
            ilike(akifProductObservationsTable.reporterCountry, input.country),
            ilike(akifProductObservationsTable.partnerCountry, input.country),
          )!,
        ]
      : []),
    ...(input.hsCode ? [eq(akifProductObservationsTable.hsCode, input.hsCode)] : []),
  ];
  return db.select().from(akifProductObservationsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(akifProductObservationsTable.createdAt))
    .limit(input.limit ?? 100);
}
