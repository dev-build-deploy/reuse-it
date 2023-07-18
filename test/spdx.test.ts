/* 
SPDX-FileCopyrightText: 2023 Kevin de Jong <monkaii@hotmail.com>
SPDX-License-Identifier: MIT
*/

import * as reuseIt from "../src/index";
import * as fs from "fs";

/**
 * Validates the SPDX header of a file.
 */
describe("Software Bill of Materials", () => {
  beforeAll(() => {
    jest
      .useFakeTimers()
      .setSystemTime(new Date('2023-01-01'));
  });

  test("woep", async () => {
    // Create an empty Software Bill of Materials
    const sbom = new reuseIt.SoftwareBillOfMaterials("Example Project", "Example Tool v0");

    // Add associated (related) files
    await sbom.addFile("src/spdx/sbom.ts");

    // Show the results
    console.log(JSON.stringify(sbom, null, 2))
  })

  test("Validate SBOM", async () => {
    for (const entry of fs.readdirSync("test/fixtures")) {
      
      if (fs.statSync(`test/fixtures/${entry}`).isDirectory() || entry.endsWith(".fixture")) continue;
      
      const fixture = JSON.parse(fs.readFileSync(`test/fixtures/${entry}.fixture`, "utf8"));
      const file = `test/fixtures/${entry}`;

      const sbom = new reuseIt.SoftwareBillOfMaterials("test-project", "ReuseIt-v0");
      await sbom.addFile(file);

      expect(JSON.parse(JSON.stringify(sbom))).toStrictEqual(fixture);
    }
  });  
});