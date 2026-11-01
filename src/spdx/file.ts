/*
SPDX-FileCopyrightText: 2023 Kevin de Jong <monkaii@hotmail.com>
SPDX-License-Identifier: MIT
*/

import * as commentIt from "@dev-build-deploy/comment-it";
import * as debian from "@dev-build-deploy/dep5-it";
import * as crypto from "crypto";
import * as fs from "fs";

import * as parser from "../parser";
import { IAnnotation, findReuseTomls } from "../reuse-toml";

/** @internal */
export const DEP5_FILE_PATH = ".reuse/dep5";

/** @internal */
export const REUSE_TOML_FILE_NAME = "REUSE.toml";

/** Number of leading bytes inspected to tell binary files from text files (as git does) */
const BINARY_DETECTION_BYTES = 8000;

/**
 * Licensing information collected from one source
 * @internal
 */
type Licensing = {
  copyrights: string[];
  licenses: string[];
  comments: string[];
};

/** Parsed dep5 file, with the path and modification time it was parsed from */
let dep5Cache: { path: string; mtimeMs: number; dep5: debian.DebianCopyright } | undefined = undefined;

/**
 * Returns the parsed dep5 file, cached until the file changes
 * @param path Path of the dep5 file
 * @returns The parsed dep5 file
 */
function readDep5(path: string): debian.DebianCopyright {
  const mtimeMs = fs.statSync(path).mtimeMs;
  if (dep5Cache === undefined || dep5Cache.path !== path || dep5Cache.mtimeMs !== mtimeMs) {
    dep5Cache = { path, mtimeMs, dep5: debian.DebianCopyright.fromFile(path) };
  }
  return dep5Cache.dep5;
}

/**
 * Whether the file is binary: it has a NUL byte in its first bytes
 * @param file Path of the file
 * @returns True for binary files
 */
function isBinary(file: string): boolean {
  const descriptor = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(BINARY_DETECTION_BYTES);
    const length = fs.readSync(descriptor, buffer, 0, BINARY_DETECTION_BYTES, 0);
    return buffer.subarray(0, length).includes(0);
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * Removes duplicates, keeping the first occurrence
 * @param values Values to deduplicate
 * @returns The values without duplicates
 */
function unique(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

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
    this.SPDXID = `SPDXRef-${crypto.createHash("SHA1").update(fileName).digest("hex")}`;

    // Generate the checksum over the raw bytes (binary files are not valid UTF-8)
    const contents = fs.readFileSync(this.fileName);
    this.checksums = [
      {
        algorithm: "SHA1",
        checksumValue: crypto.createHash("SHA1").update(contents).digest("hex"),
      },
    ];
  }

  /**
   * Create a SPDX file from the provided file path, with the Licensing Information the REUSE Specification
   * (3.3) associates with it:
   *
   * 1. The file's own information: its adjacent .license file if it exists (the file's contents are then
   *    ignored), otherwise the SPDX tags in its comments (or in its text, for text files without comment support).
   * 2. REUSE.toml files in its directory and above, by the `precedence` of the matching tables:
   *    `closest` (the default) only fills in what the file lacks, separately for copyright and licence, from the
   *    closest REUSE.toml; `aggregate` adds the table to the file's information; `override` replaces everything
   *    closer to the file, and the override table closest to the project root wins.
   * 3. The last matching Files paragraph of .reuse/dep5, which is aggregated with the information above
   *    (both licences apply when they differ). The dep5 header paragraph describes the project as a whole
   *    and is not applied to files. A paragraph's Comment becomes the file's comment.
   *
   * @param file The file path (relative to the project root, which is the current working directory)
   * @returns The SPDX file
   */
  static async fromFile(file: string): Promise<SpdxFile> {
    /**
     * Reads the SPDX tags from the provided comments into the SPDX file and the own Licensing Information
     * @param comments Comments to read
     * @param file The SPDX file to update
     * @param own The file's own Licensing Information
     */
    async function readComments(
      comments: AsyncIterable<commentIt.Comment> | Iterable<commentIt.Comment>,
      file: SpdxFile,
      own: Licensing
    ) {
      let ignore = false;
      for await (const comment of comments) {
        for (const token of parser.extractData(comment)) {
          if (token.type === "ignore") {
            ignore = token.data.startsWith("Start");
          }
          if (ignore) continue;

          updateFromToken(token, file, own);
        }
      }
    }

    /**
     * Wraps the lines of a plain text file into a single comment
     * @param source The plain text file
     * @returns The comment containing all lines
     */
    function plainTextComment(source: string): commentIt.Comment {
      const comment: commentIt.Comment = {
        type: "multiline",
        format: { start: "", end: "" },
        contents: [],
      };

      fs.readFileSync(source, "utf-8")
        .split("\n")
        .forEach((line, index) => {
          comment.contents.push({ line: index, column: { start: 0, end: line.length }, value: line, raw: line });
        });

      return comment;
    }

    /**
     * Applies a SPDX File tag to the SPDX file (or, for Licensing Information, to the own information)
     * @param token The tag to apply
     * @param file SPDX File to update
     * @param own The file's own Licensing Information
     */
    function updateFromToken(token: parser.ExtractedToken, file: SpdxFile, own: Licensing) {
      switch (token.type) {
        case "attributionText":
          file.attributionTexts.push(token.data);
          break;
        case "comment":
          own.comments.push(token.data);
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
          own.copyrights.push(token.data);
          break;
        case "notice":
          file.noticeText = token.data;
          break;
        case "type":
          file.fileTypes.push(token.data as IFileType);
          break;
        case "licenseInfoInFile":
        case "license":
          own.licenses.push(token.data);
          break;
      }
    }

    /**
     * Combines the file's own information with the matching REUSE.toml tables
     * @param own The file's own Licensing Information
     * @param annotations The matching tables, the one closest to the project root first
     * @returns The combined Licensing Information
     */
    function applyReuseToml(own: Licensing, annotations: IAnnotation[]): Licensing {
      const comments = (tables: IAnnotation[]) => tables.flatMap(table => (table.comment ? [table.comment] : []));

      const override = annotations.find(table => table.precedence === "override");
      if (override) {
        return { copyrights: override.copyrights, licenses: override.licenses, comments: comments([override]) };
      }

      const aggregated = annotations.filter(table => table.precedence === "aggregate");
      const closest = annotations[annotations.length - 1];
      const useClosest = own.copyrights.length === 0 || own.licenses.length === 0;
      return {
        copyrights: [
          ...aggregated.flatMap(table => table.copyrights),
          ...(own.copyrights.length > 0 ? own.copyrights : closest.copyrights),
        ],
        licenses: [
          ...aggregated.flatMap(table => table.licenses),
          ...(own.licenses.length > 0 ? own.licenses : closest.licenses),
        ],
        comments: [...comments(aggregated), ...own.comments, ...(useClosest ? comments([closest]) : [])],
      };
    }

    /**
     * Aggregates the matching dep5 Files paragraph with the Licensing Information
     * @param licensing The Licensing Information so far
     * @param path Path relative to the project root
     * @returns The aggregated Licensing Information
     */
    function applyDebianFile(licensing: Licensing, path: string): Licensing {
      const stanza = readDep5(DEP5_FILE_PATH).getFileStanza(path);
      if (!stanza) return licensing;

      const lines = (text?: string) =>
        (text ?? "")
          .split("\n")
          .map(line => line.trim())
          .filter(line => line.length > 0);
      return {
        copyrights: [...lines(stanza.copyright), ...licensing.copyrights],
        // The first line of a License field is the license expression, the rest is its text
        licenses: [...lines(stanza.license).slice(0, 1), ...licensing.licenses],
        comments: [...(stanza.comment ? [stanza.comment] : []), ...licensing.comments],
      };
    }

    const spdxFile = new SpdxFile(file);
    const path = spdxFile.fileName.replace(/^\.\//, "");
    let licensing: Licensing = { copyrights: [], licenses: [], comments: [] };

    if (fs.existsSync(`${file}.license`)) {
      await readComments([plainTextComment(`${file}.license`)], spdxFile, licensing);
    } else if (commentIt.isSupported(file)) {
      await readComments(commentIt.extractComments(spdxFile.fileName), spdxFile, licensing);
    } else if (!isBinary(file)) {
      // Fallback to plain text file parsing in case we cannot parse the file comment blocks.
      await readComments([plainTextComment(file)], spdxFile, licensing);
    }

    const annotations = findReuseTomls(path, REUSE_TOML_FILE_NAME)
      .map(toml => toml.getAnnotation(path))
      .filter((annotation): annotation is IAnnotation => annotation !== undefined);
    if (annotations.length > 0) {
      licensing = applyReuseToml(licensing, annotations);
    }

    if (fs.existsSync(DEP5_FILE_PATH)) {
      licensing = applyDebianFile(licensing, path);
    }

    if (licensing.copyrights.length > 0) {
      spdxFile.copyrightText = unique(licensing.copyrights).join("\n");
    }
    if (licensing.licenses.length > 0) {
      spdxFile.licenseInfoInFiles = unique(licensing.licenses);
    }
    if (licensing.comments.length > 0) {
      spdxFile.comment = unique(licensing.comments).join("\n");
    }

    return spdxFile;
  }
}
