const DatabaseUrlKey = "DATABASE_URL";
const TestDatabaseUrlKey = "TEST_DATABASE_URL";

export type TestDatabaseConfig = {
  connectionString: string;
};

export const loadTestDatabaseConfig = (
  environment: NodeJS.ProcessEnv,
): TestDatabaseConfig => {
  const testDatabaseUrl = environment[TestDatabaseUrlKey];
  if (!testDatabaseUrl || testDatabaseUrl.trim().length === 0) {
    throw new Error(
      "TEST_DATABASE_URL is required for database integration tests",
    );
  }

  if (testDatabaseUrl === environment[DatabaseUrlKey]) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  }

  return { connectionString: testDatabaseUrl };
};
