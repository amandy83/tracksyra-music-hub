import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = "supabase/migrations";

function loadEnv(path) {
  const env = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv(".env");
if (!env.DATABASE_URL) {
  console.error(JSON.stringify({ ok: false, error: "DATABASE_URL is required" }));
  process.exit(1);
}

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const expected = parseExpectedObjects(migrationFiles);

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const tracking = await readMigrationTracking();
  const production = await readProductionObjects();
  const comparison = compare(expected, production, tracking);
  console.log(JSON.stringify({
    ok: true,
    tracking,
    migrationFiles: migrationFiles.map((file) => ({
      file,
      version: versionFromFile(file),
      tracked: tracking.trackedVersions.includes(versionFromFile(file)),
    })),
    expectedCounts: countByType(expected),
    productionCounts: countByType(production),
    missingObjects: comparison.missingObjects,
    extraObjects: comparison.extraObjects,
    migrationsExistingInRepositoryButNotTracked: comparison.untrackedMigrationFiles,
    migrationsTrackedButMissingFromRepository: comparison.trackedWithoutFile,
    likelyReason: inferReason(tracking, comparison),
    verdict: {
      migrationTracking: tracking.schemaExists && tracking.tableExists ? "PASS" : "FAIL",
      schemaDrift: comparison.missingObjects.length === 0 && comparison.extraObjects.length === 0 ? "PASS" : "FAIL",
      productionConsistency: comparison.missingObjects.length === 0 && comparison.trackedWithoutFile.length === 0 ? "PASS" : "FAIL",
    },
  }, null, 2));
} finally {
  await client.end();
}

function parseExpectedObjects(files) {
  const objects = new Map();
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    const add = (type, schema, name) => {
      schema ||= "public";
      if (!schema || !name || isTempName(name)) return;
      const key = `${type}:${schema}.${name}`;
      if (!objects.has(key)) objects.set(key, { type, schema, name, key, files: [] });
      objects.get(key).files.push(file);
    };

    for (const match of sql.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+((?:"?[\w$]+"?\.)?"?[\w$]+"?)\s*\(/gi)) {
      const { schema, name } = splitQualified(match[1]);
      add("function", schema, name);
    }
    for (const match of sql.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TRIGGER|CONSTRAINT\s+TRIGGER)\s+"?([\w$]+)"?\s+/gi)) {
      add("trigger", "public", unquote(match[1]));
    }
    for (const match of sql.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"?[\w$]+"?\.)?"?[\w$]+"?)/gi)) {
      const { schema, name } = splitQualified(match[1]);
      add("table", schema, name);
    }
    for (const match of sql.matchAll(/\bCREATE\s+TYPE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"?[\w$]+"?\.)?"?[\w$]+"?)/gi)) {
      const { schema, name } = splitQualified(match[1]);
      add("type", schema, name);
    }
    for (const match of sql.matchAll(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([\w$]+)"?/gi)) {
      add("index", "public", unquote(match[1]));
    }
    for (const match of sql.matchAll(/\bCREATE\s+POLICY\s+"?([^"\n]+?)"?\s+ON\s+((?:"?[\w$]+"?\.)?"?[\w$]+"?)/gi)) {
      const relation = splitQualified(match[2]);
      add("policy", relation.schema || "public", `${relation.name}:${match[1].trim()}`);
    }
    for (const match of sql.matchAll(/\bCREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([\w$-]+)"?/gi)) {
      add("extension", "*", unquote(match[1]));
    }
  }
  return [...objects.values()].sort(sortObject);
}

async function readMigrationTracking() {
  const schema = await client.query(
    "select exists (select 1 from information_schema.schemata where schema_name = 'supabase_migrations') as exists",
  );
  const table = await client.query(
    `select exists (
       select 1
       from information_schema.tables
       where table_schema = 'supabase_migrations'
         and table_name = 'schema_migrations'
     ) as exists`,
  );
  let columns = [];
  let trackedVersions = [];
  if (table.rows[0].exists) {
    const cols = await client.query(
      `select column_name
       from information_schema.columns
       where table_schema = 'supabase_migrations'
         and table_name = 'schema_migrations'
       order by ordinal_position`,
    );
    columns = cols.rows.map((row) => row.column_name);
    const versions = await client.query("select version::text from supabase_migrations.schema_migrations order by version::text");
    trackedVersions = versions.rows.map((row) => row.version);
  }
  return {
    schemaExists: schema.rows[0].exists,
    tableExists: table.rows[0].exists,
    columns,
    trackedVersions,
    trackedCount: trackedVersions.length,
  };
}

async function readProductionObjects() {
  const objects = [];
  const addRows = (type, rows, map) => {
    for (const row of rows) {
      const obj = map(row);
      if (!obj || isIgnored(obj)) continue;
      if (type === "extension") obj.schema = "*";
      objects.push({ ...obj, key: `${type}:${obj.schema}.${obj.name}`, type });
    }
  };

  addRows("table", (await client.query(`
    select table_schema as schema, table_name as name
    from information_schema.tables
    where table_schema not in ('pg_catalog', 'information_schema')
      and table_type = 'BASE TABLE'
  `)).rows, (row) => row);

  addRows("function", (await client.query(`
    select n.nspname as schema, p.proname as name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('pg_catalog', 'information_schema')
  `)).rows, (row) => row);

  addRows("trigger", (await client.query(`
    select n.nspname as schema, t.tgname as name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname not in ('pg_catalog', 'information_schema')
  `)).rows, (row) => row);

  addRows("type", (await client.query(`
    select n.nspname as schema, t.typname as name
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname not in ('pg_catalog', 'information_schema')
      and t.typtype in ('e', 'd')
  `)).rows, (row) => row);

  addRows("index", (await client.query(`
    select schemaname as schema, indexname as name
    from pg_indexes
    where schemaname not in ('pg_catalog', 'information_schema')
  `)).rows, (row) => row);

  addRows("policy", (await client.query(`
    select schemaname as schema, tablename || ':' || policyname as name
    from pg_policies
    where schemaname not in ('pg_catalog', 'information_schema')
  `)).rows, (row) => row);

  addRows("extension", (await client.query(`
    select n.nspname as schema, e.extname as name
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
  `)).rows, (row) => row);

  return objects.sort(sortObject);
}

function compare(expectedObjects, productionObjects, tracking) {
  const expectedKeys = new Set(expectedObjects.map((object) => object.key));
  const productionKeys = new Set(productionObjects.map((object) => object.key));
  const trackedSet = new Set(tracking.trackedVersions);
  const fileVersions = new Set(migrationFiles.map(versionFromFile));

  return {
    missingObjects: expectedObjects
      .filter((object) => !productionKeys.has(object.key))
      .map(summarizeObject),
    extraObjects: productionObjects
      .filter((object) => !expectedKeys.has(object.key) && !isAllowedExtra(object))
      .map(summarizeObject),
    untrackedMigrationFiles: migrationFiles
      .filter((file) => !trackedSet.has(versionFromFile(file))),
    trackedWithoutFile: tracking.trackedVersions
      .filter((version) => !fileVersions.has(version)),
  };
}

function inferReason(tracking, comparison) {
  if (tracking.schemaExists && tracking.tableExists) {
    return "Supabase migration tracking exists. Any untracked repository migrations are pending, manually applied without registry rows, or belong to another environment.";
  }
  const expectedCount = expected.length;
  const presentCount = expectedCount - comparison.missingObjects.length;
  if (presentCount > 0) {
    return "Migration tracking is absent, but many repository-defined objects exist in production. This indicates migrations were applied manually or through SQL/editor/API paths that did not create Supabase CLI migration tracking metadata. Creation-before-migration-support cannot be proven from database metadata alone.";
  }
  return "Migration tracking is absent and repository-defined objects are mostly missing. This suggests the database was not initialized by the local migration set, or the connection points to a different project/environment.";
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function splitQualified(value) {
  const parts = value.split(".").map(unquote);
  if (parts.length === 1) return { schema: "public", name: parts[0] };
  return { schema: parts[0], name: parts[1] };
}

function unquote(value) {
  return String(value || "").replace(/^"|"$/g, "");
}

function isTempName(name) {
  return /^(if|select|on|from)$/i.test(name || "");
}

function isIgnored(object) {
  if (["pg_catalog", "information_schema"].includes(object.schema)) return true;
  if (object.schema === "auth" || object.schema === "graphql" || object.schema === "graphql_public") return true;
  if (object.schema === "extensions" && object.type !== "extension") return true;
  if (object.type === "type" && object.name.startsWith("_")) return true;
  if (object.type === "table" && object.schema === "supabase_migrations") return false;
  return false;
}

function isAllowedExtra(object) {
  if (object.type === "extension" && ["pg_graphql", "pg_stat_statements", "uuid-ossp", "plpgsql"].includes(object.name)) return true;
  if (object.type === "function" && object.schema === "pgbouncer") return true;
  if (object.schema === "realtime" || object.schema === "vault" || object.schema === "net") return true;
  if (object.type === "index" && /_pkey$|_key$/.test(object.name)) return true;
  return false;
}

function countByType(objects) {
  return objects.reduce((acc, object) => {
    acc[object.type] = (acc[object.type] || 0) + 1;
    return acc;
  }, {});
}

function summarizeObject(object) {
  return {
    type: object.type,
    name: `${object.schema}.${object.name}`,
    files: object.files,
  };
}

function sortObject(a, b) {
  return a.key.localeCompare(b.key);
}

function versionFromFile(file) {
  return file.split("_")[0];
}
