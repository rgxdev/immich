import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "disk_health_history" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "name" character varying NOT NULL,
  "devicePath" character varying NOT NULL,
  "mountPath" character varying,
  "isPrimary" boolean NOT NULL DEFAULT false,
  "deviceType" character varying,
  "protocol" character varying,
  "status" character varying NOT NULL,
  "healthPercent" integer,
  "temperatureCelsius" integer,
  "powerOnHours" integer,
  "availableBytes" bigint,
  "usedBytes" bigint,
  "totalBytes" bigint,
  "issues" jsonb,
  "lastCheckedAt" timestamp with time zone NOT NULL,
  CONSTRAINT "disk_health_history_pkey" PRIMARY KEY ("id")
);`.execute(db);

  await sql`CREATE INDEX "disk_health_history_devicePath_createdAt_idx" ON "disk_health_history" ("devicePath", "createdAt");`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX "disk_health_history_devicePath_createdAt_idx";`.execute(db);
  await sql`DROP TABLE "disk_health_history";`.execute(db);
}
