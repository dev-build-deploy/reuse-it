/*
SPDX-FileCopyrightText: 2026 Kevin de Jong <monkaii@hotmail.com>
SPDX-License-Identifier: MIT
*/

import * as fs from "fs";
import * as path from "path";

/**
 * TOML parser. smol-toml ships its types as an ES module, which a CommonJS build cannot import; its CommonJS
 * entry point (dist/index.cjs) is loaded through require instead.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { parse } = require("smol-toml") as { parse: (toml: string) => Record<string, unknown> };

/**
 * Order of precedence of a REUSE.toml annotation (REUSE Specification 3.2+)
 * - closest: the information in the file wins; the table is the fallback (separately for copyright and licence)
 * - aggregate: the table is always added to the information in the file
 * - override: the table replaces all information closer to the file
 * @internal
 */
export type Precedence = "closest" | "aggregate" | "override";

/**
 * Licensing information of one [[annotations]] table
 * @internal
 */
export interface IAnnotation {
  /** Path globs, relative to the directory of the REUSE.toml file */
  paths: string[];
  /** Order of precedence */
  precedence: Precedence;
  /** Copyright notices (SPDX-FileCopyrightText) */
  copyrights: string[];
  /** SPDX License Expressions (SPDX-License-Identifier) */
  licenses: string[];
  /** Comment (SPDX-FileComment) */
  comment?: string;
}

/**
 * Converts a REUSE.toml value (a string or a list of strings) to a list of strings
 * @param value The value to convert
 * @param key The key of the value (for error messages)
 * @param file The REUSE.toml file (for error messages)
 * @returns The list of strings
 */
function toList(value: unknown, key: string, file: string): string[] {
  if (value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every(item => typeof item === "string")) return value;
  throw new Error(`${file}: '${key}' must be a string or a list of strings`);
}

/**
 * Matches a path against a REUSE.toml path glob:
 * - `*` matches everything except forward slashes
 * - `**` and `**` followed by a slash match everything, forward slashes included
 * - a backslash makes the next character literal (`\*` is an asterisk, `\\` a backslash)
 *
 * @param file Path relative to the directory of the REUSE.toml file
 * @param glob The path glob
 * @returns True if the path matches the glob
 * @internal
 */
export function isGlobMatch(file: string, glob: string): boolean {
  let expression = "";
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index];
    if (char === "\\" && index + 1 < glob.length) {
      index++;
      expression += escapeRegExp(glob[index]);
    } else if (char === "*" && glob[index + 1] === "*") {
      index++;
      if (glob[index + 1] === "/") {
        index++;
        expression += "(?:[\\s\\S]*/)?";
      } else {
        expression += "[\\s\\S]*";
      }
    } else if (char === "*") {
      expression += "[^/]*";
    } else {
      expression += escapeRegExp(char);
    }
  }
  return new RegExp(`^${expression}$`).test(file);
}

/**
 * Escapes a string for use in a regular expression
 * @param value The value to escape
 * @returns The escaped value
 */
function escapeRegExp(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

/**
 * A REUSE.toml file
 * @internal
 */
export class ReuseToml {
  /** Directory of the REUSE.toml file, relative to the project root ("" for the root) */
  directory: string;
  /** The [[annotations]] tables, in file order */
  annotations: IAnnotation[];

  constructor(directory: string, annotations: IAnnotation[]) {
    this.directory = directory;
    this.annotations = annotations;
  }

  /**
   * Parses a REUSE.toml file (version 1)
   * @param file Path of the REUSE.toml file, relative to the project root
   * @returns The parsed REUSE.toml file
   * @throws Error when the file is not a valid REUSE.toml file
   */
  static fromFile(file: string): ReuseToml {
    const data = parse(fs.readFileSync(file, "utf-8"));
    if (data.version !== 1) {
      throw new Error(`${file}: unsupported REUSE.toml version '${data.version}' (expected 1)`);
    }

    const tables = (data.annotations ?? []) as Record<string, unknown>[];
    const annotations = tables.map(table => {
      const precedence = (table.precedence ?? "closest") as Precedence;
      if (!["closest", "aggregate", "override"].includes(precedence)) {
        throw new Error(`${file}: unknown precedence '${precedence}'`);
      }
      const comment = table["SPDX-FileComment"];
      return {
        paths: toList(table.path, "path", file),
        precedence,
        copyrights: toList(table["SPDX-FileCopyrightText"], "SPDX-FileCopyrightText", file),
        licenses: toList(table["SPDX-License-Identifier"], "SPDX-License-Identifier", file),
        comment: typeof comment === "string" ? comment : undefined,
      };
    });

    const directory = path.posix.dirname(file.split(path.sep).join("/"));
    return new ReuseToml(directory === "." ? "" : directory, annotations);
  }

  /**
   * Returns the annotation that applies to the given file; when several tables match, the last one is used.
   * @param file Path relative to the project root
   * @returns The last matching annotation, or undefined when no table covers the file
   */
  getAnnotation(file: string): IAnnotation | undefined {
    const prefix = this.directory === "" ? "" : `${this.directory}/`;
    if (!file.startsWith(prefix)) return undefined;

    const relative = file.substring(prefix.length);
    for (let index = this.annotations.length - 1; index >= 0; index--) {
      if (this.annotations[index].paths.some(glob => isGlobMatch(relative, glob))) {
        return this.annotations[index];
      }
    }
  }
}

/** Parsed files, by path, with the modification time they were parsed at */
const cache = new Map<string, { mtimeMs: number; toml: ReuseToml }>();

/**
 * Returns the REUSE.toml files that can cover the given file: the ones in its directory and every directory
 * above it, up to the project root (the current working directory). Parsed files are cached until they change.
 *
 * @param file Path relative to the project root
 * @param fileName The file name of REUSE.toml files
 * @returns The REUSE.toml files, the one closest to the project root first
 * @internal
 */
export function findReuseTomls(file: string, fileName: string): ReuseToml[] {
  const directories = [""];
  const parts = file.split("/").slice(0, -1);
  for (let index = 1; index <= parts.length; index++) {
    directories.push(parts.slice(0, index).join("/"));
  }

  const result: ReuseToml[] = [];
  for (const directory of directories) {
    const tomlPath = directory === "" ? fileName : `${directory}/${fileName}`;
    if (!fs.existsSync(tomlPath)) continue;

    const mtimeMs = fs.statSync(tomlPath).mtimeMs;
    let entry = cache.get(tomlPath);
    if (entry === undefined || entry.mtimeMs !== mtimeMs) {
      entry = { mtimeMs, toml: ReuseToml.fromFile(tomlPath) };
      cache.set(tomlPath, entry);
    }
    result.push(entry.toml);
  }
  return result;
}
