/*
SPDX-FileCopyrightText: 2023 Kevin de Jong <monkaii@hotmail.com>
SPDX-License-Identifier: MIT
*/

import * as commentIt from "@dev-build-deploy/comment-it";
import * as debian from "@dev-build-deploy/dep5-it";
import * as crypto from "crypto";
import * as fs from "fs";
import * as parser from "../parser";

/** @internal */
export const DEP5_FILE_PATH = ".reuse/dep5";

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

/**
 * SPDX File
 * @member SPDXID The SPDX ID of the file
 * @member annotations Annotations
 * @member checksum Checksums
 * @member comment Comments
 * @member contributors Contributors
 * @member fileName The file name
 * @member fileTypes The file types
 * @member licenseComments License comments
 * @member licenseConcluded License concluded
 * @member licenseInfoInFiles License information in files
 * @member noticeText Notices
 * @member attributionTexts Attribution texts
 */
export class SpdxFile {
  SPDXID: string;
  annotations?: {
    annotationDate: string;
    annotationType: string;
    annotator: string;
    comment?: string;
  }[];
  checksums: {
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
  noticeText?: string;
  attributionTexts: string[] = []; // 0..*

  constructor(fileName: string) {
    this.fileName = fileName.startsWith("./") ? fileName : `./${fileName}`;
    this.SPDXID = `SPDXRef-${crypto.createHash("SHA1").update(fileName).digest("hex")}`

    // Generate the checksum
    const contents = fs.readFileSync(this.fileName, "utf-8");
    this.checksums = [
      {
        algorithm: "SHA1",
        checksumValue: crypto.createHash("SHA1").update(contents).digest("hex")
      }
    ]
  }

  /**
   * Create a SPDX file from the provided file path, and update it with information from (in order of precedence):
   * 
   * 1. The Debian Configuration file
   * 2. The .license file
   * 3. File tags provided in comment blocks in the file
   * 
   * @param file The file path to create the SPDX file from
   * @returns The SPDX file
   */
  static async fromFile(file: string): Promise<SpdxFile> {
    /**
     * Updates the SPDX file with information the Debian Configuration file
     * @param file The SPDX file to update
     * @returns The updated SPDX file
     */
    function parseDebianFile(file: SpdxFile) {        
      const dep5 = debian.DebianCopyright.fromFile(DEP5_FILE_PATH);
      if (dep5.header.copyright) {
        file.copyrightText = dep5.header.copyright;
      }
      if (dep5.header.license) {
        file.licenseInfoInFiles = [dep5.header.license];
      }
      const stanza = dep5.getFileStanza(file.fileName.replace("./", ""));

      if (stanza) {
        if (stanza.copyright) {
          file.copyrightText = stanza.copyright;
        }
        if (stanza.license) {
          file.licenseInfoInFiles = [stanza.license];
        }
      }

      return file;
    }

    /**
     * Update the SPDX file with information provided in the plain text file
     * @param file The SPDX file to update
     * @returns The updated SPDX file
     */
    async function parsePlainFile(source: string, file: SpdxFile) {
      const content = fs.readFileSync(source, "utf-8");

      const comment: commentIt.IComment = {
        type: "multiline",
        format: { start: "", end: "" },
        contents: []
      }

      let index = 0;
      for (const line of content.split("\n")) {
        comment.contents.push({
          line: index,
          column: { start: 0, end: line.length },
          value: line
        });
        index += 1;
      }

      return await parseComment(comment, file);
    }

    /**
     * Updates the SPDX file with information provided as File tags
     * @param file The SPDX file to update
     * @returns The updated SPDX file
     */
    async function parseFile(file: SpdxFile): Promise<SpdxFile> {
      for await (const comment of commentIt.extractComments(file.fileName, { maxLines: 50 })) {
        file = await parseComment(comment, file);
      }
      return file;
    }

    /**
     * Parses the SPDX File and ReUSE tokens from the provided comment
     * @param comment Comment to parse
     * @param file SPDX File to update
     * @returns The updated SPDX file
     */
    async function parseComment(comment: commentIt.IComment, file: SpdxFile) {
      for await (const token of parser.extractData(comment)) {
        switch (token.type) {
          case "attributionText":
            file.attributionTexts.push(token.data);
            break;
          case "comment":
            file.comment = token.data;
            break;
          case "contributor":
            file.fileContributors.push(token.data);
            break;
          case "licenseComments":
            file.licenseComments = token.data;
            break;
          case "licenseConcluded":
            file.licenseConcluded = token.data;
            break;
          case "copyright":
            file.copyrightText = token.data;
            break;
          case "notice":
            file.noticeText = token.data;
            break;
          case "type":
            file.fileTypes.push(token.data as IFileType);
            break;
          case "licenseInfoInFile":
          case "license": {
            if (file.licenseInfoInFiles.includes("NOASSERTION")) {
              file.licenseInfoInFiles = [token.data];
            } else {
              file.licenseInfoInFiles.push(token.data);
            }
            break;
          }
        }
      }
      return file;
    }


    let spdxFile = new SpdxFile(file);
    if (fs.existsSync(DEP5_FILE_PATH)) {
      spdxFile = parseDebianFile(spdxFile);
    }

    if (fs.existsSync(`${file}.license`)) {
      spdxFile = await parsePlainFile(`${file}.license`, spdxFile);
    }
    
    if (commentIt.isSupported(file)) {
      spdxFile = await parseFile(spdxFile);
    } else {
      // Fallback to plain text file parsing in case we cannot parse the file comment blocks.
      spdxFile = await parsePlainFile(file, spdxFile)
    }

    return spdxFile;
  }
}
