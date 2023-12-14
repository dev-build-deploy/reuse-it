/* 
SPDX-FileCopyrightText: 2023 Kevin de Jong <monkaii@hotmail.com>
SPDX-License-Identifier: MIT
*/

import * as fs from "fs";

import * as reuseIt from "../src/index";
import * as spdxFile from "../src/spdx/file";

/**
 * Validates the SPDX header of a file.
 */
describe("SPDX", () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date("2023-01-01"));
  });

  test("README example", async () => {
    // Create an empty Software Bill of Materials
    const sbom = new reuseIt.SoftwareBillOfMaterials("Example Project", "Example Tool v0");

    // Add associated (related) files
    await sbom.addFile("src/spdx/sbom.ts");

    // Show the results
    console.log(JSON.stringify(sbom, null, 2));
  });

  test("Validate Software Bill of Materials", async () => {
    for (const entry of fs.readdirSync("test/fixtures")) {
      if (fs.statSync(`test/fixtures/${entry}`).isDirectory() || entry.endsWith(".fixture")) continue;

      Object.defineProperty(spdxFile, "DEP5_FILE_PATH", { value: "does-not-exist" });
      const fixture = JSON.parse(fs.readFileSync(`test/fixtures/${entry}.fixture`, "utf8"));
      const file = `test/fixtures/${entry}`;

      const sbom = new reuseIt.SoftwareBillOfMaterials("test-project", "ReuseIt-v0");
      await sbom.addFile(file);

      expect(JSON.parse(JSON.stringify(sbom))).toStrictEqual(fixture);
    }
  });

  test("Validate Software Bill of Materials (bulk)", async () => {
    const fixture = JSON.parse(fs.readFileSync(`test/bulk/sbom.fixture`, "utf8"));

    Object.defineProperty(spdxFile, "DEP5_FILE_PATH", { value: "test/debian/header.dep5" });
    const sbom = new reuseIt.SoftwareBillOfMaterials("test-project", "ReuseIt-v0");
    await sbom.addFiles(["test/fixtures/full-file.ts", "test/fixtures/minimal-file.ts"]);

    expect(JSON.parse(JSON.stringify(sbom))).toStrictEqual(fixture);
  });

  test("Validate Software Bill of Materials (adding license file)", async () => {
    const sbom = new reuseIt.SoftwareBillOfMaterials("test-project", "ReuseIt-v0");
    await sbom.addFile("test.license");

    expect(sbom.files.length).toBe(0);
  });

  test("Validate Debian Copyright configuration (stanza)", async () => {
    const fixture = JSON.parse(fs.readFileSync(`test/fixtures/missing-info.ts.debian.fixture`, "utf8"));
    const file = `test/fixtures/missing-info.ts`;

    Object.defineProperty(spdxFile, "DEP5_FILE_PATH", { value: "test/debian/header.dep5" });
    const sbom = new reuseIt.SoftwareBillOfMaterials("test-project", "ReuseIt-v0");
    await sbom.addFile(file);

    expect(JSON.parse(JSON.stringify(sbom))).toStrictEqual(fixture);
  });

  test("Validate Debian Copyright configuration (header)", async () => {
    const fixture = JSON.parse(fs.readFileSync(`test/fixtures/missing-info.ts.debian.stanza.fixture`, "utf8"));
    const file = `test/fixtures/missing-info.ts`;

    Object.defineProperty(spdxFile, "DEP5_FILE_PATH", { value: "test/debian/filestanza.dep5" });
    const sbom = new reuseIt.SoftwareBillOfMaterials("test-project", "ReuseIt-v0");
    await sbom.addFile(file);

    expect(JSON.parse(JSON.stringify(sbom))).toStrictEqual(fixture);
  });

  test("Validate License file", async () => {
    const fixture = JSON.parse(fs.readFileSync(`test/license/missing-info.ts.fixture`, "utf8"));
    const file = `test/license/missing-info.ts`;

    Object.defineProperty(spdxFile, "DEP5_FILE_PATH", { value: "does-not-exist" });
    const sbom = new reuseIt.SoftwareBillOfMaterials("test-project", "ReuseIt-v0");
    await sbom.addFile(file);

    expect(JSON.parse(JSON.stringify(sbom))).toStrictEqual(fixture);
  });
});
