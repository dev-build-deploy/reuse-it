/*
SPDX-FileCopyrightText: 2023 Kevin de Jong <monkaii@hotmail.com>
SPDX-License-Identifier: MIT
*/

import * as commentIt from "@dev-build-deploy/comment-it";
import * as crypto from "crypto";
import * as fs from "fs";
import * as parser from "../parser";

const fileTypes = [
  "SOURCE",
  "BINARY",
  "ARCHIVE",
  "APPLICATION",
  "AUDIO",
  "IMAGE",
  "TEXT",
  "VIDEO",
  "DOCUMENTATION",
  "SPDX",
  "OTHER",
];

type IFileType = (typeof fileTypes)[number];

export class File {
  SPDXID: string;
  annotations?: {
    annotationDate: string;
    annotationType: string;
    annotator: string;
    comment?: string;
  }[];
  checksum: {
    algorithm: string;
    checksumValue: string;
  }[] = [];
  comment?: string;
  copyrightText?: string;
  fileContributors: string[] = []; // 0..*
  fileName: string;
  fileTypes: IFileType[] = []; // 0..*
  licenseComments?: string;
  licenseConcluded = "NOASSERTION";
  licenseInfoInFiles: string[] = ["NOASSERTION"];
  notice?: string;
  attributionTexts: string[] = []; // 0..*

  constructor(fileName: string) {
    this.fileName = fileName.startsWith("./") ? fileName : `./${fileName}`;
    this.SPDXID = `SPDXRef-${crypto.createHash("SHA1").update(fileName).digest("hex")}`

    // Generate the checksum
    const contents = fs.readFileSync(this.fileName, "utf-8");
    this.checksum = [
      {
        algorithm: "SHA1",
        checksumValue: crypto.createHash("SHA1").update(contents).digest("hex")
      }
    ]
  }

  static async fromFile(file: string): Promise<File> {
    async function parseFile(file: string) {
      const spdxFile = new File(file);
      for await (const comment of commentIt.extractComments(file, { maxLines: 50 })) {
        for await (const token of parser.extractData(comment)) {
          switch (token.type) {
            case "attributionText":
              spdxFile.attributionTexts.push(token.data);
              break;
            case "comment":
              spdxFile.comment = token.data;
              break;
            case "contributor":
              spdxFile.fileContributors.push(token.data);
              break;
            case "licenseComments":
              spdxFile.licenseComments = token.data;
              break;
            case "licenseConcluded":
              spdxFile.licenseConcluded = token.data;
              break;
            case "copyright":
              spdxFile.copyrightText = token.data;
              break;
            case "notice":
              spdxFile.notice = token.data;
              break;
            case "type":
              spdxFile.fileTypes.push(token.data as IFileType);
              break;
            case "licenseInfoInFile":
            case "license": {
              if (spdxFile.licenseInfoInFiles.includes("NOASSERTION")) {
                spdxFile.licenseInfoInFiles = [token.data];
              } else {
                spdxFile.licenseInfoInFiles.push(token.data);
              }
              break;
            }
          }
        }
      }
      return spdxFile;
    }

    let spdxFile = new File(file);
    if (commentIt.isSupported(file)) {
      spdxFile = await parseFile(file);
    }

    // License file takes precedence over the source file
    if (fs.existsSync(`${file}.license`)) {
      const licenseFile = await parseFile(`${file}.license`);
      spdxFile.copyrightText = licenseFile.copyrightText;
      spdxFile.licenseInfoInFiles = licenseFile.licenseInfoInFiles;
    }

    // Debian configuration takes precedence over the license file
    // TODO: Add support for debian configuration

    return spdxFile;
  }
}
