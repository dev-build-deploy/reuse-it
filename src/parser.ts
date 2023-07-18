/*
SPDX-FileCopyrightText: 2023 Kevin de Jong <monkaii@hotmail.com>
SPDX-License-Identifier: MIT
*/

import * as commentIt from "@dev-build-deploy/comment-it";

/**
 * Supported SPDX File tokens
 * @internal
 */
const SPDXTokens = {
  copyright: "SPDX-FileCopyrightText",
  license: "SPDX-License-Identifier",
  attributionText: "SPDX-FileAttributionText", // TODO: Multiline support
  comment: "SPDX-FileComment", // TODO: Multiline support
  contributor: "SPDX-FileContributor",
  licenseComments: "SPDX-LicenseComments", // TODO: Multiline support
  licenseConcluded: "SPDX-LicenseConcluded",
  licenseInfoInFile: "SPDX-LicenseInfoInFile",
  notice: "SPDX-FileNotice", // TODO: Multiline support
  type: "SPDX-FileType",
} as const;

/**
 * Resulting token
 * @internal
 */
type Token = {
  start: number;
  end: number;
  type: keyof typeof SPDXTokens;
};

/**
 * Generates a token from the provided line
 * @param line The line to generate a token from
 * @returns The generated token
 */
function generateToken(line: string): Token | undefined {
  const tokenKeys = Object.keys(SPDXTokens) as (keyof typeof SPDXTokens)[];

  for (const key of tokenKeys) {
    const match = new RegExp(`${SPDXTokens[key]}:`, "i").exec(line);
    if (match === null) {
      continue;
    }

    return {
      start: match.index,
      end: line.indexOf(":") + 1,
      type: key as keyof typeof SPDXTokens,
    };
  }
}

/**
 * Extracts the data from the provided comment
 * @param comment The comment to extract the data from
 * @internal
 */
export function* extractData(comment: commentIt.IComment) {
  for (const line of comment.contents) {
    const match = generateToken(line.value);
    if (match) {
      yield { type: match.type, data: line.value.substring(match.end).trim() };
    }
  }
}
