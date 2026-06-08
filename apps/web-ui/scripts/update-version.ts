#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json to get version
const packagePath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string };
const version = packageJson.version;

// Update constants file with actual version
const constantsPath = join(__dirname, '..', 'src', 'shared', 'constants.ts');
const constantsContent = readFileSync(constantsPath, 'utf8');
const updatedContent = constantsContent.replace(
  /export const APP_VERSION = '[^']*';/,
  `export const APP_VERSION = '${version}';`
);

// Write back to constants file
writeFileSync(constantsPath, updatedContent);

console.log(`✅ Updated APP_VERSION to ${version}`);